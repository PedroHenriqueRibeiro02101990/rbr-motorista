import type { jsPDF } from 'jspdf'

// Rodapé padrão dos PDFs da RBR (mesmo desenho do rodapé da cotação): linha fina, nome da
// empresa à esquerda, página no meio e contato à direita. O conteúdo da página deve parar
// antes de RODAPE_TOPO (mm, A4) — quem gera o PDF quebra a página ao chegar nesse limite.
export const RODAPE_LINHA = 285
export const RODAPE_TOPO = RODAPE_LINHA - 6

const MUTED: [number, number, number] = [110, 116, 140]
const BORDA: [number, number, number] = [223, 227, 236]
const txt = (s: string) => s.replace(/→/g, '->').replace(/—/g, '-')

export type EmpresaRodape = {
  nome_fantasia?: string
  email_comercial?: string
  whatsapp_comercial?: string
  telefone_comercial?: string
}

// Chamar no fim, depois de todo o conteúdo (precisa saber o total de páginas).
export function desenharRodape(doc: jsPDF, empresa: EmpresaRodape, margem = 16) {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...BORDA)
    doc.setLineWidth(0.2)
    doc.line(margem, RODAPE_LINHA, 210 - margem, RODAPE_LINHA)
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(txt(empresa.nome_fantasia || 'RBR Cargo'), margem, 290, { charSpace: 0.3 })
    doc.setFont('helvetica', 'normal')
    const contato = [empresa.email_comercial, empresa.whatsapp_comercial || empresa.telefone_comercial].filter(Boolean).join('   ·   ')
    if (contato) doc.text(txt(contato), 210 - margem, 290, { align: 'right' })
    doc.setFontSize(6.5)
    doc.text(`${p}/${total}`, 105, 290, { align: 'center' })
  }
}
