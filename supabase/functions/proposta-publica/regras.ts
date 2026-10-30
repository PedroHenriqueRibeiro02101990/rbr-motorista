// E04/E05/E06 · Regras puras do link público de aceite da proposta (sem rede, sem banco).

export type LinkProposta = { expira_em: string | null; perdida_em: string | null; aceita_em: string | null }
export type SituacaoLink = 'valido' | 'aceito' | 'expirado' | 'perdido'

export function situacaoDoLink(l: LinkProposta, agora: number): SituacaoLink {
  if (l.aceita_em) return 'aceito'
  if (l.perdida_em) return 'perdido'
  if (l.expira_em && new Date(l.expira_em).getTime() < agora) return 'expirado'
  return 'valido'
}

export function validarAceite(nome: unknown, cargo: unknown): { ok: true; nome: string; cargo: string } | { ok: false; erro: string } {
  const n = String(nome ?? '').replace(/\s+/g, ' ').trim()
  const c = String(cargo ?? '').replace(/\s+/g, ' ').trim()
  if (n.length < 3 || n.length > 120) return { ok: false, erro: 'Informe seu nome completo.' }
  if (c.length < 2 || c.length > 80) return { ok: false, erro: 'Informe seu cargo.' }
  return { ok: true, nome: n, cargo: c }
}

// O código do link tem que ter cara de código (32 letras/números); qualquer outra coisa nem consulta o banco.
export function codigoValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && /^[0-9a-f]{32}$/.test(codigo)
}

// Primeiro IP da cadeia x-forwarded-for; vazio vira 'desconhecido'.
export function ipDaRequisicao(xff: string | null): string {
  const ip = (xff ?? '').split(',')[0]?.trim()
  return ip && ip.length <= 64 ? ip : 'desconhecido'
}
