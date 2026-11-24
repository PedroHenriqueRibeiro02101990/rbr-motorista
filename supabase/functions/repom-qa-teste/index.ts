// Edge Function TEMPORÁRIA repom-qa-teste (verify_jwt = true; chamada com a chave pública anon). APAGAR/DESATIVAR depois do teste.
// Só roda com o segredo REPOM_QA_TESTE_LIBERADO=sim (fora disso responde "desligado"). Só QA (base e token FIXOS no código), só o contrato 2166947.
// Ações: { acao: "token" | "consultar_contrato" | "sequencia", confirmacao?: { nome } }. Regras e travas em _shared/repomQaTeste.ts.
// Credenciais: SOMENTE REPOM_QA_FRETE_* (user, password, partner). Nunca devolve credencial, token nem corpo bruto da Repom.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom } from "../_shared/repomClient.ts";
import { criarRepomFreteClient } from "../_shared/repomFreteClient.ts";
import { configFreteDoAmbiente } from "../_shared/repomFreteConfig.ts";
import { BASE_QA_FIXA, TOKEN_QA_FIXO, chaveLigada, executarQaTeste } from "../_shared/repomQaTeste.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const segredo = async (n: string): Promise<string | null> => {
  const { data, error } = await admin.rpc("repom_segredo", { p_nome: n });
  if (error) throw new Error("config");
  return (data as string | null) ?? null;
};
const J = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ ok: false, erro: "Use POST." }, 405);
  try {
    if (!chaveLigada(await segredo("REPOM_QA_TESTE_LIBERADO"))) return J({ ok: false, desligado: true, erro: "desligado" }, 503);
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ambiente = ambienteRepom(await segredo("REPOM_AMBIENTE"));
    const cfg = await configFreteDoAmbiente("qa", segredo); // só REPOM_QA_FRETE_*
    const frete = criarRepomFreteClient({ ...cfg, ambiente: "qa", urlBase: BASE_QA_FIXA, urlToken: TOKEN_QA_FIXO });
    const saida = await executarQaTeste(corpo, {
      ligado: true,
      ambiente,
      frete,
      hoje: () => new Date().toISOString().slice(0, 10),
      async historico(acao) {
        const { data } = await admin.from("repom_requisicoes").select("status").eq("acao", `qa-teste-${acao}`);
        return (data ?? []).map((x: { status: string }) => x.status);
      },
      async registrar(acao, request) {
        const { data } = await admin.from("repom_requisicoes").insert({ acao: acao.slice(0, 60), ambiente: "qa", idempotency_key: crypto.randomUUID(), request_json: request, status: "pendente" }).select("id").maybeSingle();
        return data?.id ?? null;
      },
      async concluir(id, r) {
        if (!id) return;
        await admin.from("repom_requisicoes").update({ status: r.status, http_status: r.http, response_json: r.resposta, erro: r.erro?.slice(0, 300) ?? null }).eq("id", id);
      },
    });
    return J(saida.corpo, saida.status);
  } catch {
    return J({ ok: false, erro: "Não foi possível concluir agora. Nada foi repetido." }, 500);
  }
});
