import { jsPDF } from 'jspdf'
import { brl, fmtData } from './financeiro'
import { LOGO_RBR_CARGO_PNG } from '@rbr/shared/brand/logoDataUri'

const NAVY: [number, number, number] = [18, 23, 61]
const MUTED: [number, number, number] = [110, 116, 140]
const GOLD: [number, number, number] = [184, 134, 59]
const GOLD_TINT: [number, number, number] = [250, 244, 232]
const PAGE_BG: [number, number, number] = [241, 243, 247]
const CARD_BG: [number, number, number] = [255, 255, 255]
const CARD_BORDER: [number, number, number] = [223, 227, 236]
const FIELD_BG: [number, number, number] = [246, 247, 251]
const FIELD_BORDER: [number, number, number] = [232, 235, 242]
const txt = (s: string) => s.replace(/→/g, '->').replace(/—/g, '-')

// Formato real de parametros_sistema.dados_empresa (ver dados-empresa-rbr-cargo.md) —
// diferente do EmpresaFatura de faturaPdf.ts, que não bate 1:1 com esse shape (por isso
// telefone/email saem em branco na fatura hoje; aqui mapeamos os campos certos).
export interface EmpresaCotacao {
  razao_social?: string
  nome_fantasia?: string
  cnpj?: string
  rntrc?: string
  telefone_comercial?: string
  whatsapp_comercial?: string
  email_comercial?: string
  endereco?: {
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    municipio?: string
    uf?: string
    cep?: string
  }
}

export interface ItemPrecoCotacao {
  descricao: string
  valor: number
  detalhe?: string
}

export interface CotacaoPdfDados {
  numero: string
  dataEmissao: string // ISO
  clienteNome: string
  clienteDocumento?: string | null
  clienteContato?: string | null
  cidadeOrigem?: string | null
  ufOrigem?: string | null
  cidadeDestino?: string | null
  ufDestino?: string | null
  distanciaKm?: number | null
  tipoCarga?: string | null
  pesoBrutoKg?: number | null
  valorNf?: number | null
  naturezaOperacao?: string | null
  // Composição interna do preço (frete, pedágio, seguro, custos adicionais) — usada pro
  // cálculo e pro financeiro interno, mas não é exibida item a item nesta cotação: o cliente
  // vê só o valor final do frete para o trecho (ver OBSERVACOES abaixo).
  itensPreco: ItemPrecoCotacao[]
  valorTotal: number
  prazoPagamento: string
  formaPagamento: string
  validadeDias?: number
}

// Texto padrão da RBR — reaproduzido do papel timbrado (Word) que este PDF substitui, não
// inventado aqui. Ver /areas/modelo-papel-timbrado.md.
const TEXTO_COLETA_ENTREGA = 'Em datas acordadas entre as partes'

// Observações fixas no rodapé da cotação — pedágio/seguro/monitoramento não aparecem mais
// como itens de preço (só o valor final do frete), e sim aqui como texto corrido; inclui a
// declaração de conformidade com o piso mínimo ANTT (Resolução ANTT 6.084/2026, ver
// claude/radar-regulatorio-log.md e apps-motorista-agenciador-status-v1.md no projeto).
const OBSERVACOES: string[] = [
  'Frete calculado em conformidade com o piso mínimo de referência da ANTT (Resolução ANTT 6.084/2026) para o trecho, tipo de carga e configuração de eixos informados.',
  'Pedágio e seguro de carga (SGR) já estão inclusos no valor do frete.',
  'Monitoramento com checkpoint a cada 6 horas ao longo do trajeto.',
  'Escolta armada e Autorização Especial de Trânsito (AET), quando exigidas pelo tipo de carga, são tratadas e cotadas à parte.',
]

function enderecoEmpresaLinha(e?: EmpresaCotacao['endereco']): string {
  if (!e) return ''
  const linha1 = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const linha2 = [e.municipio, e.uf].filter(Boolean).join('/')
  return [linha1, linha2].filter(Boolean).join(' · ')
}

