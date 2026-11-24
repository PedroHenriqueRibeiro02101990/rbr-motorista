// Teste de saldo com adiantamento (QA, 24/11/2026): monta um contrato NOVO a partir do contrato-modelo 2166947 (já aceito pela Repom em 17/11),
// com adiantamento de R$ 10,00. Sem Deno, sem rede (testes em repomQaAdiantamento.test.ts). Nenhum CPF/CNPJ fica gravado neste arquivo:
// o prestador, o motorista, a placa, a rota e o destinatário vêm da consulta ao contrato-modelo e são conferidos só pelos FINAIS.
import type { PedidoContratoFrete, TipoDocumentoFrete } from './repomFreteClient.ts'

export const PREFIXO_IDENTIFIER = 'RBRQA'
export const FRETE_TOTAL = 3500 // acima do piso da ANTT (no CPN1377: R$ 1.000 rejeitada, R$ 3.500 aceita)
export const ADIANTAMENTO = 10
export const SEST_PF = 10.5 // 1,5% de 20% do frete (3.500 x 20% = 700; 1,5% = 10,50): suposição de cálculo; a Repom diz se a base está certa
export const PISO = { distanceTravel: 300, emptyReturn: true, highPerformanceTransport: false, veichleComposition: false } as const
export const FINAIS_MODELO = { prestadorCpf: '4687', motoristaCpf: '2853', placa: 'BIS4025' } as const
export const MAX_TENTATIVAS_EMISSAO = 2
/** IBGE da rota de teste de 17/11 (a consulta da rota por código não devolve IBGE: o Swagger só traz Name/Distance/RoundTrip). Exigidos pela Repom na emissão (725). */
export const IBGE_ORIGEM = '3550308' // São Paulo/SP
export const IBGE_DESTINO = '3304557' // Rio de Janeiro/RJ

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const pick = (o: Obj, ...nomes: string[]): unknown => {
  for (const n of nomes) { const k = Object.keys(o).find((x) => x.toLowerCase() === n.toLowerCase()); if (k && o[k] != null && o[k] !== '') return o[k] }
  return undefined
}
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export interface ModeloContrato {
  status: string | null
  hiredNationalId: string
  operationIdentifier: string
  cardNumber: number
  traceCode: number
  routeCode: number
  branchCode: string
  ncm: string
  pesoCarga: number
  valorCarga: number
  motoristas: { cpf: string; principal: boolean }[]
  placas: string[]
  destinatario: { documento: string; nome: string; tipo: 'Person' | 'Company' }
  documento: { tipo: TipoDocumentoFrete; serie: string; numero: string; chave: string; branchCode: string }
  tipoLocal: 'Branch' | 'GasStation' | 'DigitalPayment' | 'Hired'
}

