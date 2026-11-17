// Prospeccao, Etapa 5: regras PURAS do agente de IA (classificacao -> acao, validador de texto, custo e teto, experimentos, allowlist do analista).
// Sem Deno, sem rede, sem API paga. As funcoes de borda (prospeccao-agente / prospeccao-analista) so chamam a IA e executam o que estas regras permitem.
import { validarModelo } from "./prospeccaoRegras.ts";

export const WHATSAPP_RBR = "(11) 95397-7966";
// numeros da RBR que podem aparecer (WhatsApp e o fixo que ja consta no toque 1)
const FONES_RBR = new Set(["11953977966", "1153977966"]);
export const SEGMENTOS_VALIDOS = ["alimentos", "bebidas", "plasticos", "metalurgia", "maquinas"] as const;

// ---- categorias e acoes --------------------------------------------------------------------------------
export const CATEGORIAS = ["sair", "agora_nao", "indicacao", "cotacao", "recusa_carga", "preco_prazo_negociacao", "duvida", "cosmeticos", "devolucao_ou_resposta_automatica"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export type ModeloResposta = "resp_sair" | "resp_agora_nao" | "resp_indicacao" | "resp_cotacao" | "resp_recusa_carga";
export type AcaoAgente =
  | { tipo: "descadastrar"; modelo: "resp_sair" }
  | { tipo: "responder"; modelo: Exclude<ModeloResposta, "resp_sair">; pausarJornada: boolean; registrarIndicado: boolean; avisarPedro: boolean; tirarDoFluxo: boolean }
  | { tipo: "escalar_para_pedro"; motivo: string }
  | { tipo: "devolucao_ou_automatica" };

/** Categoria -> o que o agente faz. Tudo fora do roteiro (preco, prazo, negociacao, duvida, cosmeticos, ambiguidade, tom irritado) NAO e respondido: vai para o Pedro. */
export function acaoParaCategoria(cat: Categoria, tomIrritado = false): AcaoAgente {
  if (tomIrritado && cat !== "sair") return { tipo: "escalar_para_pedro", motivo: "tom irritado: uma pessoa precisa responder" };
  switch (cat) {
    case "sair": return { tipo: "descadastrar", modelo: "resp_sair" };
    case "agora_nao": return { tipo: "responder", modelo: "resp_agora_nao", pausarJornada: true, registrarIndicado: false, avisarPedro: false, tirarDoFluxo: false };
    case "indicacao": return { tipo: "responder", modelo: "resp_indicacao", pausarJornada: false, registrarIndicado: true, avisarPedro: false, tirarDoFluxo: false };
    case "cotacao": return { tipo: "responder", modelo: "resp_cotacao", pausarJornada: true, registrarIndicado: false, avisarPedro: true, tirarDoFluxo: true };
    case "recusa_carga": return { tipo: "responder", modelo: "resp_recusa_carga", pausarJornada: true, registrarIndicado: false, avisarPedro: false, tirarDoFluxo: false };
    case "preco_prazo_negociacao": return { tipo: "escalar_para_pedro", motivo: "pergunta de preco, prazo ou negociacao: so uma pessoa responde" };
    case "cosmeticos": return { tipo: "escalar_para_pedro", motivo: "assunto cosmeticos: fora do roteiro, decisao do Pedro" };
    case "duvida": return { tipo: "escalar_para_pedro", motivo: "duvida fora do roteiro" };
    case "devolucao_ou_resposta_automatica": return { tipo: "devolucao_ou_automatica" };
  }
}
export const quemEhDevolucao = (de: string, corpo: string) => /(mailer-daemon|postmaster)@/i.test(de) || /\b5\.\d{1,3}\.\d{1,3}\b/.test(corpo) || /(undeliverable|delivery (status )?notification|n[aã]o foi poss[ií]vel entregar|endere[cç]o n[aã]o encontrado)/i.test(corpo);

// ---- autonomia -----------------------------------------------------------------------------------------
export type Autonomia = "rascunho" | "seguras" | "roteiro";
const SEGURAS: ModeloResposta[] = ["resp_agora_nao", "resp_indicacao", "resp_recusa_carga"];
/** Com APROVACAO_OBRIGATORIA ligada o agente so cria rascunho. Sem ela, a escada decide; comeca em "rascunho". A confirmacao de descadastro (resp_sair) e tratada fora daqui (sempre sai). */
export function podeEnviarSozinho(o: { aprovacaoObrigatoria: boolean; autonomia: string; modelo: ModeloResposta }): boolean {
  if (o.aprovacaoObrigatoria) return false;
  if (o.modelo === "resp_sair") return true;
  if (o.autonomia === "seguras") return SEGURAS.includes(o.modelo);
  if (o.autonomia === "roteiro") return [...SEGURAS, "resp_cotacao"].includes(o.modelo);
  return false;
}

// ---- classificacao e escalada --------------------------------------------------------------------------
export interface CamposExtraidos { origem?: string; destino?: string; tipo_carga?: string; peso?: string; veiculo?: string; valor_mercadoria?: string; cnpj?: string; whatsapp?: string; indicado?: string }
const CAMPOS: (keyof CamposExtraidos)[] = ["origem", "destino", "tipo_carga", "peso", "veiculo", "valor_mercadoria", "cnpj", "whatsapp", "indicado"];
/** Aceita so os campos conhecidos, como texto curto; CNPJ so com 14 digitos, WhatsApp so com 10 a 13, indicado so se for e-mail ou telefone. Nada alem disso passa. */
export function limparCampos(bruto: unknown): CamposExtraidos {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const out: CamposExtraidos = {};
  for (const k of CAMPOS) {
    const v = o[k];
    if (typeof v !== "string" && typeof v !== "number") continue;
    const t = String(v).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!t || /^(null|n\/a|desconhecido|nao informado|não informado)$/i.test(t)) continue;
    if (k === "cnpj") { const d = t.replace(/\D/g, ""); if (d.length === 14) out.cnpj = d; continue; }
    if (k === "whatsapp") { const d = t.replace(/\D/g, ""); if (d.length >= 10 && d.length <= 13) out.whatsapp = d; continue; }
    if (k === "indicado" && !/@/.test(t) && t.replace(/\D/g, "").length < 10) continue;
    out[k] = t;
  }
  return out;
}
export interface SaidaClassificador { categoria: Categoria; confianca: number; tomIrritado: boolean; campos: CamposExtraidos; resumo: string }
/** Le o JSON da IA (tolera texto em volta). Qualquer coisa fora do contrato = null. */
export function lerSaidaClassificador(texto: string): SaidaClassificador | null {
  try {
    const j = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1));
    if (!(CATEGORIAS as readonly string[]).includes(j.categoria) || typeof j.confianca !== "number" || !(j.confianca >= 0 && j.confianca <= 1)) return null;
    return { categoria: j.categoria, confianca: j.confianca, tomIrritado: j.tom_irritado === true, campos: limparCampos(j.campos), resumo: typeof j.resumo === "string" ? j.resumo.replace(/\s+/g, " ").trim().slice(0, 240) : "" };
  } catch { return null; }
}
export const CONFIANCA_MINIMA = 0.7;
/** Haiku com baixa confianca sobe para o modelo forte; com baixa confianca de novo, vai para uma pessoa. */
export function decidirEscalada(confianca: number, nivel: "barato" | "forte"): "aceitar" | "escalar_modelo" | "humano" {
  if (confianca >= CONFIANCA_MINIMA) return "aceitar";
  return nivel === "barato" ? "escalar_modelo" : "humano";
}

