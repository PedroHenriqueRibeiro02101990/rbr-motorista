import { supabase } from '@rbr/shared/supabaseClient'
import type { Database, Json } from '@rbr/shared/database.types'

type T = Database['public']['Tables']
type V = Database['public']['Views']

export type Lancamento = V['v_lancamentos']['Row']
export type Conta = V['v_saldos_contas']['Row']
export type Fatura = V['v_faturas']['Row']
export type ResultadoOperacao = V['v_resultado_operacoes']['Row']
export type Categoria = T['categorias_financeiras']['Row']
export type CondicaoPrazo = T['condicoes_prazo']['Row']
export type Documento = T['documentos_financeiros']['Row']
export type Recorrencia = T['recorrencias_financeiras']['Row']
export type Extrato = T['extratos_bancarios']['Row']
export type ExtratoItem = T['extrato_itens']['Row']
export type RegraCategorizacao = T['regras_categorizacao']['Row']
export type Baixa = T['baixas_financeiras']['Row']
export type Fornecedor = T['fornecedores']['Row']
export type Cliente = T['clientes']['Row']

export type TipoLanc = 'receber' | 'pagar'
export type Forma = 'pix' | 'boleto' | 'transferencia' | 'dinheiro' | 'cartao' | 'debito_automatico' | 'outro'

export const FORMA_LABEL: Record<string, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  transferencia: 'TED/transferência',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  debito_automatico: 'Débito automático',
  outro: 'Outro',
}

export const SITUACAO: Record<string, { label: string; bg: string; fg: string }> = {
  vencido: { label: 'Vencido', bg: '#FBE9E9', fg: '#B42318' },
  vence_hoje: { label: 'Vence hoje', bg: '#FDF1DC', fg: '#8A5A00' },
  a_vencer: { label: 'A vencer', bg: '#EAEDF6', fg: '#1E2761' },
  parcial: { label: 'Parcial', bg: '#FDF1DC', fg: '#8A5A00' },
  previsto: { label: 'Previsto', bg: '#F1F2F6', fg: '#6B7280' },
  pago: { label: 'Pago', bg: '#E7F5EC', fg: '#15803D' },
  cancelado: { label: 'Cancelado', bg: '#F1F2F6', fg: '#9CA3AF' },
  aguardando_pagamento: { label: 'Aguardando', bg: '#EAEDF6', fg: '#1E2761' },
  cancelada: { label: 'Cancelada', bg: '#F1F2F6', fg: '#9CA3AF' },
}

export const GRUPO_LABEL: Record<string, string> = {
  receita_operacional: 'Receita operacional',
  outras_receitas: 'Outras receitas',
  receita_financeira: 'Receitas financeiras',
  deducoes: 'Impostos sobre o faturamento',
  custo_operacional: 'Custos das operações',
  despesa_administrativa: 'Despesas administrativas',
  despesa_comercial: 'Despesas comerciais',
  despesa_pessoal: 'Pessoal',
  despesa_financeira: 'Despesas financeiras',
  investimento: 'Investimentos',
  retirada_socios: 'Retirada dos sócios',
  emprestimo: 'Empréstimos e aportes',
}

export const BASE_LABEL: Record<string, string> = {
  aprovacao: 'aprovação da cotação',
  liberacao: 'liberação da carga',
  coleta: 'coleta',
  entrega: 'entrega',
  emissao: 'emissão do documento',
}

export const TIPO_DOC_LABEL: Record<string, string> = {
  nfe: 'NF-e',
  nfse: 'NFS-e',
  cte: 'CT-e',
  boleto: 'Boleto',
  fatura: 'Fatura',
  recibo: 'Recibo',
  comprovante: 'Comprovante',
  extrato: 'Extrato',
  contrato: 'Contrato',
  guia_imposto: 'Guia de imposto',
  outro: 'Documento',
}

export const ACAO_DOC_LABEL: Record<string, string> = {
  criar_lancamento: 'Criar conta a pagar',
  criar_lancamento_pago: 'Lançar como já pago',
  vincular_lancamento: 'Vincular a um lançamento previsto',
  baixar_lancamento: 'Dar baixa com este comprovante',
  nota_emitida: 'Nota emitida pela RBR — vincular ao recebível',
  importar_extrato: 'É um extrato — importar na Conciliação',
}

// ---------------------------------------------------------------- datas e números
export const hojeISO = () => new Date().toLocaleDateString('sv-SE')

