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

// PDF no visual da cotação padrão (lib/preCotacaoPdf). Gerar o PDF marca a pré-cotação como enviada, então sem
// data de envio a emissão é agora e a validade conta a partir de hoje.
export async function gerarPdfPre(p: PreCotacao, itens: Item[], cliente: string, empresa: Record<string, string>) {
  const { gerarPreCotacaoPdf } = await import('../../lib/preCotacaoPdf')
  const veiculo = (i: Item) => [i.tipo_veiculo, i.eixos ? `${i.eixos} eixos` : null].filter(Boolean).join(' · ')
  return gerarPreCotacaoPdf(
    {
      numero: numeroFmt(p.numero),
      dataEmissao: p.enviada_em ?? new Date().toISOString(),
      validadeDias: p.validade_dias || 7,
      clienteNome: cliente,
      aviso: AVISO_PRE_COTACAO,
      rotas: [...itens]
        .sort((a, b) => a.ordem - b.ordem)
        .map((i) => ({
          origem: `${i.cidade_origem}/${i.uf_origem}`,
          destino: `${i.cidade_destino}/${i.uf_destino}`,
          veiculo: veiculo(i),
          viagens: i.viagens,
          pedagio: i.pedagio,
          precoViagem: i.preco_viagem,
        })),
    },
    empresa as unknown as import('../../lib/pdfVisual').EmpresaCotacao,
  )
}
