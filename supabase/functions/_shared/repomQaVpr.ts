// Ações FIXAS do vale-pedágio (conta 9501, API Repom.ValePedagio.WebAPI v2.0) dentro da função temporária repom-qa-teste.
// Sem Deno, sem rede própria (testes em repomQaVpr.test.ts). Só QA. Lista fechada: tag_vpr, emitir_vpo_vpr, consultar_vpo_vpr, cancelar_vpo_vpr.
// Segredos: SÓ os da 9501 (login/senha do token de viagem), lidos pela função e entregues ao cliente VPR. Nunca devolvidos, logados ou gravados.
// Os dados do prestador, do motorista e da placa são os MESMOS da rodada de 17/11: vêm só por LEITURA do contrato-modelo e dos cadastros de teste do 9520
// (nada é emitido nem alterado no Frete). Nenhum CPF/CNPJ fica gravado em código; a resposta e o registro mostram só os finais.
// REGRA: montar certo de primeira. O PRE-VOO valida localmente cada regra do manual ANTES de qualquer chamada que emite; se algo falhar, não envia.
import type { ClienteRepomFrete } from './repomFreteClient.ts'
import { conferirModelo, lerModeloContrato } from './repomQaAdiantamento.ts'
import { montarCorpoVale, normalizarPlaca, placaApta, type ClienteRepomVpr, type PedidoVale, type ResultadoVpr, type TagRepom, type ValeRepom } from './repomVprClient.ts'

export const ACOES_VPR = ['tag_vpr', 'rota_vpr', 'emitir_vpo_vpr', 'consultar_vpo_vpr', 'cancelar_vpo_vpr'] as const
export const MAX_ROTAS_VPR = 2
/** Código da rota no NOSSO sistema (até 10): a rota da 9501 em QA. O 1/143217 do contrato do Frete NÃO existe na 9501 ("Roteiro inativo ou não cadastrado para o cliente"). */
export const CODIGO_ROTA_CLIENTE_VPR = 'RBRQAV01'
export const IBGE_ORIGEM_ROTA = '3550308' // São Paulo/SP
export const IBGE_DESTINO_ROTA = '3304557' // Rio de Janeiro/RJ
export type AcaoVpr = (typeof ACOES_VPR)[number]
/** Conjuntos da planilha PRESTADOR OK ANTT liberados para o teste (lista fechada de placas; o documento do transportador vem no pedido e passa pelo PRE-VOO). */
export const CARRETA_DO_PAR_VPR: Record<string, string> = { FPU2C10: 'NPJ5072', EHX9J93: 'SUM8I91', QIB4852: 'QTL9584' }
export interface ParVpr { tracao: string; carreta?: string; documento: string }
/** Lê `par` do pedido: só tração da lista (com a carreta dela) e o documento (CPF/CNPJ válido). Devolve null se não houver; string se for inválido. */
export function lerParVpr(v: unknown): ParVpr | null | string {
  if (v == null) return null
  if (!ehObj(v)) return 'par inválido'
  const tracao = normalizarPlaca(String(v.tracao ?? '')); const documento = so(v.documento)
  const carreta = v.carreta ? normalizarPlaca(String(v.carreta)) : ''
  if (!(tracao in CARRETA_DO_PAR_VPR)) return 'tração fora da lista liberada'
  if (carreta !== CARRETA_DO_PAR_VPR[tracao]) return 'carreta não é a do par da lista'
  if (!(documento.length === 11 ? cpfValido(documento) : cnpjValido(documento))) return 'documento do transportador inválido'
  return { tracao, carreta, documento }
}
export const MAX_EMISSOES_VPR = 4 // 2 da rodada 1 (usadas, erro 0) + 2 da rodada 2 (liberadas pelo Pedro)
export const MAX_CANCELAMENTOS_VPR = 1
/** Contrato-modelo da rodada de 17/11 (só leitura): de onde vêm prestador, motorista, placa e roteiro. */
export const MODELO_SHIPPING_ID = 2166947
/** CNPJ da filial de emissão do QA do 9501 (informado pela Repom junto das credenciais; é a filial da RBR, não é segredo). */
export const CNPJ_FILIAL_VPR_QA = '69115969000104'
export const USUARIO_EMISSAO_VPR = 'RBR QA Homologacao'
/** A Repom já devolveu identificador truncado no Frete: o processo tem no máximo 16 caracteres (o manual aceita 20). */
export const MAX_PROCESSO = 16
export const PRAZO_CANCELAMENTO_HORAS = 3

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const fim4 = (v: string) => (v ? `***${v.slice(-4)}` : '')

