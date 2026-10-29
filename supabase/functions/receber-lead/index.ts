// Edge Function: receber-lead  (verify_jwt = false — chamada pelo formulário do site, sem login)
//
// Recebe o formulário da LP (JSON ou application/x-www-form-urlencoded), grava em `leads` com a origem da campanha
// (gclid e UTMs quando vierem) e registra a interação "formulario" em `interacoes`.
// Próxima ação do lead novo: "Primeiro contato", em até 15 min em horário comercial (padrão a revisar — regras.ts).
// Não envia WhatsApp, e-mail nem liga (etapa 1/2 do CRM). O e-mail atual da LP continua em paralelo, pelo próprio site.
//
// Proteções: campo-isca (_honey / website) descarta robô sem avisar; limite de 20 envios por hora por IP
// (tabela tentativas_acesso_publico, a mesma da conta-publica); campos com tamanho máximo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizarLead, prazoPrimeiraAcao } from "./regras.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LIMITE_POR_HORA = 20;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);

  try {
    let corpo: Record<string, unknown> = {};
    const tipo = req.headers.get("content-type") ?? "";
    if (tipo.includes("application/json")) {
      corpo = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) corpo[k] = typeof v === "string" ? v : "";
    }

    const r = normalizarLead(corpo);
    if ("robo" in r) return json({ ok: true }); // não dá pista ao robô
    if ("erro" in r) return json({ ok: false, erro: r.erro }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // IP real: o cabeçalho do proxy vem antes do que o cliente poderia forjar no x-forwarded-for.
    const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? xff[xff.length - 1] ?? "desconhecido";
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("tentativas_acesso_publico")
      .select("id", { count: "exact", head: true })
      .eq("chave", `ip:${ip}`)
      .eq("acao", "lead")
      .gte("criado_em", desde);
    if ((count ?? 0) >= LIMITE_POR_HORA) {
      return json({ ok: false, erro: "Muitos envios seguidos. Fale com a gente pelo WhatsApp." }, 429);
    }
    await admin.from("tentativas_acesso_publico").insert({ chave: `ip:${ip}`, acao: "lead" });

    const agora = new Date();
    const { data: lead, error } = await admin
      .from("leads")
      .insert({ ...r.lead, proxima_acao: "Primeiro contato", proxima_acao_em: prazoPrimeiraAcao(agora).toISOString() })
      .select("id")
      .single();
    if (error || !lead) {
      console.error("[receber-lead] insert lead", error?.message);
      return json({ ok: false, erro: "Não consegui registrar agora. Fale com a gente pelo WhatsApp." }, 500);
    }

    const resumo = [
      r.lead.origem_cidade || r.lead.destino_cidade
        ? `Rota: ${r.lead.origem_cidade ?? "?"}/${r.lead.origem_uf ?? "?"} → ${r.lead.destino_cidade ?? "?"}/${r.lead.destino_uf ?? "?"}`
        : null,
      r.lead.veiculo ? `Veículo: ${r.lead.veiculo}` : null,
      r.lead.mensagem ? `Mensagem: ${r.lead.mensagem}` : null,
      r.lead.utm_campaign ? `Campanha: ${r.lead.utm_campaign}` : null,
    ].filter(Boolean).join("\n");
    const { error: errInt } = await admin
      .from("interacoes")
      .insert({ lead_id: lead.id, tipo: "formulario", direcao: "entrada", ocorreu_em: agora.toISOString(), conteudo: resumo || null });
    if (errInt) console.error("[receber-lead] insert interacao", errInt.message);

    return json({ ok: true, id: lead.id });
  } catch (e) {
    console.error("[receber-lead]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, erro: "Não consegui registrar agora. Fale com a gente pelo WhatsApp." }, 500);
  }
});
