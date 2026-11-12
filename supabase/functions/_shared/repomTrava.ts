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

export type Veredito = { permitido: true } | { permitido: false; status: 503 | 429; erro: string }

export function decidirTrava(liberada: boolean): Veredito {
  return liberada ? { permitido: true } : { permitido: false, status: 503, erro: MSG_DESLIGADA }
}
export function decidirLimite(usadoHoje: number, limite: number): Veredito {
  return usadoHoje >= limite ? { permitido: false, status: 429, erro: MSG_LIMITE } : { permitido: true }
}