// ---------- validações locais ----------
export function cpfValido(v: string): boolean {
  const d = so(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  for (const t of [9, 10]) {
    let s = 0
    for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i)
    if (((s * 10) % 11) % 10 !== Number(d[t])) return false
  }
  return true
}
export function cnpjValido(v: string): boolean {
  const d = so(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  for (const t of [12, 13]) {
    const pesos = t === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let s = 0
    for (let i = 0; i < t; i++) s += Number(d[i]) * pesos[i]
    const r = s % 11
    if ((r < 2 ? 0 : 11 - r) !== Number(d[t])) return false
  }
  return true
}
export const placaPadrao = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(p))

/** Código do processo: estável, único, até 16 caracteres, só letras e números. "RBV" + aammdd + hhmmss (UTC) = 15. */
export function novoProcessoVpr(agora: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `RBV${p2(agora.getUTCFullYear() % 100)}${p2(agora.getUTCMonth() + 1)}${p2(agora.getUTCDate())}${p2(agora.getUTCHours())}${p2(agora.getUTCMinutes())}${p2(agora.getUTCSeconds())}`
}

export interface RegraVpr { regra: string; ok: boolean; detalhe?: string }
/** Todas as regras do manual (4.3) conferidas no pedido que VAI para a Repom. Devolve a lista completa (ok ou não). */
export function conferirPreVoo(p: PedidoVale): RegraVpr[] {
  const corpo = montarCorpoVale(p) as Obj
  const r: RegraVpr[] = []
  const add = (regra: string, ok: boolean, detalhe?: string) => r.push({ regra, ok, ...(detalhe ? { detalhe } : {}) })
  add('processoCodigoCliente até 16 (manual: 20), só letras e números', !!p.processoCodigoCliente && p.processoCodigoCliente.length <= MAX_PROCESSO && /^[A-Za-z0-9]+$/.test(p.processoCodigoCliente), `${p.processoCodigoCliente?.length ?? 0} caracteres`)
  add('placa da tração no padrão (7)', placaPadrao(p.placa))
  add('numeroEixos da tração inteiro 1..15', Number.isInteger(p.numeroEixos) && p.numeroEixos >= 1 && p.numeroEixos <= 15, String(p.numeroEixos))
  if (p.carretaPlaca) {
    add('placa da carreta no padrão (7) e diferente da tração', placaPadrao(p.carretaPlaca) && normalizarPlaca(p.carretaPlaca) !== normalizarPlaca(p.placa))
    add('carretaNumeroEixos inteiro 1..15 (soma, se mais de uma carreta)', Number.isInteger(p.carretaNumeroEixos) && (p.carretaNumeroEixos as number) >= 1 && (p.carretaNumeroEixos as number) <= 15, String(p.carretaNumeroEixos))
  } else {
    add('sem carreta: CarretaPlaca "", CarretaNumeroEixos 0, UtilizaCarreta "false"', corpo.CarretaPlaca === '' && corpo.CarretaNumeroEixos === 0 && corpo.UtilizaCarreta === 'false')
  }
  add('nomeTransportador preenchido, até 100', !!p.nomeTransportador?.trim() && p.nomeTransportador.length <= 100, `${p.nomeTransportador?.length ?? 0} caracteres`)
  const dt = so(p.documentoTransportador)
  add('documentoTransportador é CPF ou CNPJ com dígito verificador válido', dt.length === 11 ? cpfValido(dt) : cnpjValido(dt), fim4(dt))
  add('documentoSubcontratado ausente (só se o transportador não tiver RNTRC na placa)', !p.documentoSubcontratado && corpo.DocumentoSubcontratado === '')
  add('nomeMotorista preenchido, até 50', !!p.nomeMotorista?.trim() && p.nomeMotorista.length <= 50, `${p.nomeMotorista?.length ?? 0} caracteres`)
  add('documentoMotorista é CPF de 11 dígitos válido', cpfValido(p.documentoMotorista), fim4(so(p.documentoMotorista)))
  add('cnpjFilial de 14 dígitos válido', cnpjValido(p.cnpjFilial), fim4(so(p.cnpjFilial)))
  add('usuarioEmissao preenchido, até 50', !!p.usuarioEmissao?.trim() && p.usuarioEmissao.length <= 50)
  add('roteiro (RoteiroCodigo e PercursoCodigo) inteiros > 0', !!p.roteiro && Number.isInteger(p.roteiro.roteiroCodigo) && p.roteiro.roteiroCodigo > 0 && Number.isInteger(p.roteiro.percursoCodigo) && p.roteiro.percursoCodigo > 0, p.roteiro ? `${p.roteiro.percursoCodigo}/${p.roteiro.roteiroCodigo}` : '')
  const cfg = (corpo.Configuracao ?? {}) as Obj
  add('configuracao com eixos suspensos inteiros (0 e 0)', Number.isInteger(cfg.EixosSuspensosIda) && Number.isInteger(cfg.EixosSuspensosVolta), `${cfg.EixosSuspensosIda}/${cfg.EixosSuspensosVolta}`)
  const dc = (corpo.documento as { documentoCodigo: string; serie?: string }[] | undefined) ?? []
  add('documento (CT-e do contrato-modelo): codigo até 100, serie até 10', dc.length === 1 && !!dc[0].documentoCodigo && dc[0].documentoCodigo.length <= 100 && (dc[0].serie ?? '').length <= 10, dc[0] ? `${dc[0].documentoCodigo.length}/${(dc[0].serie ?? '').length}` : 'ausente')
  add('Pracas é array VAZIO e NumeroCartao é vazio (como no Postman da Repom; praças só com roteirizador próprio)', Array.isArray(corpo.Pracas) && (corpo.Pracas as unknown[]).length === 0 && corpo.NumeroCartao === '')
  return r
}

