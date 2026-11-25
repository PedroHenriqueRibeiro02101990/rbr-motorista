// Modo "cadastro" da extrair-documento (Parte A etapa 2 / Parte B etapa 10): varios arquivos por chamada, classificacao automatica,
// campos com confianca e normalizacao (kg, reais, CIOT 12+4). So a equipe interna (gestor_rbr, operacao, fiscal). NAO grava em cadastros:
// so registra a leitura em documento_extracoes. Aceita PDF e imagem. Os arquivos ficam nos buckets cadastro-documentos ou operacao-documentos.
// Body: { modo: "cadastro", bucket?: "cadastro-documentos"|"operacao-documentos", arquivos: [{ path, tipo? }] }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { chamarGemini, MENSAGEM_OCUPADA, ORCAMENTO_TOTAL_MS, textoDaResposta } from "../_shared/geminiResiliente.ts";
import {
  conferenciaCruzada, normalizarExtracao, PROMPT_CLASSIFICACAO, PROMPTS_V2, SCHEMA_CLASSIFICACAO, schemaDoTipo, TIPOS_DOCUMENTO,
  type Normalizado, type TipoDocumento,
} from "../_shared/extracao-documentos.ts";
import { lerSemIa } from "../_shared/leitura-texto.ts";
import { ehTipoLeitura, mesclarBrutos, MSG_FOTO_SEM_LEITURA, MSG_PARCIAL_SEM_IA, paraBruto } from "../_shared/leituraFila.ts";
import { enfileirar } from "./fila.ts";

const BUCKETS = ["cadastro-documentos", "operacao-documentos"];
const MAX_ARQUIVOS = 12;
const MAX_BYTES = 10 * 1024 * 1024;

// Falha da leitura automatica (IA ocupada, lenta ou recusando): vira resultado POR ARQUIVO, sem derrubar os outros.
class ErroIA extends Error {
  constructor(public codigo: string, public mensagem: string, public detalhe: string) { super(mensagem); }
}

async function gemini(key: string, prompt: string, schema: unknown, bytes: Uint8Array, mime: string, rotulo: string, prazoAbsoluto: number) {
  const r = await chamarGemini({
    chave: key,
    modelo: Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash",
    modeloAlternativo: Deno.env.get("GEMINI_MODEL_FALLBACK") || null, // so se existir; nunca inventado
    prazoAbsoluto,
    corpo: {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: encodeBase64(bytes) } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    },
  });
  // log sem dados pessoais: tipo, tentativas, tempo e status final
  console.log(JSON.stringify({ fn: "extrair-documento", etapa: rotulo, ok: r.ok, tentativas: r.tentativas, ms: r.ms, status: r.ok ? 200 : r.status }));
  if (!r.ok) throw new ErroIA(r.codigo, r.mensagem, r.detalhe);
  const txt = textoDaResposta(r.json);
  if (!txt) throw new ErroIA("ia_indisponivel", MENSAGEM_OCUPADA, `gemini=200;motivo=resposta_vazia;tentativas=${r.tentativas}`);
  try { return JSON.parse(txt); } catch { throw new ErroIA("ia_indisponivel", MENSAGEM_OCUPADA, `gemini=200;motivo=resposta_fora_do_formato;tentativas=${r.tentativas}`); }
}

