// Repom Frete (guia 3.0, cliente 9520): adaptador único, no mesmo padrão do efreteClient / nspedagioClient / repomVprClient.
// Especificação: docs/repom/ESPECIFICACAO-FRETE.md; dúvidas: docs/repom/DUVIDAS-PARA-REPOM.md (cada TODO abaixo cita a dúvida).
// Sem dependências do Deno e SEM gravar em banco (testes em repomFreteClient.test.ts, tudo com mock; nenhuma chamada real à Repom).
// NÃO está ligado a nada e NÃO substitui nem altera o efreteClient: a Repom entra como fornecedor selecionável.
// Segredos entram por `config` (Vault, lidos por quem chama) e nunca são logados nem devolvidos. Token cacheado; em 401 renova UMA vez e repete UMA vez.
// A EMISSÃO do contrato é assíncrona (devolve OperationKey) e NUNCA é repetida depois de timeout/5xx: o resultado vem com `incerto: true`.
// O que o guia deixa ambíguo ou sem detalhe é NAO IMPLEMENTADO (rejeita com RepomFreteNaoImplementado) e está em DUVIDAS-PARA-REPOM.md.
import type { Fetch } from './repomClient.ts'

export interface CredenciaisRepomFrete {
  user: string // código do cliente na Repom (9520)
  version: string // "Version utilizada" (D-F02)
  password: string
  partner: string // CNPJ do cliente cadastrado na Repom
}

export interface ConfigRepomFrete {
  ambiente: 'qa' | 'prd'
  credenciais: CredenciaisRepomFrete
  /** URL do token do 9520. O guia não informa (D-F01): sem ela o cliente responde "não configurado". Segredo REPOM_FRETE_URL_TOKEN. */
  urlToken?: string
  /** URL base da API Frete. QA tem padrão (a do guia); PRD NÃO consta no guia e precisa ser informada (REPOM_FRETE_URL_BASE). */
  urlBase?: string
  urlRelatorio?: string
  limiteMs?: number
}

export const URL_BASE_QA = 'https://qa.repom.com.br/Repom.Frete.WebAPI'

export class RepomFreteNaoImplementado extends Error {
  readonly codigo = 'NAO_IMPLEMENTADO'
  constructor(metodo: string, duvida: string) {
    super(`Repom Frete (${metodo}): não implementado — aguardando resposta da Repom (${duvida})`)
    this.name = 'RepomFreteNaoImplementado'
  }
}

export type ResultadoFrete<T> =
  | { ok: true; http: number; dados: T; bruto: unknown }
  | { ok: false; http: number; erro: string; codigoErro?: string | null; incerto?: boolean; bruto: unknown }

// ---------- regras puras ----------

const so = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const seg = (v: string | number) => encodeURIComponent(String(v).trim())
const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/** Lê a mensagem de erro do Repom Frete: {Errors:[{Message,ErrorCode}]}, [{Message,ErrorCode}] ou {Message}. */
export function lerErroFrete(bruto: unknown): { mensagem: string; codigo: string | null } | null {
  const lista = (l: unknown[]) => {
    const itens = l.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
    const msgs = itens.map((e) => String(e.Message ?? e.message ?? '')).filter(Boolean)
    return msgs.length ? { mensagem: msgs.join('; '), codigo: itens[0]?.ErrorCode != null ? String(itens[0].ErrorCode) : null } : null
  }
  if (Array.isArray(bruto)) return lista(bruto)
  if (!bruto || typeof bruto !== 'object') return null
  const o = bruto as Record<string, unknown>
  if (Array.isArray(o.Errors) && o.Errors.length) return lista(o.Errors)
  if (Array.isArray(o.errors) && o.errors.length) return lista(o.errors)
  const r = o.Response as Record<string, unknown> | undefined
  const sc = Number(r?.StatusCode ?? o.StatusCode)
  if (sc >= 400 && typeof o.Message === 'string') return { mensagem: o.Message, codigo: null }
  return null
}

export function mensagemHttpFrete(status: number): string {
  if (status === 401 || status === 403) return 'A Repom recusou o acesso. Confira as credenciais.'
  if (status === 404) return 'A Repom não encontrou o registro consultado.'
  if (status === 429) return 'Muitas consultas à Repom. Tente de novo em instantes.'
  if (status >= 500) return 'A Repom está indisponível agora.'
  return `A Repom não aceitou o pedido (HTTP ${status}).`
}

export type TipoDocumentoFrete = 'CTE' | 'NFe' | 'NFSe' | 'CRT' | 'OCC' | 'Romaneio' | 'MDFe'
export type LocalEntrega = 'Branch' | 'GasStation' | 'DigitalPayment' | 'Hired'
export const TIPOS_DOCUMENTO: TipoDocumentoFrete[] = ['CTE', 'NFe', 'NFSe', 'CRT', 'OCC', 'Romaneio', 'MDFe']