/** Visão do pedido SEM dado pessoal: documentos só pelos finais, nomes só pelo primeiro nome. */
export function pedidoSanitizado(p: PedidoVale): Obj {
  const primeiro = (n: string) => `${String(n ?? '').trim().split(/\s+/)[0] ?? ''}…`
  return {
    processoCodigoCliente: p.processoCodigoCliente, placa: normalizarPlaca(p.placa), numeroEixos: p.numeroEixos,
    ...(p.carretaPlaca ? { carretaPlaca: normalizarPlaca(p.carretaPlaca), carretaNumeroEixos: p.carretaNumeroEixos, utilizaCarreta: true } : {}),
    nomeTransportador: primeiro(p.nomeTransportador), documentoTransportador: fim4(so(p.documentoTransportador)),
    nomeMotorista: primeiro(p.nomeMotorista), documentoMotorista: fim4(so(p.documentoMotorista)), cnpjFilial: fim4(so(p.cnpjFilial)),
    usuarioEmissao: p.usuarioEmissao, roteiro: p.roteiro ? { RoteiroCodigo: p.roteiro.roteiroCodigo, PercursoCodigo: p.roteiro.percursoCodigo } : null,
    configuracao: { EixosSuspensosIda: p.eixosSuspensosIda ?? 0, EixosSuspensosVolta: p.eixosSuspensosVolta ?? 0 },
  }
}

