// Edge Function TEMPORÁRIA repom-qa-teste (verify_jwt = true; chamada com a chave pública anon). APAGAR/DESATIVAR depois do teste.
// Só roda com o segredo REPOM_QA_TESTE_LIBERADO=sim (fora disso responde "desligado"). Só QA (base e token FIXOS no código), só o contrato 2166947.
// Ações: { acao: "token" | "consultar_contrato" | "sequencia" | "ler_autorizacao" | "rodada_autorizar" | "saldo" | "ler_modelo" | "criar_rota" | "consultar_rota" | "emitir_adiantamento" | "cancelar_adiantamento" | "ler_rota_ibge" | "consultar_emissao" | "baixar_comprovante" | "consultar_contrato_por_id" | "cancelar_contrato", confirmacao?: { nome } }. Regras e travas em _shared/repomQaTeste.ts.
// Credenciais: SOMENTE REPOM_QA_FRETE_* (user, password, partner). Nunca devolve credencial, token nem corpo bruto da Repom.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom } from "../_shared/repomClient.ts";
import { criarRepomFreteClient } from "../_shared/repomFreteClient.ts";
import { configFreteDoAmbiente } from "../_shared/repomFreteConfig.ts";
import { RODADA_ROTA_INICIO } from "../_shared/repomQaAdiantamento.ts";
import { criarRepomVprClient } from "../_shared/repomVprClient.ts";
import { ACOES_VPR, executarQaVpr } from "../_shared/repomQaVpr.ts";
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
    const frete = criarRepomFreteClient({ ...cfg, ambiente: "qa", urlBase: BASE_QA_FIXA, urlToken: TOKEN_QA_FIXO, limiteMs: 100_000 });
    // Ações do VALE-PEDÁGIO (conta 9501): segredos PRÓPRIOS (nunca os do Frete). Os dados de teste do 9520 só são LIDOS.
    if ((ACOES_VPR as readonly string[]).includes(String(corpo.acao ?? ""))) {
      const login = (await segredo("REPOM_QA_VPR_VALEPEDAGIO_LOGIN")) ?? (await segredo("REPOM_VPR_VALEPEDAGIO_LOGIN")) ?? "";
      const senha = (await segredo("REPOM_QA_VPR_VALEPEDAGIO_SENHA")) ?? (await segredo("REPOM_VPR_VALEPEDAGIO_SENHA")) ?? "";
      // roteirização da 9501 (client_credentials), credencial DIFERENTE da do vale
      const rotLogin = (await segredo("REPOM_QA_VPR_ROTEIRIZACAO_LOGIN")) ?? (await segredo("REPOM_VPR_ROTEIRIZACAO_LOGIN")) ?? "";
      const rotSenha = (await segredo("REPOM_QA_VPR_ROTEIRIZACAO_SENHA")) ?? (await segredo("REPOM_VPR_ROTEIRIZACAO_SENHA")) ?? "";
      const cfgVpr = { ambiente: "qa" as const, roteirizacaoLogin: rotLogin, roteirizacaoSenha: rotSenha, valePedagioLogin: login, valePedagioSenha: senha, limiteMs: 60_000 };
      const ultima = async (processo?: string) => {
        let q = admin.from("repom_requisicoes").select("response_json").eq("acao", "qa-teste-vpr-emitir").eq("status", "ok").order("criado_em", { ascending: false }).limit(1);
        if (processo) q = q.eq("request_json->>processo", processo);
        const { data } = await q;
        const r = data?.[0]?.response_json as { processo?: string; codigoViagem?: string } | undefined;
        return r?.processo ? { processo: r.processo, codigoViagem: r.codigoViagem ?? null } : null;
      };
      const saidaVpr = await executarQaVpr(corpo, {
        ligado: true,
        frete,
        vpr: criarRepomVprClient({ ...cfgVpr, verboConsultaVale: "GET" }),
        vprPost: criarRepomVprClient({ ...cfgVpr, verboConsultaVale: "POST" }),
        agora: () => new Date(),
        async rotaVpr() {
          const { data } = await admin.from("repom_requisicoes").select("response_json").eq("acao", "qa-teste-vpr-rota").eq("status", "ok").order("criado_em", { ascending: false }).limit(1);
          const r = data?.[0]?.response_json as { roteiroCodigo?: number; percursoCodigo?: number } | undefined;
          return r && Number.isInteger(r.roteiroCodigo) && Number.isInteger(r.percursoCodigo) ? { roteiroCodigo: r.roteiroCodigo!, percursoCodigo: r.percursoCodigo! } : null;
        },
        async historico(acao) {
          const { data } = await admin.from("repom_requisicoes").select("status").eq("acao", "qa-teste-vpr-" + acao);
          return (data ?? []).map((x: { status: string }) => x.status);
        },
        emissao: ultima,
        async registrar(acao, request) {
          const { data } = await admin.from("repom_requisicoes").insert({ acao: acao.slice(0, 60), ambiente: "qa", idempotency_key: crypto.randomUUID(), request_json: request, status: "pendente" }).select("id").maybeSingle();
          return data?.id ?? null;
        },
        async concluir(id, r) {
          if (!id) return;
          await admin.from("repom_requisicoes").update({ status: r.status, http_status: r.http, response_json: r.resposta, erro: r.erro?.slice(0, 300) ?? null }).eq("id", id);
        },
      });
      return J(saidaVpr.corpo, saidaVpr.status);
    }
    const saida = await executarQaTeste(corpo, {
      ligado: true,
      ambiente,
      frete,
      agora: () => new Date(),
      espera: (ms) => new Promise((r) => setTimeout(r, ms)),
      async ultimaEmissao() {
        const { data } = await admin.from("repom_requisicoes").select("request_json").eq("acao", "qa-teste-emitir-adiantamento").order("criado_em", { ascending: false }).limit(1);
        const id = (data?.[0]?.request_json as { identifier?: string } | undefined)?.identifier;
        return typeof id === "string" ? id : null;
      },
      async tentativasRota() {
        const { data } = await admin.from("repom_requisicoes").select("request_json").eq("acao", "qa-teste-criar-rota").order("criado_em", { ascending: false });
        return (data ?? []).map((x: { request_json: { traceIdentifier?: string } | null }) => x.request_json?.traceIdentifier).filter((t: unknown): t is string => typeof t === "string");
      },
      async rotaCriada() {
        const { data } = await admin.from("repom_requisicoes").select("response_json").eq("acao", "qa-teste-criar-rota").eq("status", "ok").order("criado_em", { ascending: false }).limit(1);
        const r = data?.[0]?.response_json as { traceCode?: number; routeCode?: number; eixos?: number } | undefined;
        return r && Number.isInteger(r.traceCode) && Number.isInteger(r.routeCode) ? { traceCode: r.traceCode!, routeCode: r.routeCode!, eixos: Number.isInteger(r.eixos) ? r.eixos! : 5 } : null;
      },
      async tentativasComRota(routeCode) {
        const { data } = await admin.from("repom_requisicoes").select("status, request_json").eq("acao", "qa-teste-emitir-adiantamento");
        return (data ?? []).filter((x: { request_json: { rota_route?: number } | null }) => x.request_json?.rota_route === routeCode).map((x: { status: string }) => x.status);
      },
      hoje: () => new Date().toISOString().slice(0, 10),
      amanha: () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10), // dia seguinte (AAAA-MM-DD, formato do guia); a Repom recusa a data de hoje
      async historico(acao) {
        // Rodada 2 (24/11/2026): as tentativas de criar rota feitas antes de RODADA_ROTA_INICIO (22:23 e 22:24) não contam, por autorização do Pedro.
        let q = admin.from("repom_requisicoes").select("status").eq("acao", `qa-teste-${acao}`);
        if (acao === "criar-rota") q = q.gte("criado_em", RODADA_ROTA_INICIO);
        const { data } = await q;
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
