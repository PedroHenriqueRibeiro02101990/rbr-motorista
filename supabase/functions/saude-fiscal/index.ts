// Edge Function: saude-fiscal  (verify_jwt = true)
//
// G02/G03/G09: lê as operações abertas, os documentos e o CIOT/VPO, aplica as checagens de _shared/saudeFiscal.ts e grava os
// achados em saude_fiscal_achados (os anteriores ainda não resolvidos do mesmo robô são marcados como resolvidos antes).
// Só leitura do resto do banco: NÃO emite, NÃO cancela e NÃO averba nada. Só gestor RBR chama. Ainda sem agendamento (pg_cron).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { avaliarSaudeFiscal, corGeral } from "../_shared/saudeFiscal.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u } = await comoUsuario.auth.getUser();
    if (!u?.user) return json({ ok: false, erro: "Não autenticado." }, 401);
    const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", u.user.id).maybeSingle();
    if (p?.papel !== "gestor_rbr") return json({ ok: false, erro: "Só um gestor RBR vê a saúde fiscal." }, 403);

    const corte = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const [ops, docs, ciot] = await Promise.all([
      admin.from("operacoes").select("id, status, entregue_em, eh_teste").is("deleted_at", null).gt("created_at", corte),
      admin.from("documentacao_operacao").select("operacao_id, tipo, status, emitido_em, atualizado_em").gt("created_at", corte),
      admin.from("operacao_ciot_vpo").select("operacao_id, ciot_status, ciot_fim_previsto, vpo_idvpo"),
    ]);
    const erro = ops.error ?? docs.error ?? ciot.error;
    if (erro) return json({ ok: false, erro: erro.message }, 500);

    const achados = avaliarSaudeFiscal({
      operacoes: (ops.data ?? []) as never,
      documentos: (docs.data ?? []) as never,
      ciot: (ciot.data ?? []) as never,
      agora: Date.now(),
    });

    await admin.from("saude_fiscal_achados").update({ resolvido_em: new Date().toISOString() }).eq("robo", "reconciliador").is("resolvido_em", null);
    if (achados.length) await admin.from("saude_fiscal_achados").insert(achados);

    return json({ ok: true, cor: corGeral(achados), total: achados.length, achados });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