export async function tratarCadastro(req: Request, body: Record<string, unknown>, resp: (b: unknown, s?: number) => Response): Promise<Response> {
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return resp({ sucesso: false, erro: "Nao autenticado" }, 401);
  const admin = createClient(url, service);
  const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", u.user.id).maybeSingle();
  if (!ator || !["gestor_rbr", "operacao", "fiscal"].includes(ator.papel)) return resp({ sucesso: false, erro: "Sem permissao." }, 403);

  const bucket = String(body.bucket ?? "cadastro-documentos");
  if (!BUCKETS.includes(bucket)) return resp({ sucesso: false, erro: "bucket nao permitido" }, 400);
  const arquivos = Array.isArray(body.arquivos) ? (body.arquivos as { path?: string; tipo?: string; reserva?: boolean }[]) : [];
  if (!arquivos.length || arquivos.length > MAX_ARQUIVOS) return resp({ sucesso: false, erro: `Envie de 1 a ${MAX_ARQUIVOS} arquivos.` }, 400);

  // 25/11/2026: ordem fixa: PDF com texto (parser) -> FreeLLM (fila, Agente no PC) -> Gemini so como ultima reserva (GEMINI_RESERVA_ATIVA=1 e pedido do front).
  const { data: chave } = await admin.rpc("get_gemini_api_key");

  const hoje = new Date().toISOString().slice(0, 10);
  const prazoAbsoluto = Date.now() + ORCAMENTO_TOTAL_MS; // a execucao inteira termina antes do limite de 150 s do Supabase (erro 546)
  const resultados: unknown[] = [];
  const normalizados: Normalizado[] = [];
  for (const a of arquivos) {
    const path = String(a.path ?? "");
    if (!path || path.includes("..")) { resultados.push({ path, sucesso: false, erro: "path invalido" }); continue; }
    try {
      const chaveCache = `${bucket}/${path}`;
      const { data: cache } = await admin.from("documento_extracoes").select("campos, tipo").eq("path", chaveCache).maybeSingle();
      if (cache?.campos?.normalizado && (!a.tipo || a.tipo === cache.tipo)) {
        normalizados.push(cache.campos.normalizado);
        resultados.push({ path, sucesso: true, tipo: cache.tipo, normalizado: cache.campos.normalizado, do_cache: true, origem_leitura: cache.campos.origem_leitura === "ia_gratis" ? "ia" : (cache.campos.origem_leitura ?? undefined), ia_gratis: cache.campos.origem_leitura === "ia_gratis" || undefined });
        continue;
      }
      const { data: blob, error: ed } = await admin.storage.from(bucket).download(path);
      if (ed || !blob) { resultados.push({ path, sucesso: false, erro: "Arquivo nao encontrado." }); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_BYTES) { resultados.push({ path, sucesso: false, erro: "Arquivo vazio ou maior que 10 MB." }); continue; }
      const mime = blob.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      const tipoEscolhido = (TIPOS_DOCUMENTO.includes((a.tipo ?? "") as TipoDocumento) && a.tipo !== "outro" ? a.tipo : null) as TipoDocumento | null;
      // 1) PDF/XML com texto: parser, sem IA (CNH-e, CRLV-e, RNTRC, VPR, contrato Repom)
      const semIa = await lerSemIa(bytes, mime, tipoEscolhido);
      if (semIa?.completo && semIa.tipo && semIa.bruto) {
        const tipoTxt = semIa.tipo as TipoDocumento;
        const normalizado = normalizarExtracao(tipoTxt, semIa.bruto as Record<string, unknown>, hoje);
        normalizados.push(normalizado);
        console.log(JSON.stringify({ fn: "extrair-documento", etapa: tipoTxt, ok: true, origem_leitura: "texto" }));
        await admin.from("documento_extracoes").upsert({ path: chaveCache, tipo: tipoTxt, campos: { normalizado, legivel: true, suspeita_fraude: null, origem_leitura: "texto" } });
        resultados.push({ path, sucesso: true, tipo: tipoTxt, tipo_automatico: semIa.tipoAutomatico, normalizado, legivel: true, suspeita_fraude: null, origem_leitura: "texto", campos_faltantes: [] });
        continue;
      }
      // O que o parser leu (parcial) segue junto em qualquer desfecho abaixo: nunca se perde.
      const tipoLido = semIa?.tipo && ehTipoLeitura(semIa.tipo) ? semIa.tipo : null;
      const parcial = tipoLido ? normalizarExtracao(tipoLido, (semIa?.bruto ?? {}) as Record<string, unknown>, hoje) : null;
      const faltantes = tipoLido ? (semIa?.faltantes ?? []) : [];
      const ehFoto = !semIa;

      // 2) Reserva (Gemini): so quando o front pede apos esgotar a fila E a reserva esta ligada (GEMINI_RESERVA_ATIVA=1). Nunca antes do FreeLLM.
      if (a.reserva === true) {
        if (Deno.env.get("GEMINI_RESERVA_ATIVA") === "1" && chave) {
          try {
            const prazoReserva = Math.min(prazoAbsoluto, Date.now() + 30_000);
            let tipoR = (tipoEscolhido ?? tipoLido ?? "") as TipoDocumento;
            let auto = false;
            if (!TIPOS_DOCUMENTO.includes(tipoR)) {
              const cl = await gemini(chave, PROMPT_CLASSIFICACAO, SCHEMA_CLASSIFICACAO, bytes, mime, "classificar", prazoReserva);
              tipoR = TIPOS_DOCUMENTO.includes(cl.tipo) ? cl.tipo : "outro"; auto = true;
            }
            if (tipoR === "outro") { resultados.push({ path, sucesso: true, tipo: tipoR, normalizado: null, aviso: "Documento nao reconhecido; escolha o tipo na lista." }); continue; }
            const bruto = await gemini(chave, PROMPTS_V2[tipoR], schemaDoTipo(tipoR), bytes, mime, tipoR, prazoReserva);
            const merged = mesclarBrutos(tipoR, semIa?.bruto ?? null, paraBruto(tipoR, bruto)) as Record<string, unknown>;
            const normalizado = normalizarExtracao(tipoR, merged, hoje);
            normalizados.push(normalizado);
            await admin.from("documento_extracoes").upsert({ path: chaveCache, tipo: tipoR, campos: { normalizado, legivel: bruto.legivel ?? null, suspeita_fraude: bruto.suspeita_fraude ?? null, origem_leitura: "ia" } });
            resultados.push({ path, sucesso: true, tipo: tipoR, tipo_automatico: auto, normalizado, legivel: bruto.legivel ?? null, suspeita_fraude: bruto.suspeita_fraude ?? null, origem_leitura: "ia" });
            continue;
          } catch (e) {
            if (!(e instanceof ErroIA)) throw e; // falha da reserva: cai no desfecho abaixo (parcial ou mensagem da foto)
          }
        }
        if (parcial) resultados.push({ path, sucesso: true, tipo: tipoLido, normalizado: parcial, origem_leitura: "parcial", campos_faltantes: faltantes, aviso: MSG_PARCIAL_SEM_IA });
        else resultados.push({ path, sucesso: false, codigo: "ia_indisponivel", erro: ehFoto ? MSG_FOTO_SEM_LEITURA : MSG_PARCIAL_SEM_IA, detalhe: "fila_sem_resposta" });
        continue;
      }

      // 3) FreeLLM (no PC, pelo Agente): foto, scan ou PDF lido so em parte vao para a fila; a resposta volta assincrona
      const tipoFila = tipoEscolhido ?? tipoLido ?? null;
      let f: { id: string; status: string };
      try {
        f = await enfileirar(admin, { bucket, path, mime, tipo: tipoFila, tipoAutomatico: !tipoEscolhido, texto: semIa?.texto ?? null, solicitante: ator.id });
      } catch {
        // fila ainda nao instalada (migration pendente) ou fora do ar: nunca perde o que o parser leu
        console.log(JSON.stringify({ fn: "extrair-documento", etapa: "fila", ok: false, origem_leitura: parcial ? "parcial" : "ia" }));
        if (parcial) resultados.push({ path, sucesso: true, tipo: tipoLido, normalizado: parcial, origem_leitura: "parcial", campos_faltantes: faltantes, aviso: MSG_PARCIAL_SEM_IA });
        else resultados.push({ path, sucesso: false, codigo: "ia_indisponivel", erro: ehFoto ? MSG_FOTO_SEM_LEITURA : MSG_PARCIAL_SEM_IA, detalhe: "fila_indisponivel" });
        continue;
      }
      console.log(JSON.stringify({ fn: "extrair-documento", etapa: "fila", ok: true, origem_leitura: parcial ? "parcial" : "ia", foto: ehFoto }));
      resultados.push({
        path, sucesso: true, na_fila: true, leitura_id: f.id, tipo: tipoFila ?? undefined, normalizado: parcial, tipo_automatico: !tipoEscolhido,
        origem_leitura: parcial ? "parcial" : "ia", campos_faltantes: faltantes,
        aviso: ehFoto ? "Foto na fila da leitura gratuita; pode levar ate 1 minuto." : "Li parte pelo texto; a IA gratuita esta completando o resto.",
      });
    } catch (e) {
      if (e instanceof ErroIA) resultados.push({ path, sucesso: false, codigo: e.codigo, erro: e.mensagem, detalhe: e.detalhe });
      else resultados.push({ path, sucesso: false, codigo: "erro_leitura", erro: String((e as Error).message ?? e).slice(0, 200) });
    }
  }
  return resp({ sucesso: true, resultados, conferencia_cruzada: conferenciaCruzada(normalizados) });
}
