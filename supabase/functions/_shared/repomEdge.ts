// Parte COMUM das edge functions repom-vpo e repom-frete (código Deno; a regra de negócio está em repomFluxos.ts e é testada com mock).
// verify_jwt = true no deploy E checagem de gestor_rbr aqui (defesa em profundidade). CORS restrito ao domínio do app (repomHttp.ts).
// Segredos vêm do Vault por repom_segredo (só service_role) e NUNCA entram em resposta, log ou registro.
// Cada chamada que pode ir à Repom vira uma linha em repom_requisicoes (sem payload pessoal), que também alimenta o limite diário global.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom, higienizar } from "./repomClient.ts";
import { corsPara } from "./repomHttp.ts";
import { sanitizarPayload, type RegistroOperacaoRepom, type RepositorioOperacaoRepom } from "./repomOperacao.ts";
import { decidirLimite, inicioDoDia, limiteDiario, travaLiberada, valorMaximoOperacao } from "./repomTrava.ts";
import type { DepsFluxo, SaidaFluxo } from "./repomFluxos.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export const segredo = async (nome: string): Promise<string | null> => {
  const { data, error } = await admin.rpc("repom_segredo", { p_nome: nome });
  if (error) throw new Error("Não consegui ler a configuração da Repom.");
  return (data as string | null) ?? null;
};

const repo: RepositorioOperacaoRepom = {
  async buscar(operacaoId, tipo, ambiente) {
    const { data } = await admin.from("repom_operacoes").select("*").eq("operacao_id", operacaoId).eq("tipo", tipo).eq("ambiente", ambiente).maybeSingle();
    return (data as RegistroOperacaoRepom | null) ?? null;
  },
  async criar(r) {
    const { data, error } = await admin.from("repom_operacoes").insert(r).select("*").single();
    if (error) throw new Error("Não consegui registrar a operação.");
    return data as RegistroOperacaoRepom;
  },
  async atualizar(id, patch) {
    const { id: _i, criado_em: _c, atualizado_em: _a, ...resto } = patch;
    const { data, error } = await admin.from("repom_operacoes").update(resto).eq("id", id).select("*").single();
    if (error) throw new Error("Não consegui atualizar a operação.");
    return data as RegistroOperacaoRepom;
  },
};

export interface ContextoEdge {
  deps: DepsFluxo;
  ambiente: "qa" | "prd";
  segredo: (nome: string) => Promise<string | null>;
  userId: string;
}

/** Atende uma requisição: CORS, autenticação de gestor, deps, execução, registro em repom_requisicoes. Nunca devolve segredo. */
export function servir(prefixoAcao: string, executar: (corpo: Record<string, unknown>, ctx: ContextoEdge) => Promise<SaidaFluxo>) {
  Deno.serve(async (req) => {
    const cors = corsPara(req.headers.get("origin"), Deno.env.get("REPOM_CORS_ORIGENS"));
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);
    try {
      const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
      const { data } = await comoUsuario.auth.getUser();
      if (!data?.user) return json({ ok: false, erro: "Não autenticado." }, 401);
      const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
      if (p?.papel !== "gestor_rbr") return json({ ok: false, erro: "Só o gestor da RBR usa a integração com a Repom." }, 403);

      const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const acao = String(corpo.acao ?? "");
      const [lib, amb, valMax, limite] = await Promise.all([segredo("REPOM_API_LIBERADA"), segredo("REPOM_AMBIENTE"), segredo("REPOM_VALOR_MAXIMO_OPERACAO"), segredo("REPOM_LIMITE_DIARIO")]);
      const ambiente = ambienteRepom(amb);

      // linha de registro desta chamada (a prévia não vai à Repom e não é registrada)
      let linhaId: string | null = null;
      if (acao !== "previa" && acao !== "previa_contrato") {
        const { data: linha } = await admin
          .from("repom_requisicoes")
          .insert({ acao: `${prefixoAcao}-${acao}`.slice(0, 60), ambiente, idempotency_key: crypto.randomUUID(), request_json: sanitizarPayload({ acao, operacao_id: corpo.operacao_id ?? null, valor: corpo.valor ?? null }), criado_por: data.user.id, status: "pendente" })
          .select("id")
          .maybeSingle();
        linhaId = linha?.id ?? null;
      }
      // limite diário GLOBAL (todas as ações que vão à Repom); chamado só antes de uma chamada real
      let bloqueadoPorLimite = false;
      const antesDeChamar = async (): Promise<string | null> => {
        let q = admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).in("status", ["pendente", "ok", "erro"]).gte("criado_em", inicioDoDia());
        if (linhaId) q = q.neq("id", linhaId);
        const { count } = await q;
        const v = decidirLimite(count ?? 0, limiteDiario(limite));
        if (!v.permitido) bloqueadoPorLimite = true;
        return v.permitido ? null : v.erro;
      };

      const saida = await executar(corpo, {
        deps: { repo, ambiente, apiLiberada: travaLiberada(lib), valorMaximo: valorMaximoOperacao(valMax), antesDeChamar },
        ambiente,
        segredo,
        userId: data.user.id,
      });
      if (linhaId) {
        const status = bloqueadoPorLimite ? "bloqueado_limite" : saida.status < 300 ? "ok" : [400, 422, 503].includes(saida.status) ? "bloqueado" : "erro";
        await admin.from("repom_requisicoes").update({ response_json: higienizar(saida.corpo), status, erro: saida.corpo.ok ? null : String(saida.corpo.erro ?? "").slice(0, 300), http_status: saida.status }).eq("id", linhaId);
      }
      return json(saida.corpo, saida.status);
    } catch {
      return json({ ok: false, erro: "Não foi possível concluir agora. Confira a operação antes de repetir." }, 500);
    }
  });
}