export interface PedidoContratoFrete {
  identifier: string // código único do contrato no cliente (nossa chave de idempotência)
  hiredNationalId: string
  operationIdentifier: string
  cardNumber: number // 0 = viagem digital (conta digital)
  vprCardNumber?: number
  routeTraceCode: number // BrazilianRouteTraceCode (percurso)
  routeRouteCode: number // BrazilianRouteRouteCode (roteiro)
  issueDate: string // ISO
  totalFreightValue: number
  totalLoadWeight: number
  totalLoadValue: number
  advanceMoneyValue: number
  branchCode: string
  ncm: string
  anttCodeType: number // 1..8 (tipos de carga ANTT)
  ibgeOrigem?: string
  ibgeDestino?: string
  cepOrigem?: string
  cepDestino?: string
  distanciaKm?: number
  vpr: { issue: boolean; oneWay: boolean; suspendedAxles: number; returnSuspendedAxles: number }
  entrega: { esperadaEm: string; tipoLocal: LocalEntrega }
  motoristas: { cpf: string; principal: boolean }[]
  documentos: { tipo: TipoDocumentoFrete; serie: string; numero: string; chave?: string; branchCode: string }[]
  placas: string[]
  ajustes?: { identificador: string; valor: number }[]
  destinatario: { documento: string; nome: string; tipo: 'Person' | 'Company' }
  impostos?: { tipo: 'IRRF' | 'SEST' | 'SENAT' | 'INSS'; valor: number }[] // obrigatório se o cliente calcula os impostos (D-F07)
  combustivel?: { cartao: string; valor: number } // adiantamento flexível
  ciotTacAgregado?: { contratoExistenteId: number } // 0 na primeira viagem
}

/** Valida o que o guia (seção 8) marca como obrigatório. Devolve a primeira mensagem ou null. */
export function validarContratoFrete(p: PedidoContratoFrete): string | null {
  if (!p.identifier?.trim()) return 'Informe o identificador do contrato.'
  if (![11, 14].includes(so(p.hiredNationalId).length)) return 'Documento do contratado inválido.'
  if (!p.operationIdentifier?.trim()) return 'Informe a operação.'
  if (!Number.isFinite(p.cardNumber) || p.cardNumber < 0) return 'Cartão inválido (use 0 para viagem digital).'
  if (!Number.isFinite(p.routeTraceCode) || !Number.isFinite(p.routeRouteCode) || p.routeRouteCode <= 0) return 'Informe o roteiro e o percurso cadastrados na Repom.'
  if (Number.isNaN(new Date(p.issueDate).getTime())) return 'Data de emissão inválida.'
  for (const [k, v] of [['frete', p.totalFreightValue], ['peso', p.totalLoadWeight], ['valor da carga', p.totalLoadValue], ['adiantamento', p.advanceMoneyValue]] as const) if (!Number.isFinite(v) || v < 0) return `Valor de ${k} inválido.`
  if (p.totalFreightValue <= 0) return 'O valor do frete precisa ser maior que zero.'
  if (!p.branchCode?.trim()) return 'Informe o código da filial.'
  if (!so(p.ncm)) return 'Informe o NCM da carga.'
  if (!Number.isInteger(p.anttCodeType) || p.anttCodeType < 1) return 'Informe o tipo de carga da ANTT.'
  if (Number.isNaN(new Date(p.entrega?.esperadaEm).getTime())) return 'Informe a data prevista de entrega.'
  if (!p.motoristas?.length || p.motoristas.filter((m) => m.principal).length !== 1) return 'Informe um motorista principal.'
  if (p.motoristas.some((m) => so(m.cpf).length !== 11)) return 'CPF de motorista inválido.'
  if (!p.documentos?.length) return 'Informe ao menos um documento (CT-e, NF-e...).'
  for (const d of p.documentos) {
    if (!TIPOS_DOCUMENTO.includes(d.tipo)) return 'Tipo de documento inválido.'
    if (!d.serie?.trim() || !d.numero?.trim() || !d.branchCode?.trim()) return 'Documento sem série, número ou filial.'
    if ((d.tipo === 'CTE' || d.tipo === 'NFe') && so(d.chave).length !== 44) return 'Chave de acesso do documento inválida (44 dígitos).'
  }
  if (!p.placas?.length) return 'Informe a placa do veículo.'
  if (!p.destinatario?.nome?.trim() || ![11, 14].includes(so(p.destinatario.documento).length)) return 'Destinatário inválido.'
  return null
}

