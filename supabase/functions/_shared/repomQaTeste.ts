// Regras da função temporária repom-qa-teste (sem Deno, sem rede; testes em repomQaTeste.test.ts).
// Só QA, só o contrato 2166947 (RBRC4943103), ações FIXAS (token, consultar_contrato, sequencia), UMA tentativa por ação de dinheiro,
// para no primeiro problema. Só funciona com o segredo REPOM_QA_TESTE_LIBERADO=sim. A resposta nunca leva credencial nem corpo bruto.
import type { ClienteRepomFrete, ResultadoFrete } from './repomFreteClient.ts'

export const BASE_QA_FIXA = 'https://qa.repom.com.br/Repom.Frete.Webapi'
export const TOKEN_QA_FIXO = `${BASE_QA_FIXA}/Token`
export const CONTRATO_QA = { shippingId: 2166947, identifier: 'RBRC4943103', status: 'InTransit' } as const
/** Recusas já registradas na rota /PaymentAuthorization antes da rodada fixa: 760 data, 760 filial, 728 Branch obrigatório. */
export const TENTATIVAS_ANTERIORES_AUTORIZAR = 3
/** RODADA FIXA (exceção à regra de uma tentativa por ação, autorizada pelo Pedro em 24/11/2026): no máximo 4 tentativas, nesta ordem, PaymentDate sempre do dia seguinte. */
export const LIMITE_RODADA = 4
export const MOTIVO_RODADA = 'Rodada fixa autorizada pelo Pedro em 24/11/2026: ate 4 tentativas de POST /PaymentAuthorization (Branch obrigatorio, 728), valores de Branch/BranchCode nao confirmados pela Karen; para no 1o sucesso, no 2768 ou em erro de tipo novo'
export interface Combo { branch: number; branchCode?: string; origem: string }
/** Lista fechada, sem entrada livre. Se a leitura prévia achar valores já registrados na Repom, eles entram primeiro e a última combinação sai (limite 4). */
export const COMBOS_FIXOS: Combo[] = [
  { branch: 1, branchCode: '1', origem: 'palpite: Branch 1, BranchCode "1"' },
  { branch: 1, origem: 'Branch 1, sem BranchCode' },
  { branch: 1, branchCode: '69115969000104', origem: 'Branch 1, BranchCode = CNPJ da filial do QA' },
  { branch: 2, branchCode: '1', origem: 'Branch 2, BranchCode "1"' },
]
export function montarCombos(achados: Combo[]): Combo[] {
  const vistos = new Set<string>()
  const lista: Combo[] = []
  for (const c of [...achados, ...COMBOS_FIXOS]) {
    const k = `${c.branch}|${c.branchCode ?? ''}`
    if (!vistos.has(k)) { vistos.add(k); lista.push(c) }
  }
  return lista.slice(0, LIMITE_RODADA)
}
export const ACOES_QA = ['token', 'consultar_contrato', 'sequencia', 'ler_autorizacao', 'rodada_autorizar', 'saldo'] as const
/** Janela fixa da consulta de saldo/extrato (só leitura). */
export const SALDO_INICIO = '2026-11-01'

export const chaveLigada = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase() === 'sim'

export interface DepsQaTeste {
  ligado: boolean
  ambiente: 'qa' | 'prd'
  frete: ClienteRepomFrete
  /** status das linhas anteriores de repom_requisicoes para esta ação ('quitar' | 'autorizar') */
  historico(acao: 'quitar' | 'autorizar' | 'autorizar-rodada'): Promise<string[]>
  registrar(acao: string, request: unknown): Promise<string | null>
  concluir(id: string | null, r: { status: 'ok' | 'erro'; http: number; resposta: unknown; erro: string | null }): Promise<void>
  hoje(): string // AAAA-MM-DD de hoje (fim da janela do saldo)
  amanha(): string // AAAA-MM-DD do dia seguinte (a Repom recusa PaymentDate de hoje: "deve ser maior ou igual a data atual")
}

