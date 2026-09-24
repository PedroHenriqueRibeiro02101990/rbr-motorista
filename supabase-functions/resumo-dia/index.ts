// Edge Function: resumo-dia  (verify_jwt = true, só gestor)
// Lê o painel do dia (RPC painel_inicio, com o login do gestor) e pede à IA um resumo curto
// do que mais importa hoje. Não grava nada.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `Você é o assistente de operações da RBR Cargo, agenciadora de fretes rodoviários.
Com base no JSON do painel do dia abaixo, escreva um resumo para o gestor, em português do Brasil,
em 3 a 5 frases curtas e diretas (sem listas, sem markdown, sem títulos).
Comece pelo que é mais urgente (itens de nível "vermelho"), depois o que pode esperar, e feche com uma frase
sobre o mês (cotações, conversão, faturamento e lucro comparados ao mês anterior) e o caixa.
Use valores em R$ arredondados. Não invente nada que não esteja no JSON. Se não houver alertas, diga que o dia está tranquilo.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // painel_inicio só responde para gestor — é a checagem de permissão.
    const { data: painel, error } = await asUser.rpc("painel_inicio");
    if (error || !painel) return json({ ok: false, erro: error?.message ?? "Sem permissão." }, 403);

    const { data: chave } = await admin.rpc("get_gemini_api_key");
    if (!chave) return json({ ok: false, erro: "Leitura por IA indisponível (chave não configurada)." }, 503);

    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${chave}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + "\n\nPAINEL:\n" + JSON.stringify(painel) }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!resp.ok) return json({ ok: false, erro: `IA respondeu ${resp.status}` }, 502);
    const r = await resp.json();
    const texto = (r?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!texto) return json({ ok: false, erro: "A IA não devolveu texto." }, 502);
    return json({ ok: true, texto, gerado_em: new Date().toISOString() });
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});