/** Corpo do POST /Shipping (um ARRAY de contratos). Nomes exatos do guia. */
export function montarCorpoContrato(p: PedidoContratoFrete) {
  return [
    {
      Identifier: p.identifier.trim(),
      Country: 'Brazil',
      HiredCountry: 'Brazil',
      HiredNationalId: so(p.hiredNationalId),
      OperationIdentifier: p.operationIdentifier.trim(),
      CardNumber: p.cardNumber,
      ...(p.vprCardNumber != null ? { VPRCardNumber: p.vprCardNumber } : {}),
      BrazilianRouteTraceCode: p.routeTraceCode,
      BrazilianRouteRouteCode: p.routeRouteCode,
      IssueDate: new Date(p.issueDate).toISOString(),
      TotalFreightValue: p.totalFreightValue,
      TotalLoadWeight: p.totalLoadWeight,
      TotalLoadValue: p.totalLoadValue,
      AdvanceMoneyValue: p.advanceMoneyValue,
      BranchCode: p.branchCode,
      LoadBrazilianNCM: so(p.ncm),
      LoadBrazilianANTTCodeType: p.anttCodeType,
      ...(p.ibgeOrigem ? { BrazilianIBGECodeSource: p.ibgeOrigem } : {}),
      ...(p.ibgeDestino ? { BrazilianIBGECodeDestination: p.ibgeDestino } : {}),
      ...(p.cepOrigem ? { BrazilianCEPSource: so(p.cepOrigem) } : {}),
      ...(p.cepDestino ? { BrazilianCEPDestination: so(p.cepDestino) } : {}),
      ...(p.distanciaKm != null ? { TravelledDistance: p.distanciaKm } : {}),
      VPR: { Issue: p.vpr.issue, VPROneWay: p.vpr.oneWay, VPRSuspendedAxleNumber: String(p.vpr.suspendedAxles), VPRReturnSuspendedAxleNumber: String(p.vpr.returnSuspendedAxles) },
      ShippingPayment: { ExpectedDeliveryDate: new Date(p.entrega.esperadaEm).toISOString(), ExpectedDeliveryLocationType: p.entrega.tipoLocal },
      Drivers: p.motoristas.map((m) => ({ Country: 'Brazil', NationalId: so(m.cpf), Main: m.principal })),
      Documents: p.documentos.map((d) => ({ BranchCode: d.branchCode, DocumentType: d.tipo, Series: d.serie, Number: d.numero, ...(d.chave ? { EletronicKey: so(d.chave) } : {}) })),
      Vehicles: p.placas.map((pl) => ({ Country: 'Brazil', LicensePlate: pl.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })),
      ...(p.ajustes?.length ? { AccountingAdjustments: p.ajustes.map((a) => ({ Identifier: a.identificador, Value: a.valor })) } : {}),
      ShippingReceiver: { Country: 'Brazil', NationalId: so(p.destinatario.documento), Name: p.destinatario.nome.trim(), ReceiverType: p.destinatario.tipo },
      ...(p.impostos?.length ? { Taxes: p.impostos.map((t) => ({ Type: t.tipo, Value: t.valor })) } : {}),
      ...(p.combustivel ? { ShippingFuel: { FuelCardNumber: p.combustivel.cartao, FuelValue: p.combustivel.valor } } : {}),
      ...(p.ciotTacAgregado ? { CIOTShippingType: 3, ExistingContractId: p.ciotTacAgregado.contratoExistenteId } : {}),
    },
  ]
}

export interface StatusProcessamento {
  shippingId: number | null
  identifier: string | null
  status: string | null
  erros: string[]
}
/** "emitido" quando Status = Finished e sem erros; "erro" com erros; senão "processando" (a emissão é assíncrona, D-F09). */
export function situacaoProcessamento(s: StatusProcessamento): 'emitido' | 'erro' | 'processando' {
  if (s.erros.length) return 'erro'
  return String(s.status ?? '').toLowerCase() === 'finished' ? 'emitido' : 'processando'
}

export function lerOperationKey(bruto: unknown): string | null {
  const m = String((bruto as { Message?: unknown } | null)?.Message ?? '').match(/OperationKey:\s*([0-9a-f-]{36})/i)
  return m ? m[1]! : null
}
export function lerStatusProcessamento(bruto: unknown): StatusProcessamento[] {
  const r = ((bruto as { Result?: unknown } | null)?.Result ?? null) as Record<string, unknown> | null
  if (!r) return []
  const itens = Array.isArray(r.Results) ? (r.Results as Record<string, unknown>[]) : [r]
  return itens.map((i) => ({
    shippingId: num(i.ShippingId),
    identifier: i.Identifier != null ? String(i.Identifier) : null,
    status: i.Status != null ? String(i.Status) : null,
    erros: (Array.isArray(i.Errors) ? i.Errors : []).map((e) => String((e as Record<string, unknown>)?.Message ?? e)),
  }))
}

// ---------- cliente ----------

type Req = { query?: Record<string, string | number>; corpo?: unknown; versao?: string; relatorio?: boolean }

