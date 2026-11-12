// Edge Function: repom-status  (verify_jwt = true)
// Diz ao front e ao Pedro: ambiente (qa|prd), se a TRAVA de custo está liberada (REPOM_ROTEIRIZACAO_LIBERADA = sim), o limite diário
// (REPOM_LIMITE_DIARIO, padrão 100) e o uso de hoje (repom_requisicoes), e se as credenciais existem. NUNCA expõe valor de segredo.
// Por padrão NÃO chama a Repom. Com { "verificar_token": true} faz UMA única chamada de token (não consulta rota nem pedágio) e
// informa só se o token foi obtido. Gestor ou agenciador logados (o agenciador usa o estado "liberada" para mostrar o botão).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom, criarRepomClient } from "../_shared/repomClient.ts";
import { inicioDoDia, limiteDiario, travaLiberada } from "../_shared/repomTrava.ts";

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
    const corpo = (await req.json().catch(() => ({}))) as { verificar_token?: unknown };
    const [lib, amb, lim, login, senha, codigo] = await Promise.all([
      segredo("REPOM_ROTEIRIZACAO_LIBERADA"), segredo("REPOM_AMBIENTE"), segredo("REPOM_LIMITE_DIARIO"),
      segredo("REPOM_VPR_ROTEIRIZACAO_LOGIN"), segredo("REPOM_VPR_ROTEIRIZACAO_SENHA"), segredo("REPOM_VPR_CODIGO_CLIENTE"),
    ]);
    const ambiente = ambienteRepom(amb);
    const { count } = await admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).eq("acao", "pedagio-rota").in("status", ["pendente", "ok", "erro"]).gte("criado_em", inicioDoDia());
    const saida: Record<string, unknown> = {
      ok: true,
      ambiente,
      emTeste: ambiente !== "prd",
      liberada: travaLiberada(lib),
      limiteDiario: limiteDiario(lim),
      usoHoje: count ?? 0,
      credenciaisCadastradas: Boolean(login && senha),
    };
    if (corpo.verificar_token === true) {
      if (!login || !senha) saida.tokenObtido = false;
      else {
        const repom = criarRepomClient({ ambiente, codigoCliente: codigo ?? "", roteirizacaoLogin: login, roteirizacaoSenha: senha, valePedagioLogin: "", valePedagioSenha: "" });
        saida.tokenObtido = (await repom.verificarToken()).ok;
      }
    }
    return json(saida);
  } catch {
    return json({ ok: false, erro: "Não consegui ler a configuração." });
  }
});
