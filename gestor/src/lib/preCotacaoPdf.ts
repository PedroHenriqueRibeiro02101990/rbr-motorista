import { jsPDF } from 'jspdf'
import { brl, fmtData } from './financeiro'
import { RODAPE_TOPO, desenharRodape } from './rodapePdf'
import {
  FIELD_BORDER, GOLD, GOLD_TINT, MUTED, NAVY, OBS_ESCOLTA_AET, OBS_MONITORAMENTO, OBS_PISO_ANTT, alturaObservacoes,
  cabecalhoEmpresa, card, fieldBox, fundoPagina, listaObservacoes, sectionTitle, tituloComPilulas, txt, type EmpresaCotacao,
} from './pdfVisual'

// PDF da pré-cotação no mesmo visual da cotação padrão (cotacaoPdf.ts): cabeçalho da empresa, cartões, pílulas,
// rodapé padrão. Um cartão por rota, com o valor por viagem em destaque; quebra de página sem cortar cartão.

export interface RotaPreCotacaoPdf {
  origem: string
  destino: string
  veiculo: string
  viagens: number
  pedagio: number | null
  precoViagem: number | null
}

export interface PreCotacaoPdfDados {
  numero: string
  dataEmissao: string // ISO
  validadeDias: number
  clienteNome: string
  aviso: string
  rotas: RotaPreCotacaoPdf[]
}

// Observações da cotação padrão que valem para a pré-cotação. "Pedágio e seguro inclusos" fica de fora: aqui o
// pedágio é informado rota a rota (incluído ou não).
const OBSERVACOES = [OBS_PISO_ANTT, OBS_MONITORAMENTO, OBS_ESCOLTA_AET]

const M = 16
const LARG = 210 - M * 2
const GAP = 6.5
const ROTA_H = 35

function seta(doc: jsPDF, x: number, y: number, comp = 6) {
  doc.setDrawColor(...GOLD)
  doc.setFillColor(...GOLD)
  doc.setLineWidth(0.5)
  doc.line(x, y, x + comp - 1.6, y)
  doc.triangle(x + comp, y, x + comp - 2, y - 1.2, x + comp - 2, y + 1.2, 'F')
}

