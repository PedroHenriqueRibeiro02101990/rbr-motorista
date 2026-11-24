// Regras da função temporária repom-qa-teste (sem Deno, sem rede; testes em repomQaTeste.test.ts).
// Só QA, só o contrato 2166947 (RBRC4943103), ações FIXAS (token, consultar_contrato, sequencia), UMA tentativa por ação de dinheiro,
// para no primeiro problema. Só funciona com o segredo REPOM_QA_TESTE_LIBERADO=sim. A resposta nunca leva credencial nem corpo bruto.
import { lerRotaCriada, situacaoProcessamento, type ClienteRepomFrete, type ResultadoFrete } from './repomFreteClient.ts'
import { ADIANTAMENTO, FILIAL_ROTA, FINAIS_MODELO, FRETE_TOTAL, IBGE_DESTINO, IBGE_ORIGEM, MAX_TENTATIVAS_EMISSAO, MAX_TENTATIVAS_ROTA, PREFIXO_IDENTIFIER, SEST_PF, VARIANTES_IBGE_ROTA, classificarFalhaEmissao, eixosDoVeiculo, novoTraceIdentifier, conferirModelo, escolherCargaGeral, lerModeloContrato, lerTiposCarga, montarPedidoAdiantamento } from './repomQaAdiantamento.ts'

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
export const ACOES_QA = ['token', 'consultar_contrato', 'sequencia', 'ler_autorizacao', 'rodada_autorizar', 'saldo', 'ler_modelo', 'criar_rota', 'consultar_rota', 'emitir_adiantamento', 'cancelar_adiantamento'] as const
/** Janela fixa da consulta de saldo/extrato (só leitura). */
export const SALDO_INICIO = '2026-11-01'

export const chaveLigada = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase() === 'sim'

export interface DepsQaTeste {
  ligado: boolean
  ambiente: 'qa' | 'prd'
  frete: ClienteRepomFrete
  /** status das linhas anteriores de repom_requisicoes para esta ação ('quitar' | 'autorizar') */
  historico(acao: 'quitar' | 'autorizar' | 'autorizar-rodada' | 'emitir-adiantamento' | 'criar-rota'): Promise<string[]>
  /** TraceIdentifier das tentativas de criar_rota (qualquer status, mais recente primeiro), para conferir quando o resultado ficou incerto. */
  tentativasRota(): Promise<string[]>
  /** Rota própria do 9520 criada por este teste (última com status ok em qa-teste-criar-rota), com os eixos do veículo; null se não existe. */
  rotaCriada(): Promise<{ traceCode: number; routeCode: number; eixos: number } | null>
  /** Status das tentativas de emissão (qa-teste-emitir-adiantamento) feitas COM a rota de roteiro `routeCode` (as anteriores, com a rota de 17/11, não contam). */
  tentativasComRota(routeCode: number): Promise<string[]>
  /** Identifier da ÚLTIMA tentativa de emissão do adiantamento registrada em repom_requisicoes (qualquer status), para o cancelamento. */
  ultimaEmissao(): Promise<string | null>
  agora(): Date
  espera(ms: number): Promise<void>
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
    : { etapa: nome, ok: false, http: r.http, erro: curto(r.erro), codigoErro: r.codigoErro ?? null, detalhe: { ...detalhe, ...(r.incerto ? { incerto: true } : {}), ...(r.corpoErro ? { corpo_erro: r.corpoErro } : {}) } }
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

