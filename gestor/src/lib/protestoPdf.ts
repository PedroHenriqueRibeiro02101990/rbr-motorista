import { jsPDF } from 'jspdf'
import { LOGO_RBR_CARGO_PNG } from '@rbr/shared/brand/logoDataUri'
import { soDigitos } from '@rbr/shared/consultaCadastro'
import { formatarDoc } from '@rbr/shared/documento'
import { desenharRodape, RODAPE_TOPO, type EmpresaRodape } from './rodapePdf'
import {
  dataArquivo,
  dataBr,
  dataHoraBr,
  estadoDaConsulta,
  FONTE_DESCRICAO,
  textoDataProtesto,
  textoQuantidade,
  textoValor,
  type ConsultaProtesto,
  type RegraProtesto,
} from './protesto'

// Relatório da consulta de protesto (A4), no mesmo padrão visual da cotação (fundo cinza,
// cartões brancos, logotipo, rodapé padrão). Gerado só a partir do que já está gravado em
// consultas_externas: baixar o relatório nunca chama a consulta paga.

const NAVY: [number, number, number] = [18, 23, 61]
const MUTED: [number, number, number] = [110, 116, 140]
const GOLD: [number, number, number] = [184, 134, 59]
const PAGE_BG: [number, number, number] = [241, 243, 247]
const CARD_BG: [number, number, number] = [255, 255, 255]
const CARD_BORDER: [number, number, number] = [223, 227, 236]
const FIELD_BG: [number, number, number] = [246, 247, 251]
const FIELD_BORDER: [number, number, number] = [232, 235, 242]
const HEAD_BG: [number, number, number] = [231, 233, 244]
// Selos de resultado (mesmos tons dos selos do app: verde positivo, âmbar de atenção, cinza neutro).
const SELO = {
  sem: { bg: [231, 245, 236] as [number, number, number], fg: [27, 127, 75] as [number, number, number], borda: [190, 228, 205] as [number, number, number] },
  com: { bg: [253, 241, 220] as [number, number, number], fg: [138, 90, 0] as [number, number, number], borda: [240, 214, 160] as [number, number, number] },
  vencida: { bg: [236, 237, 242] as [number, number, number], fg: [90, 96, 116] as [number, number, number], borda: [214, 217, 226] as [number, number, number] },
}
const txt = (s: string) => s.replace(/→/g, '->').replace(/—/g, '-')

export type EmpresaProtesto = EmpresaRodape & {
  razao_social?: string
  cnpj?: string
}
export type ClienteProtesto = {
  razao_social?: string | null
  nome_fantasia?: string | null
  cnpj: string
  cidade?: string | null
  uf?: string | null
}

const AVISO_LEGAL =
  'Consulta de caráter informativo, feita em base nacional de cartórios de protesto na data e hora indicadas. Não substitui certidão emitida pelo cartório competente. A fonte não emite comprovante desta consulta. A situação pode mudar após a data da consulta.'

export function nomeArquivoProtesto(cnpj: string, consultadoEm: string) {
  return `protesto_${soDigitos(cnpj)}_${dataArquivo(consultadoEm)}.pdf`
}

