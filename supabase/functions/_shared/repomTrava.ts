// Trava de custo da roteirização Repom (toda consulta é tratada como cobrada). Sem Deno e sem rede: testes em repomTrava.test.ts.
// Ordem na função: (1) trava liberada? senão 503 sem chamar a Repom; (2) cache de 30 dias (não chama a Repom e não conta no limite);
// (3) limite diário global, contado em repom_requisicoes só para consultas que de fato foram à Repom; acima disso, 429.

export const LIMITE_DIARIO_PADRAO = 100
export const VALIDADE_CACHE_DIAS = 30
export const MSG_DESLIGADA = 'Roteirização Repom desligada'
export const MSG_LIMITE = 'Limite diário de consultas à Repom atingido. Informe o pedágio manualmente.'

/** Só o texto exato "sim" libera. Qualquer outra coisa (ausente, "nao", vazio) mantém desligado. */
export const travaLiberada = (valor: string | null | undefined): boolean => String(valor ?? '').trim().toLowerCase() === 'sim'

/** Limite diário global a partir do segredo REPOM_LIMITE_DIARIO; inválido, zero ou negativo cai no padrão (100). */
export function limiteDiario(valor: string | null | undefined): number {
  const n = Number(String(valor ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : LIMITE_DIARIO_PADRAO
}

/** Início do dia em horário de Brasília (UTC-3, sem horário de verão), em ISO UTC. */
export function inicioDoDia(agora = Date.now()): string {
  const br = new Date(agora - 3 * 3_600_000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0)).toISOString()
}

export type Veredito = { permitido: true } | { permitido: false; status: 503 | 429 | 422 | 400; erro: string }

export function decidirTrava(liberada: boolean): Veredito {
  return liberada ? { permitido: true } : { permitido: false, status: 503, erro: MSG_DESLIGADA }
}
export function decidirLimite(usadoHoje: number, limite: number): Veredito {
  return usadoHoje >= limite ? { permitido: false, status: 429, erro: MSG_LIMITE } : { permitido: true }
}

// ---------- API completa (vale, contrato/CIOT, pagamento, quitação) ----------
// Ordem nas funções repom-vpo e repom-frete: (1) REPOM_API_LIBERADA = "sim"? senão 503 sem chamar a Repom; (2) confirmação humana
// registrada (nome e hora) para emissão e pagamento, senão 400; (3) valor acima de REPOM_VALOR_MAXIMO_OPERACAO, 422 sem chamar a Repom;
// (4) limite diário global de chamadas reais, 429. Leituras (consulta, TAG) só passam por (1) e (4).

export const VALOR_MAXIMO_PADRAO = 3000 // reais, fase de teste
export const MSG_API_DESLIGADA = 'Integração Repom desligada'
export const MSG_VALOR_ACIMA = 'Valor acima do máximo permitido na fase de teste. Faça pelo portal da Repom.'
export const MSG_SEM_CONFIRMACAO = 'Confirme a operação com seu nome antes de emitir ou pagar.'
export const JANELA_CONFIRMACAO_MS = 15 * 60_000

/** Máximo por operação (segredo REPOM_VALOR_MAXIMO_OPERACAO, em reais). Ausente, inválido, zero ou negativo cai no padrão (3000). */
export function valorMaximoOperacao(valor: string | null | undefined): number {
  const n = Number(String(valor ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : VALOR_MAXIMO_PADRAO
}

export function decidirApi(liberada: boolean): Veredito {
  return liberada ? { permitido: true } : { permitido: false, status: 503, erro: MSG_API_DESLIGADA }
}

/** Valor ausente, não numérico ou negativo é recusado (não se emite sem saber o valor). Igual ao máximo passa; acima, 422. */
export function decidirValor(valor: unknown, maximo: number): Veredito {
  const n = Number(valor)
  if (valor == null || valor === '' || !Number.isFinite(n) || n < 0) return { permitido: false, status: 422, erro: 'Informe o valor da operação.' }
  return n > maximo ? { permitido: false, status: 422, erro: MSG_VALOR_ACIMA } : { permitido: true }
}

export interface ConfirmacaoHumana {
  nome: string
  em: string // ISO, hora em que a pessoa confirmou
}
/** Confirmação válida: nome com 3+ letras e hora recente (até 15 min atrás, no máximo 1 min no futuro). */
export function decidirConfirmacao(c: Partial<ConfirmacaoHumana> | null | undefined, agora = Date.now()): Veredito {
  const nome = String(c?.nome ?? '').trim()
  const em = new Date(String(c?.em ?? '')).getTime()
  const ok = nome.length >= 3 && Number.isFinite(em) && agora - em <= JANELA_CONFIRMACAO_MS && em - agora <= 60_000
  return ok ? { permitido: true } : { permitido: false, status: 400, erro: MSG_SEM_CONFIRMACAO }
}

/** Ações que mexem em dinheiro ou documento (exigem confirmação e valor). Leituras e cancelamentos não. */
export const ACOES_COM_CONFIRMACAO = ['emitir_vale', 'emitir_contrato', 'pagamento', 'quitacao'] as const
export type AcaoRepom = (typeof ACOES_COM_CONFIRMACAO)[number] | 'cancelar' | 'consulta'

export function decidirOperacao(p: { acao: AcaoRepom; apiLiberada: boolean; valor?: unknown; maximo: number; confirmacao?: Partial<ConfirmacaoHumana> | null; agora?: number }): Veredito {
  const api = decidirApi(p.apiLiberada)
  if (!api.permitido) return api
  if (!(ACOES_COM_CONFIRMACAO as readonly string[]).includes(p.acao)) return { permitido: true }
  const conf = decidirConfirmacao(p.confirmacao, p.agora)
  if (!conf.permitido) return conf
  return decidirValor(p.valor, p.maximo)
}
