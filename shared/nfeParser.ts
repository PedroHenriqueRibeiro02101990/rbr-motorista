// Leitor de XML de NF-e (Nota Fiscal Eletrônica) — 100% local, roda no navegador,
// não chama nenhuma API externa. O layout do XML da NF-e é um padrão público da
// SEFAZ (mesmo em todo o Brasil), então dá pra extrair os campos com certeza,
// sem inteligência artificial nem serviço de terceiro.
//
// Aceita tanto o XML "cru" (<NFe>...) quanto o XML já processado/autorizado
// (<nfeProc>...<NFe>...<protNFe>...), que é o formato mais comum quando alguém
// baixa a nota pelo portal do emitente.

export interface DadosNFe {
  chaveAcesso: string | null
  naturezaOperacao: string | null
  remetente: {
    razaoSocial: string | null
    cnpj: string | null
    cidade: string | null
    uf: string | null
  }
  destinatario: {
    razaoSocial: string | null
    cnpjOuCpf: string | null
    cidade: string | null
    uf: string | null
  }
  pesoBrutoKg: number | null
  valorNota: number | null
  ncmsProdutos: string[]
  produtos: { descricao: string; ncm: string | null }[]
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

  const icmsTot = doc.getElementsByTagName('ICMSTot')[0]
  const valorNota = icmsTot ? numberOf(icmsTot, 'vNF') : null

  // NCM de cada item da nota — usado hoje só como sinal de apoio (Eixo 2, cruzamento
  // com lista de equipamento pesado) e fica registrado pra quando existir uma lista
  // confiável de NCM de produto perigoso (Eixo 1). Não decide nada sozinho ainda.
  const prodEls = Array.from(doc.getElementsByTagName('prod'))
  const ncmsProdutos = prodEls
    .map((p) => p.getElementsByTagName('NCM')[0]?.textContent?.trim())
    .filter((v): v is string => !!v)
  const produtos = prodEls.map((p) => ({
    descricao: p.getElementsByTagName('xProd')[0]?.textContent?.trim() ?? '',
    ncm: p.getElementsByTagName('NCM')[0]?.textContent?.trim() ?? null,
  }))

  return {
    chaveAcesso,
    naturezaOperacao: textOf(infNFe, 'natOp'),
    remetente: {
      razaoSocial: emit ? textOf(emit, 'xNome') : null,
      cnpj: emit ? textOf(emit, 'CNPJ') : null,
      cidade: enderEmit ? textOf(enderEmit, 'xMun') : null,
      uf: enderEmit ? textOf(enderEmit, 'UF') : null,
    },
    destinatario: {
      razaoSocial: dest ? textOf(dest, 'xNome') : null,
      cnpjOuCpf: dest ? (textOf(dest, 'CNPJ') ?? textOf(dest, 'CPF')) : null,
      cidade: enderDest ? textOf(enderDest, 'xMun') : null,
      uf: enderDest ? textOf(enderDest, 'UF') : null,
    },
    pesoBrutoKg,
    valorNota,
    ncmsProdutos,
    produtos,
  }
}