export function addDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function diffDias(a: string, b: string): number {
  const [a1, m1, d1] = a.split('-').map(Number)
  const [a2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(a1, m1 - 1, d1) - Date.UTC(a2, m2 - 1, d2)) / 86400000)
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  const [a, m, d] = s.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

export function fmtMes(iso: string): string {
  const [a, m] = iso.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${a.slice(2)}`
}

export function brl(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'R$ —'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function brlCurto(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${v < 0 ? '-' : ''}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 10_000) return `${v < 0 ? '-' : ''}R$ ${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return brl(v)
}

export function parseValor(v: string): number {
  const t = (v ?? '').trim().replace(/^R\$\s*/i, '')
  if (!t) return NaN
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  return Number(normal)
}

export const valorParaInput = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export function erroMsg(e: unknown): string {
  if (!e) return 'Erro desconhecido.'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message
  return m ?? String(e)
}

// ---------------------------------------------------------------- regras de prazo
export interface ParcelaRegra {
  dias: number
  percentual: number
  base?: string
}
export interface RegraPrazo {
  base: string
  modo: 'dias' | 'fechamento_mensal'
  dia_fixo?: number | null
  parcelas: ParcelaRegra[]
  ajustar_dia_util?: boolean
  forma_padrao?: string | null
}

export function regraDeCondicao(c: CondicaoPrazo): RegraPrazo {
  return {
    base: c.base,
    modo: c.modo as RegraPrazo['modo'],
    dia_fixo: c.dia_fixo,
    parcelas: (Array.isArray(c.parcelas) ? c.parcelas : []) as unknown as ParcelaRegra[],
    ajustar_dia_util: c.ajustar_dia_util,
    forma_padrao: c.forma_padrao,
  }
}

export function descreverRegra(r: RegraPrazo | null | undefined): string {
  if (!r || !r.parcelas?.length) return '—'
  if (r.modo === 'fechamento_mensal') {
    const partes = r.parcelas.map((p) => {
      const meses = p.dias ?? 1
      return `${r.parcelas.length > 1 ? `${p.percentual}% ` : ''}dia ${r.dia_fixo ?? 10} do ${meses === 1 ? 'mês seguinte' : `${meses}º mês seguinte`}`
    })
    return `Fechamento mensal (${BASE_LABEL[r.base] ?? r.base}): ${partes.join(' + ')}`
  }
  const partes = r.parcelas.map((p) => {
    const base = BASE_LABEL[p.base ?? r.base] ?? p.base ?? r.base
    const quando = p.dias === 0 ? `na ${base}` : `${p.dias} dias após a ${base}`
    return r.parcelas.length > 1 ? `${p.percentual}% ${quando}` : quando
  })
  return partes.join(' + ')
}

function ajustaUtil(iso: string, feriados: Set<string>): string {
  let d = iso
  for (let i = 0; i < 15; i++) {
    const [a, m, dd] = d.split('-').map(Number)
    const dow = new Date(Date.UTC(a, m - 1, dd)).getUTCDay()
    if (dow !== 0 && dow !== 6 && !feriados.has(d)) break
    d = addDias(d, 1)
  }
  return d
}

// Espelho do calcular_vencimentos do banco, pra pré-visualizar na tela.
export function previewVencimentos(
  r: RegraPrazo,
  datasBase: Record<string, string>,
  total: number,
  feriados: Set<string> = new Set(),
): { parcela: number; vencimento: string; valor: number; base: string }[] {
  const n = r.parcelas.length
  let acum = 0
  return r.parcelas.map((p, i) => {
    const baseNome = p.base ?? r.base
    const bd = datasBase[baseNome] ?? datasBase.entrega ?? hojeISO()
    let venc: string
    if (r.modo === 'fechamento_mensal') {
      const [a, m] = bd.split('-').map(Number)
      const alvo = new Date(Date.UTC(a, m - 1 + (p.dias ?? 1), 1))
      const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
      alvo.setUTCDate(Math.min(r.dia_fixo ?? 10, ultimo))
      venc = alvo.toISOString().slice(0, 10)
    } else {
      venc = addDias(bd, p.dias || 0)
    }
    if (r.ajustar_dia_util !== false) venc = ajustaUtil(venc, feriados)
    const valor = i === n - 1 ? Math.round((total - acum) * 100) / 100 : Math.round(total * p.percentual) / 100
    acum += valor
    return { parcela: i + 1, vencimento: venc, valor, base: baseNome }
  })
}

// ---------------------------------------------------------------- IA (Edge Function)
export async function invocarIA<R = Record<string, unknown>>(acao: string, corpo: Record<string, unknown> = {}): Promise<R> {
  const { data, error } = await supabase.functions.invoke('financeiro-ia', { body: { acao, ...corpo } })
  if (error || (data as { sucesso?: boolean })?.sucesso === false) {
    const d = data as { erro?: string } | null
    if (d?.erro) throw new Error(d.erro)
    const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
    if (ctx?.json) {
      try {
        const corpoErro = (await ctx.json()) as { erro?: string } | null
        if (corpoErro?.erro) throw new Error(corpoErro.erro)
      } catch (e) {
        if (e instanceof Error && e.message) throw e
      }
    }
    throw new Error((error as { message?: string } | null)?.message ?? 'A IA não respondeu.')
  }
  return data as R
}

// Sobe o arquivo e cria o documento; a leitura pela IA é chamada em seguida por quem chamou.
export async function enviarDocumento(file: File, extra: Partial<Documento> = {}): Promise<Documento> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: arquivo maior que 20 MB.`)
  const agora = new Date()
  const nomeSeguro = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${nomeSeguro}`
  const up = await supabase.storage.from('financeiro-documentos').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (up.error) throw new Error(`${file.name}: ${up.error.message}`)
  const { data, error } = await supabase
    .from('documentos_financeiros')
    .insert({ arquivo_path: path, arquivo_nome: file.name, arquivo_mime: file.type || null, ...extra })
    .select()
    .single()
  if (error) throw new Error(`${file.name}: ${error.message}`)
  return data
}