// ---- texto: validador deterministico ---------------------------------------------------------------------
export interface ResultadoValidacao { ok: boolean; motivos: string[] }
const RE_PRECO = [
  /r\$\s*\d/i, /\b\d+[.,]?\d*\s*(reais|real)\b/i, /\b(o\s+)?frete\s+(sai|fica|custa|ser[aá]|[eé])\s+(por\s+)?(r\$|\d)/i, /\bvalor\s+(do|de)\s+(frete|transporte|servi[cç]o)\s+(fica|[eé]|ser[aá]|sai)/i,
  /\b(cobramos|cobraremos|custa|custar[aá]|or[cç]amento (de|em) r\$)\b/i, /\b\d+\s*%\s*(de\s+)?desconto/i,
];
const RE_PRAZO_COLETA = [
  /\bprazo\s+(de|para)\s+(coleta|retirada)\b/i,
  /\b(coleta|coletamos|coletaremos|retirada|retiramos|buscamos)\b[^.\n]{0,50}\b(hoje|amanh[ãa]|em\s+at[ée]\s+\d|em\s+\d+|\d+\s*(horas?|dias?)|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|esta semana|pr[óo]xima semana)(?![a-zà-ú0-9])/i,
  /\b(em\s+at[ée]\s+\d+\s*(horas?|dias?))\b/i,
];
const RE_PROIBIDAS: [RegExp, string][] = [
  [/\b(time|equipe|setor|departamento)\s+comercial\b/i, "fala em passar para o time comercial"], [/\bagenciador(es)?\b/i, "usa a palavra agenciador"],
  [/\bvou\s+(te\s+)?passar\s+(para|pro)\b/i, "promete passar para outra pessoa"],
];
const apenasDigitos = (s: string) => s.replace(/\D/g, "");
/**
 * Regras fixas do texto (valem para toque e resposta): nunca falar valor de frete nem prazo de coleta; nunca "time comercial"/"agenciador";
 * nenhum telefone ou e-mail inventado (so o WhatsApp da RBR, vindo do MODELO, e e-mails @rbrcargo.com.br / do proprio contato); variavel sem preencher reprova;
 * rodape de "sair" obrigatorio quando exigido.
 */