// ---------- leitura do Frete (SÓ leitura) para montar o pedido ----------
const pick = (o: Obj, ...nomes: string[]): unknown => {
  for (const n of nomes) { const k = Object.keys(o).find((x) => x.toLowerCase() === n.toLowerCase()); if (k && o[k] != null && o[k] !== '') return o[k] }
  return undefined
}
/** Primeiro objeto da resposta (aceita array, Result, Data). */
function primeiroObj(v: unknown, prof = 0): Obj | null {
  if (Array.isArray(v)) return v.map((x) => primeiroObj(x, prof + 1)).find(Boolean) ?? null
  if (!ehObj(v) || prof > 4) return null
  for (const k of ['Result', 'Data', 'Hired', 'Driver', 'Vehicle']) { const i = pick(v, k); if (i != null) { const d = primeiroObj(i, prof + 1); if (d) return d } }
  return v
}
const NOMES = ['Name', 'FullName', 'HiredName', 'DriverName', 'CorporateName', 'LegalName', 'Nome']
/** Procura o primeiro campo de nome (Name, ...) no objeto, descendo até 4 níveis (o motorista traz DriverPersonalInformation.Name). */
function acharNome(v: unknown, prof = 0): string {
  if (Array.isArray(v)) { for (const x of v) { const n = acharNome(x, prof + 1); if (n) return n } return '' }
  if (!ehObj(v) || prof > 4) return ''
  const n = pick(v, ...NOMES)
  if (typeof n === 'string' && n.trim()) return n.trim().replace(/\s+/g, ' ')
  for (const x of Object.values(v)) { if (ehObj(x) || Array.isArray(x)) { const r = acharNome(x, prof + 1); if (r) return r } }
  return ''
}
export const lerNome = (dados: unknown): string => acharNome(primeiroObj(dados))
/** Dono do veículo no cadastro (VehicleOwner): documento e nome. O cadastro de prestador por documento devolve 404 no QA; o dono do veículo é o prestador com RNTRC. */
export function lerDonoVeiculo(dados: unknown): { doc: string; nome: string } {
  const o = primeiroObj(dados)
  const dono = o ? pick(o, 'VehicleOwner') : undefined
  return ehObj(dono) ? { doc: so(pick(dono, 'NationalId')), nome: acharNome(dono) } : { doc: '', nome: '' }
}
export function lerEixosVeiculo(dados: unknown): number | null {
  const o = primeiroObj(dados)
  const n = Number(String(o ? pick(o, 'VehicleAxles', 'Axles', 'AxlesNumber', 'AxleNumber') : '').match(/\d+/)?.[0])
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : null
}

/** Só os NOMES dos campos (nunca valores), para entender uma resposta de leitura que não trouxe o que o pedido precisa. */
export function formaDaResposta(v: unknown, prof = 0): unknown {
  if (Array.isArray(v)) return v.length ? [formaDaResposta(v[0], prof + 1)] : []
  if (!ehObj(v)) return typeof v
  if (prof > 3) return '{…}'
  return Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, formaDaResposta(x, prof + 1)]))
}

export interface DepsVpr {
  ligado: boolean
  frete: Pick<ClienteRepomFrete, 'consultarContratoPorViagem' | 'consultarContratadoPorDocumento' | 'consultarMotorista' | 'consultarVeiculo'>
  vpr: ClienteRepomVpr // consulta por GET
  vprPost: ClienteRepomVpr // mesmo vale, consulta por POST (verbo do manual); só usado se o GET não for aceito
  agora(): Date
  /** Quantas linhas de cada ação já foram registradas (qualquer status que tenha ido à Repom). */
  historico(acao: 'emitir' | 'cancelar' | 'rota'): Promise<string[]>
  /** Rota da 9501 já criada/confirmada (gravada em repom_requisicoes), ou null. */
  rotaVpr(): Promise<{ roteiroCodigo: number; percursoCodigo: number } | null>
  /** Última emissão registrada (processo e codigoViagem), ou a de um processo dado. */
  emissao(processo?: string): Promise<{ processo: string; codigoViagem: string | null } | null>
  registrar(acao: string, request: unknown): Promise<string | null>
  concluir(id: string | null, r: { status: 'ok' | 'erro' | 'bloqueado'; http: number | null; resposta: unknown; erro?: string }): Promise<void>
}
export type SaidaQa = { status: number; corpo: Obj }

const dataDe = (b: unknown, k: string): string | null => { const v = ehObj(b) ? b[k] : null; return typeof v === 'string' && v && !v.startsWith('0001') ? v : null }
function valeSeguro(v: ValeRepom, bruto: unknown): Obj {
  return {
    codigoViagem: v.codigoViagem, codigoViagemRepom: v.codigoViagemRepom, idvpoAntt: v.idvpo, idvpoAnttDigitos: v.idvpo ? v.idvpo.length : 0,
    valor: v.valor, tag: v.tag, statusCarga: v.statusCarga, viagemAtiva: v.viagemAtiva, tipoEmissao: v.tipoEmissao, pracas: v.pracas.length,
    dataEmissao: dataDe(bruto, 'dataEmissao'), dataCancelamento: dataDe(bruto, 'dataCancelamento'),
  }
}
const tagSegura = (t: TagRepom): Obj => ({ nomeTag: t.nomeTag, numeroTag: t.numeroTag ? fim4(t.numeroTag) : null, codigoStatusTag: t.codigoStatusTag, statusTag: t.statusTag, apto: t.apto, observacao: t.observacao })

