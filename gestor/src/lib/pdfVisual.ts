import type { jsPDF } from 'jspdf'
import { LOGO_RBR_CARGO_PNG } from '@rbr/shared/brand/logoDataUri'

// Visual comum dos PDFs comerciais da RBR (cotação padrão e pré-cotação): fundo cinza, cartões brancos
// arredondados, campos em caixas cinza-claro, pílulas e o cabeçalho com logo e dados da empresa.
// O rodapé é o padrão de lib/rodapePdf.

export const NAVY: [number, number, number] = [18, 23, 61]
export const MUTED: [number, number, number] = [110, 116, 140]
export const GOLD: [number, number, number] = [184, 134, 59]
export const GOLD_TINT: [number, number, number] = [250, 244, 232]
export const PAGE_BG: [number, number, number] = [241, 243, 247]
export const CARD_BG: [number, number, number] = [255, 255, 255]
export const CARD_BORDER: [number, number, number] = [223, 227, 236]
export const FIELD_BG: [number, number, number] = [246, 247, 251]
export const FIELD_BORDER: [number, number, number] = [232, 235, 242]
export const NAVY_TINT: [number, number, number] = [231, 233, 244]

// Helvetica do jsPDF não tem seta nem travessão.
export const txt = (s: string) => s.replace(/→/g, '->').replace(/—/g, '-')

// Formato real de parametros_sistema.dados_empresa (ver dados-empresa-rbr-cargo.md).
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

// Observações fixas da cotação padrão. Reaproduzidas do papel timbrado (ver /areas/modelo-papel-timbrado.md);
// a declaração do piso ANTT segue a Resolução ANTT 6.084/2026.
export const OBS_PISO_ANTT =
  'Frete calculado em conformidade com o piso mínimo de referência da ANTT (Resolução ANTT 6.084/2026) para o trecho, tipo de carga e configuração de eixos informados.'
export const OBS_PEDAGIO_SEGURO_INCLUSOS = 'Pedágio e seguro de carga (SGR) já estão inclusos no valor do frete.'
export const OBS_MONITORAMENTO = 'Monitoramento com checkpoint a cada 6 horas ao longo do trajeto.'
export const OBS_ESCOLTA_AET =
  'Escolta armada e Autorização Especial de Trânsito (AET), quando exigidas pelo tipo de carga, são tratadas e cotadas à parte.'

export function enderecoEmpresaLinha(e?: EmpresaCotacao['endereco']): string {
  if (!e) return ''
  const linha1 = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const linha2 = [e.municipio, e.uf].filter(Boolean).join('/')
  return [linha1, linha2].filter(Boolean).join(' · ')
}

export function fundoPagina(doc: jsPDF) {
  doc.setFillColor(...PAGE_BG)
  doc.rect(0, 0, 210, 297, 'F')
}

export function card(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...CARD_BG)
  doc.setDrawColor(...CARD_BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 3, 3, 'FD')
}

export function sectionTitle(doc: jsPDF, texto: string, x: number, y: number) {
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(texto, x, y, { charSpace: 0.4 })
}

export function fieldBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, valor: string, opts: { fontSize?: number } = {}) {
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

export function pillWidth(doc: jsPDF, texto: string): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  return doc.getTextWidth(texto) + 7
}

export function pill(doc: jsPDF, x: number, y: number, texto: string, bg: [number, number, number], fg: [number, number, number]): number {
  const tw = pillWidth(doc, texto)
  doc.setFillColor(...bg)
  doc.roundedRect(x, y, tw, 5.8, 2.9, 2.9, 'F')
  doc.setTextColor(...fg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(texto, x + tw / 2, y + 3.9, { align: 'center', charSpace: 0.2 })
  return tw
}

// Cartão do topo: logo + nome, faixa dourada e as duas linhas de dados comerciais (razão social, CNPJ, RNTRC /
// endereço, WhatsApp, e-mail). Ocupa de y = 12 a 12 + 25 mm.
export function cabecalhoEmpresa(doc: jsPDF, empresa: EmpresaCotacao, m = 16) {
  const larg = 210 - m * 2
  card(doc, m, 12, larg, 25)
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
}

// Título grande à esquerda e pílulas (Nº e validade) alinhadas à direita, na mesma linha.
export function tituloComPilulas(doc: jsPDF, titulo: string, y: number, numero: string, validade: string, m = 16) {
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(titulo, m, y)
  let px = 210 - m - pillWidth(doc, validade)
  pill(doc, px, y - 4.4, validade, GOLD_TINT, GOLD)
  px -= pillWidth(doc, numero) + 3
  pill(doc, px, y - 4.4, numero, NAVY_TINT, NAVY)
}

// Lista de observações com marcador dourado; devolve o y depois da última linha.
export function listaObservacoes(doc: jsPDF, itens: string[], x: number, y: number, largura: number): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  for (const obs of itens) {
    doc.setTextColor(...GOLD)
    doc.text('•', x, y)
    doc.setTextColor(...MUTED)
    const linhas = doc.splitTextToSize(txt(obs), largura - 4) as string[]
    doc.text(linhas, x + 4, y)
    y += linhas.length * 3.9
  }
  return y
}

export function alturaObservacoes(doc: jsPDF, itens: string[], largura: number): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  return itens.reduce((n, o) => n + (doc.splitTextToSize(txt(`•  ${o}`), largura) as string[]).length, 0) * 3.9
}
