// Edge Function: repom-status  (verify_jwt = true)
// Diz ao front e ao Pedro: ambiente (qa|prd), se as TRAVAS estão liberadas (roteirização: REPOM_ROTEIRIZACAO_LIBERADA; API completa:
// REPOM_API_LIBERADA), o limite diário GLOBAL (REPOM_LIMITE_DIARIO, padrão 100) e o uso de hoje (repom_requisicoes, todas as ações), o valor
// máximo por operação (REPOM_VALOR_MAXIMO_OPERACAO, padrão 3000) e quais credenciais existem (só sim/não). NUNCA expõe valor de segredo.
// Por padrão NÃO chama a Repom. Com { "verificar_token": true | "roteirizacao" | "vale" | "frete" } faz UMA única chamada de token da API
// escolhida (não consulta rota, pedágio nem contrato) e informa só se o token foi obtido. Só o gestor pode pedir a verificação.
// Gestor ou agenciador logados (o agenciador usa "liberada" para mostrar o botão); o agenciador NÃO recebe os campos da API completa.
// CORS restrito ao domínio do app.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom } from "../_shared/repomClient.ts";
import { criarRepomFreteClient, lerFormatoToken } from "../_shared/repomFreteClient.ts";
import { corsPara } from "../_shared/repomHttp.ts";
import { criarRepomVprClient } from "../_shared/repomVprClient.ts";
import { inicioDoDia, limiteDiario, travaLiberada, valorMaximoOperacao } from "../_shared/repomTrava.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const segredo = async (n: string) => ((await admin.rpc("repom_segredo", { p_nome: n })).data as string | null) ?? null;

Deno.serve(async (req) => {
  const cors = corsPara(req.headers.get("origin"), Deno.env.get("REPOM_CORS_ORIGENS"));
  const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return json({ ok: false, erro: "Não autenticado." }, 401);
  const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
  const gestor = p?.papel === "gestor_rbr";
  if (!gestor && p?.papel !== "agenciador") return json({ ok: false, erro: "Sem permissão." }, 403);
  try {
    const corpo = (await req.json().catch(() => ({}))) as { verificar_token?: unknown };
    const [lib, amb, lim, login, senha, apiLib, valMax, valeLogin, valeSenha, fUser, fSenha, fPartner, fVersao, fToken] = await Promise.all([
      segredo("REPOM_ROTEIRIZACAO_LIBERADA"), segredo("REPOM_AMBIENTE"), segredo("REPOM_LIMITE_DIARIO"),
      segredo("REPOM_VPR_ROTEIRIZACAO_LOGIN"), segredo("REPOM_VPR_ROTEIRIZACAO_SENHA"),
      segredo("REPOM_API_LIBERADA"), segredo("REPOM_VALOR_MAXIMO_OPERACAO"), segredo("REPOM_VPR_VALEPEDAGIO_LOGIN"), segredo("REPOM_VPR_VALEPEDAGIO_SENHA"),
      segredo("REPOM_FRETE_USER"), segredo("REPOM_FRETE_PASSWORD"), segredo("REPOM_FRETE_PARTNER"), segredo("REPOM_FRETE_VERSION"), segredo("REPOM_FRETE_URL_TOKEN"),
    ]);
    const ambiente = ambienteRepom(amb);
    // uso do dia: TODAS as ações que foram (ou vão) à Repom; cache e bloqueios não entram
    const { count } = await admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).in("status", ["pendente", "ok", "erro"]).gte("criado_em", inicioDoDia());
    const saida: Record<string, unknown> = {
      ok: true,
      ambiente,
      emTeste: ambiente !== "prd",
      liberada: travaLiberada(lib),
      limiteDiario: limiteDiario(lim),
      usoHoje: count ?? 0,
      credenciaisCadastradas: Boolean(login && senha),
    };
    if (gestor) {
      saida.apiLiberada = travaLiberada(apiLib);
      saida.valorMaximoOperacao = valorMaximoOperacao(valMax);
      saida.valePedagioCredenciaisCadastradas = Boolean(valeLogin && valeSenha);
      saida.freteCredenciaisCadastradas = Boolean(fUser && fSenha && fPartner && fVersao && fToken);
      const v = corpo.verificar_token;
      // UMA chamada de token da API pedida (padrão: roteirização, como antes)
      if (v === true || v === "roteirizacao" || v === "vale") {
        const vpr = criarRepomVprClient({ ambiente, roteirizacaoLogin: login ?? "", roteirizacaoSenha: senha ?? "", valePedagioLogin: valeLogin ?? "", valePedagioSenha: valeSenha ?? "" });
        saida.tokenObtido = await vpr.verificarToken(v === "vale" ? "vale" : "roteirizacao");
      } else if (v === "frete") {
        const frete = criarRepomFreteClient({
          ambiente,
          credenciais: { user: fUser ?? "", version: fVersao ?? "", password: fSenha ?? "", partner: fPartner ?? "" },
          urlToken: fToken ?? undefined,
          tokenFormato: lerFormatoToken(await segredo("REPOM_FRETE_TOKEN_FORMATO")),
          urlBase: (await segredo("REPOM_FRETE_URL_BASE")) ?? undefined,
        });
        saida.tokenObtido = (await frete.verificarToken()).ok;
      }
    }
    return json(saida);
  } catch {
    return json({ ok: false, erro: "Não consegui ler a configuração." });
  }
});