export interface SaidaQa { status: number; corpo: Record<string, unknown> }
interface Etapa { etapa: string; ok: boolean; http: number; erro?: string; codigoErro?: string | null; detalhe?: Record<string, unknown> }

const curto = (v: unknown) => String(v ?? '').slice(0, 300)

// ---------- leitura tolerante da resposta do contrato (o formato exato não consta no guia) ----------
type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const primeiro = (o: Obj, chaves: string[]): unknown => {
  for (const k of chaves) {
    const f = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())
    if (f && o[f] != null && o[f] !== '') return o[f]
  }
  return undefined
}
const raiz = (dados: unknown): Obj | null => (Array.isArray(dados) ? (ehObj(dados[0]) ? dados[0] : null) : ehObj(dados) ? dados : null)

export interface ContratoLido { status: string | null; identifier: string | null; branchCode: string | null; documentos: { numero: string; serie: string; branchCode: string; tipo: string }[] }
export function lerContratoQa(dados: unknown): ContratoLido | null {
  const o = raiz(dados)
  if (!o) return null
  const s = primeiro(o, ['Status', 'ShippingStatus', 'StatusDescription', 'ShippingStatusDescription'])
  const status = typeof s === 'string' ? s : ehObj(s) ? String(primeiro(s, ['Name', 'Description', 'Status']) ?? '') || null : null
  const identifier = (primeiro(o, ['Identifier']) as string | undefined) ?? null
  const bc = primeiro(o, ['BranchCode'])
  const branchCode = bc != null ? String(bc) : null
  let docs: unknown[] = []
  const achar = (x: unknown, n: number) => {
    if (n > 3 || !ehObj(x)) return
    for (const [k, v] of Object.entries(x)) {
      if (/^documents?$/i.test(k) && Array.isArray(v)) docs = docs.concat(v)
      else achar(v, n + 1)
    }
  }
  achar(o, 0)
  const documentos = docs.filter(ehObj).map((d) => ({
    numero: String(primeiro(d, ['Number', 'DocumentNumber']) ?? ''),
    serie: String(primeiro(d, ['Series', 'DocumentSeries']) ?? ''),
    branchCode: String(primeiro(d, ['BranchCode']) ?? branchCode ?? ''),
    tipo: String(primeiro(d, ['DocumentType', 'Type']) ?? ''),
  })).filter((d) => d.numero && d.tipo)
  return { status, identifier, branchCode, documentos }
}

function etapaDe(nome: string, r: ResultadoFrete<unknown>, detalhe?: Record<string, unknown>): Etapa {
  return r.ok
    ? { etapa: nome, ok: true, http: r.http, detalhe }
    : { etapa: nome, ok: false, http: r.http, erro: curto(r.erro), codigoErro: r.codigoErro ?? null, detalhe: r.incerto ? { ...detalhe, incerto: true } : detalhe }
}
const ehSaldo2768 = (e: Etapa) => e.codigoErro === '2768' || /\b2768\b/.test(e.erro ?? '')
const pendenciaKaren = { codigo: 2768, dono: 'Karen', nota: 'ControleSaldo não configurado; não tentar de novo.' }

