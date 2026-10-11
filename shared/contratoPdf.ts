// PDF dos contratos (Tarefas 8 e 9). O jsPDF é passado por quem chama (cada app tem o seu node_modules).
// Texto em páginas A4, número da versão no rodapé de todas as páginas, bloco de assinaturas e, opcionalmente,
// uma página final de comprovação (hash, cláusulas aceitas, IP, aparelho, versão).

type JsPDFLike = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
  setFont: (f: string, s?: string) => unknown
  setFontSize: (n: number) => unknown
  setTextColor: (r: number, g: number, b: number) => unknown
  text: (t: string | string[], x: number, y: number, o?: Record<string, unknown>) => unknown
  splitTextToSize: (t: string, w: number) => string[]
  addPage: () => unknown
  getNumberOfPages: () => number
  setPage: (n: number) => unknown
  line: (x1: number, y1: number, x2: number, y2: number) => unknown
  output: (t: 'blob') => Blob
}
export type JsPDFCtor = new (o: { unit: 'mm'; format: 'a4' }) => JsPDFLike

export type AssinaturaPdf = { papel: string; nome: string; documento?: string | null; detalhe: string }
export type ComprovacaoPdf = {
  hash: string
  versao: number
  aceito_em: string
  ip: string | null
  aparelho: string
  clausulas: { codigo: string; texto: string }[]
}

// O Helvetica padrão do jsPDF não tem alguns caracteres; troca por equivalentes simples.
const limpar = (s: string) => s.replace(/[→]/g, '->').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, ' ')

export function gerarPdfContrato(
  JsPDF: JsPDFCtor,
  o: { titulo: string; versao: number; minuta: boolean; texto: string; assinaturas?: AssinaturaPdf[]; comprovacao?: ComprovacaoPdf; geradoEm?: Date },
): Blob {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 18
  const larg = W - 2 * M
  let y = 22
  const quebra = (h: number) => {
    if (y + h > H - 18) {
      doc.addPage()
      y = 20
    }
  }

  doc.setTextColor(18, 23, 61)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  for (const l of doc.splitTextToSize(limpar(o.titulo), larg)) {
    doc.text(l, M, y)
    y += 6.5
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110, 116, 140)
  doc.text(`Versão ${o.versao}${o.minuta ? ' - MINUTA PARA REVISÃO JURÍDICA' : ''}`, M, y)
  y += 8
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(10)
  for (const par of limpar(o.texto).split('\n')) {
    const negrito = /^#{1,4}\s/.test(par)
    doc.setFont('helvetica', negrito ? 'bold' : 'normal')
    const linhas = par.trim() === '' ? [''] : doc.splitTextToSize(par.replace(/^#{1,4}\s/, '').replace(/\*\*/g, ''), larg)
    for (const l of linhas) {
      quebra(5)
      doc.text(l, M, y)
      y += 4.8
    }
  }

  if (o.assinaturas?.length) {
    y += 6
    quebra(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.text('Assinaturas eletrônicas', M, y)
    y += 6
    for (const a of o.assinaturas) {
      quebra(22)
      doc.line(M, y, M + 90, y)
      y += 5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      doc.text(limpar(`${a.papel}: ${a.nome}${a.documento ? ` - ${a.documento}` : ''}`), M, y)
      y += 4.5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      for (const l of doc.splitTextToSize(limpar(a.detalhe), larg)) {
        doc.text(l, M, y)
        y += 4
      }
      y += 4
    }
  }

  if (o.comprovacao) {
    const c = o.comprovacao
    doc.addPage()
    y = 22
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(18, 23, 61)
    doc.text('Página de comprovação do aceite eletrônico', M, y)
    y += 9
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(30, 30, 30)
    const linhas: [string, string][] = [
      ['Versão do contrato', String(c.versao)],
      ['Aceito em (UTC)', new Date(c.aceito_em).toISOString().replace('T', ' ').slice(0, 19)],
      ['Aceito em (Brasília)', new Date(c.aceito_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
      ['IP', c.ip ?? 'não informado'],
      ['Aparelho', c.aparelho],
      ['Hash SHA-256 do texto aceito', c.hash],
    ]
    for (const [k, v] of linhas) {
      quebra(10)
      doc.setFont('helvetica', 'bold')
      doc.text(limpar(k), M, y)
      y += 4.5
      doc.setFont('helvetica', 'normal')
      for (const l of doc.splitTextToSize(limpar(v), larg)) {
        doc.text(l, M, y)
        y += 4.3
      }
      y += 2
    }
    y += 3
    doc.setFont('helvetica', 'bold')
    doc.text('Cláusulas aceitas uma a uma ("Li e aceito")', M, y)
    y += 5.5
    doc.setFont('helvetica', 'normal')
    for (const cl of c.clausulas) {
      for (const l of doc.splitTextToSize(limpar(`[x] ${cl.codigo}. ${cl.texto}`), larg)) {
        quebra(5)
        doc.text(l, M, y)
        y += 4.3
      }
      y += 1.5
    }
    y += 4
    quebra(12)
    doc.setFontSize(8.5)
    doc.setTextColor(110, 116, 140)
    for (const l of doc.splitTextToSize(
      'Assinatura eletrônica simples, com trilha de evidências guardada pela RBR Cargo (registro imutável). O hash permite conferir que o texto não foi alterado depois do aceite.',
      larg,
    )) {
      doc.text(l, M, y)
      y += 4
    }
  }

  const total = doc.getNumberOfPages()
  const quando = (o.geradoEm ?? new Date()).toLocaleString('pt-BR')
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(110, 116, 140)
    doc.text(limpar(`RBR Cargo - ${o.titulo} - versão ${o.versao} - gerado em ${quando} - página ${i} de ${total}`), M, H - 8)
  }
  return doc.output('blob')
}

export async function sha256Hex(dados: Blob | string): Promise<string> {
  const buf = typeof dados === 'string' ? new TextEncoder().encode(dados) : new Uint8Array(await dados.arrayBuffer())
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
