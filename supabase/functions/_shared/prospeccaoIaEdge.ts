// Prospeccao, Etapa 5: pecas Deno do agente de IA (chamada a API, custo, teto, avisos, experimentos). A regra esta em prospeccaoAgente.ts (testada, sem rede).
// A chave da IA fica no Vault (PROSPECCAO_IA_CHAVE) e nunca entra em log, aviso, banco ou resposta. Sem chave, nada aqui faz nada.
import { admin, logar, segredo } from "./prospeccaoEdge.ts";
import { custoBrl, custoUsd, decidirExperimento, estadoTeto, modeloDaFuncao, validarMudancaAnalista, type ContagemGrupo, type FuncaoIa, type PrecosUsd } from "./prospeccaoAgente.ts";
import { partesSP } from "./prospeccaoRegras.ts";

export type ParamsIa = Record<string, unknown>;
export async function carregarParamsIa(): Promise<ParamsIa> {
  const { data } = await admin.from("parametros_sistema").select("chave, valor").like("chave", "PROSPECCAO\\_IA\\_%");
  return Object.fromEntries((data ?? []).map((r: { chave: string; valor: unknown }) => [r.chave, r.valor]));
}
export const numero = (v: unknown, padrao: number) => { const n = Number(v); return Number.isFinite(n) ? n : padrao; };
export async function chaveIa(): Promise<string | null> { return await segredo("PROSPECCAO_IA_CHAVE"); }

/** Gasto de IA de HOJE (dia de Sao Paulo), em reais. */
export async function gastoHojeBrl(agora = new Date()): Promise<number> {
  const { data } = await admin.from("prospeccao_ia_uso").select("custo_brl").eq("data", partesSP(agora).ymd).limit(5000);
  return (data ?? []).reduce((s: number, r: { custo_brl: number }) => s + Number(r.custo_brl), 0);
}
export async function situacaoTeto(params: ParamsIa, agora = new Date()) {
  const teto = numero(params["PROSPECCAO_IA_TETO_DIARIO_BRL"], 3);
  const gasto = await gastoHojeBrl(agora);
  return { teto, gasto, ...estadoTeto(gasto, teto) };
}

export async function avisar(tipo: string, texto: string, o: { empresa_id?: string | null; conversa_id?: string | null } = {}) {
  await admin.from("prospeccao_avisos").insert({ tipo, texto: texto.slice(0, 600), empresa_id: o.empresa_id ?? null, conversa_id: o.conversa_id ?? null });
}
/** Aviso que so deve aparecer uma vez por dia (ex.: teto de IA). */
export async function avisarUmaVezPorDia(tipo: string, texto: string, agora = new Date()) {
  const inicio = new Date(`${partesSP(agora).ymd}T00:00:00-03:00`).toISOString();
  const { count } = await admin.from("prospeccao_avisos").select("id", { count: "exact", head: true }).eq("tipo", tipo).gte("criado_em", inicio);
  if (!count) { await avisar(tipo, texto); return true; }
  return false;
}

export interface ChamadaIa { funcao: FuncaoIa; system: string; user: string; maxTokens: number; respostaId?: string | null; modelo?: string }
/**
 * Chama a API da Anthropic (Messages). Registra tokens e custo em prospeccao_ia_uso (nunca o texto). Qualquer falha devolve null.
 * O texto de e-mail de terceiros entra SEMPRE em `user`, dentro de delimitadores, e o system manda tratar como dado.
 */