export function validarTextoSaida(texto: string, o: { exigeRodape?: boolean; permiteWhatsappRbr?: boolean; emailsPermitidos?: string[] } = {}): ResultadoValidacao {
  const m: string[] = [];
  if (RE_PRECO.some((r) => r.test(texto))) m.push("fala de valor de frete ou preco");
  if (RE_PRAZO_COLETA.some((r) => r.test(texto))) m.push("fala de prazo de coleta");
  for (const [re, motivo] of RE_PROIBIDAS) if (re.test(texto)) m.push(motivo);
  const telefones = texto.match(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}/g) ?? [];
  for (const t of telefones) {
    const d = apenasDigitos(t).replace(/^55(?=\d{10,11}$)/, "");
    if (!(o.permiteWhatsappRbr && FONES_RBR.has(d))) { m.push("telefone que nao e o WhatsApp da RBR"); break; }
  }
  const permitidos = new Set((o.emailsPermitidos ?? []).map((e) => e.toLowerCase()));
  for (const e of texto.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? []) {
    if (!/@rbrcargo\.com\.br$/i.test(e) && !permitidos.has(e.toLowerCase())) { m.push("e-mail que nao e da RBR nem do contato"); break; }
  }
  if (/\{[a-z_]+\}/i.test(texto)) m.push("variavel sem preencher");
  if (o.exigeRodape && !/responda\s+["“']?sair["”']?/i.test(texto)) m.push('sem o rodape de descadastro ("responda sair")');
  return { ok: m.length === 0, motivos: [...new Set(m)] };
}
/** {nome}: se conhecido, preenche; se desconhecido, remove "{nome}, " (e variantes) sem deixar virgula solta. */
export function preencherNome(texto: string, nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  if (n) return texto.replace(/\{nome\}/g, n);
  return texto.replace(/\{nome\}\s*,\s*/g, "").replace(/,\s*\{nome\}/g, "").replace(/\{nome\}\s*/g, "").replace(/(^|\n)\s*,\s*/g, "$1");
}
export const RODAPE_SAIR = 'Se preferir não receber mais mensagens, responda "sair".';
export function garantirRodape(texto: string): string {
  return /responda\s+["“']?sair["”']?/i.test(texto) ? texto : `${texto.trimEnd()}\n\n${RODAPE_SAIR}`;
}

// ---- custo de IA e teto --------------------------------------------------------------------------------
export type PrecosUsd = Record<string, { in: number; out: number }>;
/** US$ por milhao de tokens. Modelo desconhecido usa o preco MAIS ALTO conhecido (nunca subestima o gasto). */
export function custoUsd(modelo: string, tokensIn: number, tokensOut: number, precos: PrecosUsd): number {
  const tabela = Object.values(precos);
  const p = precos[modelo] ?? tabela.reduce((a, b) => (b.in + b.out > a.in + a.out ? b : a), { in: 0, out: 0 });
  return (Math.max(0, tokensIn) * p.in + Math.max(0, tokensOut) * p.out) / 1_000_000;
}
export const custoBrl = (usd: number, cambio: number) => usd * (cambio > 0 ? cambio : 6);
export function estadoTeto(gastoHojeBrl: number, tetoBrl: number): { parar: boolean; alerta70: boolean; pct: number } {
  const pct = tetoBrl > 0 ? gastoHojeBrl / tetoBrl : 1;
  return { parar: gastoHojeBrl >= tetoBrl, alerta70: pct >= 0.7, pct };
}
export type FuncaoIa = "classificar" | "extrair" | "validar" | "redigir" | "escalar" | "analisar";
export function modeloDaFuncao(funcao: FuncaoIa, p: Record<string, unknown>): string {
  const chave = { classificar: "CLASSIFICAR", extrair: "EXTRAIR", validar: "VALIDAR", redigir: "REDIGIR", escalar: "ESCALAR", analisar: "REDIGIR" }[funcao];
  const v = p[`PROSPECCAO_IA_MODELO_${chave}`];
  return typeof v === "string" && /^claude-[a-z0-9-]+$/.test(v) ? v : funcao === "redigir" || funcao === "escalar" || funcao === "analisar" ? "claude-sonnet-5-5" : "claude-haiku-5-5";
}

// ---- experimentos --------------------------------------------------------------------------------------
export interface ContagemGrupo { enviados: number; respostasUteis: number; descadastros: number; devolucoes: number }
const taxa = (n: number, d: number) => (d > 0 ? n / d : 0);
/** true = esta mensagem usa a VARIANTE (no maximo 10% dos envios, mesmo que o experimento peca mais). */
export const usarVariante = (pct: number, aleatorio: number) => aleatorio < Math.min(10, Math.max(0, pct)) / 100;
/** Atribuicao estavel por empresa (experimento de cadencia): a mesma empresa sempre cai no mesmo grupo. */
export function grupoVariantePorEmpresa(empresaId: string, pct: number): boolean {
  let h = 0; for (let i = 0; i < empresaId.length; i++) h = (h * 31 + empresaId.charCodeAt(i)) >>> 0;
  return h % 100 < Math.min(10, Math.max(0, pct));
}
export const MIN_ENVIOS_COMPARACAO = 100;
/**
 * Reverte para o padrao se: (i) descadastros+devolucoes da variante acima do padrao (vale ja nos primeiros envios, para proteger o dominio) ou
 * (ii) menos respostas uteis que o padrao depois de cerca de 100 envios. Vira vencedor so com amostra dos DOIS lados, pelo menos 5 respostas uteis e margem clara (>= 25%).
 */
export function decidirExperimento(padrao: ContagemGrupo, variante: ContagemGrupo): { decisao: "continuar" | "reverter" | "vencedor"; motivo: string } {
  if (variante.enviados === 0) return { decisao: "continuar", motivo: "sem envios da variante ainda" };
  const ruimV = variante.descadastros + variante.devolucoes;
  if (ruimV >= 1 && taxa(ruimV, variante.enviados) > taxa(padrao.descadastros + padrao.devolucoes, padrao.enviados)) {
    return { decisao: "reverter", motivo: `descadastros/devolucoes da variante (${ruimV} em ${variante.enviados}) acima do padrao (${padrao.descadastros + padrao.devolucoes} em ${padrao.enviados})` };
  }
  if (variante.enviados >= MIN_ENVIOS_COMPARACAO) {
    const tv = taxa(variante.respostasUteis, variante.enviados), tp = taxa(padrao.respostasUteis, padrao.enviados);
    if (tv < tp) return { decisao: "reverter", motivo: `menos respostas uteis que o padrao (${(tv * 100).toFixed(1)}% contra ${(tp * 100).toFixed(1)}%) depois de ${variante.enviados} envios` };
    if (padrao.enviados >= MIN_ENVIOS_COMPARACAO && variante.respostasUteis >= 5 && tv >= tp * 1.25) return { decisao: "vencedor", motivo: `respostas uteis ${(tv * 100).toFixed(1)}% contra ${(tp * 100).toFixed(1)}% do padrao` };
  }
  return { decisao: "continuar", motivo: "ainda sem amostra suficiente" };
}

// ---- allowlist do analista ----------------------------------------------------------------------------
/** O analista SO pode propor mudanca nestes quatro campos. */
export const CAMPOS_EDITAVEIS_PELA_IA = ["texto", "assunto", "cadencia", "segmento"] as const;
/** FIXO: nunca editavel por IA (documentado e testado). */
export const CAMPOS_FIXOS = ["preco", "prazo_coleta", "regras_descadastro", "regras_bloqueio", "limite_envio", "limite_gasto", "lista_recusa_carga", "promessas", "flags", "chaves", "aprovacao_obrigatoria", "teto_ia", "autonomia", "rampa", "pesos"] as const;
export type MudancaAnalista =
  | { campo: "texto" | "assunto"; alvo: string; valor: string }
  | { campo: "cadencia"; alvo: "jornada"; valor: number[] }       // atraso (dias) dos toques 2, 3 e 4
  | { campo: "segmento"; alvo: string; valor: string };
export function validarMudancaAnalista(m: { campo: string; alvo?: string; valor?: unknown }): { ok: boolean; motivo?: string } {
  if ((CAMPOS_FIXOS as readonly string[]).includes(m.campo)) return { ok: false, motivo: `o campo "${m.campo}" e fixo: a IA nao altera` };
  if (!(CAMPOS_EDITAVEIS_PELA_IA as readonly string[]).includes(m.campo)) return { ok: false, motivo: `campo "${m.campo}" fora da allowlist (texto, assunto, cadencia, segmento)` };
  if (m.campo === "texto" || m.campo === "assunto") {
    if (typeof m.valor !== "string" || !m.valor.trim()) return { ok: false, motivo: "texto vazio" };
    if (!/^toque[1-4]$/.test(m.alvo ?? "")) return { ok: false, motivo: "so os textos dos toques 1 a 4 podem ser testados (descadastro, cotacao e recusa sao fixos)" };
    const assunto = m.campo === "assunto" ? m.valor : "assunto";
    const corpo = m.campo === "texto" ? m.valor : "corpo";
    const erro = validarModelo(assunto, corpo);
    if (erro) return { ok: false, motivo: erro };
    // as variaveis de modelo ({cidade}...) sao legitimas aqui: validarModelo ja as conferiu; troca por um valor qualquer antes de validar o resto
    const v = validarTextoSaida(m.valor.replace(/\{[a-z_]+\}/g, "x"), { exigeRodape: m.campo === "texto", permiteWhatsappRbr: true });
    if (!v.ok) return { ok: false, motivo: `texto reprovado: ${v.motivos.join("; ")}` };
    return { ok: true };
  }
  if (m.campo === "cadencia") {
    const v = m.valor;
    if (!Array.isArray(v) || v.length < 1 || v.length > 3 || !v.every((n) => Number.isInteger(n) && n >= 2 && n <= 30)) return { ok: false, motivo: "cadencia: ate 3 intervalos (maximo 4 toques), cada um de 2 a 30 dias" };
    return { ok: true };
  }
  if (!(SEGMENTOS_VALIDOS as readonly string[]).includes(String(m.valor))) return { ok: false, motivo: "segmento desconhecido" };
  return { ok: true };
}

// ---- metricas do relatorio semanal -------------------------------------------------------------------------
export interface LinhaEnvio { toque: number; modelo: string; segmento: string; variante: boolean; resposta: string | null; devolvida: boolean }
export interface BlocoMetrica { enviados: number; respostas: number; uteis: number; agoraNao: number; descadastros: number; devolucoes: number }
const vazio = (): BlocoMetrica => ({ enviados: 0, respostas: 0, uteis: 0, agoraNao: 0, descadastros: 0, devolucoes: 0 });
const UTEIS = new Set(["cotacao", "preco_prazo", "preco_prazo_negociacao", "nao_sou_eu", "indicacao"]);
export function agregarMetricas(linhas: readonly LinhaEnvio[]): { total: BlocoMetrica; porToque: Record<string, BlocoMetrica>; porTexto: Record<string, BlocoMetrica>; porSegmento: Record<string, BlocoMetrica> } {
  const total = vazio(), porToque: Record<string, BlocoMetrica> = {}, porTexto: Record<string, BlocoMetrica> = {}, porSegmento: Record<string, BlocoMetrica> = {};
  for (const l of linhas) {
    for (const b of [total, (porToque[`toque${l.toque}`] ??= vazio()), (porTexto[`${l.modelo}${l.variante ? " (variante)" : ""}`] ??= vazio()), (porSegmento[l.segmento] ??= vazio())]) {
      b.enviados++;
      if (l.resposta) { b.respostas++; if (UTEIS.has(l.resposta)) b.uteis++; else if (l.resposta === "agora_nao") b.agoraNao++; else if (l.resposta === "sair" || l.resposta === "reclamacao") b.descadastros++; }
      if (l.devolvida) b.devolucoes++;
    }
  }
  return { total, porToque, porTexto, porSegmento };
}