// ---- primitivas visuais (cartões/campos no padrão do painel do app) ----

function card(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...CARD_BG)
  doc.setDrawColor(...CARD_BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 3, 3, 'FD')
}

function sectionTitle(doc: jsPDF, texto: string, x: number, y: number) {
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(texto, x, y, { charSpace: 0.4 })
}

function fieldBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, valor: string, opts: { fontSize?: number } = {}) {
  doc.setFillColor(...FIELD_BG)
  doc.setDrawColor(...FIELD_BORDER)
  doc.setLineWidth(0.25)
  doc.roundedRect(x, y, w, h, 2.2, 2.2, 'FD')
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.3)
  doc.text(label.toUpperCase(), x + 4.5, y + 5.8, { charSpace: 0.35 })
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(opts.fontSize ?? 9.8)
  const linhas = doc.splitTextToSize(txt(valor || '-'), w - 9) as string[]
  doc.text(linhas.slice(0, 2), x + 4.5, y + 11)
}

function pillWidth(doc: jsPDF, texto: string): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  return doc.getTextWidth(texto) + 7
}
function pill(doc: jsPDF, x: number, y: number, texto: string, bg: [number, number, number], fg: [number, number, number]): number {
  const tw = pillWidth(doc, texto)
  doc.setFillColor(...bg)
  doc.roundedRect(x, y, tw, 5.8, 2.9, 2.9, 'F')
  doc.setTextColor(...fg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(texto, x + tw / 2, y + 3.9, { align: 'center', charSpace: 0.2 })
  return tw
}

// Cotação comercial (A4) pra enviar ao cliente — visual em cartões, no mesmo padrão visual
// do painel do app (fundo cinza, cards brancos arredondados, campos em caixas cinza-claro).
// Mostra só o valor final do frete pro trecho — nunca o detalhamento de pedágio/seguro/custos
// internos, que viram texto em Observações (ver OBSERVACOES acima). Não expõe margem/lucro.
export function gerarCotacaoPdf(d: CotacaoPdfDados, empresa: EmpresaCotacao): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const m = 16
  const larg = 210 - m * 2
  const gap = 6.5

  doc.setFillColor(...PAGE_BG)
  doc.rect(0, 0, 210, 297, 'F')

  // ---- Cabeçalho: logo + dados comerciais da RBR ----
  const topoH = 25
  card(doc, m, 12, larg, topoH)
  doc.addImage(LOGO_RBR_CARGO_PNG, 'PNG', m + 5, 16, 17, 17)
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.text(txt(empresa.nome_fantasia || 'RBR Cargo'), m + 26, 21.5)
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.text('AGENCIAMENTO E TRANSPORTE DE CARGAS', m + 26, 25.8, { charSpace: 0.4 })
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  const linha1 = [empresa.razao_social, empresa.cnpj ? `CNPJ ${empresa.cnpj}` : null, empresa.rntrc ? `RNTRC ${empresa.rntrc}` : null].filter(Boolean).join('  ·  ')
  const linha2 = [enderecoEmpresaLinha(empresa.endereco), empresa.whatsapp_comercial || empresa.telefone_comercial, empresa.email_comercial].filter(Boolean).join('  ·  ')
  if (linha1) doc.text(txt(linha1), m + 26, 29.6)
  if (linha2) doc.text(txt(linha2), m + 26, 33)

  // ---- título + pills (Nº / validade) ----
  let y = 48
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('Cotação de Frete', m, y)

  const validadeData = fmtData(new Date(new Date(d.dataEmissao).getTime() + (d.validadeDias ?? 5) * 86400000).toISOString())
  const txtValidade = `Válida até ${validadeData}`
  const txtNumero = `Nº ${d.numero}`
  let px = 210 - m - pillWidth(doc, txtValidade)
  pill(doc, px, y - 4.4, txtValidade, GOLD_TINT, GOLD)
  px -= pillWidth(doc, txtNumero) + 3
  pill(doc, px, y - 4.4, txtNumero, [231, 233, 244], NAVY)
  y += 8

  // ---- card: cliente e rota ----
  const padX = 5
  const colGap = 4
  const col3 = (larg - padX * 2 - colGap * 2) / 3
  const rowH = 16
  const temCarga = Boolean(d.tipoCarga || d.pesoBrutoKg != null)
  const clienteRotaH = 12 + rowH * 2 + colGap + (temCarga ? rowH + colGap : 0)
  card(doc, m, y, larg, clienteRotaH)
  sectionTitle(doc, 'CLIENTE E ROTA', m + 5, y + 8)
  let fy = y + 12
  fieldBox(doc, m + 5, fy, col3, rowH, 'Cliente', d.clienteNome)
  fieldBox(doc, m + 5 + col3 + colGap, fy, col3, rowH, 'Documento', d.clienteDocumento ?? '-', { fontSize: 8.5 })
  fieldBox(doc, m + 5 + (col3 + colGap) * 2, fy, col3, rowH, 'Contato', d.clienteContato ?? '-', { fontSize: 8.5 })
  fy += rowH + colGap
  fieldBox(doc, m + 5, fy, col3, rowH, 'Origem', [d.cidadeOrigem, d.ufOrigem].filter(Boolean).join('/'))
  fieldBox(doc, m + 5 + col3 + colGap, fy, col3, rowH, 'Destino', [d.cidadeDestino, d.ufDestino].filter(Boolean).join('/'))
  fieldBox(doc, m + 5 + (col3 + colGap) * 2, fy, col3, rowH, 'Distância', d.distanciaKm != null ? `${d.distanciaKm.toLocaleString('pt-BR')} km` : '-')
  if (temCarga) {
    fy += rowH + colGap
    const cargaTexto = [d.tipoCarga, d.pesoBrutoKg != null ? `${d.pesoBrutoKg.toLocaleString('pt-BR')} kg` : null].filter(Boolean).join('  ·  ')
    fieldBox(doc, m + 5, fy, larg - 10, rowH, 'Carga', cargaTexto, { fontSize: 9 })
  }
  y += clienteRotaH + gap

  // ---- card: resumo da cotação (prazo / forma de pagamento / valor do frete) ----
  const resumoH = 22
  card(doc, m, y, larg, resumoH)
  const stats: Array<{ label: string; valor: string; destaque?: boolean }> = [
    { label: 'PRAZO DE PAGAMENTO', valor: d.prazoPagamento || '-' },
    { label: 'FORMA DE PAGAMENTO', valor: d.formaPagamento || '-' },
    { label: 'VALOR DO FRETE', valor: brl(d.valorTotal), destaque: true },
  ]
  const statW = larg / 3
  stats.forEach((s, i) => {
    const sx = m + statW * i
    if (i > 0) {
      doc.setDrawColor(...FIELD_BORDER)
      doc.setLineWidth(0.25)
      doc.line(sx, y + 6, sx, y + resumoH - 6)
    }
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(s.label, sx + statW / 2, y + 8.5, { align: 'center', charSpace: 0.35 })
    doc.setTextColor(...(s.destaque ? GOLD : NAVY))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(s.destaque ? 15 : 9)
    const linhas = doc.splitTextToSize(txt(s.valor), statW - 10) as string[]
    doc.text(linhas.slice(0, 2), sx + statW / 2, y + (s.destaque ? 16.5 : 15), { align: 'center' })
  })
  y += resumoH + gap

  // ---- card: condições gerais + observações ----
  const condicoes: Array<[string, string]> = [
    ['Coleta e entrega', TEXTO_COLETA_ENTREGA],
    ['Validade da cotação', `Até ${validadeData}`],
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  const obsLinhasCount = OBSERVACOES.reduce((n, o) => n + (doc.splitTextToSize(txt(`•  ${o}`), larg - 10) as string[]).length, 0)
  const condH = 12 + 6 + 5 + 6 + obsLinhasCount * 3.9 + 4
  card(doc, m, y, larg, condH)
  sectionTitle(doc, 'CONDIÇÕES GERAIS', m + 5, y + 8)
  let cy = y + 14
  const colW2 = (larg - 10) / 2
  for (let c = 0; c < 2; c++) {
    const par = condicoes[c]
    const x = c === 0 ? m + 5 : m + 5 + colW2 + 5
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const rot = `${par[0]}: `
    doc.text(rot, x, cy)
    const rw = doc.getTextWidth(rot)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(txt(par[1]), x + rw, cy)
  }
  cy += 6
  doc.setDrawColor(...FIELD_BORDER)
  doc.setLineWidth(0.25)
  doc.line(m + 5, cy, 210 - m - 5, cy)
  cy += 6
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.text('OBSERVAÇÕES', m + 5, cy, { charSpace: 0.4 })
  cy += 4.6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  for (const obs of OBSERVACOES) {
    doc.setTextColor(...GOLD)
    doc.text('•', m + 5, cy)
    doc.setTextColor(...MUTED)
    const linhas = doc.splitTextToSize(txt(obs), larg - 14) as string[]
    doc.text(linhas, m + 9, cy)
    cy += linhas.length * 3.9
  }
  y += condH + gap

  if (y > 245) {
    doc.addPage()
    doc.setFillColor(...PAGE_BG)
    doc.rect(0, 0, 210, 297, 'F')
    y = m
  }

  // ---- card: aceite da cotação ----
  const aceiteH = 28
  const refW = 56
  doc.setFillColor(...GOLD_TINT)
  doc.roundedRect(m, y, larg, aceiteH, 3, 3, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(m, y, 1.4, aceiteH, 'F')
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('ACEITE DA COTAÇÃO', m + 7, y + 8.5, { charSpace: 0.3 })
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.8)
  const aceiteTexto = doc.splitTextToSize(
    txt(
      'A aprovação se dá por resposta a este e-mail com a palavra "de acordo", citando o número da cotação. A resposta por escrito tem validade de aceite formal, dispensando assinatura. As datas de coleta e entrega são definidas em comum acordo entre as partes após o fechamento.',
    ),
    larg - refW - 18,
  ) as string[]
  doc.text(aceiteTexto, m + 7, y + 14)

  const refX = 210 - m - refW
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.3)
  doc.line(refX, y + 5, refX, y + aceiteH - 5)
  doc.setLineWidth(0.2)
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('RESPONDER PARA', refX + 7, y + 9.5, { charSpace: 0.3 })
  doc.setTextColor(...NAVY)
  doc.setFontSize(8.5)
  doc.text(txt(empresa.email_comercial || 'comercial@rbrcargo.com.br'), refX + 7, y + 14)
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('REFERÊNCIA', refX + 7, y + 20.5, { charSpace: 0.3 })
  doc.setTextColor(...NAVY)
  doc.setFontSize(10.5)
  doc.text(`Cotação ${d.numero}`, refX + 7, y + 25)

  // ---- rodapé ----
  const totalPaginas = doc.getNumberOfPages()
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p)
    doc.setDrawColor(...CARD_BORDER)
    doc.setLineWidth(0.2)
    doc.line(m, 285, 210 - m, 285)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(txt(empresa.nome_fantasia || 'RBR Cargo'), m, 290, { charSpace: 0.3 })
    doc.setFont('helvetica', 'normal')
    const rodapeContato = [empresa.email_comercial, empresa.whatsapp_comercial || empresa.telefone_comercial].filter(Boolean).join('   ·   ')
    if (rodapeContato) doc.text(txt(rodapeContato), 210 - m, 290, { align: 'right' })
    doc.setFontSize(6.5)
    doc.text(`${p}/${totalPaginas}`, 105, 290, { align: 'center' })
  }

  return doc.output('blob')
}
