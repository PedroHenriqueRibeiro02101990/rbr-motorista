// Ordem de coleta (PDF do motorista): local de carregamento, contato no local, data, carga e documentos.
// O desenho fica aqui para o gestor (gera e guarda) e o app do motorista (abre a ordem da carga dele) usarem o mesmo
// layout. Cada app passa o documento do jsPDF que já tem instalado. Testes: shared/ordemColetaPdf.test.ts.

export interface OrdemColeta {
  codigo: string // ex.: "150CBC5D-v2"
  rota: string // "CAMPINAS/SP → CURITIBA/PR"
  endereco_carregamento: string
  cep_carregamento: string | null
  cidade_carregamento: string
  uf_carregamento: string
  contato_nome: string | null
  contato_telefone: string | null
  coleta_prevista_em: string | null // ISO
  carga_descricao: string | null
  peso_kg: number | null
  volumes: number | null
  documentos: { tipo: string; numero?: string | null; chave?: string | null }[]
  observacoes: string | null
  motorista?: string | null
  placa?: string | null
  gerada_em: string // ISO
  empresa?: { nome: string; telefone?: string | null } | null
}

// O mínimo do jsPDF que o desenho usa (evita depender do pacote dentro de shared/).
export interface PdfLike {
  setFont(fonte: string, estilo: string): unknown
  setFontSize(tamanho: number): unknown
  setTextColor(r: number, g: number, b: number): unknown
  setDrawColor(r: number, g: number, b: number): unknown
  line(x1: number, y1: number, x2: number, y2: number): unknown
  text(texto: string | string[], x: number, y: number, opcoes?: { align?: string }): unknown
  splitTextToSize(texto: string, largura: number): string[]
  addPage(): unknown
}

const ROTULO_DOC: Record<string, string> = { cte: 'CT-e', mdfe: 'MDF-e', nfse: 'NFS-e', nfe: 'NF-e', ciot: 'CIOT', vpo: 'Vale-pedágio', atm: 'Averbação' }
// As fontes padrão do PDF (WinAnsi) não têm seta.
const txt = (s: string) => s.replace(/→/g, '->')

export function dataHora(iso: string | null): string {
  if (!iso) return 'a combinar'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'a combinar'
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Seções da ordem (texto puro, também usado nos testes).
export function secoesOrdemColeta(o: OrdemColeta): { titulo: string; linhas: [string, string][] }[] {
  const cep = o.cep_carregamento ? ` · CEP ${o.cep_carregamento.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''
  const carga = [
    o.carga_descricao,
    o.peso_kg != null ? `${o.peso_kg.toLocaleString('pt-BR')} kg` : null,
    o.volumes != null ? `${o.volumes} volume(s)` : null,
  ].filter(Boolean)
  return [
    {
      titulo: 'Local de carregamento',
      linhas: [
        ['Endereço', o.endereco_carregamento],
        ['Cidade', `${o.cidade_carregamento}/${o.uf_carregamento}${cep}`],
      ],
    },
    { titulo: 'Contato no local', linhas: [['Nome', o.contato_nome || 'a confirmar com a RBR'], ['Telefone', o.contato_telefone || '—']] },
    { titulo: 'Data da coleta', linhas: [['Prevista para', dataHora(o.coleta_prevista_em)]] },
    { titulo: 'Carga', linhas: [['Descrição', carga.length ? carga.join(' · ') : '—']] },
    {
      titulo: 'Documentos da viagem',
      linhas: o.documentos.length
        ? o.documentos.map((d) => [ROTULO_DOC[d.tipo] ?? d.tipo, [d.numero ? `nº ${d.numero}` : null, d.chave].filter(Boolean).join(' · ') || 'emitido'] as [string, string])
        : [['—', 'A RBR envia os documentos antes da saída.']],
    },
    ...(o.motorista || o.placa ? [{ titulo: 'Motorista e veículo', linhas: [['Motorista', o.motorista || '—'], ['Placa', o.placa || '—']] as [string, string][] }] : []),
    ...(o.observacoes ? [{ titulo: 'Observações', linhas: [['', o.observacoes]] as [string, string][] }] : []),
  ]
}

export function desenharOrdemColeta(doc: PdfLike, o: OrdemColeta): void {
  const margem = 14
  const largura = 210 - margem * 2
  const colCampo = 42
  let y = margem
  const quebra = (altura: number) => {
    if (y + altura > 297 - margem) {
      doc.addPage()
      y = margem
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(18, 23, 61)
  doc.text('Ordem de coleta', margem, y + 6)
  doc.setFontSize(10)
  doc.text(txt(`nº ${o.codigo}`), margem + largura, y + 6, { align: 'right' })
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(txt(o.rota), margem, y)
  y += 5
  doc.setFontSize(8.5)
  doc.setTextColor(110, 116, 140)
  doc.text(`Gerada em ${dataHora(o.gerada_em)}${o.empresa?.nome ? ` · ${o.empresa.nome}` : ''}`, margem, y)
  y += 4
  doc.setDrawColor(210, 214, 226)
  doc.line(margem, y, margem + largura, y)
  y += 6

  for (const s of secoesOrdemColeta(o)) {
    quebra(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(138, 99, 37)
    doc.text(s.titulo.toUpperCase(), margem, y)
    y += 5
    for (const [campo, valor] of s.linhas) {
      const linhas = doc.splitTextToSize(txt(valor), campo ? largura - colCampo : largura)
      quebra(linhas.length * 5 + 1)
      doc.setFontSize(10.5)
      if (campo) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(110, 116, 140)
        doc.text(txt(campo), margem, y)
      }
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(22, 26, 51)
      doc.text(linhas, campo ? margem + colCampo : margem, y)
      y += linhas.length * 5 + 1
    }
    y += 3
  }

  quebra(16)
  doc.setDrawColor(210, 214, 226)
  doc.line(margem, y, margem + largura, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(110, 116, 140)
  doc.text(
    doc.splitTextToSize(
      `Apresente esta ordem no local de carregamento. Dúvidas ou atraso: avise a RBR${o.empresa?.telefone ? ` pelo ${o.empresa.telefone}` : ''} antes de sair.`,
      largura,
    ),
    margem,
    y,
  )
}
