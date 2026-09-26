// Leitor de XML de NF-e (Nota Fiscal Eletrônica) — 100% local, roda no navegador,
// não chama nenhuma API externa. O layout do XML da NF-e é um padrão público da
// SEFAZ (mesmo em todo o Brasil), então dá pra extrair os campos com certeza,
// sem inteligência artificial nem serviço de terceiro.
//
// Aceita tanto o XML "cru" (<NFe>...) quanto o XML já processado/autorizado
// (<nfeProc>...<NFe>...<protNFe>...), que é o formato mais comum quando alguém
// baixa a nota pelo portal do emitente.

export interface EnderecoNFe {
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  codigo_ibge: string | null
  uf: string | null
  cep: string | null
}

export interface DadosNFe {
  chaveAcesso: string | null
  naturezaOperacao: string | null
  numero: string | null
  serie: string | null
  dataEmissao: string | null // AAAA-MM-DD
  remetente: {
    razaoSocial: string | null
    cnpj: string | null
    ie: string | null
    cidade: string | null
    uf: string | null
    endereco: EnderecoNFe | null
  }
  destinatario: {
    razaoSocial: string | null
    cnpjOuCpf: string | null
    ie: string | null
    cidade: string | null
    uf: string | null
    endereco: EnderecoNFe | null
  }
  pesoBrutoKg: number | null
  quantidadeVolumes: number | null
  valorNota: number | null
  produtoPredominante: string | null
  ncmsProdutos: string[]
  produtos: { descricao: string; ncm: string | null; valor: number | null }[]
}

function lerEndereco(el: Element | undefined): EnderecoNFe | null {
  if (!el) return null
  return {
    logradouro: textOf(el, 'xLgr'),
    numero: textOf(el, 'nro'),
    complemento: textOf(el, 'xCpl'),
    bairro: textOf(el, 'xBairro'),
    municipio: textOf(el, 'xMun'),
    codigo_ibge: textOf(el, 'cMun'),
    uf: textOf(el, 'UF'),
    cep: textOf(el, 'CEP'),
  }
}

function textOf(root: Element | Document, tag: string): string | null {
  const el = root.getElementsByTagName(tag)[0]
  const t = el?.textContent?.trim()
  return t && t !== '' ? t : null
}

function numberOf(root: Element | Document, tag: string): number | null {
  const t = textOf(root, tag)
  if (t === null) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Recebe o texto do arquivo XML e devolve os campos relevantes pra pré-preencher
 * uma cotação. Devolve `null` se o arquivo não parecer um XML de NF-e válido
 * (ex: usuário subiu o arquivo errado) — quem chama decide como avisar o usuário.
 */
export function parseNFeXml(xmlText: string): DadosNFe | null {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  } catch {
    return null
  }

  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const infNFe = doc.getElementsByTagName('infNFe')[0]
  if (!infNFe) return null

  // Chave de acesso: normalmente vem no atributo Id="NFe<44 dígitos>" do
  // próprio infNFe, ou no chNFe dentro de protNFe quando é XML processado.
  const idAttr = infNFe.getAttribute('Id') ?? infNFe.getAttribute('id')
  const chaveDoId = idAttr?.replace(/^NFe/i, '').trim() ?? null
  const chaveDoProt = textOf(doc, 'chNFe')
  const chaveAcesso = chaveDoId || chaveDoProt || null

  const emit = doc.getElementsByTagName('emit')[0]
  const enderEmit = emit?.getElementsByTagName('enderEmit')[0]
  const dest = doc.getElementsByTagName('dest')[0]
  const enderDest = dest?.getElementsByTagName('enderDest')[0]

  // Peso bruto: a NF pode ter mais de um <vol> (volume) — soma todos os pesoB
  // informados (a grande maioria das notas de frete tem só um).
  const volumes = Array.from(doc.getElementsByTagName('vol'))
  const pesos = volumes
    .map((v) => v.getElementsByTagName('pesoB')[0]?.textContent?.trim())
    .filter((v): v is string => !!v)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const pesoBrutoKg = pesos.length > 0 ? pesos.reduce((a, b) => a + b, 0) : null
  const qtdVols = volumes
    .map((v) => Number(v.getElementsByTagName('qVol')[0]?.textContent?.trim()))
    .filter((n) => Number.isFinite(n))
  const quantidadeVolumes = qtdVols.length > 0 ? qtdVols.reduce((a, b) => a + b, 0) : null

  const icmsTot = doc.getElementsByTagName('ICMSTot')[0]
  const valorNota = icmsTot ? numberOf(icmsTot, 'vNF') : null

  // NCM de cada item da nota — usado hoje só como sinal de apoio (Eixo 2, cruzamento
  // com lista de equipamento pesado) e fica registrado pra quando existir uma lista
  // confiável de NCM de produto perigoso (Eixo 1). Não decide nada sozinho ainda.
  const prodEls = Array.from(doc.getElementsByTagName('prod'))
  const ncmsProdutos = prodEls
    .map((p) => p.getElementsByTagName('NCM')[0]?.textContent?.trim())
    .filter((v): v is string => !!v)
  const produtos = prodEls.map((p) => {
    const v = Number(p.getElementsByTagName('vProd')[0]?.textContent?.trim())
    return {
      descricao: p.getElementsByTagName('xProd')[0]?.textContent?.trim() ?? '',
      ncm: p.getElementsByTagName('NCM')[0]?.textContent?.trim() ?? null,
      valor: Number.isFinite(v) ? v : null,
    }
  })
  // Produto predominante (campo do CT-e/MDF-e): o item de maior valor na nota.
  const predominante = produtos.reduce<(typeof produtos)[number] | null>(
    (maior, p) => (maior == null || (p.valor ?? 0) > (maior.valor ?? 0) ? p : maior),
    null,
  )
  const ide = doc.getElementsByTagName('ide')[0]
  const dhEmi = ide ? (textOf(ide, 'dhEmi') ?? textOf(ide, 'dEmi')) : null

  return {
    chaveAcesso,
    naturezaOperacao: textOf(infNFe, 'natOp'),
    numero: ide ? textOf(ide, 'nNF') : null,
    serie: ide ? textOf(ide, 'serie') : null,
    dataEmissao: dhEmi ? dhEmi.slice(0, 10) : null,
    remetente: {
      razaoSocial: emit ? textOf(emit, 'xNome') : null,
      cnpj: emit ? (textOf(emit, 'CNPJ') ?? textOf(emit, 'CPF')) : null,
      ie: emit ? textOf(emit, 'IE') : null,
      cidade: enderEmit ? textOf(enderEmit, 'xMun') : null,
      uf: enderEmit ? textOf(enderEmit, 'UF') : null,
      endereco: lerEndereco(enderEmit),
    },
    destinatario: {
      razaoSocial: dest ? textOf(dest, 'xNome') : null,
      cnpjOuCpf: dest ? (textOf(dest, 'CNPJ') ?? textOf(dest, 'CPF')) : null,
      ie: dest ? textOf(dest, 'IE') : null,
      cidade: enderDest ? textOf(enderDest, 'xMun') : null,
      uf: enderDest ? textOf(enderDest, 'UF') : null,
      endereco: lerEndereco(enderDest),
    },
    pesoBrutoKg,
    quantidadeVolumes,
    valorNota,
    produtoPredominante: predominante?.descricao || null,
    ncmsProdutos,
    produtos,
  }
}
