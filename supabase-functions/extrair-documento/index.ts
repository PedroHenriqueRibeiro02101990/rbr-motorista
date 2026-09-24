// Edge Function: extrair-documento
//
// Lê uma imagem já enviada ao Storage (bucket `documentos-pessoais`) com o
// Gemini e extrai os campos de CNH, RG, CRLV ou Cartão CNPJ — incluindo sinais
// de fraude (foto de tela, montagem) e legibilidade.
//
// Dois modos:
//  - sem `documento_id`: só devolve os campos (pré-preenche o formulário).
//  - com `documento_id`: grava os campos na linha de documentos_pessoais_imagens.
//    Isso dispara a esteira de verificação automática no banco
//    (avaliar_cadastro), que aprova, manda pra análise ou recusa.
//
// Segurança: só o dono do arquivo (pessoa/<id próprio>, veiculo/<veículo dele>,
// pessoa/<condutor dele>) ou um gestor pode pedir a leitura. Os campos lidos
// só são gravados por aqui (service role) — o app não consegue forjá-los.
// A leitura fica em cache por arquivo, pra não pagar/gastar cota duas vezes.
//
// A chave do Gemini fica no Supabase Vault (get_gemini_api_key, só service_role).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMUM = `Se um campo não estiver legível ou não existir na imagem, devolva null — nunca invente.
Além dos dados, avalie a própria imagem:
- "legivel": false se a foto estiver borrada, cortada, escura ou com reflexo que impeça a leitura dos dados principais.
- "suspeita_fraude": true se houver sinais de montagem/edição (fontes ou alinhamentos diferentes, recortes, sobreposição),
  se for foto de outra tela (moiré, pixels, borda de monitor/celular) ou fotocópia de fotocópia; explique em "motivo_suspeita".
  Documento digital oficial (CNH-e, CRLV-e) aberto no celular do próprio titular NÃO é fraude por si só.`;

const PROMPTS: Record<string, string> = {
  cnh: `Você está lendo uma foto de Carteira Nacional de Habilitação (CNH) brasileira (física ou digital).
Extraia os campos do schema. Validade em YYYY-MM-DD. Categoria é a combinação de letras (ex: "AE", "B", "D").
"ear": true se no campo de observações constar "EAR" (Exerce Atividade Remunerada); false se o campo de observações
estiver legível e não tiver EAR; null se não der pra ler. CPF só com números. ${COMUM}`,
  rg: `Você está lendo uma foto de documento de identidade brasileiro (RG / Carteira de Identidade, física ou digital).
Extraia os campos do schema. CPF só com números (se o documento tiver). Data de nascimento em YYYY-MM-DD. ${COMUM}`,
  crlv: `Você está lendo uma foto de CRLV / CRLV-e (Certificado de Registro e Licenciamento de Veículo) brasileiro.
Extraia os campos do schema. "exercicio" é o ano do licenciamento (campo EXERCÍCIO). "cpf_cnpj_proprietario" é o CPF ou
CNPJ do proprietário, só números/letras. Capacidade de carga em quilogramas (número). ${COMUM}`,
  cartao_cnpj: `Você está lendo o Comprovante de Inscrição e de Situação Cadastral (Cartão CNPJ) emitido pela Receita Federal.