  // 1c) TESTE DE SALDO COM ADIANTAMENTO (24/11/2026): ler o modelo, emitir UM contrato novo com adiantamento de R$ 10,00 e cancelar
  if (acao === 'ler_modelo') {
    const mod = await passo('modelo', { shippingId: CONTRATO_QA.shippingId }, () => d.frete.consultarContratoPorViagem(CONTRATO_QA.shippingId), (dados) => {
      const r = lerModeloContrato(dados)
      if ('erro' in r) return { erro_leitura: r.erro }
      const m = r.modelo
      return { status: m.status, prestador_final: m.hiredNationalId.slice(-4), motoristas_finais: m.motoristas.map((x) => x.cpf.slice(-4)), placas: m.placas, filial: m.branchCode, ncm4: m.ncm, peso: m.pesoCarga, valor_carga: m.valorCarga, percurso: m.traceCode, roteiro: m.routeCode, local_entrega: m.tipoLocal, destinatario_tipo: m.destinatario.tipo, documento_tipo: m.documento.tipo, confere_com_17_11: conferirModelo(m) ?? 'sim' }
    })
    const tc = await passo('tipos_carga', {}, () => d.frete.tiposDeCarga(), (dados) => ({ tipos: lerTiposCarga(dados) }))
    return fim(mod.e.ok && tc.e.ok ? 200 : 502, { ok: mod.e.ok && tc.e.ok })
  }
  if (acao === 'consultar_rota') {
    // SÓ LEITURA: confere se a última tentativa de criar_rota (que ficou incerta por tempo esgotado) chegou a criar a rota; não gasta tentativa
    const tids = await d.tentativasRota()
    if (!tids.length) return parar('Não há tentativa de criar_rota para conferir.')
    if (await d.rotaCriada()) return parar('A rota já está registrada; nada a conferir.')
    const vei = await d.frete.consultarVeiculo(FINAIS_MODELO.placa)
    const eixos = vei.ok ? eixosDoVeiculo(vei.dados) : 5
    for (const tid of tids) {
      const porId = await passo('rota_por_identificador', { traceIdentifier: tid, eixos }, () => d.frete.consultarRotaPorIdentificador(tid, eixos), (dados) => ({ traceIdentifier: tid, resposta: resumirResposta(dados) }))
      const ro = porId.r.ok ? (Array.isArray(porId.r.dados) ? porId.r.dados[0] : porId.r.dados) : null
      const o = ehObj(ro) ? ro : {}
      const trace = Number(primeiro(o, ['TraceCode'])); const route = Number(primeiro(o, ['RouteCode'])); const dist = Number(primeiro(o, ['Distance']))
      if (!Number.isInteger(trace) || !Number.isInteger(route) || trace <= 0 || route <= 0) continue
      const id = await d.registrar('qa-teste-criar-rota', { origem: 'consulta_rota', traceIdentifier: tid, confirmado_por: 'consulta' })
      await d.concluir(id, { status: 'ok', http: 200, resposta: { traceIdentifier: tid, traceCode: trace, routeCode: route, eixos, distancia_km: Number.isFinite(dist) ? dist : null, achada_por_consulta: true }, erro: null })
      return fim(200, { encontrada: true, traceIdentifier: tid, traceCode: trace, routeCode: route, eixos, distancia_km: Number.isFinite(dist) ? dist : null })
    }
    return fim(200, { parou: true, encontrada: false, identificadores: tids, motivo: 'A Repom não devolveu rota para nenhum dos identificadores tentados.' })
  }
  if (acao === 'criar_rota') {
    const nomeR = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()
    if (nomeR.length < 3) return parar('A criação da rota exige confirmacao.nome.', 400)
    const hist = await d.historico('criar-rota')
    if (hist.includes('ok') || (await d.rotaCriada())) return parar('Já existe uma rota criada por este teste; não crio outra.')
    if (hist.length >= MAX_TENTATIVAS_ROTA) return parar(`Já foram ${hist.length} tentativas de criar a rota (máximo ${MAX_TENTATIVAS_ROTA}); não repito.`)
    const formato = VARIANTES_IBGE_ROTA[hist.length]!
    const traceId = novoTraceIdentifier(d.agora())
    const idLinha = await d.registrar('qa-teste-criar-rota', { tentativa: hist.length + 1, max: MAX_TENTATIVAS_ROTA, formato_ibge: formato, filial: FILIAL_ROTA, origem: IBGE_ORIGEM, destino: IBGE_DESTINO, ida_e_volta: true, traceIdentifier: traceId, confirmado_por: nomeR })
    const cr = await d.frete.rotaAutomatica({ filial: FILIAL_ROTA, ibgeOrigem: IBGE_ORIGEM, ibgeDestino: IBGE_DESTINO, idaVolta: true, identificador: traceId, formatoIbge: formato })
    const base = { tentativa: hist.length + 1, formato_ibge: formato, traceIdentifier: traceId }
    if (!cr.ok) {
      const e = etapaDe('criar_rota', cr, base)
      await d.concluir(idLinha, { status: 'erro', http: e.http, resposta: { ...base, codigoErro: e.codigoErro ?? null, erro: e.erro ?? null, corpo_erro: cr.corpoErro ?? null, incerto: cr.incerto ?? false }, erro: e.erro ?? null })
      etapas.push(e)
      return fim(e.http && e.http < 500 ? 422 : 502, { parou: true, tentativa: hist.length + 1, formato_ibge: formato, motivo: cr.incerto ? 'Resultado incerto (5xx ou rede); não sei se a Repom criou a rota. Parei para conferir.' : 'A Repom recusou a criação da rota.' })
    }
    const lida = lerRotaCriada(cr.bruto)
    if ('erro' in lida) {
      const resumo = resumirResposta(cr.bruto)
      await d.concluir(idLinha, { status: 'erro', http: cr.http, resposta: { ...base, resultado: 'sem_codigos', erro: lida.erro, resposta: resumo }, erro: lida.erro })
      etapas.push({ etapa: 'criar_rota', ok: false, http: cr.http, erro: lida.erro, detalhe: { ...base, resposta: resumo } })
      return fim(422, { parou: true, tentativa: hist.length + 1, formato_ibge: formato, motivo: 'A Repom respondeu, mas sem RouteCode/TraceCodeRepom válidos.' })
    }
    // eixos do veículo (só leitura) e confirmação da rota por GET /Route/byroutecode/{trace}/{route}/{eixos}
    const vei = await d.frete.consultarVeiculo(FINAIS_MODELO.placa)
    const eixos = vei.ok ? eixosDoVeiculo(vei.dados) : 5
    const conf = await d.frete.consultarRotaPorCodigo(lida.traceCode, lida.routeCode, eixos)
    const ro = conf.ok ? (Array.isArray(conf.dados) ? conf.dados[0] : conf.dados) : null
    const rotaObj = ehObj(ro) ? ro : {}
    const dist = Number(primeiro(rotaObj, ['Distance']))
    const detalhe = { ...base, traceCode: lida.traceCode, routeCode: lida.routeCode, status_repom: lida.status, eixos, eixos_lidos_do_veiculo: vei.ok, confirmada: conf.ok, http_confirmacao: conf.http, erro_confirmacao: conf.ok ? null : curto(conf.erro), corpo_erro_confirmacao: conf.ok ? null : (conf.corpoErro ?? null), nome: String(primeiro(rotaObj, ['Name']) ?? '').slice(0, 120), distancia_km: Number.isFinite(dist) ? dist : null }
    await d.concluir(idLinha, { status: 'ok', http: cr.http, resposta: detalhe, erro: null })
    etapas.push({ etapa: 'criar_rota', ok: true, http: cr.http, detalhe })
    return fim(200, { traceCode: lida.traceCode, routeCode: lida.routeCode, eixos, confirmada: conf.ok, distancia_km: Number.isFinite(dist) ? dist : null })
  }
  if (acao === 'emitir_adiantamento') {
    const nomeE = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()
    if (nomeE.length < 3) return parar('A emissão exige confirmacao.nome.', 400)
    const rotaNova = await d.rotaCriada()
    if (!rotaNova) return parar('Não há rota própria do 9520 criada por este teste (ação criar_rota). Nada foi emitido.')
    const hist = await d.tentativasComRota(rotaNova.routeCode)
    if (hist.length >= MAX_TENTATIVAS_EMISSAO) return parar(`Já foram ${hist.length} tentativas de emissão (máximo ${MAX_TENTATIVAS_EMISSAO}); não repito.`)
    if (hist.includes('ok')) return parar('Já existe um contrato emitido por este teste; cancele antes de qualquer nova emissão.')
    const mod = await passo('modelo', { shippingId: CONTRATO_QA.shippingId }, () => d.frete.consultarContratoPorViagem(CONTRATO_QA.shippingId))
    if (!mod.r.ok) return fim(502, { parou: true })
    const lm = lerModeloContrato(mod.r.dados)
    if ('erro' in lm) return parar(lm.erro + ' Nada foi emitido.')
    const conf = conferirModelo(lm.modelo)
    if (conf) return parar(conf + ' Nada foi emitido.')
    const tc = await passo('tipos_carga', {}, () => d.frete.tiposDeCarga())
    if (!tc.r.ok) return fim(502, { parou: true })
    const tipos = lerTiposCarga(tc.r.dados)
    const geral = escolherCargaGeral(tipos)
    if (!geral) return parar(`Não achei "carga geral" na lista de tipos da ANTT (${tipos.map((t) => `${t.id}=${t.descricao}`).join('; ').slice(0, 400)}). Nada foi emitido.`)
    // leitura da rota (só GET): distância real para o piso; o Swagger não traz IBGE nessa consulta, então valem os IBGE de 17/11 (SP -> RJ)
    const rr = await d.frete.consultarRotaPorCodigo(rotaNova.traceCode, rotaNova.routeCode, rotaNova.eixos)
    const ro = rr.ok ? (Array.isArray(rr.dados) ? rr.dados[0] : rr.dados) : null
    const rotaObj = ehObj(ro) ? ro : {}
    const distRota = Number(primeiro(rotaObj, ['Distance']))
    const distOk = Number.isFinite(distRota) && distRota > 0
    etapas.push({ etapa: 'rota', ok: rr.ok && distOk, http: rr.http, ...(rr.ok ? {} : { erro: curto(rr.erro) }), detalhe: { lida: rr.ok, ...(!rr.ok && rr.corpoErro ? { corpo_erro: rr.corpoErro } : {}), traceCode: rotaNova.traceCode, routeCode: rotaNova.routeCode, eixos: rotaNova.eixos, nome: String(primeiro(rotaObj, ['Name']) ?? '').slice(0, 120), distancia_km: Number.isFinite(distRota) ? distRota : null, ibge_usados: { origem: IBGE_ORIGEM, destino: IBGE_DESTINO } } })
    if (!distOk) return parar('Não consegui ler a distância da rota criada; nada foi emitido (nenhuma tentativa gasta).')
    const { pedido } = montarPedidoAdiantamento(lm.modelo, d.agora(), geral.id, Math.random, { distanciaKm: distRota, rota: { traceCode: rotaNova.traceCode, routeCode: rotaNova.routeCode } })
    const tentativa = hist.length + 1
    const idLinha = await d.registrar('qa-teste-emitir-adiantamento', { identifier: pedido.identifier, tentativa, max: MAX_TENTATIVAS_EMISSAO, frete: FRETE_TOTAL, adiantamento: ADIANTAMENTO, sest: SEST_PF, ibge_origem: pedido.ibgeOrigem, ibge_destino: pedido.ibgeDestino, cep_origem: pedido.cepOrigem, cep_destino: pedido.cepDestino, rota_trace: rotaNova.traceCode, rota_route: rotaNova.routeCode, distancia_km: pedido.distanciaKm, ncm: pedido.ncm, antt: geral.id, card: 0, confirmado_por: nomeE })
    const fecha = async (status: 'ok' | 'erro', http: number, resposta: Record<string, unknown>, erroTxt: string | null) => { await d.concluir(idLinha, { status, http, resposta: { identifier: pedido.identifier, tentativa, ...resposta }, erro: erroTxt }) }
    const em = await d.frete.emitirContrato(pedido)
    if (!em.ok) {
      const tipo = classificarFalhaEmissao([em.erro], em.codigoErro)
      await fecha('erro', em.http, { resultado: tipo, codigo: em.codigoErro ?? null, incerto: em.incerto ?? false, corpo_erro: em.corpoErro ?? null }, curto(em.erro))
      etapas.push({ etapa: 'emitir', ok: false, http: em.http, erro: curto(em.erro), codigoErro: em.codigoErro ?? null, detalhe: { identifier: pedido.identifier, resultado: tipo, ...(em.incerto ? { incerto: true } : {}), ...(em.corpoErro ? { corpo_erro: em.corpoErro } : {}) } })
      return fim(em.http && em.http < 500 ? 422 : 502, { parou: true, identifier: pedido.identifier, resultado: tipo, responde_sobre_saldo: tipo !== 'outro', ...(tipo === '2768' ? { pendencia_externa: pendenciaKaren } : {}) })
    }
    const chave = em.dados.operationKey
    if (!chave) {
      await fecha('erro', em.http, { resultado: 'sem_operation_key' }, 'A Repom aceitou o pedido mas não devolveu a chave da operação.')
      return fim(502, { parou: true, identifier: pedido.identifier, motivo: 'A Repom aceitou o pedido mas não devolveu a OperationKey; confira o contrato pelo identificador antes de qualquer nova tentativa.' })
    }
    // a emissão é assíncrona: consultar o processamento (até 8 vezes, 4 s entre elas)
    let final: 'emitido' | 'erro' | 'processando' = 'processando'
    let erros: string[] = []
    for (let i = 0; i < 8 && final === 'processando'; i++) {
      await d.espera(4000)
      const st = await d.frete.consultarStatusPorChave(chave)
      if (!st.ok) continue
      const itens = st.dados
      erros = itens.flatMap((x) => x.erros)
      if (itens.some((x) => situacaoProcessamento(x) === 'erro')) final = 'erro'
      else if (itens.length && itens.every((x) => situacaoProcessamento(x) === 'emitido')) final = 'emitido'
    }
    if (final === 'erro') {
      const tipo = classificarFalhaEmissao(erros)
      await fecha('erro', 200, { resultado: tipo, erros: erros.map(curto).slice(0, 5) }, curto(erros.join('; ')))
      etapas.push({ etapa: 'emitir', ok: false, http: 200, erro: curto(erros.join('; ')), detalhe: { identifier: pedido.identifier, resultado: tipo } })
      return fim(422, { parou: true, identifier: pedido.identifier, resultado: tipo, responde_sobre_saldo: tipo !== 'outro', ...(tipo === '2768' ? { pendencia_externa: pendenciaKaren } : {}) })
    }
    if (final === 'processando') {
      await fecha('erro', 200, { resultado: 'processando' }, 'Sem resposta final do processamento no prazo.')
      return fim(504, { parou: true, identifier: pedido.identifier, motivo: 'A emissão ainda estava em processamento quando parei de esperar; consulte o contrato pelo identificador (ele pode existir).' })
    }
    const lido2 = await d.frete.consultarContratoPorIdentificador(pedido.identifier)
    const o2 = lido2.ok ? (Array.isArray(lido2.dados) ? lido2.dados[0] : lido2.dados) : null
    const dados2 = ehObj(o2) ? o2 : {}
    const shippingId = Number(primeiro(dados2, ['ShippingId'])) || null
    const ciot = primeiro(dados2, ['CIOT']) ?? null
    const statusContrato = lerContratoQa(o2)?.status ?? null
    const adiant = primeiro(dados2, ['AdvanceMoneyValue']) ?? null
    await fecha('ok', 200, { resultado: 'emitido_com_adiantamento', shippingId, ciot, status: statusContrato, adiantamento_no_contrato: adiant }, null)
    etapas.push({ etapa: 'emitir', ok: true, http: 200, detalhe: { identifier: pedido.identifier, shippingId, ciot, status: statusContrato, adiantamento_no_contrato: adiant } })
    return fim(200, { identifier: pedido.identifier, resultado: 'emitido_com_adiantamento', credito_chegou: true, shippingId, ciot, status: statusContrato })
  }
  if (acao === 'cancelar_adiantamento') {
    const nomeC = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()
    if (nomeC.length < 3) return parar('O cancelamento exige confirmacao.nome.', 400)
    const ident = await d.ultimaEmissao()
    if (!ident || !ident.startsWith(PREFIXO_IDENTIFIER)) return parar('Não há contrato criado por este teste para cancelar.')
    const lido3 = await passo('consultar_criado', { identifier: ident }, () => d.frete.consultarContratoPorIdentificador(ident))
    if (!lido3.r.ok) return parar(`Não achei o contrato ${ident} na Repom (nada a cancelar): ${curto(lido3.r.erro)}`)
    const o3 = Array.isArray(lido3.r.dados) ? lido3.r.dados[0] : lido3.r.dados
    const sid = ehObj(o3) ? Number(primeiro(o3, ['ShippingId'])) : NaN
    if (!Number.isInteger(sid) || sid <= 0) return parar('Não consegui ler o código da viagem do contrato criado; não cancelo.')
    if (sid === CONTRATO_QA.shippingId) return parar('Recusado: nunca cancelo o contrato 2166947.')
    if (ehObj(o3) && String(primeiro(o3, ['Identifier']) ?? ident) !== ident) return parar('O contrato lido não tem o identificador esperado; não cancelo.')
    const stAntes = lerContratoQa(o3)?.status ?? null
    if (/cancel/i.test(stAntes ?? '')) return fim(200, { identifier: ident, shippingId: sid, status: stAntes, ja_cancelado: true })
    const canc = await passo('cancelar', { identifier: ident, shippingId: sid, confirmado_por: nomeC }, () => d.frete.cancelarContrato(sid))
    if (!canc.r.ok) return fim(canc.e.http && canc.e.http < 500 ? 422 : 502, { parou: true, identifier: ident, shippingId: sid, motivo: 'A Repom recusou o cancelamento.' })
    const dep = await d.frete.consultarContratoPorViagem(sid)
    const stDepois = dep.ok ? lerContratoQa(dep.dados)?.status ?? null : null
    return fim(200, { identifier: ident, shippingId: sid, status_antes: stAntes, status_depois: stDepois, cancelado: /cancel/i.test(stDepois ?? '') })
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
