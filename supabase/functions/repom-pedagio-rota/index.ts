// Edge Function: repom-pedagio-rota  (verify_jwt = true)  NÃO PUBLICADA: deploy só depois de revisão.
//
// Calcula o pedágio de uma rota pela Repom (API VPR, roteirização) para a COTAÇÃO. Fluxo: normaliza IBGE -> procura no cache
// (repom_rotas/repom_pedagios) -> se não houver, cadastra a rota e consulta o valor -> grava o cache -> devolve.
// Entrada: { cotacao_id } (lê ibge_origem, ibge_destino e eixos da cotação, respeitando o acesso do usuário)
//      ou { ibge_origem, ibge_destino, paradas?, ida_volta?, eixos, eixos_suspensos_ida?, eixos_suspensos_volta? }.
// Quem chama: gestor RBR ou agenciador logados, ou o motor de preço com a chave interna (REPOM_CHAMADA_INTERNA no Vault).
// TRAVA DE CUSTO (toda consulta é cobrada): só roda com REPOM_ROTEIRIZACAO_LIBERADA = 'sim' no Vault; senão 503 "Roteirização Repom desligada"
// sem chamar a Repom. Cache de 30 dias (mesma rota e mesmos eixos) não chama a Repom e não conta no limite. Limite diário global:
// REPOM_LIMITE_DIARIO (padrão 100), contado em repom_requisicoes; acima disso 429. Ambiente: REPOM_AMBIENTE (qa|prd, padrão qa).
// Limite de uso: 10 consultas por usuário por minuto (protege o custo por consulta). Cada chamada vira uma linha em
// repom_requisicoes ANTES de a resposta ser interpretada, sem segredo e sem token. Erro da Repom nunca quebra a cotação:
// a resposta é { ok:false, erro } e o campo manual segue valendo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ambienteRepom, criarRepomClient, higienizar, ufDoIbge } from "../_shared/repomClient.ts";
import { pedagioPorRota, sha256Hex, type Repositorio } from "../_shared/repomPedagio.ts";
import { corsPara } from "../_shared/repomHttp.ts";
import { decidirLimite, decidirTrava, inicioDoDia, limiteDiario, travaLiberada } from "../_shared/repomTrava.ts";

// CORS restrito ao domínio do app (repomHttp.ts); a chave interna do motor de preço é servidor a servidor e não depende de CORS.
let CORS: Record<string, string> = {};
const LIMITE_POR_MINUTO = 10;

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const segredo = async (nome: string): Promise<string | null> => {
  const { data, error } = await admin.rpc("repom_segredo", { p_nome: nome });
  if (error) throw new Error("Não consegui ler a configuração da Repom.");
  return (data as string | null) ?? null;
};
function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Quem = { ok: true; userId: string | null; client: ReturnType<typeof createClient> | null } | { ok: false; status: number; erro: string };
async function quemChama(req: Request): Promise<Quem> {
  const interna = req.headers.get("x-repom-chave-interna") ?? "";
  if (interna) {
    return iguais(interna, (await segredo("REPOM_CHAMADA_INTERNA")) ?? "") ? { ok: true, userId: null, client: null } : { ok: false, status: 403, erro: "Chave interna inválida." };
  }
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return { ok: false, status: 401, erro: "Não autenticado." };
  const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
  if (p?.papel !== "gestor_rbr" && p?.papel !== "agenciador") return { ok: false, status: 403, erro: "Só gestor ou agenciador calcula o pedágio." };
  return { ok: true, userId: data.user.id, client: comoUsuario };
}

const repo: Repositorio = {
  async buscarRota(h) {
    const { data } = await admin.from("repom_rotas").select("id, codigo_roteiro_repom, codigo_percurso_repom, descricao_percurso").eq("chave_hash", h).maybeSingle();
    return data ?? null;
  },
  async gravarRota(r) {
    const { data, error } = await admin.from("repom_rotas").upsert(r, { onConflict: "chave_hash" }).select("id, codigo_roteiro_repom, codigo_percurso_repom, descricao_percurso").single();
    if (error) throw new Error("Não consegui gravar a rota no cache.");
    return data;
  },
  async buscarPedagio(rotaId, eixos, a, b) {
    const { data } = await admin.from("repom_pedagios").select("valor_total, valor_ida, valor_volta, consultado_em, validade_dias").eq("rota_id", rotaId).eq("eixos", eixos).eq("eixos_suspensos_ida", a).eq("eixos_suspensos_volta", b).maybeSingle();
    return data ? { ...data, valor_total: Number(data.valor_total), valor_ida: data.valor_ida == null ? null : Number(data.valor_ida), valor_volta: data.valor_volta == null ? null : Number(data.valor_volta) } : null;
  },
  async gravarPedagio(p, descricao) {
    await admin.from("repom_pedagios").upsert({ ...p, consultado_em: new Date().toISOString() }, { onConflict: "rota_id,eixos,eixos_suspensos_ida,eixos_suspensos_volta" });
    if (descricao) await admin.from("repom_rotas").update({ descricao_percurso: descricao }).eq("id", p.rota_id);
  },
};