export async function chamarIa(chave: string, params: ParamsIa, c: ChamadaIa): Promise<string | null> {
  const modelo = c.modelo ?? modeloDaFuncao(c.funcao, params);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" }, signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ model: modelo, max_tokens: c.maxTokens, system: c.system, messages: [{ role: "user", content: c.user }] }),
    });
    if (!r.ok) { await logar("sistema", "ia_http_erro", { resultado: `${c.funcao} ${modelo}: HTTP ${r.status}` }); return null; }
    const j = await r.json() as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const tin = j.usage?.input_tokens ?? 0, tout = j.usage?.output_tokens ?? 0;
    const precos = (params["PROSPECCAO_IA_PRECOS_USD_MILHAO"] ?? {}) as PrecosUsd;
    const usd = custoUsd(modelo, tin, tout, precos);
    await admin.from("prospeccao_ia_uso").insert({ funcao: c.funcao, modelo, tokens_in: tin, tokens_out: tout, custo_usd: usd, custo_brl: custoBrl(usd, numero(params["PROSPECCAO_IA_CAMBIO_USD_BRL"], 6)), resposta_id: c.respostaId ?? null });
    return j.content?.[0]?.text ?? null;
  } catch (e) { await logar("sistema", "ia_falhou", { erro: e instanceof Error ? e.message : String(e) }); return null; }
}
export const lerJson = (t: string | null): Record<string, unknown> | null => {
  if (!t) return null;
  try { return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { return null; }
};

// ---- experimentos: contagem, reversao e promocao ------------------------------------------------------------
export interface Experimento { id: string; tipo: "texto" | "assunto" | "cadencia" | "segmento"; alvo: string; padrao: Record<string, unknown>; variante: Record<string, unknown>; pct_envios: number; status: string; criado_em: string }
const UTEIS = ["cotacao", "preco_prazo", "preco_prazo_negociacao", "nao_sou_eu", "indicacao"];
async function contar(exp: Experimento, daVariante: boolean): Promise<ContagemGrupo> {
  let q = admin.from("prospeccao_mensagens").select("id, contato_id, toque").eq("status", "enviado").gte("enviado_em", exp.criado_em).limit(3000);
  q = daVariante ? q.eq("experimento_id", exp.id) : q.is("experimento_id", null);
  if (exp.tipo === "texto" || exp.tipo === "assunto") q = q.eq("toque", Number(exp.alvo.replace("toque", "")));
  else if (exp.tipo === "cadencia") q = q.gte("toque", 2);
  else q = q.eq("toque", 1);
  const { data } = await q;
  const msgs = (data ?? []) as { id: string; contato_id: string }[];
  if (msgs.length === 0) return { enviados: 0, respostasUteis: 0, descadastros: 0, devolucoes: 0 };
  const [{ data: rs }, { data: cs }] = await Promise.all([
    admin.from("prospeccao_respostas").select("mensagem_id, classificacao").in("mensagem_id", msgs.map((m) => m.id)),
    admin.from("prospeccao_contatos").select("id").in("id", msgs.map((m) => m.contato_id)).eq("validacao_status", "devolvido"),
  ]);
  const resp = (rs ?? []) as { classificacao: string | null }[];
  return {
    enviados: msgs.length, respostasUteis: resp.filter((r) => r.classificacao && UTEIS.includes(r.classificacao)).length,
    descadastros: resp.filter((r) => r.classificacao === "sair" || r.classificacao === "reclamacao").length, devolucoes: (cs ?? []).length,
  };
}
/** Vencedor vira o padrao (so por caminhos permitidos pela allowlist); revertido nunca toca no padrao (a variante so existia dentro do teste). */
async function promover(exp: Experimento) {
  const v = exp.variante as { assunto?: string; corpo?: string; atrasos?: number[] };
  if (exp.tipo === "texto" && v.corpo && validarMudancaAnalista({ campo: "texto", alvo: exp.alvo, valor: v.corpo }).ok) await admin.from("prospeccao_modelos").update({ corpo: v.corpo }).eq("tipo", exp.alvo);
  else if (exp.tipo === "assunto" && v.assunto && validarMudancaAnalista({ campo: "assunto", alvo: exp.alvo, valor: v.assunto }).ok) await admin.from("prospeccao_modelos").update({ assunto: v.assunto }).eq("tipo", exp.alvo);
  else if (exp.tipo === "cadencia" && v.atrasos && validarMudancaAnalista({ campo: "cadencia", alvo: "jornada", valor: v.atrasos }).ok) {
    for (let i = 0; i < v.atrasos.length; i++) await admin.from("prospeccao_jornada").update({ atraso_dias: v.atrasos[i] }).eq("toque", i + 2);
  }
  // segmento: nao ha padrao persistente para trocar; o relatorio avisa para o Pedro decidir
}
/** Avalia os experimentos em teste. Chamado a cada ciclo de leitura (protege o dominio logo nos primeiros envios) e no relatorio semanal. Devolve as reversoes. */
export async function avaliarExperimentos(): Promise<{ id: string; tipo: string; alvo: string; motivo: string }[]> {
  const { data } = await admin.from("prospeccao_experimentos").select("*").eq("status", "em_teste");
  const revertidos: { id: string; tipo: string; alvo: string; motivo: string }[] = [];
  for (const exp of (data ?? []) as Experimento[]) {
    const [padrao, variante] = await Promise.all([contar(exp, false), contar(exp, true)]);
    const d = decidirExperimento(padrao, variante);
    if (d.decisao === "continuar") continue;
    const status = d.decisao === "reverter" ? "revertido" : "vencedor";
    await admin.from("prospeccao_experimentos").update({ status, motivo_decisao: d.motivo, decidido_em: new Date().toISOString() }).eq("id", exp.id);
    if (d.decisao === "vencedor") { await promover(exp); await avisar("experimento", `Experimento vencedor (${exp.tipo} em ${exp.alvo}): ${d.motivo}. Virou o padrao.`); }
    else { revertidos.push({ id: exp.id, tipo: exp.tipo, alvo: exp.alvo, motivo: d.motivo }); await avisar("reversao", `Experimento REVERTIDO para o padrao (${exp.tipo} em ${exp.alvo}): ${d.motivo}.`); }
    await logar("sistema", `experimento_${status}`, { resultado: `${exp.tipo}/${exp.alvo}: ${d.motivo}` });
  }
  return revertidos;
}
export async function experimentosAtivos(): Promise<Experimento[]> {
  const { data } = await admin.from("prospeccao_experimentos").select("*").eq("status", "em_teste");
  return (data ?? []) as Experimento[];
}