function cartaoRota(doc: jsPDF, r: RotaPreCotacaoPdf, i: number, y: number) {
  card(doc, M, y, LARG, ROTA_H)
  // número + trecho
  doc.setFillColor(...NAVY)
  doc.circle(M + 8, y + 7.6, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(String(i + 1), M + 8, y + 8.7, { align: 'center' })
  doc.setTextColor(...NAVY)
  doc.setFontSize(10.5)
  const origem = txt(r.origem)
  doc.text(origem, M + 14, y + 9)
  const xs = M + 14 + doc.getTextWidth(origem) + 2.5
  seta(doc, xs, y + 7.8)
  doc.text(txt(r.destino), xs + 8.5, y + 9)

  // campos + valor por viagem em destaque
  const valorW = 50
  const colGap = 4
  const campos = LARG - 10 - valorW - colGap
  const colW = (campos - colGap * 2) / 3
  const fy = y + 13.5
  const fh = 16
  fieldBox(doc, M + 5, fy, colW, fh, 'Veículo', r.veiculo || 'A definir', { fontSize: 8.8 })
  fieldBox(doc, M + 5 + colW + colGap, fy, colW, fh, 'Viagens', String(r.viagens))
  const comPedagio = r.pedagio != null && r.pedagio > 0
  fieldBox(
    doc, M + 5 + (colW + colGap) * 2, fy, colW, fh, comPedagio ? 'Pedágio incluído' : 'Pedágio',
    comPedagio ? brl(r.pedagio) : 'Não incluído', { fontSize: 8.8 },
  )
  const vx = M + LARG - 5 - valorW
  doc.setFillColor(...GOLD_TINT)
  doc.roundedRect(vx, fy, valorW, fh, 2.2, 2.2, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.3)
  doc.text('VALOR POR VIAGEM', vx + valorW / 2, fy + 5.8, { align: 'center', charSpace: 0.35 })
  doc.setFontSize(13.5)
  doc.text(r.precoViagem != null ? brl(r.precoViagem) : 'A combinar', vx + valorW / 2, fy + 12.6, { align: 'center' })
}

export function gerarPreCotacaoPdf(d: PreCotacaoPdfDados, empresa: EmpresaCotacao): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const emissao = fmtData(d.dataEmissao)
  const validaAte = fmtData(new Date(new Date(d.dataEmissao).getTime() + d.validadeDias * 86400000).toISOString())

  fundoPagina(doc)
  cabecalhoEmpresa(doc, empresa, M)

  let y = 48
  tituloComPilulas(doc, 'Pré-cotação', y, `Nº ${d.numero}`, `Válida até ${validaAte}`, M)
  y += 8

  // ---- cliente, emissão e validade ----
  const colGap = 4
  const col3 = (LARG - 10 - colGap * 2) / 3
  const clienteH = 12 + 16 + 5
  card(doc, M, y, LARG, clienteH)
  sectionTitle(doc, 'CLIENTE', M + 5, y + 8)
  fieldBox(doc, M + 5, y + 12, col3, 16, 'Cliente', d.clienteNome)
  fieldBox(doc, M + 5 + col3 + colGap, y + 12, col3, 16, 'Data de emissão', emissao)
  fieldBox(doc, M + 5 + (col3 + colGap) * 2, y + 12, col3, 16, 'Validade', `${d.validadeDias} dias · até ${validaAte}`, { fontSize: 8.8 })
  y += clienteH + GAP

  // ---- aviso da pré-cotação em caixa destacada ----
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.4)
  const avisoLinhas = doc.splitTextToSize(txt(d.aviso), LARG - 14) as string[]
  const avisoH = 10.5 + avisoLinhas.length * 4.2
  doc.setFillColor(...GOLD_TINT)
  doc.roundedRect(M, y, LARG, avisoH, 3, 3, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(M, y, 1.4, avisoH, 'F')
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('ATENÇÃO', M + 7, y + 6.5, { charSpace: 0.4 })
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.4)
  doc.text(avisoLinhas, M + 7, y + 11)
  y += avisoH + GAP

  // ---- rotas: um cartão por trecho, sem cortar cartão entre páginas ----
  const novaPagina = () => {
    doc.addPage()
    fundoPagina(doc)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text(txt(`Pré-cotação Nº ${d.numero} · continuação`), M, 16, { charSpace: 0.2 })
    y = 22
  }
  if (y + 8 + ROTA_H > RODAPE_TOPO) novaPagina()
  sectionTitle(doc, `ROTAS (${d.rotas.length})`, M + 1, y + 2)
  y += 6
  d.rotas.forEach((r, i) => {
    if (y + ROTA_H > RODAPE_TOPO) novaPagina()
    cartaoRota(doc, r, i, y)
    y += ROTA_H + 4
  })
  y += GAP - 4

  // ---- condições gerais + observações padrão ----
  const obsH = alturaObservacoes(doc, OBSERVACOES, LARG - 10)
  const condH = 12 + 4.2 * 2 + 5 + 6 + obsH + 5
  if (y + condH > RODAPE_TOPO) novaPagina()
  card(doc, M, y, LARG, condH)
  sectionTitle(doc, 'CONDIÇÕES GERAIS', M + 5, y + 8)
  let cy = y + 14
  const linhaCondicao = (rotulo: string, valor: string) => {
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(`${rotulo}: `, M + 5, cy)
    const rw = doc.getTextWidth(`${rotulo}: `)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(txt(valor), M + 5 + rw, cy)
    cy += 4.2
  }
  linhaCondicao('Validade', `${d.validadeDias} dias a partir do envio (até ${validaAte})`)
  linhaCondicao('Valores', 'por viagem, para o veículo indicado em cada rota; pedágio conforme cada rota')
  doc.setDrawColor(...FIELD_BORDER)
  doc.setLineWidth(0.25)
  doc.line(M + 5, cy, 210 - M - 5, cy)
  cy += 6
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.text('OBSERVAÇÕES', M + 5, cy, { charSpace: 0.4 })
  cy += 4.6
  listaObservacoes(doc, OBSERVACOES, M + 5, cy, LARG - 10)

  desenharRodape(doc, empresa, M)
  return doc.output('blob')
}