Deno.serve(async (req) => {
  CORS = corsPara(req.headers.get("origin"), Deno.env.get("REPOM_CORS_ORIGENS"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const quem = await quemChama(req);
    if (!quem.ok) return json({ ok: false, erro: quem.erro }, quem.status);

    const trava = decidirTrava(travaLiberada(await segredo("REPOM_ROTEIRIZACAO_LIBERADA")));
    if (!trava.permitido) return json({ ok: false, desligado: true, erro: trava.erro }, trava.status);

    const ambiente = ambienteRepom(await segredo("REPOM_AMBIENTE"));
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Entrada: pela cotação (acesso do próprio usuário) ou pelos campos.
    let ibgeO = String(b.ibge_origem ?? ""), ibgeD = String(b.ibge_destino ?? ""), eixos = Number(b.eixos ?? 0);
    if (b.cotacao_id) {
      if (!quem.client) return json({ ok: false, erro: "Informe os campos da rota." }, 400);
      const { data: c } = await quem.client.from("cotacoes").select("ibge_origem, ibge_destino, eixos").eq("id", String(b.cotacao_id)).maybeSingle();
      if (!c) return json({ ok: false, erro: "Cotação não encontrada." }, 404);
      ibgeO = String(c.ibge_origem ?? ""); ibgeD = String(c.ibge_destino ?? ""); eixos = Number(c.eixos ?? 0);
      if (!ibgeO || !ibgeD) return json({ ok: false, erro: "Preencha origem e destino da cotação (cidades com código IBGE) antes de calcular." });
    }
    const ufO = ufDoIbge(ibgeO), ufD = ufDoIbge(ibgeD);
    if (!ufO || !ufD) return json({ ok: false, erro: "Código IBGE de origem ou destino inválido." }, 400);
    const paradas = (Array.isArray(b.paradas) ? b.paradas : []).map((x) => ({ ibge: String((x as { ibge?: unknown }).ibge ?? ""), uf: ufDoIbge(String((x as { ibge?: unknown }).ibge ?? "")) ?? "" }));
    if (paradas.some((p) => !p.uf)) return json({ ok: false, erro: "Código IBGE de parada inválido." }, 400);
    const entrada = { ibgeOrigem: ibgeO, ufOrigem: ufO, ibgeDestino: ibgeD, ufDestino: ufD, paradas, idaVolta: b.ida_volta === true, eixos, eixosSuspensosIda: Number(b.eixos_suspensos_ida ?? 0), eixosSuspensosVolta: Number(b.eixos_suspensos_volta ?? 0) };

    // Limite de uso por usuário por minuto.
    if (quem.userId) {
      const desde = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).eq("criado_por", quem.userId).gte("criado_em", desde);
      if ((count ?? 0) >= LIMITE_POR_MINUTO) return json({ ok: false, erro: "Muitas consultas seguidas. Aguarde um minuto e tente de novo." }, 429);
    }

    // Registro ANTES de interpretar a resposta (sem segredo e sem token).
    const chaveIdem = await sha256Hex(`${quem.userId ?? "interno"}|${JSON.stringify(entrada)}|${Math.floor(Date.now() / 60_000)}`);
    const { data: linha } = await admin.from("repom_requisicoes").insert({ acao: "pedagio-rota", ambiente, idempotency_key: chaveIdem, request_json: higienizar(entrada), criado_por: quem.userId, status: "pendente" }).select("id").maybeSingle();

    const repom = criarRepomClient({
      ambiente,
      codigoCliente: (await segredo("REPOM_VPR_CODIGO_CLIENTE")) ?? "",
      roteirizacaoLogin: (await segredo("REPOM_VPR_ROTEIRIZACAO_LOGIN")) ?? "",
      roteirizacaoSenha: (await segredo("REPOM_VPR_ROTEIRIZACAO_SENHA")) ?? "",
      valePedagioLogin: "", valePedagioSenha: "",
    });
    // Limite diário: roda só quando o cache não resolve, antes da primeira chamada à Repom. Conta apenas consultas que foram (ou vão) à Repom.
    const antesDeChamar = async (): Promise<string | null> => {
      const limite = limiteDiario(await segredo("REPOM_LIMITE_DIARIO"));
      let q = admin.from("repom_requisicoes").select("id", { count: "exact", head: true }).in("status", ["pendente", "ok", "erro"]).gte("criado_em", inicioDoDia()); // global: todas as ações que vão à Repom
      if (linha?.id) q = q.neq("id", linha.id);
      const { count } = await q;
      const v = decidirLimite(count ?? 0, limite);
      return v.permitido ? null : v.erro;
    };
    const r = await pedagioPorRota(entrada, repo, repom, Date.now(), antesDeChamar);

    // Cache e limite não contam como consulta à Repom (status próprio, fora da contagem do dia).
    const statusFinal = r.limite ? "bloqueado_limite" : r.doCache ? "cache" : r.ok ? "ok" : "erro";
    if (linha?.id) await admin.from("repom_requisicoes").update({ response_json: higienizar(r), status: statusFinal, erro: r.ok ? null : r.erro ?? null, http_status: r.ok ? 200 : null }).eq("id", linha.id);
    if (r.limite) return json({ ok: false, limite: true, erro: r.erro }, 429);
    return json({ ...r, ambiente, emTeste: ambiente !== "prd" });
  } catch (e) {
    return json({ ok: false, erro: "Não foi possível calcular o pedágio agora. Informe o valor manualmente." }, 200);
  }
});