/** Lê o contrato-modelo (resposta do GET /Shipping/ByShipping). Devolve { erro } com o que faltou, para PARAR sem emitir. */
export function lerModeloContrato(dados: unknown): { modelo: ModeloContrato } | { erro: string } {
  const o = Array.isArray(dados) ? (ehObj(dados[0]) ? dados[0] : null) : ehObj(dados) ? dados : null
  if (!o) return { erro: 'Resposta do contrato-modelo em formato inesperado.' }
  const faltas: string[] = []
  const hired = so(pick(o, 'HiredNationalId'))
  const trace = num(pick(o, 'BrazilianRouteTraceCode'))
  const rota = num(pick(o, 'BrazilianRouteRouteCode'))
  const branch = String(pick(o, 'BranchCode') ?? '')
  const ncm4 = so(pick(o, 'LoadBrazilianNCM')).slice(0, 4)
  const drivers = (Array.isArray(pick(o, 'Drivers')) ? (pick(o, 'Drivers') as unknown[]) : []).filter(ehObj).map((d) => ({ cpf: so(pick(d, 'NationalId')), principal: pick(d, 'Main') === true }))
  const plates = (Array.isArray(pick(o, 'Vehicles')) ? (pick(o, 'Vehicles') as unknown[]) : []).filter(ehObj).map((v) => String(pick(v, 'LicensePlate') ?? '').toUpperCase()).filter(Boolean)
  const doc0 = (Array.isArray(pick(o, 'Documents')) ? (pick(o, 'Documents') as unknown[]) : []).filter(ehObj)[0]
  const rec = ehObj(pick(o, 'ShippingReceiver')) ? (pick(o, 'ShippingReceiver') as Obj) : null
  const pag = ehObj(pick(o, 'ShippingPayment')) ? (pick(o, 'ShippingPayment') as Obj) : null
  if (![11, 14].includes(hired.length)) faltas.push('prestador')
  if (trace == null || rota == null) faltas.push('rota (percurso/roteiro)')
  if (!branch) faltas.push('filial')
  if (ncm4.length !== 4) faltas.push('NCM de 4 dígitos')
  if (drivers.length === 0) faltas.push('motorista')
  if (plates.length === 0) faltas.push('placa')
  if (!doc0 || so(pick(doc0, 'EletronicKey')).length !== 44) faltas.push('documento CT-e com chave de 44 dígitos')
  if (!rec || ![11, 14].includes(so(pick(rec, 'NationalId')).length) || !String(pick(rec, 'Name') ?? '').trim()) faltas.push('destinatário')
  if (faltas.length) return { erro: `O contrato-modelo não traz: ${faltas.join(', ')}.` }
  const tipoRec = String(pick(rec!, 'ReceiverType') ?? '')
  const loc = String(pick(pag ?? {}, 'ExpectedDeliveryLocationType') ?? 'Branch')
  const tipoDoc = String(pick(doc0!, 'DocumentType') ?? '')
  return {
    modelo: {
      status: typeof pick(o, 'Status') === 'string' ? (pick(o, 'Status') as string) : null,
      hiredNationalId: hired,
      operationIdentifier: String(pick(o, 'OperationIdentifier') ?? ''),
      cardNumber: num(pick(o, 'CardNumber')) ?? 0,
      traceCode: trace!,
      routeCode: rota!,
      branchCode: branch,
      ncm: ncm4,
      pesoCarga: num(pick(o, 'TotalLoadWeight')) ?? 1000,
      valorCarga: num(pick(o, 'TotalLoadValue')) ?? 10000,
      motoristas: drivers.map((d, i) => ({ cpf: d.cpf, principal: drivers.some((x) => x.principal) ? d.principal : i === 0 })),
      placas: plates,
      destinatario: { documento: so(pick(rec!, 'NationalId')), nome: String(pick(rec!, 'Name')).trim(), tipo: /person|1/i.test(tipoRec) && !/company/i.test(tipoRec) ? 'Person' : 'Company' },
      documento: { tipo: (/cte|ct-e/i.test(tipoDoc) ? 'CTE' : (tipoDoc as TipoDocumentoFrete)), serie: String(pick(doc0!, 'Series') ?? '1'), numero: String(pick(doc0!, 'Number') ?? ''), chave: so(pick(doc0!, 'EletronicKey')), branchCode: String(pick(doc0!, 'BranchCode') ?? branch) },
      tipoLocal: (['Branch', 'GasStation', 'DigitalPayment', 'Hired'].includes(loc) ? loc : 'Branch') as ModeloContrato['tipoLocal'],
    },
  }
}

/** Confere se o modelo é mesmo o prestador/motorista/veículo da rodada de 17/11 (só pelos FINAIS dos documentos e pela placa). */
export function conferirModelo(m: ModeloContrato): string | null {
  if (!m.hiredNationalId.endsWith(FINAIS_MODELO.prestadorCpf) || m.hiredNationalId.length !== 11) return 'O prestador do contrato-modelo não é o da rodada de 17/11 (pessoa física).'
  if (!m.motoristas.some((d) => d.cpf.endsWith(FINAIS_MODELO.motoristaCpf))) return 'O motorista do contrato-modelo não é o da rodada de 17/11.'
  if (!m.placas.includes(FINAIS_MODELO.placa)) return 'A placa do contrato-modelo não é a da rodada de 17/11.'
  // CardNumber do modelo não é conferido: o GET devolve o cartão da conta digital já criado; a emissão do teste SEMPRE envia CardNumber 0 (viagem digital).
  if (m.documento.tipo !== 'CTE') return 'O documento do contrato-modelo não é um CT-e.'
  return null
}

const pad = (n: number, t: number) => String(n).padStart(t, '0')
/** Dígito verificador da chave de acesso (módulo 11, pesos 2..9 da direita para a esquerda). */
export function dvChaveAcesso(base43: string): number {
  let soma = 0
  let peso = 2
  for (let i = base43.length - 1; i >= 0; i--) { soma += Number(base43[i]) * peso; peso = peso === 9 ? 2 : peso + 1 }
  const r = soma % 11
  return r < 2 ? 0 : 11 - r
}
export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave) && dvChaveAcesso(chave.slice(0, 43)) === Number(chave[43])
}
/** CT-e NOVO (número e código aleatório novos) com a UF/CNPJ/modelo/série do CT-e do modelo, AAMM de agora e DV correto. */
export function novaChaveCte(modelo: ModeloContrato['documento'], agora: Date, aleatorio: () => number = Math.random) {
  const c = modelo.chave
  const aamm = pad(agora.getUTCFullYear() % 100, 2) + pad(agora.getUTCMonth() + 1, 2)
  const numero = pad(1 + Math.floor(aleatorio() * 899_999_998), 9)
  const cct = pad(Math.floor(aleatorio() * 99_999_999), 8)
  const base43 = c.slice(0, 2) + aamm + c.slice(6, 20) + c.slice(20, 22) + c.slice(22, 25) + numero + '1' + cct
  const chave = base43 + String(dvChaveAcesso(base43))
  return { chave, serie: String(Number(c.slice(22, 25))), numero: String(Number(numero)) }
}

