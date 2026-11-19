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
  const arquivos = Array.isArray(body.arquivos) ? (body.arquivos as { path?: string; tipo?: string }[]) : [];
  if (!arquivos.length || arquivos.length > MAX_ARQUIVOS) return resp({ sucesso: false, erro: `Envie de 1 a ${MAX_ARQUIVOS} arquivos.` }, 400);

  // 19/11/2026: PDF com texto (Repom VPR/contrato) e lido sem IA; a chave da IA so e exigida quando precisar dela.
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
        resultados.push({ path, sucesso: true, tipo: cache.tipo, normalizado: cache.campos.normalizado, do_cache: true });
        continue;
      }
      const { data: blob, error: ed } = await admin.storage.from(bucket).download(path);
      if (ed || !blob) { resultados.push({ path, sucesso: false, erro: "Arquivo nao encontrado." }); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_BYTES) { resultados.push({ path, sucesso: false, erro: "Arquivo vazio ou maior que 10 MB." }); continue; }
      const mime = blob.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      let tipo = (a.tipo ?? "") as TipoDocumento;
      let tipoAuto = false;
      const semIa = await lerSemIa(bytes, mime, TIPOS_DOCUMENTO.includes(tipo) ? tipo : null);
      if (semIa) {
        const tipoTxt = semIa.tipo as TipoDocumento;
        const normalizado = normalizarExtracao(tipoTxt, semIa.bruto as Record<string, unknown>, hoje);
        normalizados.push(normalizado);
        console.log(JSON.stringify({ fn: "extrair-documento", etapa: tipoTxt, ok: true, origem_leitura: "texto" }));
        await admin.from("documento_extracoes").upsert({ path: chaveCache, tipo: tipoTxt, campos: { normalizado, legivel: true, suspeita_fraude: null, origem_leitura: "texto" } });
        resultados.push({ path, sucesso: true, tipo: tipoTxt, tipo_automatico: !a.tipo, normalizado, legivel: true, suspeita_fraude: null, origem_leitura: "texto" });
        continue;
      }
      if (!chave) { resultados.push({ path, sucesso: false, codigo: "ia_indisponivel", erro: "Leitura automatica indisponivel (chave da IA nao configurada).", detalhe: "sem_chave" }); continue; }
      if (!TIPOS_DOCUMENTO.includes(tipo)) {
        const cl = await gemini(chave, PROMPT_CLASSIFICACAO, SCHEMA_CLASSIFICACAO, bytes, mime, "classificar", prazoAbsoluto);
        tipo = TIPOS_DOCUMENTO.includes(cl.tipo) ? cl.tipo : "outro";
        tipoAuto = true;
      }
      if (tipo === "outro") { resultados.push({ path, sucesso: true, tipo, normalizado: null, aviso: "Documento nao reconhecido; escolha o tipo na lista." }); continue; }
      const bruto = await gemini(chave, PROMPTS_V2[tipo], schemaDoTipo(tipo), bytes, mime, tipo, prazoAbsoluto);
      const normalizado = normalizarExtracao(tipo, bruto, hoje);
      normalizados.push(normalizado);
      await admin.from("documento_extracoes").upsert({ path: chaveCache, tipo, campos: { normalizado, legivel: bruto.legivel ?? null, suspeita_fraude: bruto.suspeita_fraude ?? null } });
      resultados.push({ path, sucesso: true, tipo, tipo_automatico: tipoAuto, normalizado, legivel: bruto.legivel ?? null, suspeita_fraude: bruto.suspeita_fraude ?? null });
    } catch (e) {
      if (e instanceof ErroIA) resultados.push({ path, sucesso: false, codigo: e.codigo, erro: e.mensagem, detalhe: e.detalhe });
      else resultados.push({ path, sucesso: false, codigo: "erro_leitura", erro: String((e as Error).message ?? e).slice(0, 200) });
    }
  }
  return resp({ sucesso: true, resultados, conferencia_cruzada: conferenciaCruzada(normalizados) });
}
