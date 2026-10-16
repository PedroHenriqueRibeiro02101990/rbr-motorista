import { jsPDF } from 'jspdf'
import { brl, fmtData } from './financeiro'
import { desenharRodape } from './rodapePdf'
import {
  FIELD_BORDER, GOLD, GOLD_TINT, MUTED, NAVY, OBS_ESCOLTA_AET, OBS_MONITORAMENTO, OBS_PEDAGIO_SEGURO_INCLUSOS, OBS_PISO_ANTT,
  alturaObservacoes, cabecalhoEmpresa, card, fieldBox, fundoPagina, listaObservacoes, sectionTitle, tituloComPilulas, txt,
  type EmpresaCotacao,
} from './pdfVisual'

export type { EmpresaCotacao } from './pdfVisual'

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
  enderecoDestino?: string | null
  // Carga que passa por mais de um ponto de coleta antes do destino final (ex.: "carrega na
  // Bosch, depois na Logik, e segue pro destino"). Texto livre e opcional.
  pontosColetaAdicionais?: string | null
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
  prazoEntrega?: string | null
  observacoes?: string | null
}

// Texto padrão da RBR — reaproduzido do papel timbrado (Word) que este PDF substitui, não
// inventado aqui. Ver /areas/modelo-papel-timbrado.md.
const TEXTO_COLETA_ENTREGA = 'Em datas acordadas entre as partes'

// Observações fixas no rodapé da cotação — pedágio/seguro/monitoramento não aparecem mais
// como itens de preço (só o valor final do frete), e sim aqui como texto corrido; inclui a
// declaração de conformidade com o piso mínimo ANTT (Resolução ANTT 6.084/2026, ver
// claude/radar-regulatorio-log.md e apps-motorista-agenciador-status-v1.md no projeto).
const OBSERVACOES: string[] = [OBS_PISO_ANTT, OBS_PEDAGIO_SEGURO_INCLUSOS, OBS_MONITORAMENTO, OBS_ESCOLTA_AET]