export function novoIdentifier(agora: Date): string {
  return `${PREFIXO_IDENTIFIER}${pad(agora.getUTCFullYear() % 100, 2)}${pad(agora.getUTCMonth() + 1, 2)}${pad(agora.getUTCDate(), 2)}${pad(agora.getUTCHours(), 2)}${pad(agora.getUTCMinutes(), 2)}${pad(agora.getUTCSeconds(), 2)}`
}

export interface TipoCarga { id: number; descricao: string }
export function lerTiposCarga(dados: unknown): TipoCarga[] {
  const lista: unknown[] = Array.isArray(dados) ? dados : ehObj(dados) ? Object.values(dados).flatMap((x) => (Array.isArray(x) ? x : [])) : []
  return lista.filter(ehObj).map((o) => ({ id: Number(pick(o, 'CodeType', 'Id', 'Code', 'Codigo', 'Value')), descricao: String(pick(o, 'Description', 'Descricao', 'Name', 'Nome') ?? '') })).filter((t) => Number.isInteger(t.id) && t.descricao)
}
/** "Carga geral" é o tipo usado no contrato de teste; se a lista não trouxer esse texto, PARA (não adivinha). */
export function escolherCargaGeral(tipos: TipoCarga[]): TipoCarga | null {
  return tipos.find((t) => /carga\s+geral|general\s+cargo/i.test(t.descricao)) ?? null
}

export function montarPedidoAdiantamento(m: ModeloContrato, agora: Date, anttCodeType: number, aleatorio: () => number = Math.random, opcoes: { distanciaKm?: number | null } = {}): { pedido: PedidoContratoFrete; documentoNovo: { serie: string; numero: string } } {
  const distancia = opcoes.distanciaKm && opcoes.distanciaKm > 0 ? Math.round(opcoes.distanciaKm) : PISO.distanceTravel
  const k = novaChaveCte(m.documento, agora, aleatorio)
  const identifier = novoIdentifier(agora)
  const dia = (n: number) => new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + n, 12, 0, 0)).toISOString()
  const operacao = (`QA${pad(agora.getUTCHours(), 2)}${pad(agora.getUTCMinutes(), 2)}${pad(agora.getUTCSeconds(), 2)}`).slice(0, 10)
  return {
    documentoNovo: { serie: k.serie, numero: k.numero },
    pedido: {
      identifier,
      hiredNationalId: m.hiredNationalId,
      operationIdentifier: operacao,
      cardNumber: 0, // conta digital (viagem digital)
      routeTraceCode: m.traceCode,
      routeRouteCode: m.routeCode,
      issueDate: agora.toISOString(),
      totalFreightValue: FRETE_TOTAL,
      totalLoadWeight: m.pesoCarga,
      totalLoadValue: m.valorCarga,
      advanceMoneyValue: ADIANTAMENTO,
      branchCode: m.branchCode,
      ncm: m.ncm, // 4 caracteres
      anttCodeType,
      distanciaKm: distancia,
      ibgeOrigem: IBGE_ORIGEM,
      ibgeDestino: IBGE_DESTINO,
      vpr: { issue: false, oneWay: true, suspendedAxles: 0, returnSuspendedAxles: 0 },
      entrega: { esperadaEm: dia(2), tipoLocal: m.tipoLocal },
      motoristas: m.motoristas,
      documentos: [{ tipo: 'CTE', serie: k.serie, numero: k.numero, chave: k.chave, branchCode: m.documento.branchCode }], // sem CheckDocument e sem DeliveryLocationType
      placas: m.placas,
      destinatario: m.destinatario,
      impostos: [{ tipo: 'SEST', valor: SEST_PF }], // prestador pessoa física
      pisoFrete: { ...PISO, distanceTravel: distancia },
    },
  }
}

export type FalhaEmissao = 'saldo' | '2768' | 'outro'
/** "Saldo Insuficiente" = o crédito não está na conta; 2768 = ControleSaldo (pendência externa); o resto NÃO responde sobre o saldo. */
export function classificarFalhaEmissao(textos: string[], codigo?: string | null): FalhaEmissao {
  const t = textos.join(' | ')
  if (codigo === '2768' || /\b2768\b/.test(t)) return '2768'
  if (/saldo\s+insuficiente|insufficient/i.test(t)) return 'saldo'
  return 'outro'
}