export async function abrirArquivo(path: string) {
  const { data, error } = await supabase.storage.from('financeiro-documentos').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Não consegui abrir o arquivo.')
  window.open(data.signedUrl, '_blank', 'noopener')
}

// ---------------------------------------------------------------- extratos (OFX / CSV)
export interface ItemExtrato {
  data: string
  descricao: string
  valor: number
  documento_ref?: string | null
}

export function parseOFX(texto: string): { itens: ItemExtrato[]; saldoFinal: number | null } {
  const itens: ItemExtrato[] = []
  const blocos = texto.split(/<STMTTRN>/i).slice(1)
  const tag = (b: string, t: string) => {
    const m = b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'))
    return m ? m[1].trim() : ''
  }
  for (const b of blocos) {
    const dt = tag(b, 'DTPOSTED')
    const valor = Number(tag(b, 'TRNAMT').replace(',', '.'))
    if (!dt || !Number.isFinite(valor) || valor === 0) continue
    const data = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`
    const descricao = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' — ') || tag(b, 'TRNTYPE') || '(sem descrição)'
    itens.push({ data, descricao, valor, documento_ref: tag(b, 'FITID') || tag(b, 'CHECKNUM') || null })
  }
  const bal = texto.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i)
  const saldoFinal = bal ? Number(bal[1].trim().replace(',', '.')) : null
  return { itens, saldoFinal: Number.isFinite(saldoFinal as number) ? saldoFinal : null }
}

function dataBR(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function splitCSV(linha: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let aspas = false
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas
    else if (ch === sep && !aspas) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

// CSV de banco: reconhece colunas de data, descrição/histórico, valor (ou crédito/débito separados).
export function parseCSV(texto: string): { itens: ItemExtrato[]; erro?: string } {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length < 2) return { itens: [], erro: 'Arquivo vazio.' }
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ','
  let iCab = linhas.findIndex((l) => /data/i.test(l) && /(valor|cr[eé]dito|d[eé]bito)/i.test(l))
  if (iCab < 0) iCab = 0
  const cab = splitCSV(linhas[iCab], sep).map((c) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const idx = (re: RegExp) => cab.findIndex((c) => re.test(c))
  const cData = idx(/^data|data lanc|dt/)
  const idxExceto = (re: RegExp, fora: number[]) => cab.findIndex((c, i) => !fora.includes(i) && re.test(c))
  let cDesc = idxExceto(/descri|historico|memo|detalhe/, [cData])
  if (cDesc < 0) cDesc = idxExceto(/lancamento/, [cData])
  const cValor = idx(/^valor|valor \(r\$\)|montante|quantia/)
  const cCred = idx(/credito|entrada/)
  const cDeb = idx(/debito|saida/)
  const cDoc = idx(/documento|doc\.|n[ºo°] doc|identificador/)
  if (cData < 0 || (cValor < 0 && cCred < 0 && cDeb < 0)) {
    return { itens: [], erro: 'Não achei as colunas de data e valor. O CSV precisa ter cabeçalho com "Data" e "Valor" (ou "Crédito"/"Débito").' }
  }
  const itens: ItemExtrato[] = []
  for (const l of linhas.slice(iCab + 1)) {
    const c = splitCSV(l, sep)
    const data = dataBR(c[cData] ?? '')
    if (!data) continue
    let valor = NaN
    if (cValor >= 0) {
      const bruto = (c[cValor] ?? '').replace(/\s/g, '')
      const debito = /d$/i.test(bruto)
      valor = parseValor(bruto.replace(/[cd]$/i, ''))
      if (debito) valor = -Math.abs(valor)
    } else {
      const cr = parseValor(c[cCred] ?? '')
      const db = parseValor(c[cDeb] ?? '')
      valor = (Number.isFinite(cr) ? Math.abs(cr) : 0) - (Number.isFinite(db) ? Math.abs(db) : 0)
    }
    if (!Number.isFinite(valor) || valor === 0) continue
    const descricao = (cDesc >= 0 ? c[cDesc] : c.filter((_, i) => i !== cData && i !== cValor).join(' ')) || '(sem descrição)'
    if (/^saldo/i.test(descricao.trim())) continue
    itens.push({ data, descricao: descricao.replace(/^"|"$/g, ''), valor: Math.round(valor * 100) / 100, documento_ref: cDoc >= 0 ? c[cDoc] || null : null })
  }
  return { itens }
}

// ---------------------------------------------------------------- cadastros de apoio (cache simples)
export interface Apoio {
  categorias: Categoria[]
  contas: Conta[]
  condicoes: CondicaoPrazo[]
  fornecedores: Pick<Fornecedor, 'id' | 'nome' | 'razao_social' | 'cnpj' | 'cpf' | 'pix' | 'categoria_id' | 'condicao_prazo_id' | 'status'>[]
  clientes: Pick<Cliente, 'id' | 'razao_social' | 'nome_fantasia' | 'cnpj' | 'cpf' | 'celular_whatsapp' | 'email' | 'status'>[]
  feriados: Set<string>
}

export async function carregarApoio(): Promise<Apoio> {
  const [cat, con, cond, forn, cli, fer] = await Promise.all([
    supabase.from('categorias_financeiras').select('*').order('ordem'),
    supabase.from('v_saldos_contas').select('*').order('padrao', { ascending: false }).order('nome'),
    supabase.from('condicoes_prazo').select('*').order('nome'),
    supabase.from('fornecedores').select('id, nome, razao_social, cnpj, cpf, pix, categoria_id, condicao_prazo_id, status').order('nome').limit(1000),
    supabase.from('clientes').select('id, razao_social, nome_fantasia, cnpj, cpf, celular_whatsapp, email, status').is('deleted_at', null).order('razao_social').limit(1000),
    supabase.from('feriados').select('data'),
  ])
  const erro = cat.error ?? con.error ?? cond.error ?? forn.error ?? cli.error
  if (erro) throw new Error(erro.message)
  return {
    categorias: cat.data ?? [],
    contas: con.data ?? [],
    condicoes: cond.data ?? [],
    fornecedores: forn.data ?? [],
    clientes: cli.data ?? [],
    feriados: new Set((fer.data ?? []).map((f) => f.data)),
  }
}

export const nomeCliente = (c: { nome_fantasia?: string | null; razao_social?: string | null } | null | undefined) =>
  c?.nome_fantasia || c?.razao_social || '—'
export const nomeFornecedor = (f: { nome?: string | null; razao_social?: string | null } | null | undefined) => f?.nome || f?.razao_social || '—'

export async function lerParametro<Tipo = Json>(chave: string): Promise<Tipo | null> {
  const { data } = await supabase.from('parametros_sistema').select('valor').eq('chave', chave).maybeSingle()
  return (data?.valor as Tipo) ?? null
}

export async function salvarParametro(chave: string, valor: Json) {
  const { error } = await supabase.from('parametros_sistema').update({ valor, updated_at: new Date().toISOString() }).eq('chave', chave)
  if (error) throw new Error(error.message)
}

export function whatsappLink(numero: string | null | undefined, texto: string): string {
  let d = digitos(numero)
  if (d && d.length <= 11) d = `55${d}`
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}