// Cotação comercial (A4) pra enviar ao cliente — visual em cartões, no mesmo padrão visual
// do painel do app (fundo cinza, cards brancos arredondados, campos em caixas cinza-claro).
// Mostra só o valor final do frete pro trecho — nunca o detalhamento de pedágio/seguro/custos
// internos, que viram texto em Observações (ver OBSERVACOES acima). Não expõe margem/lucro.
export function gerarCotacaoPdf(d: CotacaoPdfDados, empresa: EmpresaCotacao): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const m = 16
  const larg = 210 - m * 2
  const gap = 6.5

  fundoPagina(doc)

  // ---- Cabeçalho: logo + dados comerciais da RBR ----
  cabecalhoEmpresa(doc, empresa, m)

  // ---- título + pills (Nº / validade) ----
  let y = 48
  const validadeData = fmtData(new Date(new Date(d.dataEmissao).getTime() + (d.validadeDias ?? 5) * 86400000).toISOString())
  tituloComPilulas(doc, 'Cotação de Frete', y, `Nº ${d.numero}`, `Válida até ${validadeData}`, m)
  y += 8

  // ---- card: cliente e rota ----
  const padX = 5
  const colGap = 4
  const col3 = (larg - padX * 2 - colGap * 2) / 3
  const rowH = 16
  const temCarga = Boolean(d.tipoCarga || d.pesoBrutoKg != null)
  const temPontosColeta = Boolean(d.pontosColetaAdicionais)
  const clienteRotaH =
    12 + rowH * 2 + colGap + (temPontosColeta ? rowH + colGap : 0) + (temCarga ? rowH + colGap : 0)
  card(doc, m, y, larg, clienteRotaH)
  sectionTitle(doc, 'CLIENTE E ROTA', m + 5, y + 8)
  let fy = y + 12
  fieldBox(doc, m + 5, fy, col3, rowH, 'Cliente', d.clienteNome)
  fieldBox(doc, m + 5 + col3 + colGap, fy, col3, rowH, 'Documento', d.clienteDocumento ?? '-', { fontSize: 8.5 })
  fieldBox(doc, m + 5 + (col3 + colGap) * 2, fy, col3, rowH, 'Contato', d.clienteContato ?? '-', { fontSize: 8.5 })
  fy += rowH + colGap
  fieldBox(doc, m + 5, fy, col3, rowH, 'Origem', [d.cidadeOrigem, d.ufOrigem].filter(Boolean).join('/'))
  const destinoTexto = [[d.cidadeDestino, d.ufDestino].filter(Boolean).join('/'), d.enderecoDestino].filter(Boolean).join(' — ')
  fieldBox(doc, m + 5 + col3 + colGap, fy, col3, rowH, 'Destino', destinoTexto, { fontSize: 8.5 })
  fieldBox(doc, m + 5 + (col3 + colGap) * 2, fy, col3, rowH, 'Distância', d.distanciaKm != null ? `${d.distanciaKm.toLocaleString('pt-BR')} km` : '-')
  if (temPontosColeta) {
    fy += rowH + colGap
    fieldBox(doc, m + 5, fy, larg - 10, rowH, 'Pontos de coleta adicionais', d.pontosColetaAdicionais ?? '-', { fontSize: 9 })
  }
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
  // As duas primeiras condições ficam lado a lado (como sempre foi); "Prazo de entrega" (se
  // preenchido na cotação) entra como uma 3ª linha, em largura cheia, abaixo delas.
  const condicoes: Array<[string, string]> = [
    ['Coleta e entrega', TEXTO_COLETA_ENTREGA],
    ['Validade da cotação', `Até ${validadeData}`],
  ]
  if (d.prazoEntrega) condicoes.push(['Prazo de entrega', d.prazoEntrega])
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  const colW2 = (larg - 10) / 2
  const condLinhas = condicoes.map(([label, valor], i) => {
    const rw = doc.getTextWidth(`${label}: `)
    const colW = i < 2 ? colW2 : larg - 10
    return (doc.splitTextToSize(txt(valor), colW - rw) as string[]).length
  })
  const condRowsAlturas = [Math.max(condLinhas[0] ?? 1, condLinhas[1] ?? 1)]
  for (let i = 2; i < condicoes.length; i++) condRowsAlturas.push(condLinhas[i])
  const condicoesH = condRowsAlturas.reduce((n, l) => n + l * 4.2, 0)

  const obsAltura = alturaObservacoes(doc, OBSERVACOES, larg - 10)
  const obsUsuario = d.observacoes ? (doc.splitTextToSize(txt(d.observacoes), larg - 10) as string[]) : []
  const obsUsuarioH = obsUsuario.length > 0 ? 4.6 + obsUsuario.length * 3.9 + 2 : 0

  const condH = 12 + condicoesH + 5 + 6 + obsAltura + obsUsuarioH + 4
  card(doc, m, y, larg, condH)
  sectionTitle(doc, 'CONDIÇÕES GERAIS', m + 5, y + 8)
  let cy = y + 14
  for (let c = 0; c < Math.min(2, condicoes.length); c++) {
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
    const linhas = doc.splitTextToSize(txt(par[1]), colW2 - rw) as string[]
    doc.text(linhas, x + rw, cy)
  }
  cy += condRowsAlturas[0] * 4.2
  for (let c = 2; c < condicoes.length; c++) {
    const par = condicoes[c]
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    const rot = `${par[0]}: `
    doc.text(rot, m + 5, cy)
    const rw = doc.getTextWidth(rot)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    const linhas = doc.splitTextToSize(txt(par[1]), larg - 10 - rw) as string[]
    doc.text(linhas, m + 5 + rw, cy)
    cy += linhas.length * 4.2
  }
  doc.setDrawColor(...FIELD_BORDER)
  doc.setLineWidth(0.25)
  doc.line(m + 5, cy, 210 - m - 5, cy)
  cy += 6
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.text('OBSERVAÇÕES', m + 5, cy, { charSpace: 0.4 })
  cy += 4.6
  cy = listaObservacoes(doc, OBSERVACOES, m + 5, cy, larg - 10)
  if (obsUsuario.length > 0) {
    cy += 2
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.text('OBSERVAÇÕES DA COTAÇÃO', m + 5, cy, { charSpace: 0.4 })
    cy += 4.6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    doc.setTextColor(...MUTED)
    doc.text(obsUsuario, m + 5, cy)
    cy += obsUsuario.length * 3.9
  }
  y += condH + gap

  if (y > 245) {
    doc.addPage()
    fundoPagina(doc)
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

  // ---- rodapé (padrão de lib/rodapePdf) ----
  desenharRodape(doc, empresa, m)

  return doc.output('blob')
}