type PreVoo = { ok: true; pedido: PedidoVale; regras: RegraVpr[]; tracao: string } | { ok: false; erro: string; regras?: RegraVpr[]; forma?: unknown }

/** Lê (só leitura) e monta o pedido do vale com os mesmos dados do 17/11, e roda o PRE-VOO. Nada é enviado à conta 9501 aqui. */
export async function montarPreVoo(d: DepsVpr, rotaFixa?: { roteiroCodigo: number; percursoCodigo: number }, par?: ParVpr): Promise<PreVoo> {
  const rota = rotaFixa ?? (await d.rotaVpr())
  if (!rota) return { ok: false, erro: 'A rota da 9501 ainda não existe: rode rota_vpr antes (o 1/143217 do Frete não vale na 9501).' }
  const lm = await d.frete.consultarContratoPorViagem(MODELO_SHIPPING_ID)
  if (!lm.ok) return { ok: false, erro: 'Não consegui ler o contrato-modelo do QA (só leitura).' }
  const m = lerModeloContrato(lm.dados)
  if ('erro' in m) return { ok: false, erro: m.erro }
  const conf = conferirModelo(m.modelo)
  if (conf) return { ok: false, erro: conf }
  const mod = m.modelo
  // com `par` (planilha ANTT): tração + carreta e documento do transportador do par; motorista, CT-e e filial continuam os do modelo
  const placas = par ? [par.tracao, par.carreta].filter((x): x is string => !!x) : mod.placas
  const docTransp = par ? par.documento : mod.hiredNationalId
  const principal = mod.motoristas.find((x) => x.principal) ?? mod.motoristas[0]
  const [ctd, mot, ...veis] = await Promise.all([d.frete.consultarContratadoPorDocumento(docTransp), d.frete.consultarMotorista(principal.cpf), ...placas.slice(0, 2).map((p) => d.frete.consultarVeiculo(p))])
  const dono = veis[0]?.ok ? lerDonoVeiculo(veis[0].dados) : { doc: '', nome: '' }
  const nomeT = (ctd.ok ? lerNome(ctd.dados) : '') || (dono.doc === so(docTransp) ? dono.nome : '')
  const nomeM = mot.ok ? lerNome(mot.dados) : ''
  if (!nomeT) return { ok: false, erro: 'Não li o nome do prestador no cadastro de teste (só leitura).', forma: { http: ctd.http, resposta: ctd.ok ? formaDaResposta(ctd.dados) : null, contrato_modelo: formaDaResposta(lm.dados), motorista_http: mot.http, motorista: mot.ok ? formaDaResposta(mot.dados) : null, veiculo: veis[0]?.ok ? formaDaResposta(veis[0].dados) : null } }
  if (!nomeM) return { ok: false, erro: 'Não li o nome do motorista no cadastro de teste (só leitura).', forma: { http: mot.http, resposta: mot.ok ? formaDaResposta(mot.dados) : null } }
  const eixos = veis.map((v) => (v.ok ? lerEixosVeiculo(v.dados) : null))
  if (eixos[0] == null) return { ok: false, erro: 'Não li os eixos da tração no cadastro do veículo (só leitura).', forma: { http: veis[0]?.http, resposta: veis[0]?.ok ? formaDaResposta(veis[0].dados) : null } }
  const comCarreta = placas.length > 1
  if (comCarreta && eixos[1] == null) return { ok: false, erro: 'Não li os eixos da carreta no cadastro do veículo (só leitura).', forma: { http: veis[1]?.http, resposta: veis[1]?.ok ? formaDaResposta(veis[1].dados) : null } }
  const pedido: PedidoVale = {
    processoCodigoCliente: novoProcessoVpr(d.agora()),
    placa: normalizarPlaca(placas[0]), numeroEixos: eixos[0],
    ...(comCarreta ? { carretaPlaca: normalizarPlaca(placas[1]), carretaNumeroEixos: eixos[1] as number } : {}),
    nomeTransportador: nomeT, documentoTransportador: docTransp,
    nomeMotorista: nomeM, documentoMotorista: principal.cpf, cnpjFilial: CNPJ_FILIAL_VPR_QA, usuarioEmissao: USUARIO_EMISSAO_VPR,
    roteiro: rota, documentos: [{ codigo: mod.documento.numero, serie: mod.documento.serie }], eixosSuspensosIda: 0, eixosSuspensosVolta: 0,
  }
  const regras = conferirPreVoo(pedido)
  const falhas = regras.filter((x) => !x.ok)
  if (falhas.length) return { ok: false, erro: `PRE-VOO reprovou: ${falhas.map((x) => x.regra).join('; ')}.`, regras }
  return { ok: true, pedido, regras, tracao: pedido.placa }
}

