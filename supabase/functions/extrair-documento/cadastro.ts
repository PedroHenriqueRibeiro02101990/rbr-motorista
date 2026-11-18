// Modo "cadastro" da extrair-documento (Parte A etapa 2 / Parte B etapa 10): varios arquivos por chamada, classificacao automatica,
// campos com confianca e normalizacao (kg, reais, CIOT 12+4). So gestor_rbr (inclui o perfil de operacao). NAO grava em cadastros:
// so registra a leitura em documento_extracoes. Aceita PDF e imagem. Os arquivos ficam nos buckets cadastro-documentos ou operacao-documentos.
// Body: { modo: "cadastro", bucket?: "cadastro-documentos"|"operacao-documentos", arquivos: [{ path, tipo? }] }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import {
  conferenciaCruzada, normalizarExtracao, PROMPT_CLASSIFICACAO, PROMPTS_V2, SCHEMA_CLASSIFICACAO, schemaDoTipo, TIPOS_DOCUMENTO,
  type Normalizado, type TipoDocumento,
} from "../_shared/extracao-documentos.ts";

const BUCKETS = ["cadastro-documentos", "operacao-documentos"];
const MAX_ARQUIVOS = 12;
const MAX_BYTES = 10 * 1024 * 1024;

async function gemini(key: string, prompt: string, schema: unknown, bytes: Uint8Array, mime: string) {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: encodeBase64(bytes) } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    }),
  });
  if (!r.ok) throw new Error(`IA respondeu ${r.status}`);
  const j = await r.json();
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("A IA nao devolveu conteudo.");
  return JSON.parse(txt);
}

export async function tratarCadastro(req: Request, body: Record<string, unknown>, resp: (b: unknown, s?: number) => Response): Promise<Response> {
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return resp({ sucesso: false, erro: "Nao autenticado" }, 401);
  const admin = createClient(url, service);
  const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", u.user.id).maybeSingle();
  if (!ator || ator.papel !== "gestor_rbr") return resp({ sucesso: false, erro: "Sem permissao." }, 403);

  const bucket = String(body.bucket ?? "cadastro-documentos");
  if (!BUCKETS.includes(bucket)) return resp({ sucesso: false, erro: "bucket nao permitido" }, 400);
  const arquivos = Array.isArray(body.arquivos) ? (body.arquivos as { path?: string; tipo?: string }[]) : [];
  if (!arquivos.length || arquivos.length > MAX_ARQUIVOS) return resp({ sucesso: false, erro: `Envie de 1 a ${MAX_ARQUIVOS} arquivos.` }, 400);

  const { data: chave, error: ek } = await admin.rpc("get_gemini_api_key");
  if (ek || !chave) return resp({ sucesso: false, erro: "Leitura automatica indisponivel (chave da IA nao configurada)." }, 503);

  const hoje = new Date().toISOString().slice(0, 10);
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
      if (!TIPOS_DOCUMENTO.includes(tipo)) {
        const cl = await gemini(chave, PROMPT_CLASSIFICACAO, SCHEMA_CLASSIFICACAO, bytes, mime);
        tipo = TIPOS_DOCUMENTO.includes(cl.tipo) ? cl.tipo : "outro";
        tipoAuto = true;
      }
      if (tipo === "outro") { resultados.push({ path, sucesso: true, tipo, normalizado: null, aviso: "Documento nao reconhecido; escolha o tipo na lista." }); continue; }
      const bruto = await gemini(chave, PROMPTS_V2[tipo], schemaDoTipo(tipo), bytes, mime);
      const normalizado = normalizarExtracao(tipo, bruto, hoje);
      normalizados.push(normalizado);
      await admin.from("documento_extracoes").upsert({ path: chaveCache, tipo, campos: { normalizado, legivel: bruto.legivel ?? null, suspeita_fraude: bruto.suspeita_fraude ?? null } });
      resultados.push({ path, sucesso: true, tipo, tipo_automatico: tipoAuto, normalizado, legivel: bruto.legivel ?? null, suspeita_fraude: bruto.suspeita_fraude ?? null });
    } catch (e) {
      resultados.push({ path, sucesso: false, erro: String((e as Error).message ?? e).slice(0, 200) });
    }
  }
  return resp({ sucesso: true, resultados, conferencia_cruzada: conferenciaCruzada(normalizados) });
}