Extraia os campos do schema. "cnpj" só com números e letras (o CNPJ pode ser alfanumérico). "situacao_cadastral" como aparece
(ex: "ATIVA", "BAIXADA", "INAPTA", "SUSPENSA"). "data_emissao" é a data em que o comprovante foi emitido (YYYY-MM-DD). ${COMUM}`,
};

const AVALIACAO = {
  legivel: { type: "boolean", nullable: true },
  suspeita_fraude: { type: "boolean", nullable: true },
  motivo_suspeita: { type: "string", nullable: true },
};

const SCHEMAS: Record<string, { type: string; properties: Record<string, unknown>; required: string[] }> = {
  cnh: {
    type: "object",
    properties: {
      numero_registro: { type: "string", nullable: true },
      categoria: { type: "string", nullable: true },
      validade: { type: "string", nullable: true },
      nome: { type: "string", nullable: true },
      cpf: { type: "string", nullable: true },
      ear: { type: "boolean", nullable: true },
      ...AVALIACAO,
    },
    required: ["numero_registro", "categoria", "validade", "nome", "cpf", "ear", "legivel", "suspeita_fraude"],
  },
  rg: {
    type: "object",
    properties: {
      nome: { type: "string", nullable: true },
      cpf: { type: "string", nullable: true },
      numero_rg: { type: "string", nullable: true },
      data_nascimento: { type: "string", nullable: true },
      ...AVALIACAO,
    },
    required: ["nome", "cpf", "numero_rg", "legivel", "suspeita_fraude"],
  },
  crlv: {
    type: "object",
    properties: {
      placa: { type: "string", nullable: true },
      renavam: { type: "string", nullable: true },
      chassi: { type: "string", nullable: true },
      marca_modelo: { type: "string", nullable: true },
      ano: { type: "integer", nullable: true },
      exercicio: { type: "integer", nullable: true },
      capacidade_carga: { type: "number", nullable: true },
      cpf_cnpj_proprietario: { type: "string", nullable: true },
      nome_proprietario: { type: "string", nullable: true },
      uf: { type: "string", nullable: true },
      ...AVALIACAO,
    },
    required: ["placa", "renavam", "marca_modelo", "ano", "exercicio", "cpf_cnpj_proprietario", "legivel", "suspeita_fraude"],
  },
  cartao_cnpj: {
    type: "object",
    properties: {
      cnpj: { type: "string", nullable: true },
      razao_social: { type: "string", nullable: true },
      nome_fantasia: { type: "string", nullable: true },
      situacao_cadastral: { type: "string", nullable: true },
      data_emissao: { type: "string", nullable: true },
      ...AVALIACAO,
    },
    required: ["cnpj", "razao_social", "situacao_cadastral", "legivel", "suspeita_fraude"],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  try {
    const { tipo, path, documento_id } = await req.json();
    if (!PROMPTS[tipo]) {
      return jsonResponse({ sucesso: false, erro: "tipo precisa ser cnh, rg, crlv ou cartao_cnpj" }, 400);
    }
    if (!path || typeof path !== "string" || path.includes("..")) {
      return jsonResponse({ sucesso: false, erro: "path inválido" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAsUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ---- Quem está pedindo pode ler esse arquivo? ----
    const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!ator) return jsonResponse({ sucesso: false, erro: "Cadastro não encontrado." }, 403);
    const partes = path.split("/");
    let permitido = ator.papel === "gestor_rbr";
    if (!permitido && partes[0] === "pessoa") {
      if (partes[1] === ator.id) permitido = true;
      else {
        const { data: cond } = await admin.from("pessoas").select("id").eq("id", partes[1]).eq("papel", "condutor").eq("titular_id", ator.id).maybeSingle();
        permitido = !!cond;
      }
    } else if (!permitido && partes[0] === "veiculo") {
      const { data: v } = await admin.from("veiculos").select("id").eq("id", partes[1]).eq("titular_id", ator.id).maybeSingle();
      permitido = !!v;
    }
    if (!permitido) return jsonResponse({ sucesso: false, erro: "Sem permissão para este arquivo." }, 403);

    // Se vai gravar, a linha do documento tem que ser desse arquivo.
    let doc: { id: string; tipo: string; arquivo_url: string } | null = null;
    if (documento_id) {
      const { data } = await admin.from("documentos_pessoais_imagens").select("id, tipo, arquivo_url").eq("id", documento_id).maybeSingle();
      if (!data || data.arquivo_url !== path || data.tipo !== tipo) {
        return jsonResponse({ sucesso: false, erro: "Documento não confere com o arquivo." }, 400);
      }
      doc = data;
    }

    // ---- Cache ----
    const { data: cache } = await admin.from("documento_extracoes").select("campos, tipo").eq("path", path).maybeSingle();
    let campos: Record<string, unknown> | null = cache && cache.tipo === tipo ? (cache.campos as Record<string, unknown>) : null;

    if (!campos) {
      const { data: geminiApiKey, error: keyError } = await admin.rpc("get_gemini_api_key");
      if (keyError || !geminiApiKey) {
        return jsonResponse({ sucesso: false, erro: "Leitura automática indisponível (chave da IA não configurada)." }, 503);
      }
      const { data: fileBlob, error: downloadError } = await admin.storage.from("documentos-pessoais").download(path);
      if (downloadError || !fileBlob) {
        return jsonResponse({ sucesso: false, erro: `Arquivo não encontrado: ${downloadError?.message ?? "?"}` }, 404);
      }
      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      if (bytes.length > 15 * 1024 * 1024) return jsonResponse({ sucesso: false, erro: "Arquivo grande demais (máx. 15 MB)." }, 413);
      const mimeType = fileBlob.type && fileBlob.type !== "" ? fileBlob.type : "image/jpeg";
      const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPTS[tipo] }, { inline_data: { mime_type: mimeType, data: encodeBase64(bytes) } }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMAS[tipo], temperature: 0 },
          }),
        },
      );
      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        return jsonResponse({ sucesso: false, erro: `IA respondeu ${geminiResp.status}: ${errText.slice(0, 200)}` }, 502);
      }
      const geminiJson = await geminiResp.json();
      const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return jsonResponse({ sucesso: false, erro: "A IA não devolveu conteúdo." }, 502);
      try {
        campos = JSON.parse(text);
      } catch {
        return jsonResponse({ sucesso: false, erro: "Resposta da IA fora do formato." }, 502);
      }
      await admin.from("documento_extracoes").upsert({ path, tipo, campos });
    }

    // ---- Grava e dispara a verificação ----
    if (doc) {
      const { error: upErr } = await admin
        .from("documentos_pessoais_imagens")
        .update({ campos_extraidos: campos, extraido_em: new Date().toISOString() })
        .eq("id", doc.id);
      if (upErr) return jsonResponse({ sucesso: false, erro: upErr.message }, 500);
    }

    return jsonResponse({ sucesso: true, tipo, campos, gravado: !!doc });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