export interface ClienteRepomFrete {
  readonly ambiente: 'qa' | 'prd'
  /** UMA chamada de token. Só para o diagnóstico do repom-status. */
  verificarToken(): Promise<{ ok: boolean; erro?: string }>
  // cadastros (um por chamada, antes da emissão)
  criarContratado(corpo: Record<string, unknown>): Promise<ResultadoFrete<unknown>>
  consultarContratadoPorNome(nome: string): Promise<ResultadoFrete<unknown>>
  consultarContratadoPorDocumento(documento: string): Promise<ResultadoFrete<unknown>>
  alterarContratado(documento: string, corpo: Record<string, unknown>): Promise<ResultadoFrete<unknown>>
  bloquearContratado(documento: string, bloquear: boolean, motivo: string): Promise<ResultadoFrete<unknown>>
  criarMotorista(corpo: Record<string, unknown>): Promise<ResultadoFrete<unknown>>
  consultarMotorista(cpf: string): Promise<ResultadoFrete<unknown>>
  alterarMotorista(cpf: string, corpo: Record<string, unknown>): Promise<ResultadoFrete<unknown>>
  bloquearMotorista(cpf: string, bloquear: boolean, motivo: string): Promise<ResultadoFrete<unknown>>
  criarVeiculo(corpo: Record<string, unknown>): Promise<ResultadoFrete<unknown>>
  consultarVeiculo(placa: string): Promise<ResultadoFrete<unknown>>
  alterarVeiculo(placa: string, corpo: Record<string, unknown>): Promise<ResultadoFrete<unknown>>
  bloquearVeiculo(placa: string, bloquear: boolean, motivo: string): Promise<ResultadoFrete<unknown>>
  tiposDeCarga(): Promise<ResultadoFrete<unknown>>
  // rota
  rotaAutomatica(p: { filial: string; ibgeOrigem: string; ibgeDestino: string; idaVolta: boolean; identificador?: string; paradasIbge?: string[] }): Promise<ResultadoFrete<unknown>>
  consultarRotaPorIbge(ibgeOrigem: string, ibgeDestino: string, eixos: number): Promise<ResultadoFrete<unknown>>
  consultarRotaPorCep(cep: string, eixos: number): Promise<ResultadoFrete<unknown>>
  consultarRotaPorCodigo(percurso: number, roteiro: number, eixos: number): Promise<ResultadoFrete<unknown>>
  consultarRotaPorIdentificador(identificador: string, eixos: number): Promise<ResultadoFrete<unknown>>
  consultarSolicitacaoDeRota(identificador: string): Promise<ResultadoFrete<unknown>>
  // validações (antes de emitir)
  validarVeiculo(placa: string): Promise<ResultadoFrete<unknown>>
  validarVeiculoPorTag(placa: string): Promise<ResultadoFrete<unknown>>
  validarDocumentoPrestador(documento: string): Promise<ResultadoFrete<unknown>>
  validarCartao(cartao: string, documento: string): Promise<ResultadoFrete<unknown>>
  // contrato / CIOT
  emitirContrato(p: PedidoContratoFrete): Promise<ResultadoFrete<{ operationKey: string | null }>>
  consultarStatusPorChave(operationKey: string): Promise<ResultadoFrete<StatusProcessamento[]>>
  consultarContratoPorViagem(shippingId: number | string): Promise<ResultadoFrete<unknown>>
  consultarContratoPorIdentificador(identifier: string): Promise<ResultadoFrete<unknown>>
  consultarStatusPorIdentificador(identifier: string): Promise<ResultadoFrete<StatusProcessamento[]>>
  cancelarContrato(shippingId: number | string): Promise<ResultadoFrete<unknown>>
  interromperContrato(shippingId: number | string): Promise<ResultadoFrete<unknown>>
  bloquearContrato(shippingId: number | string, bloquear: boolean, motivo: string): Promise<ResultadoFrete<unknown>>
  adicionarDocumento(shippingId: number | string, doc: { branchCode: string; tipo: TipoDocumentoFrete; serie: string; numero: string; chave?: string }): Promise<ResultadoFrete<unknown>>
  adicionarMovimento(shippingId: number | string, identificador: string, valor: number): Promise<ResultadoFrete<unknown>>
  adicionarImpostos(shippingId: number, impostos: { tipo: string; valor: number }[]): Promise<ResultadoFrete<unknown>>
  adicionarImpostosPorIdentificador(identifier: string, impostos: { tipo: string; valor: number }[]): Promise<ResultadoFrete<unknown>>
  cadastrarMovimento(p: { codigoCliente: string; nome: string; tipo: 'D' | 'C'; incideSobreImposto: boolean; incideSobreFrete: boolean; liberaSaldo: boolean }): Promise<ResultadoFrete<unknown>>
  listarMovimentos(): Promise<ResultadoFrete<unknown>>
  consultarPracasVpr(identifier: string): Promise<ResultadoFrete<unknown>>
  retificarCiotAgregado(p: { ciot: string; veiculos: { placa: string; rntrc: string }[]; quantidade: number; preco: number }): Promise<ResultadoFrete<unknown>>
  cancelarCiotAgregado(ciot: string, motivo: string): Promise<ResultadoFrete<unknown>>
  encerrarCiotAgregado(ciot: string): Promise<ResultadoFrete<unknown>>
  // pagamento e quitação
  autorizarPagamento(itens: { shippingId?: number; identifier: string; branchCode: string; dataPagamento: string }[]): Promise<ResultadoFrete<unknown>>
  consultarAutorizacaoPorLote(lote: number | string): Promise<ResultadoFrete<unknown>>
  consultarAutorizacaoPorIdentificador(identifier: string): Promise<ResultadoFrete<unknown>>
  consultarAutorizacaoPorViagem(shippingId: number | string): Promise<ResultadoFrete<unknown>>
  cancelarAutorizacao(itens: { shippingId?: number; identifier: string; branchCode: string }[]): Promise<ResultadoFrete<unknown>>
  quitarViagem(p: { branchCode: string; shippingId: number | string; pesoDescarregado?: number; documentos: { numero: string; serie: string; branchCode: string; tipo: TipoDocumentoFrete; status: 'Dismissed' | 'Lost' | 'Delivered' | 'Reshipping' }[] }): Promise<ResultadoFrete<unknown>>
  consultarQuitacao(shippingId: number | string): Promise<ResultadoFrete<unknown>>
  cancelarQuitacao(shippingId: number | string): Promise<ResultadoFrete<unknown>>
  // NAO IMPLEMENTADO (guia ambíguo ou sem detalhe; ver DUVIDAS-PARA-REPOM.md)
  /** Saldo do cliente: caminho informado pela Repom (Karen, 13/11), FORA do guia. Formato da resposta desconhecido (D-F15): devolve o que vier. */
  consultarSaldoCliente(inicio: string, fim: string): Promise<ResultadoFrete<unknown>>
  adiantarSaldoFrete(): Promise<never>
  alterarDocumentoQuitacao(): Promise<never>
  consultarContratosPorStatus(): Promise<never>
  listarOperacoes(): Promise<never>
}

