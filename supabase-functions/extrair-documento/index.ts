// Edge Function: extrair-documento
//
// Lê uma imagem já enviada ao Storage (bucket `documentos-pessoais`) e usa o
// Gemini (plano gratuito — decisão registrada em claude/gemini-api-contratacao.md)
// pra extrair os campos de CNH ou CRLV automaticamente.
//
// Não grava nada no banco — devolve os campos extraídos pro cliente, que
// pré-preenche o formulário e deixa o usuário revisar/confirmar antes de salvar
// (mantém humano no loop, igual ao texto que já existia: "será conferida pela
// equipe").
//
// A chave do Gemini fica guardada no Supabase Vault (tabela vault.secrets,
// nome 'gemini_api_key') — não em env var. Só a função SQL
// get_gemini_api_key() consegue lê-la, e só o role service_role tem
// permissão de executá-la (revogado de public/anon/authenticated).
// Sem o secret cadastrado, a função responde 503 de forma explícita — não
// quebra o fluxo manual existente, só não pré-preenche.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CNH_PROMPT = `Você está lendo uma foto de Carteira Nacional de Habilitação (CNH) brasileira.
Extraia exatamente os campos pedidos no schema. Se um campo não estiver legível ou não existir
na imagem, devolva null para ele — nunca invente um valor. A validade deve vir no formato
YYYY-MM-DD. A categoria é a combinação de letras (ex: "AE", "B", "D").`;

const CNH_SCHEMA = {
  type: "object",
  properties: {
    numero_registro: { type: "string", nullable: true },
    categoria: { type: "string", nullable: true },
    validade: { type: "string", nullable: true },
    nome: { type: "string", nullable: true },
    cpf: { type: "string", nullable: true },
  },
  required: ["numero_registro", "categoria", "validade", "nome", "cpf"],
};

const CRLV_PROMPT = `Você está lendo uma foto de CRLV (Certificado de Registro e Licenciamento de
Veículo) brasileiro. Extraia exatamente os campos pedidos no schema. Se um campo não estiver
legível ou não existir na imagem, devolva null para ele — nunca invente um valor. Placa no
formato usual (com ou sem hífen, como aparece no documento). Capacidade de carga em
quilogramas, só o número.`;

const CRLV_SCHEMA = {
  type: "object",
  properties: {
    placa: { type: "string", nullable: true },
    renavam: { type: "string", nullable: true },
    marca_modelo: { type: "string", nullable: true },
    ano: { type: "integer", nullable: true },
    capacidade_carga: { type: "number", nullable: true },
  },
  required: ["placa", "renavam", "marca_modelo", "ano", "capacidade_carga"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  try {
    const { tipo, path } = await req.json();
    if (tipo !== "cnh" && tipo !== "crlv") {
      return jsonResponse({ sucesso: false, erro: "tipo precisa ser 'cnh' ou 'crlv'" }, 400);
    }
    if (!path || typeof path !== "string") {
      return jsonResponse({ sucesso: false, erro: "path é obrigatório" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Confirma que quem chamou está autenticado (verify_jwt=true no deploy já
    // barra requisição sem token válido, isso aqui é defesa em profundidade e
    // dá acesso ao user.id se algum dia precisarmos logar quem disparou o OCR).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // A chave do Gemini fica no Supabase Vault (não em env var) — só a função
    // get_gemini_api_key(), chamável apenas por service_role, consegue lê-la.
    const { data: geminiApiKey, error: keyError } = await supabaseAdmin.rpc("get_gemini_api_key");
    if (keyError || !geminiApiKey) {
      return jsonResponse(
        { sucesso: false, erro: "Gemini ainda não configurado (chave não encontrada no Vault)." },
        503,
      );
    }
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from("documentos-pessoais")
      .download(path);
    if (downloadError || !fileBlob) {
      return jsonResponse(
        { sucesso: false, erro: `Não achei o arquivo no Storage: ${downloadError?.message ?? "desconhecido"}` },
        404,
      );
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const base64 = encodeBase64(bytes);
    const mimeType = fileBlob.type && fileBlob.type !== "" ? fileBlob.type : "image/jpeg";

    const prompt = tipo === "cnh" ? CNH_PROMPT : CRLV_PROMPT;
    const schema = tipo === "cnh" ? CNH_SCHEMA : CRLV_SCHEMA;
    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      },
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      return jsonResponse(
        { sucesso: false, erro: `Gemini respondeu ${geminiResp.status}: ${errText.slice(0, 300)}` },
        502,
      );
    }

    const geminiJson = await geminiResp.json();
    const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return jsonResponse({ sucesso: false, erro: "Gemini não devolveu conteúdo legível." }, 502);
    }

    let campos: Record<string, unknown>;
    try {
      campos = JSON.parse(text);
    } catch {
      return jsonResponse({ sucesso: false, erro: "Resposta do Gemini não veio em JSON válido." }, 502);
    }

    return jsonResponse({ sucesso: true, tipo, campos });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