/** 'filial' = 760 de filial; 'branch' = 728; 'saldo2768'; 'novo' = qualquer outra coisa (a rodada PARA). */
export function tipoErroAutorizacao(e: { codigoErro?: string | null; erro?: string }): 'saldo2768' | 'filial' | 'branch' | 'novo' {
  const m = e.erro ?? ''
  if (e.codigoErro === '2768' || /\b2768\b/.test(m)) return 'saldo2768'
  if (e.codigoErro === '760' && /filial/i.test(m)) return 'filial'
  if (e.codigoErro === '728' || /branch.*(empty|vazio)/i.test(m)) return 'branch'
  return 'novo'
}
export interface AutorizacaoLida { branch?: number | string; branchCode?: string | number; paymentDate?: string; amountPaid?: number | string; batchId?: number | string }
/** Lê autorizações existentes (só campos não secretos) de qualquer lugar da resposta, até 3 níveis. */
export function lerAutorizacoes(dados: unknown): AutorizacaoLida[] {
  const out: AutorizacaoLida[] = []
  const rec = (x: unknown, n: number) => {
    if (n > 3 || x == null) return
    if (Array.isArray(x)) { for (const y of x) rec(y, n + 1); return }
    if (!ehObj(x)) return
    const g = (k: string) => { const f = Object.keys(x).find((y) => y.toLowerCase() === k.toLowerCase()); const v = f ? x[f] : undefined; return typeof v === 'string' || typeof v === 'number' ? v : undefined }
    const item: AutorizacaoLida = { branch: g('Branch'), branchCode: g('BranchCode'), paymentDate: g('PaymentDate') as string | undefined, amountPaid: g('AmountPaid'), batchId: g('BatchId') }
    const limpo = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined && v !== '')) as AutorizacaoLida
    if (Object.keys(limpo).length) out.push(limpo)
    else for (const v of Object.values(x)) rec(v, n + 1)
  }
  rec(dados, 0)
  return out
}

const PROIBIDAS = /(senha|password|secret|token|authorization|login|client_?id|partner|cnpj|cpf|documento|nationalid)/i
/** Cópia da resposta sem campos que pareçam segredo/documento, limitada a ~1800 caracteres. */
export function resumirResposta(v: unknown): unknown {
  const rec = (x: unknown, n: number): unknown => {
    if (n > 5 || x == null || typeof x !== 'object') return x
    if (Array.isArray(x)) return x.slice(0, 20).map((y) => rec(y, n + 1))
    return Object.fromEntries(Object.entries(x as Obj).map(([k, y]) => [k, PROIBIDAS.test(k) ? '[oculto]' : rec(y, n + 1)]))
  }
  const txt = JSON.stringify(rec(v, 0)) ?? 'null'
  return txt.length > 1800 ? { truncado: true, inicio: txt.slice(0, 1800) } : JSON.parse(txt)
}
const CAMPOS_EXTRATO = ['identifier', 'repomContractCode', 'clientContractCode', 'clientBranchCode', 'financialTransactionType', 'financialManagementType', 'financialTransactionValue', 'financialTransactionDate', 'financialTransactionPaymentDate', 'paymentBatchCode', 'transactionID']
/** Movimentações do extrato que são DESTE contrato (identifier RBRC4943103 ou código Repom 2166947), só campos financeiros. */
export function movimentosDoContrato(dados: unknown): Record<string, unknown>[] {
  const lista: unknown[] = Array.isArray(dados) ? dados : ehObj(dados) ? Object.values(dados).flatMap((x) => (Array.isArray(x) ? x : [])) : []
  return lista.filter(ehObj)
    .filter((m) => String(primeiro(m, ['identifier']) ?? '') === CONTRATO_QA.identifier || String(primeiro(m, ['repomContractCode']) ?? '') === String(CONTRATO_QA.shippingId))
    .map((m) => Object.fromEntries(CAMPOS_EXTRATO.map((k) => [k, primeiro(m, [k]) ?? null])))
}


