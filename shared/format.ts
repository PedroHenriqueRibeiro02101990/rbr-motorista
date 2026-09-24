export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ —'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  // Data pura 'YYYY-MM-DD': formata direto (new Date() interpretaria como meia-noite UTC
  // e mostraria o dia anterior no fuso do Brasil).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
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
  perdida: 'Perdida',
}

export const MOTIVO_PERDA_LABEL: Record<string, string> = {
  preco: 'Preço',
  prazo: 'Prazo',
  sem_motorista: 'Sem motorista disponível',
  cliente_desistiu: 'Cliente desistiu',
  concorrente: 'Fechou com concorrente',
  outro: 'Outro',
}

export const STATUS_OPERACAO_LABEL: Record<string, string> = {
  alocando_motorista: 'Alocando motorista',
  aguardando_liberacao_fiscal: 'Aguardando documentos',
  liberada_coleta: 'Liberada p/ coleta',
  carregando: 'Carregando',
  em_transito: 'Em trânsito',
  entregue: 'Entregue',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
}

export const TIPO_DOC_LABEL: Record<string, string> = {
  cte: 'CT-e',
  mdfe: 'MDF-e',
  nfse: 'NFS-e',
  ciot: 'CIOT',
  vpo: 'Vale-pedágio (VPO)',
  gr: 'Pesquisa GR',
  atm: 'Averbação do seguro',
  wialon: 'Rastreamento por satélite',
  aet: 'AET (DNIT)',
  apolice_seguro: 'Apólice de seguro',
}
