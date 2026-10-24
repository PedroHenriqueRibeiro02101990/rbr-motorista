// NF-e do CLIENTE na operação (passo 4). A RBR não emite NF-e em operação real: a nota da mercadoria é do cliente
// (embarcador) e o CT-e/MDF-e citam essas notas. Aqui fica a parte sem I/O (testada em shared/test/nfeOperacao.test.ts):
// - chave de acesso: dígito verificador (mesma regra da função chave_nfe_valida do banco);
// - leitura de um arquivo XML: NF-e (crua ou nfeProc autorizada, pelo parseNFeXml) ou CT-e autorizado (só as chaves
//   das NF-e que ele cita);
// - linha para operacao_nfes a partir da nota lida, da digitação ou da NF da cotação;
// - conferências que só AVISAM (nunca travam): cliente, rota, soma dos valores e NF repetida em outra operação.

import { parseNFeXml, type DadosNFe } from './nfeParser'

export type OrigemNfe = 'xml' | 'digitada' | 'cotacao'

// Linha de operacao_nfes (valor = valor total da nota; peso_kg = peso bruto).
export interface NotaOperacao {
  chave_acesso: string
  numero: string | null
  serie: string | null
  emitente_cnpj: string | null
  emitente_nome: string | null
  destinatario_cnpj: string | null
  destinatario_nome: string | null
  valor: number | null
  peso_kg: number | null
  ncm: string | null
  ncms: string[] | null
  produto_predominante: string | null
  quantidade_volumes: number | null
  data_emissao: string | null
  municipio_origem: string | null
  uf_origem: string | null
  municipio_destino: string | null
  uf_destino: string | null
  origem: OrigemNfe
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

// Módulo 11, pesos 2..9 da direita para a esquerda; resto < 2 => DV 0.
export function dvChaveNfe(base43: string): number {
  let soma = 0
  let peso = 2
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export type ProblemaChave = 'tamanho' | 'modelo' | 'digito'
export function conferirChaveNfe(chave: string): { ok: true; chave: string } | { ok: false; problema: ProblemaChave; mensagem: string } {
  const c = digitos(chave)
  if (c.length !== 44) return { ok: false, problema: 'tamanho', mensagem: `A chave tem ${c.length} dígitos; precisa de 44.` }
  if (c.slice(20, 22) !== '55') return { ok: false, problema: 'modelo', mensagem: `Modelo ${c.slice(20, 22)} na chave: NF-e é modelo 55.` }
  if (dvChaveNfe(c.slice(0, 43)) !== Number(c[43])) return { ok: false, problema: 'digito', mensagem: 'Dígito verificador não confere: confira a chave digitada.' }
  return { ok: true, chave: c }
}

// Dados que a própria chave carrega (UF, ano/mês, CNPJ do emitente, série, número).
export function dadosDaChave(chave: string) {
  const c = digitos(chave)
  return {
    cnpjEmitente: c.slice(6, 20),
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
  }
}

export function notaDeDadosNFe(d: DadosNFe): NotaOperacao | null {
  const chave = digitos(d.chaveAcesso)
  if (chave.length !== 44) return null
  const ncms = Array.from(new Set(d.ncmsProdutos.map(digitos).filter(Boolean)))
  // NCM da nota: o do item de maior valor (mesma ideia do produto predominante).
  const maior = d.produtos.reduce<(typeof d.produtos)[number] | null>((m, p) => (m == null || (p.valor ?? 0) > (m.valor ?? 0) ? p : m), null)
  return {
    chave_acesso: chave,
    numero: d.numero,
    serie: d.serie,
    emitente_cnpj: digitos(d.remetente.cnpj) || null,
    emitente_nome: d.remetente.razaoSocial,
    destinatario_cnpj: digitos(d.destinatario.cnpjOuCpf) || null,
    destinatario_nome: d.destinatario.razaoSocial,
    valor: d.valorNota,
    peso_kg: d.pesoBrutoKg,
    ncm: digitos(maior?.ncm) || ncms[0] || null,
    ncms: ncms.length ? ncms : null,
    produto_predominante: d.produtoPredominante,
    quantidade_volumes: d.quantidadeVolumes,
    data_emissao: d.dataEmissao,
    municipio_origem: d.remetente.cidade,
    uf_origem: d.remetente.uf,
    municipio_destino: d.destinatario.cidade,
    uf_destino: d.destinatario.uf,
    origem: 'xml',
  }
}

// Chaves das NF-e citadas num CT-e (<infNFe><chave>), para aceitar o XML do CT-e já autorizado.
export function chavesDoCte(xmlText: string): string[] | null {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  } catch {
    return null
  }
  if (doc.getElementsByTagName('infCte').length === 0) return null
  const chaves = Array.from(doc.getElementsByTagName('infNFe'))
    .map((el) => digitos(el.getElementsByTagName('chave')[0]?.textContent))
    .filter((c) => c.length === 44)
  return Array.from(new Set(chaves))
}

export type LeituraXml =
  | { tipo: 'nfe'; nota: NotaOperacao }
  | { tipo: 'cte'; chaves: string[] }
  | { tipo: 'invalido'; motivo: string }

export function lerXmlNotaOuCte(xmlText: string): LeituraXml {
  // CT-e primeiro: ele também tem <infNFe> (dentro de infDoc) e o parser de NF-e o confundiria com uma nota.
  const chaves = chavesDoCte(xmlText)
  if (chaves) {
    if (chaves.length === 0) return { tipo: 'invalido', motivo: 'O CT-e não cita nenhuma NF-e.' }
    return { tipo: 'cte', chaves }
  }
  const nfe = parseNFeXml(xmlText)
  if (nfe) {
    const nota = notaDeDadosNFe(nfe)
    if (!nota) return { tipo: 'invalido', motivo: 'XML de NF-e sem chave de acesso de 44 dígitos.' }
    const c = conferirChaveNfe(nota.chave_acesso)
    if (!c.ok) return { tipo: 'invalido', motivo: `Chave da NF-e inválida: ${c.mensagem}` }
    return { tipo: 'nfe', nota }
  }
  return { tipo: 'invalido', motivo: 'O arquivo não é XML de NF-e nem de CT-e.' }
}

// Digitação à mão (sem XML): chave obrigatória com DV; o resto é o mínimo para CT-e, MDF-e e CIOT.
export interface NotaDigitada {
  chave: string
  numero?: string
  serie?: string
  emitenteCnpj?: string
  destinatarioCnpj?: string
  valor?: number | null
  pesoKg?: number | null
  ncm?: string
}
export function notaDigitada(n: NotaDigitada): { ok: true; nota: NotaOperacao } | { ok: false; mensagem: string } {
  const c = conferirChaveNfe(n.chave)
  if (!c.ok) return { ok: false, mensagem: c.mensagem }
  const daChave = dadosDaChave(c.chave)
  const ncm = digitos(n.ncm)
  if (ncm && ncm.length !== 8 && ncm.length !== 4) return { ok: false, mensagem: 'NCM com 8 dígitos (ou os 4 primeiros).' }
  if (n.valor != null && !(n.valor > 0)) return { ok: false, mensagem: 'Valor da nota precisa ser maior que zero.' }
  if (n.pesoKg != null && !(n.pesoKg > 0)) return { ok: false, mensagem: 'Peso precisa ser maior que zero.' }
  return {
    ok: true,
    nota: {
      chave_acesso: c.chave,
      numero: n.numero?.trim() || daChave.numero,
      serie: n.serie?.trim() || daChave.serie,
      emitente_cnpj: digitos(n.emitenteCnpj) || daChave.cnpjEmitente,
      emitente_nome: null,
      destinatario_cnpj: digitos(n.destinatarioCnpj) || null,
      destinatario_nome: null,
      valor: n.valor ?? null,
      peso_kg: n.pesoKg ?? null,
      ncm: ncm || null,
      ncms: ncm ? [ncm] : null,
      produto_predominante: null,
      quantidade_volumes: null,
      data_emissao: null,
      municipio_origem: null,
      uf_origem: null,
      municipio_destino: null,
      uf_destino: null,
      origem: 'digitada',
    },
  }
}

// "Usar a NF da cotação": copia os campos nf_* já importados na cotação (sem subir o XML de novo).
export interface NfDaCotacao {
  nf_chave_acesso: string | null
  nf_numero: string | null
  nf_serie: string | null
  nf_remetente_cnpj: string | null
  nf_remetente_razao_social: string | null
  nf_destinatario_cnpj: string | null
  nf_destinatario_razao_social: string | null
  nf_data_emissao: string | null
  nf_produto_predominante: string | null
  nf_quantidade_volumes: number | null
  valor_nf: number | null
  peso_bruto_kg: number | null
  ncms_produtos: string[] | null
  cidade_origem: string | null
  uf_origem: string | null
  cidade_destino: string | null
  uf_destino: string | null
}
export function notaDaCotacao(c: NfDaCotacao): { ok: true; nota: NotaOperacao } | { ok: false; mensagem: string } {
  if (!c.nf_chave_acesso) return { ok: false, mensagem: 'A cotação não tem NF importada.' }
  const k = conferirChaveNfe(c.nf_chave_acesso)
  if (!k.ok) return { ok: false, mensagem: `Chave da NF da cotação inválida: ${k.mensagem}` }
  const ncms = (c.ncms_produtos ?? []).map(digitos).filter(Boolean)
  return {
    ok: true,
    nota: {
      chave_acesso: k.chave,
      numero: c.nf_numero,
      serie: c.nf_serie,
      emitente_cnpj: digitos(c.nf_remetente_cnpj) || null,
      emitente_nome: c.nf_remetente_razao_social,
      destinatario_cnpj: digitos(c.nf_destinatario_cnpj) || null,
      destinatario_nome: c.nf_destinatario_razao_social,
      valor: c.valor_nf,
      peso_kg: c.peso_bruto_kg,
      ncm: ncms[0] ?? null,
      ncms: ncms.length ? ncms : null,
      produto_predominante: c.nf_produto_predominante,
      quantidade_volumes: c.nf_quantidade_volumes,
      data_emissao: c.nf_data_emissao,
      municipio_origem: c.cidade_origem,
      uf_origem: c.uf_origem,
      municipio_destino: c.cidade_destino,
      uf_destino: c.uf_destino,
      origem: 'cotacao',
    },
  }
}

export function totaisNotas(notas: Pick<NotaOperacao, 'valor' | 'peso_kg'>[]) {
  const soma = (xs: (number | null)[]) => Math.round(xs.reduce<number>((s, x) => s + (x ?? 0), 0) * 100) / 100
  return { quantidade: notas.length, valor: soma(notas.map((n) => n.valor)), pesoKg: soma(notas.map((n) => n.peso_kg)) }
}

const semAcento = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()

// Contexto da operação para conferir as notas (cliente, rota e valor da carga na cotação).
export interface ContextoConferencia {
  clienteCnpj: string | null
  cidadeOrigem: string | null
  ufOrigem: string | null
  cidadeDestino: string | null
  ufDestino: string | null
  valorCargaCotacao: number | null
  duplicadasEmOutraOperacao: string[]
}

export interface AvisoNota {
  chave: string | null // null = aviso do conjunto (ex.: soma)
  codigo: 'cliente' | 'origem' | 'destino' | 'soma' | 'duplicada' | 'sem_valor'
  mensagem: string
}

// Só avisa; nunca trava.
export function conferirNotas(notas: NotaOperacao[], ctx: ContextoConferencia): AvisoNota[] {
  const avisos: AvisoNota[] = []
  const cliente = digitos(ctx.clienteCnpj)
  for (const n of notas) {
    const ref = `NF ${n.numero ?? n.chave_acesso.slice(25, 34)}`
    if (cliente && n.emitente_cnpj && n.destinatario_cnpj && digitos(n.emitente_cnpj) !== cliente && digitos(n.destinatario_cnpj) !== cliente) {
      avisos.push({ chave: n.chave_acesso, codigo: 'cliente', mensagem: `${ref}: nem o remetente nem o destinatário é o cliente da operação.` })
    }
    if (n.municipio_origem && ctx.cidadeOrigem && (semAcento(n.municipio_origem) !== semAcento(ctx.cidadeOrigem) || semAcento(n.uf_origem) !== semAcento(ctx.ufOrigem))) {
      avisos.push({ chave: n.chave_acesso, codigo: 'origem', mensagem: `${ref}: sai de ${n.municipio_origem}/${n.uf_origem}, a rota começa em ${ctx.cidadeOrigem}/${ctx.ufOrigem}.` })
    }
    if (n.municipio_destino && ctx.cidadeDestino && (semAcento(n.municipio_destino) !== semAcento(ctx.cidadeDestino) || semAcento(n.uf_destino) !== semAcento(ctx.ufDestino))) {
      avisos.push({ chave: n.chave_acesso, codigo: 'destino', mensagem: `${ref}: vai para ${n.municipio_destino}/${n.uf_destino}, a rota termina em ${ctx.cidadeDestino}/${ctx.ufDestino}.` })
    }
    if (n.valor == null) avisos.push({ chave: n.chave_acesso, codigo: 'sem_valor', mensagem: `${ref}: sem valor total (o CIOT e a averbação usam a soma das notas).` })
    if (ctx.duplicadasEmOutraOperacao.includes(n.chave_acesso)) {
      avisos.push({ chave: n.chave_acesso, codigo: 'duplicada', mensagem: `${ref}: esta nota já está em outra operação.` })
    }
  }
  const t = totaisNotas(notas)
  if (notas.length && ctx.valorCargaCotacao != null && Math.abs(t.valor - ctx.valorCargaCotacao) > 0.01) {
    avisos.push({
      chave: null,
      codigo: 'soma',
      mensagem: `Soma das notas R$ ${t.valor.toFixed(2)} diferente do valor da carga na cotação (R$ ${ctx.valorCargaCotacao.toFixed(2)}).`,
    })
  }
  return avisos
}
