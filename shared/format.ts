export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ —'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-BR')
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function initials(nome: string | null | undefined): string {
  if (!nome) return '?'
  const parts = nome.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export const STATUS_COTACAO_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  convertida: 'Convertida',
}

export const STATUS_OPERACAO_LABEL: Record<string, string> = {
  alocando_motorista: 'Alocando motorista',
  aguardando_liberacao_fiscal: 'Aguardando fiscal',
  liberada_coleta: 'Liberada p/ coleta',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
}