export async function executarQaTeste(corpo: Record<string, unknown>, d: DepsQaTeste): Promise<SaidaQa> {
  if (!d.ligado) return { status: 503, corpo: { ok: false, desligado: true, erro: 'desligado' } }
  if (d.ambiente !== 'qa') return { status: 403, corpo: { ok: false, erro: 'Esta função só roda em QA.' } }
  const acao = String(corpo.acao ?? '')
  if (!(ACOES_QA as readonly string[]).includes(acao)) return { status: 400, corpo: { ok: false, erro: `Ação inválida. Use: ${ACOES_QA.join(', ')}.` } }

  const etapas: Etapa[] = []
  const fim = (status: number, extra: Record<string, unknown> = {}): SaidaQa => ({ status, corpo: { ok: etapas.length > 0 && etapas.every((e) => e.ok) && !extra.parou, contrato: CONTRATO_QA.shippingId, etapas, ...extra } })
  const parar = (motivo: string, status = 409) => fim(status, { parou: true, motivo })
  const passo = async <T>(nome: string, req: unknown, fn: () => Promise<ResultadoFrete<T>>, resumir?: (dados: T) => Record<string, unknown>) => {
    const id = await d.registrar(`qa-teste-${nome}`, req)
    const r = await fn()
    const e = etapaDe(nome, r, r.ok && resumir ? resumir(r.dados) : undefined)
    await d.concluir(id, { status: e.ok ? 'ok' : 'erro', http: e.http, resposta: { ok: e.ok, http: e.http, erro: e.erro ?? null, codigoErro: e.codigoErro ?? null, detalhe: e.detalhe ?? null }, erro: e.ok ? null : (e.erro ?? null) })
    etapas.push(e)
    return { e, r }
  }

  // 1) token (UMA tentativa de login; não devolve o token)
  {
    const id = await d.registrar('qa-teste-token', { acao })
    const t = await d.frete.verificarToken()
    const e: Etapa = { etapa: 'token', ok: t.ok, http: t.ok ? 200 : 0, erro: t.ok ? undefined : curto(t.erro) }
    await d.concluir(id, { status: t.ok ? 'ok' : 'erro', http: e.http, resposta: { ok: t.ok }, erro: e.erro ?? null })
    etapas.push(e)
    if (!t.ok) return fim(502, { parou: true })
    if (acao === 'token') return fim(200)
  }

  // 1b) saldo do cliente e extrato financeiro (SÓ LEITURA, dois GET no host do Relatório de QA)
  if (acao === 'saldo') {
    const ini = SALDO_INICIO
    const fimDia = d.hoje()
    const sal = await passo('saldo_cliente', { inicio: ini, fim: fimDia }, () => d.frete.consultarSaldoCliente(ini, fimDia), (dados) => ({ resposta: resumirResposta(dados) }))
    const ext = await passo('extrato_financeiro', { inicio: ini, fim: fimDia }, () => d.frete.consultarExtratoFinanceiro(ini, fimDia), (dados) => {
      const todos = Array.isArray(dados) ? dados.length : null
      return { total_movimentos: todos, do_contrato: movimentosDoContrato(dados) }
    })
    return fim(sal.e.ok || ext.e.ok ? 200 : 502, { janela: { inicio: ini, fim: fimDia }, ok: sal.e.ok && ext.e.ok })
  }

  // 2) consulta do contrato (só leitura)
  const c = await passo('consultar_contrato', { shippingId: CONTRATO_QA.shippingId }, () => d.frete.consultarContratoPorViagem(CONTRATO_QA.shippingId), (dados) => {
    const l = lerContratoQa(dados)
    return { status: l?.status ?? null, identifier: l?.identifier ?? null, documentos: l?.documentos.length ?? 0, branchCode: l?.branchCode ?? null, branchCodeDocumentos: [...new Set((l?.documentos ?? []).map((x) => x.branchCode))] } // BranchCode nao e segredo; e o usado na quitacao
  })
  if (!c.r.ok) return fim(502, { parou: true })
  if (acao === 'consultar_contrato') return fim(200)
  const lido = lerContratoQa(c.r.dados)

  // 2b) leitura das autorizações já registradas na Repom (só leitura, não gasta tentativa)
  const lerAuto = async () => {
    const porViagem = await d.frete.consultarAutorizacaoPorViagem(CONTRATO_QA.shippingId)
    const porIdent = await d.frete.consultarAutorizacaoPorIdentificador(CONTRATO_QA.identifier)
    const itens = [...(porViagem.ok ? lerAutorizacoes(porViagem.dados) : []), ...(porIdent.ok ? lerAutorizacoes(porIdent.dados) : [])]
    const unicos = itens.filter((x, i) => itens.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i)
    return { itens: unicos, http: [porViagem.http, porIdent.http], erros: [porViagem.ok ? null : curto(porViagem.erro), porIdent.ok ? null : curto(porIdent.erro)] }
  }
  if (acao === 'ler_autorizacao' || acao === 'rodada_autorizar') {
    const idLeitura = await d.registrar('qa-teste-ler-autorizacao', { acao })
    const l0 = await lerAuto()
    const detLeitura = { encontradas: l0.itens.length, itens: l0.itens, http: l0.http, erros_leitura: l0.erros }
    await d.concluir(idLeitura, { status: 'ok', http: l0.http[0] ?? 0, resposta: detLeitura, erro: null })
    etapas.push({ etapa: 'ler_autorizacao', ok: true, http: l0.http[0] ?? 0, detalhe: detLeitura })
    if (acao === 'ler_autorizacao') return fim(200)

    // 2c) RODADA FIXA: travas
    if (!lido?.status) return parar('Não consegui ler o status do contrato; nada foi autorizado.')
    if (!['paid', 'quitada'].includes(lido.status.toLowerCase().replace(/[\s_-]/g, ''))) return parar(`Esperava o contrato quitado (Paid); status atual: ${curto(lido.status)}. Nada foi autorizado.`)
    if (lido.identifier && lido.identifier !== CONTRATO_QA.identifier) return parar('O contrato consultado não é o RBRC4943103; nada foi autorizado.')
    const nomeR = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()
    if (nomeR.length < 3) return parar('A rodada exige confirmacao.nome.', 400)
    const ja = await d.historico('autorizar')
    if (ja.length !== TENTATIVAS_ANTERIORES_AUTORIZAR || ja.some((x) => x !== 'erro')) return parar('A rodada só vale com exatamente 3 recusas anteriores; não rodo.')
    if ((await d.historico('autorizar-rodada')).length) return parar('A rodada fixa é única e já foi usada; não repito.')

    const achados: Combo[] = l0.itens
      .filter((x) => x.branch != null && Number.isInteger(Number(x.branch)))
      .map((x) => ({ branch: Number(x.branch), branchCode: x.branchCode != null ? String(x.branchCode) : undefined, origem: 'valores já registrados na Repom (leitura prévia)' }))
    const combos = montarCombos(achados)
    const tentativas: Record<string, unknown>[] = []
    for (const [i, cb] of combos.entries()) {
      const id = await d.registrar('qa-teste-autorizar-rodada', { tentativa: i + 1, limite: LIMITE_RODADA, branch: cb.branch, branchCode: cb.branchCode ?? null, origem: cb.origem, motivo: MOTIVO_RODADA, confirmado_por: nomeR })
      const r = await d.frete.autorizarPagamento([{ shippingId: CONTRATO_QA.shippingId, identifier: CONTRATO_QA.identifier, branch: cb.branch, ...(cb.branchCode ? { branchCode: cb.branchCode } : {}), dataPagamento: d.amanha() }])
      const e = etapaDe('autorizar_rodada', r, { tentativa: i + 1, branch: cb.branch, branchCode: cb.branchCode ?? null, origem: cb.origem })
      await d.concluir(id, { status: e.ok ? 'ok' : 'erro', http: e.http, resposta: { ok: e.ok, http: e.http, codigoErro: e.codigoErro ?? null, erro: e.erro ?? null, branch: cb.branch, branchCode: cb.branchCode ?? null }, erro: e.ok ? null : (e.erro ?? null) })
      etapas.push(e)
      tentativas.push({ n: i + 1, branch: cb.branch, branchCode: cb.branchCode ?? null, http: e.http, codigo: e.codigoErro ?? null, erro: e.erro ?? null, ok: e.ok })
      if (e.ok) {
        const depois = await lerAuto()
        const c2 = await d.frete.consultarContratoPorViagem(CONTRATO_QA.shippingId)
        const l2 = c2.ok ? lerContratoQa(c2.dados) : null
        return fim(200, { ok: true, combinacao_que_funcionou: { branch: cb.branch, branchCode: cb.branchCode ?? null }, tentativas, depois: { autorizacoes: depois.itens, status_contrato: l2?.status ?? null } })
      }
      const tipo = tipoErroAutorizacao(e)
      if (tipo === 'saldo2768') return fim(422, { parou: true, motivo: 'Apareceu o erro 2768; não tento de novo.', tentativas, pendencia_externa: pendenciaKaren })
      if (e.detalhe?.incerto || e.http >= 500 || e.http === 0) return fim(502, { parou: true, motivo: 'Resultado incerto (erro 5xx ou falha de rede); não sei se a Repom registrou. Parei para conferir.', tentativas })
      if (tipo === 'novo') return fim(422, { parou: true, erro_de_tipo_novo: true, motivo: 'Erro de tipo NOVO (não é 760 de filial nem 728); parei para você decidir.', tentativas })
    }
    return fim(422, { parou: true, motivo: `Nenhuma das ${combos.length} combinações funcionou (limite ${LIMITE_RODADA}); não insisto. Próximo passo: resposta da Karen.`, tentativas })
  }

  // 3) travas antes de mexer em dinheiro
  if (!lido?.status) return parar('Não consegui ler o status do contrato; nada foi quitado.')
  if (lido.status.toLowerCase().replace(/[\s_-]/g, '') !== CONTRATO_QA.status.toLowerCase()) return parar(`O contrato não está mais em ${CONTRATO_QA.status} (status atual: ${curto(lido.status)}); nada foi quitado. Decidir antes de continuar.`)
  if (lido.identifier && lido.identifier !== CONTRATO_QA.identifier) return parar('O contrato consultado não é o RBRC4943103; nada foi quitado.')
  const branch = lido.branchCode ?? lido.documentos[0]?.branchCode ?? ''
  if (!branch) return parar('Não encontrei o BranchCode no contrato; nada foi quitado.')
  if (!lido.documentos.length) return parar('O contrato não traz documentos legíveis para a quitação; nada foi quitado. Preciso do formato da resposta.')
  const nome = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()
  if (nome.length < 3) return parar('Quitação e autorização exigem confirmacao.nome (quem autorizou o teste).', 400)
  if ((await d.historico('quitar')).length) return parar('Já houve uma tentativa de quitação deste contrato; não repito. Confira antes.')
  if ((await d.historico('autorizar')).length) return parar('Já houve uma tentativa de autorização; não repito.')

  // 4) quitação (UMA tentativa)
  const q = await passo('quitar', { shippingId: CONTRATO_QA.shippingId, documentos: lido.documentos.length, confirmado_por: nome }, () =>
    d.frete.quitarViagem({
      branchCode: branch,
      shippingId: CONTRATO_QA.shippingId,
      documentos: lido.documentos.map((x) => ({ numero: x.numero, serie: x.serie, branchCode: x.branchCode || branch, tipo: x.tipo as never, status: 'Delivered' as const })),
    }))
  if (!q.e.ok) return fim(q.e.http && q.e.http < 500 ? 422 : 502, { parou: true, pendencia_externa: ehSaldo2768(q.e) ? pendenciaKaren : undefined })

  // 5) autorização de pagamento (UMA tentativa, só depois da quitação ok)
  const a = await passo('autorizar', { shippingId: CONTRATO_QA.shippingId, identifier: CONTRATO_QA.identifier, confirmado_por: nome }, () =>
    d.frete.autorizarPagamento([{ shippingId: CONTRATO_QA.shippingId, identifier: CONTRATO_QA.identifier, branch: Number(branch), branchCode: branch, dataPagamento: d.amanha() }]))
  if (!a.e.ok) return fim(a.e.http && a.e.http < 500 ? 422 : 502, { parou: true, pendencia_externa: ehSaldo2768(a.e) ? pendenciaKaren : undefined })
  return fim(200)
}