export function gerarProtestoPdf(opts: {
  cliente: ClienteProtesto
  consulta: ConsultaProtesto
  regra: RegraProtesto
  empresa: EmpresaProtesto
  consultadoPorNome?: string | null
  agora?: number
}): Blob {
  const { cliente, consulta, regra, empresa } = opts
  const r = consulta.resultado ?? {}
  const est = estadoDaConsulta(consulta, regra, opts.agora)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const m = 16
  const larg = 210 - m * 2
  let y = 0

  const fundo = () => {
    doc.setFillColor(...PAGE_BG)
    doc.rect(0, 0, 210, 297, 'F')
  }
  const card = (x: number, yy: number, w: number, h: number) => {
    doc.setFillColor(...CARD_BG)
    doc.setDrawColor(...CARD_BORDER)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, yy, w, h, 3, 3, 'FD')
  }
  const tituloSecao = (t: string, x: number, yy: number) => {
    doc.setTextColor(...NAVY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(t, x, yy, { charSpace: 0.4 })
  }
  // Pequeno cabeçalho nas páginas de continuação.
  const novaPagina = () => {
    doc.addPage()
    fundo()
    doc.setTextColor(...MUTED)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(txt(`Relatório de consulta de protestos · CNPJ ${formatarDoc(cliente.cnpj)} (continuação)`), m, 12)
    y = 18
  }
  const garantir = (altura: number) => {
    if (y + altura > RODAPE_TOPO) {
      novaPagina()
      return true
    }
    return false
  }

  fundo()

  // ---- Cabeçalho: logo + empresa ----
  card(m, 12, larg, 25)
  doc.addImage(LOGO_RBR_CARGO_PNG, 'PNG', m + 5, 16, 17, 17)
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.text(txt(empresa.nome_fantasia || 'RBR Cargo'), m + 26, 21.5)
  doc.setTextColor(...GOLD)
  doc.setFontSize(6.8)
  doc.text('AGENCIAMENTO E TRANSPORTE DE CARGAS', m + 26, 25.8, { charSpace: 0.4 })
  doc.setTextColor(...MUTED)
  doc.setFont('helvetica', 'normal')
  const linhaEmpresa = [empresa.razao_social, empresa.cnpj ? `CNPJ ${empresa.cnpj}` : null].filter(Boolean).join('  ·  ')
  if (linhaEmpresa) doc.text(txt(linhaEmpresa), m + 26, 29.6)

  // ---- Título ----
  y = 48
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('Relatório de consulta de protestos', m, y)
  y += 6

  // ---- Selo de resultado ----
  const chaveSelo = est.vencida ? 'vencida' : est.situacao === 'com' ? 'com' : 'sem'
  const cor = SELO[chaveSelo]
  const textoSelo = est.vencida ? 'CONSULTA VENCIDA' : est.situacao === 'com' ? 'COM PROTESTO' : est.situacao === 'sem' ? 'SEM PROTESTO' : 'RESULTADO SEM INDICAÇÃO'
  const subSelo = est.vencida
    ? `Último resultado: ${est.situacao === 'com' ? 'com protesto' : est.situacao === 'sem' ? 'sem protesto' : 'sem indicação'}. A consulta passou da validade de ${regra.validade_dias} dias e pode estar desatualizada.`
    : est.situacao === 'com'
      ? 'Constam protestos em nome deste CNPJ nos cartórios do país na data da consulta.'
      : est.situacao === 'sem'
        ? 'Nada consta em nome deste CNPJ nos cartórios do país na data da consulta.'
        : 'A fonte não indicou se há protestos. Veja as observações.'
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const subLinhas = doc.splitTextToSize(txt(subSelo), larg - 12) as string[]
  const seloH = 15 + subLinhas.length * 4
  doc.setFillColor(...cor.bg)
  doc.setDrawColor(...cor.borda)
  doc.setLineWidth(0.4)
  doc.roundedRect(m, y, larg, seloH, 3, 3, 'FD')
  doc.setFillColor(...cor.fg)
  doc.rect(m, y, 1.6, seloH, 'F')
  doc.setTextColor(...cor.fg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(textoSelo, m + 7, y + 9.5, { charSpace: 0.5 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(subLinhas, m + 7, y + 15)
  y += seloH + 6

  // ---- Identificação e resumo (pares rótulo: valor; linhas sem valor são omitidas) ----
  const quadro = (titulo: string, pares: [string, string | null | undefined][]) => {
    const validos = pares.filter((p): p is [string, string] => !!p[1])
    if (!validos.length) return
    const rotW = 44
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const alturas = validos.map(([, v]) => (doc.splitTextToSize(txt(v), larg - 10 - rotW) as string[]).length * 4 + 1.6)
    const h = 12 + alturas.reduce((a, b) => a + b, 0) + 1
    garantir(h)
    card(m, y, larg, h)
    tituloSecao(titulo, m + 5, y + 8)
    let cy = y + 13
    validos.forEach(([rot, v], i) => {
      doc.setTextColor(...MUTED)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.text(rot.toUpperCase(), m + 5, cy, { charSpace: 0.3 })
      doc.setTextColor(...NAVY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(doc.splitTextToSize(txt(v), larg - 10 - rotW) as string[], m + 5 + rotW, cy)
      cy += alturas[i]
    })
    y += h + 4
  }

  const cidadeUf = [cliente.cidade, cliente.uf].filter(Boolean).join('/')
  quadro('IDENTIFICAÇÃO', [
    ['Razão social', cliente.razao_social],
    ['Nome fantasia', cliente.nome_fantasia],
    ['CNPJ', formatarDoc(cliente.cnpj)],
    ['Cidade/UF', cidadeUf || null],
  ])
  quadro('RESUMO DA CONSULTA', [
    ['Data e hora', dataHoraBr(consulta.created_at)],
    ['Validade', est.vencida ? `Vencida em ${dataBr(est.valeAte)} (validade de ${regra.validade_dias} dias)` : `Válido até ${dataBr(est.valeAte)} (${regra.validade_dias} dias)`],
    ['Fonte', FONTE_DESCRICAO],
    ['Total de protestos', textoQuantidade(r.numeroTotalProtestos)],
    ['Valor total', textoValor(r.valorTotalProtestos)],
  ])

  // ---- Tabelas (quebra de página antes do rodapé, cabeçalho repetido) ----
  type Coluna = { titulo: string; largura: number; alinhar?: 'left' | 'right' }
  type Linha = { celulas: (string | null | undefined)[]; tipo?: 'grupo' | 'item' }
  const tabela = (titulo: string, colunas: Coluna[], linhas: Linha[]) => {
    const cabecalho = (continua: boolean) => {
      doc.setTextColor(...NAVY)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(txt(continua ? `${titulo} (continuação)` : titulo), m, y + 4)
      y += 6.5
      doc.setFillColor(...HEAD_BG)
      doc.rect(m, y, larg, 7, 'F')
      doc.setFontSize(7.5)
      let x = m
      for (const c of colunas) {
        doc.text(c.titulo.toUpperCase(), c.alinhar === 'right' ? x + c.largura - 2.5 : x + 2.5, y + 4.7, { align: c.alinhar === 'right' ? 'right' : 'left', charSpace: 0.2 })
        x += c.largura
      }
      y += 7
    }
    garantir(6.5 + 7 + 7)
    cabecalho(false)
    for (const l of linhas) {
      const item = l.tipo === 'item'
      doc.setFont('helvetica', l.tipo === 'grupo' ? 'bold' : 'normal')
      doc.setFontSize(item ? 8 : 8.5)
      const partes = colunas.map((c, i) => {
        const recuo = item && i === 0 ? 6 : 0
        return doc.splitTextToSize(txt(l.celulas[i] ?? '-'), c.largura - 5 - recuo) as string[]
      })
      const h = Math.max(...partes.map((p) => p.length)) * 4 + 3
      if (y + h > RODAPE_TOPO) {
        novaPagina()
        cabecalho(true)
        doc.setFont('helvetica', l.tipo === 'grupo' ? 'bold' : 'normal')
        doc.setFontSize(item ? 8 : 8.5)
      }
      doc.setFillColor(...(item ? FIELD_BG : CARD_BG))
      doc.rect(m, y, larg, h, 'F')
      doc.setDrawColor(...FIELD_BORDER)
      doc.setLineWidth(0.2)
      doc.line(m, y + h, m + larg, y + h)
      doc.setTextColor(...(item ? MUTED : NAVY))
      let x = m
      colunas.forEach((c, i) => {
        const recuo = item && i === 0 ? 6 : 0
        doc.text(partes[i], c.alinhar === 'right' ? x + c.largura - 2.5 : x + 2.5 + recuo, y + 4.6, { align: c.alinhar === 'right' ? 'right' : 'left' })
        x += c.largura
      })
      y += h
    }
    y += 5
  }

  const estados = r.protestos ?? []
  if (est.situacao === 'com' && estados.length) {
    tabela(
      'PROTESTOS POR ESTADO',
      [
        { titulo: 'UF', largura: larg - 80 },
        { titulo: 'Quantidade', largura: 35, alinhar: 'right' },
        { titulo: 'Valor', largura: 45, alinhar: 'right' },
      ],
      estados.map((e) => ({ celulas: [e.estado ?? '-', textoQuantidade(e.numeroTotalProtestosUF), textoValor(e.valorTotalProtestosEstado)] })),
    )
    for (const e of estados) {
      const linhas: Linha[] = []
      for (const c of e.cartorios ?? []) {
        linhas.push({ tipo: 'grupo', celulas: [c.cidade ? `Cartório de ${c.cidade}` : 'Cartório', textoQuantidade(c.numeroProtestos), textoValor(c.valorTotalProtestosCartorio)] })
        for (const t of c.titulos ?? []) {
          const data = textoDataProtesto(t.dataProtesto)
          linhas.push({ tipo: 'item', celulas: [data ? `Protesto em ${data}` : 'Protesto (data não informada)', '', textoValor(t.valorProtestado)] })
        }
      }
      if (!linhas.length) continue
      tabela(
        `CARTÓRIOS · ${e.estado ?? 'UF não informada'}`,
        [
          { titulo: 'Cartório / título', largura: larg - 80 },
          { titulo: 'Quantidade', largura: 35, alinhar: 'right' },
          { titulo: 'Valor', largura: 45, alinhar: 'right' },
        ],
        linhas,
      )
    }
  }

  // ---- Observações, aviso legal e responsável ----
  const paragrafo = (rotulo: string | null, texto: string, tamanho: number, cor: [number, number, number]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tamanho)
    const linhas = doc.splitTextToSize(txt(texto), larg) as string[]
    const h = (rotulo ? 5 : 0) + linhas.length * (tamanho * 0.45) + 3
    garantir(h)
    if (rotulo) {
      doc.setTextColor(...MUTED)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.text(rotulo, m, y + 3, { charSpace: 0.4 })
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(tamanho)
    }
    doc.setTextColor(...cor)
    doc.text(linhas, m, y + 3)
    y += linhas.length * (tamanho * 0.45) + 3
  }
  if (r.observacoes) paragrafo('OBSERVAÇÕES DA FONTE', r.observacoes, 9, NAVY)
  y += 2
  paragrafo(null, AVISO_LEGAL, 7.3, MUTED)
  if (opts.consultadoPorNome) paragrafo(null, `Consulta realizada por: ${opts.consultadoPorNome}`, 8.5, NAVY)

  desenharRodape(doc, empresa, m)
  return doc.output('blob')
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