export async function executarQaVpr(corpo: Obj, d: DepsVpr): Promise<SaidaQa> {
  const acao = String(corpo.acao ?? '') as AcaoVpr
  if (!(ACOES_VPR as readonly string[]).includes(acao)) return { status: 400, corpo: { ok: false, erro: `Ação inválida. Use: ${ACOES_VPR.join(', ')}.` } }
  if (!d.ligado) return { status: 503, corpo: { ok: false, desligado: true, erro: 'desligado' } }
  const parar = (erro: string, status = 422, extra: Obj = {}): SaidaQa => ({ status, corpo: { ok: false, parou: true, erro, ...extra } })
  const nome = String((corpo.confirmacao as Obj | undefined)?.nome ?? '').trim()

  // ---------- ROTA da 9501 (roteirização, token PRÓPRIO client_credentials) ----------
  if (acao === 'rota_vpr') {
    if (nome.length < 3) return parar('A rota exige confirmacao.nome.', 400)
    const pv0 = await montarPreVoo(d, { roteiroCodigo: 1, percursoCodigo: 1 }) // só para ler os eixos do conjunto; nada é enviado
    if (!pv0.ok) return parar(pv0.erro, 422)
    const eixos = pv0.pedido.numeroEixos + (pv0.pedido.carretaNumeroEixos ?? 0)
    const id = await d.registrar('qa-teste-vpr-rota', { codigoRoteiroCliente: CODIGO_ROTA_CLIENTE_VPR, ibgeOrigem: IBGE_ORIGEM_ROTA, ibgeDestino: IBGE_DESTINO_ROTA, eixos, confirmado_por: nome.slice(0, 80) })
    let criada = false
    let cons = await d.vpr.consultarRota(CODIGO_ROTA_CLIENTE_VPR)
    let cod: { roteiroCodigo: number; percursoCodigo: number } | null = cons.ok && cons.dados ? { roteiroCodigo: Number(cons.dados.codigoRoteiro), percursoCodigo: Number(cons.dados.codigoPercurso) } : null
    if (!cons.ok) { await d.concluir(id, { status: 'erro', http: cons.http, resposta: null, erro: cons.erro }); return parar(`Consulta da rota na 9501 falhou: ${cons.erro}`, cons.http === 0 ? 502 : 422, { http: cons.http }) }
    if (!cod) {
      if ((await d.historico('rota')).length >= MAX_ROTAS_VPR + 1) { await d.concluir(id, { status: 'bloqueado', http: null, resposta: null, erro: 'limite' }); return parar(`Limite de ${MAX_ROTAS_VPR} criações de rota atingido.`, 429) }
      const c = await d.vpr.criarRota({ codigoRoteiroCliente: CODIGO_ROTA_CLIENTE_VPR, origem: { ibge: IBGE_ORIGEM_ROTA, uf: 'SP' }, destino: { ibge: IBGE_DESTINO_ROTA, uf: 'RJ' }, idaVolta: false, tipoRota: 'mais_rapida', tipoVeiculo: 2 })
      if (!c.ok) { await d.concluir(id, { status: 'erro', http: c.http, resposta: { numeroErro: c.numeroErro ?? null }, erro: c.erro }); return parar(`A Repom não criou a rota na 9501: ${c.erro}`, c.http === 0 ? 502 : 422, { http: c.http, numeroErro: c.numeroErro ?? null }) }
      criada = true
      cod = { roteiroCodigo: Number(c.dados.codigoRoteiroRepom), percursoCodigo: Number(c.dados.codigoPercursoRepom) }
    }
    if (!Number.isInteger(cod.roteiroCodigo) || !Number.isInteger(cod.percursoCodigo) || cod.roteiroCodigo <= 0 || cod.percursoCodigo <= 0) { await d.concluir(id, { status: 'erro', http: null, resposta: null, erro: 'códigos inválidos' }); return parar('A Repom devolveu códigos de rota inválidos.', 422) }
    const ped = await d.vpr.consultarPedagio({ codigoRoteiro: String(cod.roteiroCodigo), codigoPercurso: String(cod.percursoCodigo), eixos })
    const resposta = { roteiroCodigo: cod.roteiroCodigo, percursoCodigo: cod.percursoCodigo, criada, eixos, valorTotal: ped.ok ? ped.dados.valorTotal : null, pedagioHttp: ped.http, pedagioErro: ped.ok ? null : ped.erro }
    await d.concluir(id, { status: 'ok', http: ped.http, resposta })
    return { status: 200, corpo: { ok: true, rota: resposta } }
  }

  const par = lerParVpr(corpo.par)
  if (typeof par === 'string') return parar(par, 400)

  // ---------- TAG (e PRE-VOO sem enviar) ----------
  if (acao === 'tag_vpr') {
    const pv = await montarPreVoo(d, undefined, par ?? undefined)
    if (!pv.ok) return parar(pv.erro, 422, { pre_voo: { aprovado: false, regras: pv.regras ?? [] }, forma_da_leitura: pv.forma ?? null })
    const id = await d.registrar('qa-teste-vpr-tag', { placa: pv.tracao })
    const t = await d.vpr.consultarTag(pv.pedido.placa)
    await d.concluir(id, { status: t.ok ? 'ok' : 'erro', http: t.http, resposta: t.ok ? { tags: t.dados.length, apta: placaApta(t.dados) } : null, erro: t.ok ? undefined : t.erro })
    if (!t.ok) return parar(`Consulta de TAG falhou: ${t.erro}`, t.http === 0 ? 502 : 422, { http: t.http })
    const apta = placaApta(t.dados)
    return { status: 200, corpo: { ok: true, http: t.http, placa: pv.tracao, apta_para_vale: apta, tags: t.dados.map(tagSegura), pre_voo: { aprovado: true, regras: pv.regras, pedido: pedidoSanitizado(pv.pedido) } } }
  }

  // ---------- EMISSÃO (uma vez) ----------
  if (acao === 'emitir_vpo_vpr') {
    if (nome.length < 3) return parar('A emissão exige confirmacao.nome.', 400)
    const hist = await d.historico('emitir')
    if (hist.length >= MAX_EMISSOES_VPR) return parar(`Limite de ${MAX_EMISSOES_VPR} emissões do vale nesta função atingido.`, 429)
    const pv = await montarPreVoo(d, undefined, par ?? undefined)
    if (!pv.ok) return parar(pv.erro, 422, { pre_voo: { aprovado: false, regras: pv.regras ?? [] }, forma_da_leitura: pv.forma ?? null })
    const t = await d.vpr.consultarTag(pv.pedido.placa)
    if (!t.ok) return parar(`Consulta de TAG falhou antes de emitir: ${t.erro}. Nada foi emitido.`, t.http === 0 ? 502 : 422)
    if (!placaApta(t.dados)) return parar('A placa não está com TAG ativa (codigoStatusTag 1) e apta (Sim). Nada foi emitido.', 422, { tags: t.dados.map(tagSegura) })
    const sanit = pedidoSanitizado(pv.pedido)
    const id = await d.registrar('qa-teste-vpr-emitir', { processo: pv.pedido.processoCodigoCliente, confirmado_por: nome.slice(0, 80), pedido: sanit })
    const r = await d.vpr.emitirVale(pv.pedido) // UMA tentativa; sem repetição, nem em timeout/5xx
    if (r.ok) {
      const seguro = valeSeguro(r.dados, r.bruto)
      await d.concluir(id, { status: 'ok', http: r.http, resposta: { processo: pv.pedido.processoCodigoCliente, ...seguro } })
      return { status: 200, corpo: { ok: true, http: r.http, processo: pv.pedido.processoCodigoCliente, pre_voo: { aprovado: true, regras: pv.regras, pedido: sanit }, vale: seguro } }
    }
    await d.concluir(id, { status: 'erro', http: r.http, resposta: { processo: pv.pedido.processoCodigoCliente, incerto: r.incerto === true, numeroErro: r.numeroErro ?? null }, erro: r.erro })
    return parar(r.incerto ? 'Resposta incerta (tempo esgotado ou erro de rede). NÃO reenviei: a API não tem consulta por processo; confira no portal (Viagens) pelo processo.' : `A Repom recusou a emissão: ${r.erro}`, r.incerto ? 202 : 422, {
      http: r.http, numeroErro: r.numeroErro ?? null, processo: pv.pedido.processoCodigoCliente, incerto: r.incerto === true, pre_voo: { aprovado: true, regras: pv.regras, pedido: sanit },
    })
  }

  // ---------- CONSULTA (por código ou por processo) ----------
  if (acao === 'consultar_vpo_vpr') {
    const por = String(corpo.por ?? 'codigo') === 'processo' ? 'processo' : 'codigo'
    const e0 = await d.emissao()
    const e = por === 'processo' && e0 ? await d.emissao(e0.processo) : e0
    if (!e || !e.codigoViagem) return parar('Não há emissão do vale registrada com codigoViagem (a API não consulta por processo; sem o código não há o que consultar).', 404)
    const id = await d.registrar('qa-teste-vpr-consultar', { por, processo: e.processo })
    let verbo: 'GET' | 'POST' = 'GET'
    let r: ResultadoVpr<ValeRepom> = por === 'processo' ? await d.vpr.consultarValePorProcesso(e.processo) : await d.vpr.consultarVale(e.codigoViagem)
    // o manual diz POST; o curl dele é um GET sem corpo. Só se o GET não for aceito (405/404/400 sem erro de negócio) tenta o POST do manual, uma vez.
    if (por === 'codigo' && !r.ok && [400, 404, 405].includes(r.http) && !r.numeroErro) { verbo = 'POST'; r = await d.vprPost.consultarVale(e.codigoViagem) }
    await d.concluir(id, { status: r.ok ? 'ok' : 'erro', http: r.http, resposta: r.ok ? { verbo, ...valeSeguro(r.dados, r.bruto) } : { verbo, numeroErro: r.numeroErro ?? null }, erro: r.ok ? undefined : r.erro })
    if (!r.ok) return parar(`Consulta recusada: ${r.erro}`, 422, { http: r.http, verbo, numeroErro: r.numeroErro ?? null })
    return { status: 200, corpo: { ok: true, http: r.http, verbo_que_funcionou: verbo, por, processo: e.processo, vale: valeSeguro(r.dados, r.bruto) } }
  }

  // ---------- CANCELAMENTO (uma vez) ----------
  if (nome.length < 3) return parar('O cancelamento exige confirmacao.nome.', 400)
  if ((await d.historico('cancelar')).length >= MAX_CANCELAMENTOS_VPR) return parar('O vale de teste já teve o cancelamento pedido; não repito.', 429)
  const e = await d.emissao()
  if (!e || !e.codigoViagem) return parar('Não há vale emitido (com codigoViagem) para cancelar.', 404)
  const id = await d.registrar('qa-teste-vpr-cancelar', { processo: e.processo, confirmado_por: nome.slice(0, 80) })
  const c = await d.vpr.cancelarVale(e.codigoViagem, USUARIO_EMISSAO_VPR)
  const jaCancelado = !c.ok && c.numeroErro === '325'
  await d.concluir(id, { status: c.ok || jaCancelado ? 'ok' : 'erro', http: c.http, resposta: { cancelado: c.ok || jaCancelado, numeroErro: c.ok ? null : c.numeroErro ?? null, motivo: c.ok ? null : c.erro }, erro: c.ok || jaCancelado ? undefined : c.erro })
  if (!c.ok && !jaCancelado) return parar(`Cancelamento recusado: ${c.erro}`, c.incerto ? 202 : 422, { http: c.http, numeroErro: c.numeroErro ?? null, prazo_padrao_horas: PRAZO_CANCELAMENTO_HORAS })
  return { status: 200, corpo: { ok: true, http: c.http, cancelado: true, ja_estava_cancelado: jaCancelado, processo: e.processo } }
}