export function criarRepomFreteClient(config: ConfigRepomFrete, fetchFn: Fetch = (u, i) => fetch(u, i) as never): ClienteRepomFrete {
  const base = (config.urlBase ?? (config.ambiente === 'qa' ? URL_BASE_QA : '')).replace(/\/+$/, '')
  const baseRel = (config.urlRelatorio ?? base.replace(/Repom\.Frete\.WebAPI$/i, 'Repom.Relatorio.WebAPI')).replace(/\/+$/, '')
  const limite = config.limiteMs ?? 30_000
  const c = config.credenciais
  let token: { valor: string; expira: number } | null = null

  const configurado = (): string | null => {
    if (!base) return 'A URL da API Frete de produção não foi configurada.'
    if (!config.urlToken) return 'A URL do token da Repom Frete não foi configurada.'
    if (!c.user || !c.password || !c.partner || !c.version) return 'Credenciais da Repom Frete não configuradas.'
    return null
  }

  async function http(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), limite)
    try {
      return await fetchFn(url, { ...init, signal: ctl.signal })
    } catch (e) {
      throw new Error((e as Error)?.name === 'AbortError' ? 'TIMEOUT' : 'REDE')
    } finally {
      clearTimeout(t)
    }
  }

  async function obterToken(forcar = false): Promise<string> {
    if (!forcar && token && token.expira > Date.now() + 60_000) return token.valor
    // CONFIRMAR (D-F02): formulário com User, Version, Password, Partner. O guia não mostra o corpo (só a figura).
    const corpo = new URLSearchParams({ User: c.user, Version: c.version, Password: c.password, Partner: c.partner }).toString()
    const r = await http(config.urlToken as string, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo })
    const j = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
    if (!r.ok || !j?.access_token) throw new Error('TOKEN:' + r.status)
    token = { valor: j.access_token, expira: Date.now() + ((Number(j.expires_in) || 3600) - 300) * 1000 }
    return token.valor
  }

  type Resp = { status: number; bruto: unknown }
  async function chamar(metodo: string, caminho: string, o: Req): Promise<Resp> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(o.query ?? {})) qs.set(k, String(v))
    if (o.versao) qs.set('x-api-version', o.versao)
    const url = `${o.relatorio ? baseRel : base}${caminho}${qs.size ? `?${qs}` : ''}`
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const tk = await obterToken(tentativa > 0)
      const headers: Record<string, string> = { authorization: `Bearer ${tk}`, accept: 'application/json' }
      if (o.corpo !== undefined) headers['content-type'] = 'application/json'
      const r = await http(url, { method: metodo, headers, body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo) })
      if (r.status === 401 && tentativa === 0) continue
      return { status: r.status, bruto: r.status === 204 ? null : await r.json().catch(() => null) }
    }
    throw new Error('TOKEN:401')
  }

  /** Executa e converte para ResultadoFrete. `emissao`: timeout/5xx deixam o resultado INCERTO (nunca reenviar sem conferir). */
  async function rodar<T>(metodo: string, caminho: string, o: Req = {}, ler?: (bruto: unknown) => T, emissao = false): Promise<ResultadoFrete<T>> {
    const nao = configurado()
    if (nao) return { ok: false, http: 0, erro: nao, bruto: null }
    try {
      const r = await chamar(metodo, caminho, o)
      const e = lerErroFrete(r.bruto)
      if (r.status >= 200 && r.status < 300 && !e) return { ok: true, http: r.status, dados: ler ? ler(r.bruto) : ((r.bruto as { Result?: unknown } | null)?.Result ?? r.bruto) as T, bruto: r.bruto }
      const incerto = emissao && r.status >= 500 ? true : undefined
      return { ok: false, http: r.status, erro: e?.mensagem ?? mensagemHttpFrete(r.status), codigoErro: e?.codigo ?? null, incerto, bruto: r.bruto }
    } catch (e) {
      const m = (e as Error)?.message ?? ''
      if (m.startsWith('TOKEN:')) return { ok: false, http: Number(m.slice(6)) || 0, erro: mensagemHttpFrete(Number(m.slice(6)) || 401), bruto: null }
      const incerto = emissao ? true : undefined
      return { ok: false, http: 0, erro: m === 'TIMEOUT' ? 'A Repom demorou demais para responder.' : 'Não consegui falar com a Repom agora.', incerto, bruto: null }
    }
  }
  const invalido = (erro: string): Promise<ResultadoFrete<never>> => Promise.resolve({ ok: false, http: 0, erro, bruto: null })
  const nao = (metodo: string, duvida: string) => () => Promise.reject(new RepomFreteNaoImplementado(metodo, duvida))
  const idViagem = (v: number | string) => (String(v).trim() && /^\d+$/.test(String(v).trim()) ? String(v).trim() : null)
  const taxas = (l: { tipo: string; valor: number }[]) => l.map((t) => ({ Type: t.tipo, Value: t.valor }))
  const docCorpo = (d: { branchCode: string; tipo: TipoDocumentoFrete; serie: string; numero: string; chave?: string }) => ({ BranchCode: d.branchCode, DocumentType: d.tipo, Series: d.serie, Number: d.numero, ...(d.chave ? { EletronicKey: so(d.chave) } : {}) })

  const bloqueio = (bloquear: boolean, motivo: string) => ({ Locked: bloquear, LockedReason: motivo })
  const doc11 = (v: string, nome: string) => (so(v).length === 11 || so(v).length === 14 ? null : `${nome} inválido.`)

  return {
    ambiente: config.ambiente,
    async verificarToken() {
      const falta = configurado()
      if (falta) return { ok: false, erro: falta }
      try {
        await obterToken(true)
        return { ok: true }
      } catch (e) {
        const m = (e as Error).message
        return { ok: false, erro: m.startsWith('TOKEN:') ? mensagemHttpFrete(Number(m.slice(6)) || 401) : 'Não consegui falar com a Repom agora.' }
      }
    },

    criarContratado: (corpo) => rodar('POST', '/Hired', { corpo }),
    consultarContratadoPorNome: (nome) => (nome.trim().length < 3 ? invalido('Informe ao menos 3 letras do nome.') : rodar('GET', `/Hired/ByName/${seg(nome)}`)),
    consultarContratadoPorDocumento: (d) => (doc11(d, 'Documento') ? invalido('Documento inválido.') : rodar('GET', `/Hired/ByDocumente/Brazil/${so(d)}`)), // o guia grafa "ByDocumente"
    alterarContratado: (d, corpo) => (doc11(d, 'Documento') ? invalido('Documento inválido.') : rodar('PUT', `/Hired/Brazil/${so(d)}`, { corpo })),
    bloquearContratado: (d, b, m) => (doc11(d, 'Documento') ? invalido('Documento inválido.') : rodar('PATCH', `/Hired/lockUnlock/Brazil/${so(d)}`, { corpo: bloqueio(b, m) })),

    criarMotorista: (corpo) => rodar('POST', '/Driver', { corpo }),
    consultarMotorista: (cpf) => (so(cpf).length !== 11 ? invalido('CPF inválido.') : rodar('GET', `/Driver/ByDocument/Brazil/${so(cpf)}`)),
    alterarMotorista: (cpf, corpo) => (so(cpf).length !== 11 ? invalido('CPF inválido.') : rodar('PUT', `/Driver/Brazil/${so(cpf)}`, { corpo })),
    bloquearMotorista: (cpf, b, m) => (so(cpf).length !== 11 ? invalido('CPF inválido.') : rodar('PATCH', `/Driver/lockUnlock/Brazil/${so(cpf)}`, { corpo: bloqueio(b, m) })),

    criarVeiculo: (corpo) => rodar('POST', '/Vehicle', { corpo }),
    consultarVeiculo: (pl) => rodar('GET', `/Vehicle/ByDocument/Brazil/${seg(pl.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}`),
    alterarVeiculo: (pl, corpo) => rodar('PUT', `/Vehicle/Brazil/${seg(pl.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}`, { corpo }),
    bloquearVeiculo: (pl, b, m) => rodar('PATCH', `/Vehicle/Brazil/${seg(pl.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}`, { corpo: bloqueio(b, m) }),
    tiposDeCarga: () => rodar('GET', '/AnttTypes/LoadTypes'),

    rotaAutomatica(p) {
      if (!p.filial.trim() || !so(p.ibgeOrigem) || !so(p.ibgeDestino)) return invalido('Informe filial, origem e destino.')
      if ((p.paradasIbge ?? []).length > 23) return invalido('No máximo 23 paradas.')
      // IBGE sem os 2 primeiros dígitos e sem zeros à esquerda (mesma regra da VPR)
      const tira = (i: string) => so(i).slice(2).replace(/^0+/, '')
      const corpo = { BranchCode: p.filial, OriginIBGECode: Number(tira(p.ibgeOrigem)), DestinyIBGECode: Number(tira(p.ibgeDestino)), RoundTrip: p.idaVolta, ...(p.identificador ? { TraceIdentifier: p.identificador } : {}), ...(p.paradasIbge?.length ? { RouteStopIBGE: p.paradasIbge.map((i) => Number(tira(i))) } : {}) }
      return rodar('POST', '/RouteRequest/RouteRequestAutomatic', { corpo, versao: '2.4' })
    },
    consultarRotaPorIbge: (o, d, e) => rodar('GET', `/Route/byibge/${seg(so(o).slice(2).replace(/^0+/, ''))}/${seg(so(d).slice(2).replace(/^0+/, ''))}/${seg(e)}`),
    consultarRotaPorCep: (cep, e) => rodar('GET', `/Route/ByCEP/${seg(so(cep))}/${seg(e)}`),
    consultarRotaPorCodigo: (percurso, roteiro, e) => rodar('GET', `/Route/byroutecode/${seg(percurso)}/${seg(roteiro)}/${seg(e)}`),
    consultarRotaPorIdentificador: (id, e) => rodar('GET', `/Route/bytraceidentifier/${seg(id)}/${seg(e)}`),
    consultarSolicitacaoDeRota: (id) => rodar('GET', `/RouteRequest/${seg(id)}`),

    validarVeiculo: (pl) => rodar('GET', `/ShippingValidation/ByVehicles/${seg(pl.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}`), // uma placa por chamada (D-F10)
    validarVeiculoPorTag: (pl) => rodar('GET', `/ShippingValidation/ByVehiclesTag/${seg(pl.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}`),
    validarDocumentoPrestador: (d) => (doc11(d, 'Documento') ? invalido('Documento inválido.') : rodar('GET', `/ShippingValidation/ByHiredDocument/Brazil/${so(d)}`)),
    validarCartao: (cartao, d) => (doc11(d, 'Documento') || !so(cartao) ? invalido('Cartão ou documento inválido.') : rodar('GET', `/ShippingValidation/ByCardNumberHiredDocument/${so(cartao)}/Brazil/${so(d)}`)),

    async emitirContrato(p) {
      const inval = validarContratoFrete(p)
      if (inval) return invalido(inval)
      // UMA tentativa. Sem retry em timeout/5xx (resultado incerto: o chamador confere por Identifier/OperationKey antes de qualquer reenvio).
      return rodar('POST', '/Shipping', { corpo: montarCorpoContrato(p), versao: '3.0' }, (b) => ({ operationKey: lerOperationKey(b) }), true)
    },
    consultarStatusPorChave: (k) => (k.trim() ? rodar('GET', `/Shipping/StatusProcessing/ByOperationKey/${seg(k)}`, {}, lerStatusProcessamento) : invalido('Informe a chave da operação.')),
    consultarContratoPorViagem: (id) => (idViagem(id) ? rodar('GET', `/Shipping/ByShipping/${idViagem(id)}`) : invalido('Código da viagem inválido.')),
    consultarContratoPorIdentificador: (id) => rodar('GET', `/Shipping/ByIdentifier/${seg(id)}`),
    consultarStatusPorIdentificador: (id) => rodar('GET', `/StatusProcessing/ByIdentifier/${seg(id)}`, {}, lerStatusProcessamento),
    cancelarContrato: (id) => (idViagem(id) ? rodar('PATCH', `/Shipping/Cancel/${idViagem(id)}`) : invalido('Código da viagem inválido.')),
    interromperContrato: (id) => (idViagem(id) ? rodar('PATCH', `/Shipping/Interruption/${idViagem(id)}`) : invalido('Código da viagem inválido.')),
    bloquearContrato: (id, b, m) => (idViagem(id) ? rodar('PATCH', `/Shipping/lockUnlock/${idViagem(id)}`, { corpo: bloqueio(b, m) }) : invalido('Código da viagem inválido.')),
    adicionarDocumento: (id, d) => (idViagem(id) ? rodar('PATCH', `/Shipping/AddDocument/${idViagem(id)}`, { corpo: docCorpo(d) }) : invalido('Código da viagem inválido.')),
    adicionarMovimento: (id, ident, valor) => (idViagem(id) ? rodar('PATCH', `/Shipping/AddMoviment/${idViagem(id)}`, { corpo: { Identifier: ident, Value: valor } }) : invalido('Código da viagem inválido.')),
    adicionarImpostos: (id, l) => rodar('PATCH', '/Shipping/AddTaxes', { corpo: [{ ShippingID: id, ShippingTaxes: taxas(l) }] }),
    adicionarImpostosPorIdentificador: (ident, l) => rodar('PATCH', '/Shipping/AddTaxesByIdentifier', { corpo: [{ Identifier: ident, ShippingTaxes: taxas(l) }] }),
    cadastrarMovimento: (p) => rodar('POST', '/Movement/MovementRegistration', { corpo: { CodigoCliente: p.codigoCliente, NomeMovimento: p.nome, TipoMovimento: p.tipo, IncideSobreImposto: p.incideSobreImposto, IncideSobreFrete: p.incideSobreFrete, LiberaSaldo: p.liberaSaldo } }),
    listarMovimentos: () => rodar('GET', '/Movement/GetMovement'),
    consultarPracasVpr: (ident) => rodar('GET', `/VPR/TollList/ByShippingIdentifier/${seg(ident)}`),

    retificarCiotAgregado: (p) => rodar('PATCH', '/Shipping/CIOTAggregate/ShippingRectification/', { corpo: { TransportOperationIdentifierCode: p.ciot, Vehicle: p.veiculos.map((v) => ({ CarLicensePlate: v.placa, RNTRC: v.rntrc })), QuantityRate: p.quantidade, PriceRate: p.preco }, versao: '3' }),
    cancelarCiotAgregado: (ciot, motivo) => (!ciot.trim() || !motivo.trim() ? invalido('Informe o CIOT e o motivo.') : rodar('POST', '/Shipping/CIOTAggregate/CancelCIOT/', { corpo: { TransportOperationIdentifierCode: ciot, Reason: motivo }, versao: '3' })),
    encerrarCiotAgregado: (ciot) => (!ciot.trim() ? invalido('Informe o CIOT.') : rodar('POST', '/Shipping/CIOTAggregate/ClosingCIOT/', { corpo: { TransportOperationIdentifierCode: ciot }, versao: '3.0' })),

    // D-F14: caminho "/PaymentAuthorization" (tabela do guia); o texto escreve "/Payment/Authorization".
    autorizarPagamento: (itens) =>
      itens.length && itens.every((i) => i.identifier.trim() && i.branchCode.trim() && !Number.isNaN(new Date(i.dataPagamento).getTime()))
        ? rodar('POST', '/PaymentAuthorization', { corpo: itens.map((i) => ({ ...(i.shippingId != null ? { ShippingId: i.shippingId } : {}), Identifier: i.identifier, Branch: 0, BranchCode: i.branchCode, PaymentDate: i.dataPagamento })) }, undefined, true) // dinheiro: timeout/5xx = INCERTO
        : invalido('Dados da autorização de pagamento incompletos.'),
    consultarAutorizacaoPorLote: (l) => rodar('GET', `/PaymentAuthorization/ByBatchId/${seg(l)}`),
    consultarAutorizacaoPorIdentificador: (i) => rodar('GET', `/PaymentAuthorization/ByIdentifier/${seg(i)}`),
    consultarAutorizacaoPorViagem: (id) => (idViagem(id) ? rodar('GET', `/PaymentAuthorization/ByShippingId/${idViagem(id)}`) : invalido('Código da viagem inválido.')),
    cancelarAutorizacao: (itens) => rodar('PATCH', '/PaymentAuthorization/Cancel', { corpo: itens.map((i) => ({ ...(i.shippingId != null ? { ShippingId: i.shippingId } : {}), Identifier: i.identifier, Branch: 0, BranchCode: i.branchCode })) }),
    // D-F12: caminho "/ShippingPayment" (tabela, download e cancelamento); o texto escreve "/Shipping/Payment".
    quitarViagem: (p) =>
      !idViagem(p.shippingId) || !p.branchCode.trim() || !p.documentos.length
        ? invalido('Dados da quitação incompletos.')
        : rodar('POST', '/ShippingPayment', { corpo: { BranchCode: p.branchCode, ShippingID: String(p.shippingId), ...(p.pesoDescarregado != null ? { TotalUnloadWeight: p.pesoDescarregado } : {}), Documents: p.documentos.map((d) => ({ Number: d.numero, Series: d.serie, BranchCode: d.branchCode, DocumentType: d.tipo, DocumentStatus: d.status })) } }, undefined, true), // dinheiro: timeout/5xx = INCERTO
    consultarQuitacao: (id) => (idViagem(id) ? rodar('GET', `/ShippingPayment/DownloadPaymentFile/${idViagem(id)}`) : invalido('Código da viagem inválido.')),
    cancelarQuitacao: (id) => (idViagem(id) ? rodar('PATCH', `/ShippingPayment/Cancel/${idViagem(id)}`) : invalido('Código da viagem inválido.')),

    consultarSaldoCliente(inicio, fim) {
      const dia = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
      if (!dia.test(inicio) || !dia.test(fim) || Number.isNaN(new Date(inicio).getTime()) || Number.isNaN(new Date(fim).getTime()) || inicio > fim) return invalido('Informe as datas no formato AAAA-MM-DD, início até o fim.')
      return rodar('GET', `/Balance/Financial/GetByDateInicialDateFinal/${inicio}/${fim}`, { relatorio: true }) // base do Relatório (Repom.Relatorio.WebAPI)
    },
    adiantarSaldoFrete: nao('adiantar saldo de frete', 'D-F11'),
    alterarDocumentoQuitacao: nao('alterar documento na quitação', 'D-F13'),
    consultarContratosPorStatus: nao('consulta por data e status (caminho truncado no guia)', 'D-F09'),
    listarOperacoes: nao('consulta de operações', 'D-F05'),
  }
}
