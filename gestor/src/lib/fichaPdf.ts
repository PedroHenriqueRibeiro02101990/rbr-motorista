import { jsPDF } from 'jspdf'
import type { DetalheOperacao, SecaoFicha } from './operacaoDetalhe'

const NAVY: [number, number, number] = [18, 23, 61]
const MUTED: [number, number, number] = [110, 116, 140]
const RED: [number, number, number] = [196, 40, 40]

// As fontes padrão do PDF (WinAnsi) não têm seta; troca por "->".
const pdfTxt = (s: string) => s.replace(/→/g, '->')

// Gera o PDF da ficha de emissão (A4, texto pesquisável). Campos obrigatórios vazios saem em vermelho.
export function gerarFichaPdf(d: DetalheOperacao, secoes: SecaoFicha[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margem = 14
  const largura = 210 - margem * 2
  const colCampo = 62
  let y = margem

  const novaPaginaSePreciso = (altura: number) => {
    if (y + altura > 297 - margem) {
      doc.addPage()
      y = margem
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text('RBR Cargo — Ficha de emissão de documentos', margem, y + 5)
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const cot = d.cotacao
  const rota = cot?.cidade_origem ? `${cot.cidade_origem}/${cot.uf_origem} -> ${cot.cidade_destino}/${cot.uf_destino}` : ''
  doc.text(`Operação ${d.operacao.id.slice(0, 8).toUpperCase()}  ·  ${rota}  ·  gerada em ${new Date().toLocaleString('pt-BR')}`, margem, y)
  y += 4
  const faltando = secoes.reduce((n, s) => n + s.linhas.filter((l) => l.faltando).length, 0)
  if (faltando > 0) {
    doc.setTextColor(...RED)
    doc.text(`${faltando} campo(s) obrigatório(s) ainda faltando — marcados em vermelho.`, margem, y + 4)
    y += 6
  }
  y += 4

  for (const s of secoes) {
    novaPaginaSePreciso(14)
    doc.setFillColor(237, 239, 247)
    doc.rect(margem, y, largura, 6.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...NAVY)
    doc.text(pdfTxt(s.titulo.toUpperCase()), margem + 2, y + 4.5)
    y += 8.5
    doc.setFontSize(9)
    for (const linha of s.linhas) {
      const valorLinhas = doc.splitTextToSize(pdfTxt(linha.valor), largura - colCampo - 2) as string[]
      const alt = Math.max(1, valorLinhas.length) * 4.2 + 1
      novaPaginaSePreciso(alt)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text(pdfTxt(linha.campo), margem + 2, y + 3)
      doc.setFont('helvetica', linha.faltando ? 'bold' : 'normal')
      doc.setTextColor(...(linha.faltando ? RED : NAVY))
      doc.text(valorLinhas, margem + colCampo, y + 3)
      y += alt
    }
    y += 2
  }

  novaPaginaSePreciso(12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    'Após emitir, devolva os PDFs/XMLs (CT-e, MDF-e, CIOT, vale-pedágio, averbação) para a RBR anexar na operação.',
    margem,
    y + 4,
  )
  return doc.output('blob')
}
