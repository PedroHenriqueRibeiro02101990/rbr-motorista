import { jsPDF } from 'jspdf'
import { formatarLinhaDigitavel } from '@rbr/shared/boleto'
import type { Fatura, Lancamento } from './financeiro'
import { brl, fmtData } from './financeiro'

const NAVY: [number, number, number] = [18, 23, 61]
const MUTED: [number, number, number] = [110, 116, 140]
const GOLD: [number, number, number] = [184, 134, 59]
const txt = (s: string) => s.replace(/→/g, '->').replace(/—/g, '-')

export interface EmpresaFatura {
  razao_social?: string
  nome_fantasia?: string
  cnpj?: string
  endereco?: string
  telefone?: string
  email?: string
}
export interface BancoFatura {
  favorecido?: string
  pix?: string
  banco?: string
  agencia?: string
  conta?: string
}

// Fatura de cobrança ao cliente (A4). Lista os fretes, total, vencimento e como pagar.
export function gerarFaturaPdf(f: Fatura, itens: Lancamento[], empresa: EmpresaFatura, banco: BancoFatura): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const m = 16
  const larg = 210 - m * 2
  let y = m

  doc.setFillColor(...NAVY)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(txt(empresa.nome_fantasia || empresa.razao_social || 'RBR Cargo'), m, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(txt([empresa.razao_social, empresa.cnpj ? `CNPJ ${empresa.cnpj}` : null].filter(Boolean).join(' · ')), m, 19)
  doc.text(txt([empresa.telefone, empresa.email].filter(Boolean).join(' · ')), m, 24)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`FATURA Nº ${f.numero ?? ''}`, 210 - m, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Emissão ${fmtData((f.data_emissao ?? '').slice(0, 10))}`, 210 - m, 19, { align: 'right' })
  y = 40

  doc.setTextColor(...MUTED)
  doc.setFontSize(8)
  doc.text('CLIENTE', m, y)
  doc.setTextColor(...NAVY)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(txt(f.cliente_nome ?? '-'), m, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(txt(f.cliente_cnpj ? `CNPJ ${f.cliente_cnpj}` : f.cliente_cpf ? `CPF ${f.cliente_cpf}` : ''), m, y + 10.5)

  doc.setFillColor(248, 244, 236)
  doc.roundedRect(210 - m - 62, y - 4, 62, 20, 2, 2, 'F')
  doc.setTextColor(...MUTED)
  doc.setFontSize(8)
  doc.text('VENCIMENTO', 210 - m - 58, y + 1)
  doc.text('TOTAL', 210 - m - 58, y + 9.5)
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(fmtData(f.data_vencimento), 210 - m - 4, y + 1.5, { align: 'right' })
  doc.setTextColor(...GOLD)
  doc.setFontSize(13)
  doc.text(brl(Number(f.valor_total)), 210 - m - 4, y + 10.5, { align: 'right' })
  y += 26

  // Tabela
  doc.setFillColor(237, 239, 247)
  doc.rect(m, y, larg, 7, 'F')
  doc.setTextColor(...NAVY)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIÇÃO', m + 2, y + 4.8)
  doc.text('DOCUMENTO', m + 112, y + 4.8)
  doc.text('VALOR', 210 - m - 2, y + 4.8, { align: 'right' })
  y += 9
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const it of itens) {
    const linhas = doc.splitTextToSize(txt(it.descricao ?? ''), 106) as string[]
    const alt = linhas.length * 4.3 + 2
    if (y + alt > 250) {
      doc.addPage()
      y = m
    }
    doc.setTextColor(...NAVY)
    doc.text(linhas, m + 2, y + 3)
    doc.setTextColor(...MUTED)
    doc.text(txt(it.numero_documento ? `Nº ${it.numero_documento}` : '-'), m + 112, y + 3)
    doc.setTextColor(...NAVY)
    doc.text(brl(Number(it.valor)), 210 - m - 2, y + 3, { align: 'right' })
    y += alt
    doc.setDrawColor(236, 238, 244)
    doc.line(m, y - 1, 210 - m, y - 1)
  }
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL', 210 - m - 40, y + 3)
  doc.text(brl(Number(f.valor_total)), 210 - m - 2, y + 3, { align: 'right' })
  y += 12

  // Como pagar
  if (y > 235) {
    doc.addPage()
    y = m
  }
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('COMO PAGAR', m, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  const pag: string[] = []
  if (f.linha_digitavel) pag.push(`Boleto — linha digitável: ${formatarLinhaDigitavel(f.linha_digitavel)}`)
  if (f.pix_copia_cola) pag.push(`Pix copia e cola: ${f.pix_copia_cola}`)
  if (banco.pix) pag.push(`Pix: ${banco.pix}${banco.favorecido ? ` (${banco.favorecido})` : ''}`)
  if (banco.banco && banco.conta) pag.push(`Transferência: banco ${banco.banco} · agência ${banco.agencia ?? ''} · conta ${banco.conta}${banco.favorecido ? ` · ${banco.favorecido}` : ''}`)
  if (!pag.length) pag.push('Combine a forma de pagamento com a RBR Cargo.')
  for (const p of pag) {
    const l = doc.splitTextToSize(txt(p), larg) as string[]
    doc.text(l, m, y)
    y += l.length * 4.5 + 1
  }
  if (f.observacoes) {
    y += 3
    doc.setTextColor(...MUTED)
    const l = doc.splitTextToSize(txt(`Observações: ${f.observacoes}`), larg) as string[]
    doc.text(l, m, y)
  }
  doc.setTextColor(...MUTED)
  doc.setFontSize(7.5)
  doc.text('Após o pagamento, envie o comprovante para a RBR Cargo. Obrigado pela parceria.', m, 287)
  return doc.output('blob')
}
