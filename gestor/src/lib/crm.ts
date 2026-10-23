// CRM comercial (etapa 1): regras da Fila do dia. Usado por pages/FilaDoDia.tsx; testes em gestor/test/crm.test.ts.
// A ordem é a mesma da view v_fila_do_dia (refeita aqui porque a API não garante a ordem da view):
// próxima ação vencida primeiro, depois quem nunca recebeu contato, depois o prazo/criação mais antigo.

export type LeadFila = {
  id: string
  status: string
  criado_em: string
  proxima_acao_em: string | null
  primeiro_contato_em: string | null
}

export const STATUS_ABERTOS = ['novo', 'em_contato', 'qualificado', 'cotando'] as const
export const STATUS_LEAD_LABEL: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  qualificado: 'Qualificado',
  cotando: 'Cotando',
  ganho: 'Ganho',
  perdido: 'Perdido',
  descartado: 'Descartado',
}

const t = (s: string | null) => (s ? new Date(s).getTime() : NaN)

export function acaoVencida(l: Pick<LeadFila, 'proxima_acao_em'>, agora = new Date()): boolean {
  return !!l.proxima_acao_em && t(l.proxima_acao_em) < agora.getTime()
}

export function ordenarFila<T extends LeadFila>(leads: T[], agora = new Date()): T[] {
  return leads
    .filter((l) => (STATUS_ABERTOS as readonly string[]).includes(l.status))
    .sort((a, b) => {
      const va = acaoVencida(a, agora) ? 0 : 1
      const vb = acaoVencida(b, agora) ? 0 : 1
      if (va !== vb) return va - vb
      const ca = a.primeiro_contato_em ? 1 : 0
      const cb = b.primeiro_contato_em ? 1 : 0
      if (ca !== cb) return ca - cb
      return (t(a.proxima_acao_em) || t(a.criado_em)) - (t(b.proxima_acao_em) || t(b.criado_em))
    })
}

// "vencida há 2 h", "em 15 min", "amanhã 08:15"…
export function rotuloPrazo(iso: string | null, agora = new Date()): string {
  if (!iso) return 'sem prazo'
  const diffMin = Math.round((t(iso) - agora.getTime()) / 60000)
  const abs = Math.abs(diffMin)
  const quanto = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} dias`
  return diffMin < 0 ? `vencida há ${quanto}` : `em ${quanto}`
}

// Lead vira oportunidade quando a cotação é criada (padrão a revisar). Etapa inicial pela situação da cotação.
export function etapaDaCotacao(statusCotacao: string | null | undefined): 'qualificacao' | 'cotacao_enviada' | 'ganha' | 'perdida' {
  if (statusCotacao === 'convertida') return 'ganha'
  if (statusCotacao === 'perdida') return 'perdida'
  if (statusCotacao === 'enviada') return 'cotacao_enviada'
  return 'qualificacao'
}
