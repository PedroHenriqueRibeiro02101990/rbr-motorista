import { brl } from '../../lib/novoDb'

export const AVISO_PRE_COTACAO = 'Esta é uma pré-cotação. Os valores podem ser alterados de acordo com a necessidade dos itens informados.'

export type StatusPre = 'rascunho' | 'enviada' | 'aceita_parcial' | 'aceita' | 'recusada' | 'expirada' | 'convertida'
export type StatusItem = 'pendente' | 'aceita' | 'recusada' | 'convertida'
export type BaseValor = 'xml' | 'digitado' | 'historico_cliente' | 'informado_cliente'

export type PreCotacao = {
  id: string
  numero: number
  cliente_id: string | null
  cliente_nome_livre: string | null
  validade_dias: number
  status: StatusPre
  observacoes: string | null
  enviada_em: string | null
  created_at: string
  pre_cotacao_itens?: Item[]
}

export type Item = {
  id: string
  pre_cotacao_id: string
  ordem: number
  cidade_origem: string
  uf_origem: string
  cidade_destino: string
  uf_destino: string
  tipo_veiculo: string | null
  eixos: number | null
  viagens: number
  valor_mercadoria: number | null
  valor_mercadoria_base: BaseValor | null
  pedagio: number | null
  pedagio_base: string | null
  preco_viagem: number | null
  status: StatusItem
  cotacao_id: string | null
}

export const STATUS_LABEL: Record<StatusPre, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita_parcial: 'Aceita em parte',
  aceita: 'Aceita',
  recusada: 'Recusada',
  expirada: 'Expirada',
  convertida: 'Convertida',
}

export const BASE_LABEL: Record<BaseValor, string> = {
  xml: 'XML da NF-e',
  digitado: 'digitado',
  historico_cliente: 'histórico do cliente',
  informado_cliente: 'informado pelo cliente (aproximado)',
}

export const TIPOS_VEICULO = ['Fiorino', 'HR', '3/4', 'Toco', 'Truck', 'Bitruck', 'Carreta', 'Carreta LS', 'Bitrem', 'Rodotrem']

export function nomeCliente(p: PreCotacao, mapa: Map<string, string>) {
  return (p.cliente_id ? mapa.get(p.cliente_id) : null) || p.cliente_nome_livre || 'Sem cliente'
}

export function validadeFim(p: PreCotacao): Date | null {
  if (!p.enviada_em) return null
  const d = new Date(p.enviada_em)
  d.setDate(d.getDate() + (p.validade_dias || 7))
  return d
}

export function diasParaVencer(p: PreCotacao): number | null {
  const f = validadeFim(p)
  if (!f) return null
  return Math.ceil((f.getTime() - Date.now()) / 86400000)
}

export function derivarStatus(atual: StatusPre, itens: Pick<Item, 'status'>[]): StatusPre {
  if (atual === 'rascunho' || atual === 'expirada' || itens.length === 0) return atual
  const n = (s: StatusItem) => itens.filter((i) => i.status === s).length
  const conv = n('convertida'), ac = n('aceita'), rec = n('recusada'), pen = n('pendente')
  if (conv > 0 && ac === 0 && pen === 0) return 'convertida'
  if (conv + ac > 0) return pen === 0 && rec === 0 ? 'aceita' : 'aceita_parcial'
  if (rec === itens.length) return 'recusada'
  return 'enviada'
}

export function numeroFmt(n: number) {
  return `PC-${String(n).padStart(4, '0')}`
}

export function textoWhatsApp(p: PreCotacao, itens: Item[], cliente: string): string {
  const linhas: string[] = [`*Pré-cotação ${numeroFmt(p.numero)} - RBR Cargo*`, `Cliente: ${cliente}`, '']
  itens.forEach((i, idx) => {
    linhas.push(`*${idx + 1}. ${i.cidade_origem}/${i.uf_origem} → ${i.cidade_destino}/${i.uf_destino}*`)
    linhas.push(`Veículo: ${[i.tipo_veiculo, i.eixos ? `${i.eixos} eixos` : null].filter(Boolean).join(' - ') || 'a definir'}`)
    linhas.push(`Viagens: ${i.viagens}`)
    linhas.push(`Valor por viagem: ${brl(i.preco_viagem)}`)
    linhas.push(i.pedagio != null && i.pedagio > 0 ? `Pedágio: ${brl(i.pedagio)}` : 'Pedágio não incluído')
    linhas.push('')
  })
  linhas.push(`_${AVISO_PRE_COTACAO}_`)
  const f = validadeFim(p)
  linhas.push(f ? `Válida até ${f.toLocaleDateString('pt-BR')} (${p.validade_dias} dias).` : `Validade: ${p.validade_dias} dias a partir do envio.`)
  return linhas.join('\n')
}

export async function gerarPdfPre(p: PreCotacao, itens: Item[], cliente: string, empresa: Record<string, string>) {
  const { jsPDF } = await import('jspdf')
  const { desenharRodape, RODAPE_TOPO } = await import('../../lib/rodapePdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const t = (s: string) => s.replace(/→/g, '->').replace(/—/g, '-')
  const M = 16
  let y = 22
  doc.setTextColor(18, 23, 61)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(`Pré-cotação ${numeroFmt(p.numero)}`, M, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(t(`Cliente: ${cliente}`), M, y)
  y += 5
  const f = validadeFim(p)
  doc.text(f ? `Válida até ${f.toLocaleDateString('pt-BR')} (${p.validade_dias} dias)` : `Validade: ${p.validade_dias} dias a partir do envio`, M, y)
  y += 9
  const nova = (h: number) => {
    if (y + h > RODAPE_TOPO) {
      doc.addPage()
      y = 22
    }
  }
  itens.forEach((i, idx) => {
    nova(26)
    doc.setFillColor(246, 247, 251)
    doc.roundedRect(M, y, 210 - 2 * M, 23, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.text(t(`${idx + 1}. ${i.cidade_origem}/${i.uf_origem} → ${i.cidade_destino}/${i.uf_destino}`), M + 3, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.text(t(`Veículo: ${[i.tipo_veiculo, i.eixos ? `${i.eixos} eixos` : null].filter(Boolean).join(' - ') || 'a definir'}   |   Viagens: ${i.viagens}`), M + 3, y + 12)
    doc.text(t(i.pedagio != null && i.pedagio > 0 ? `Pedágio: ${brl(i.pedagio)}` : 'Pedágio não incluído'), M + 3, y + 18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(t(`${brl(i.preco_viagem)} por viagem`), 210 - M - 3, y + 12, { align: 'right' })
    y += 27
  })
  nova(20)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9.5)
  doc.setTextColor(110, 116, 140)
  doc.text(doc.splitTextToSize(t(AVISO_PRE_COTACAO), 210 - 2 * M), M, y + 4)
  desenharRodape(doc, empresa)
  return doc.output('blob') as Blob
}
