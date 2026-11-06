// Edge Function: repom-status  (verify_jwt = true)  NÃO PUBLICADA.
// Diz ao front se o cálculo automático de pedágio está ligado e em que ambiente (qa|prd), e se as credenciais estão
// cadastradas, SEM expor nenhum valor secreto e SEM chamar a Repom (não gasta consulta). Gestor ou agenciador logados.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom } from "../_shared/repomClient.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const segredo = async (n: string) => ((await admin.rpc("repom_segredo", { p_nome: n })).data as string | null) ?? null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return json({ ok: false, erro: "Não autenticado." }, 401);
  const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
  if (p?.papel !== "gestor_rbr" && p?.papel !== "agenciador") return json({ ok: false, erro: "Sem permissão." }, 403);
  try {
    const [hab, amb, login, senha] = await Promise.all([segredo("REPOM_ROTEIRIZACAO_HABILITADO"), segredo("REPOM_AMBIENTE"), segredo("REPOM_VPR_ROTEIRIZACAO_LOGIN"), segredo("REPOM_VPR_ROTEIRIZACAO_SENHA")]);
    const ambiente = ambienteRepom(amb);
    return json({ ok: true, habilitado: hab === "sim", ambiente, emTeste: ambiente !== "prd", credenciaisCadastradas: Boolean(login && senha) });
  } catch {
    return json({ ok: false, erro: "Não consegui ler a configuração." });
  }
});
