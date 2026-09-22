// Edge Function: avaliar-risco-carga
//
// Recebe a descrição dos produtos de uma NF-e (já extraída no navegador pelo
// nfeParser) e pede pro Gemini uma SUGESTÃO sobre os Eixos 1 e 2 de carga
// complexa (carga-complexa-criterio.md): parece produto químico/perigoso?
// Parece carga superdimensionada/equipamento pesado?
//
// Isso existe porque não temos (ainda) uma lista oficial de NCM de produto
// perigoso pra cruzar automaticamente — em vez disso, usamos o modelo pra ler
// a descrição em português normal e dar um palpite, com justificativa.
//
// IMPORTANTE: isto é só uma sugestão pra ajudar o agenciador/gestor a decidir
// mais rápido. Nunca é usado pra marcar os campos sozinho — o app sempre pede
// confirmação humana antes de gravar o checkbox de verdade. Não substitui o
// número ONU oficial do CT-e nem qualquer obrigação regulatória.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCHEMA = {
  type: "object",
  properties: {
    possivel_perigoso: { type: "boolean" },
    motivo_perigoso: { type: "string", nullable: true },
    possivel_superdimensionada: { type: "boolean" },
    motivo_superdimensionada: { type: "string", nullable: true },
  },
  required: ["possivel_perigoso", "motivo_perigoso", "possivel_superdimensionada", "motivo_superdimensionada"],
};

function montaPrompt(produtos: { descricao: string; ncm: string | null }[], pesoBrutoKg: number | null, valorNota: number | null): string {
  const listaProdutos = produtos
    .map((p, i) => `${i + 1}. ${p.descricao || "(sem descrição)"}${p.ncm ? ` — NCM ${p.ncm}` : ""}`)
    .join("\n");

  return `Você está ajudando uma transportadora rodoviária brasileira (RBR Cargo) a triar cargas antes de alocar
um motorista. Olhando SÓ pela descrição dos produtos de uma nota fiscal (não é uma análise legal nem substitui
o número ONU oficial do CT-e), responda duas perguntas objetivas:

1) "possivel_perigoso": esses produtos parecem ser carga perigosa/produto químico (o tipo que exigiria MOPP do
motorista e ficha de emergência/painel de segurança no veículo — ex: combustíveis, solventes, ácidos, gases,
explosivos, produtos tóxicos ou corrosivos)? Se sim, explique brevemente o motivo em "motivo_perigoso"
(cite qual produto chamou atenção). Se não, "motivo_perigoso" pode ser null.

2) "possivel_superdimensionada": pelo peso informado e/ou pela descrição, parece ser carga indivisível fora do
padrão (equipamento pesado, estrutura pré-moldada, pá eólica, transformador, máquina de grande porte — o tipo
que exigiria Autorização Especial de Trânsito/AET e veículo tipo prancha)? Explique em "motivo_superdimensionada"
se sim, ou deixe null se não.

Seja conservador: só marque true quando houver indício razoável na descrição, não invente risco por produtos
comuns ou genéricos. Na dúvida genuína, prefira false e deixe o humano decidir.

Peso bruto total da nota: ${pesoBrutoKg !== null ? `${pesoBrutoKg} kg` : "não informado"}
Valor total da nota: ${valorNota !== null ? `R$ ${valorNota}` : "não informado"}

Produtos da nota:
${listaProdutos || "(nenhum produto lido)"}`;
}

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
    const { produtos, pesoBrutoKg, valorNota } = await req.json();
    if (!Array.isArray(produtos) || produtos.length === 0) {
      return jsonResponse({ sucesso: false, erro: "É preciso mandar ao menos um produto (produtos: [...])." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: geminiApiKey, error: keyError } = await supabaseAdmin.rpc("get_gemini_api_key");
    if (keyError || !geminiApiKey) {
      return jsonResponse(
        { sucesso: false, erro: "Gemini ainda não configurado (chave não encontrada no Vault)." },
        503,
      );
    }

    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const prompt = montaPrompt(produtos, pesoBrutoKg ?? null, valorNota ?? null);

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
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

    let avaliacao: Record<string, unknown>;
    try {
      avaliacao = JSON.parse(text);
    } catch {
      return jsonResponse({ sucesso: false, erro: "Resposta do Gemini não veio em JSON válido." }, 502);
    }

    return jsonResponse({ sucesso: true, avaliacao });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
