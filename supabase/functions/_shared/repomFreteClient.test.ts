// node --test supabase/functions/_shared/repomFreteClient.test.ts   (sem rede: tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fetch } from './repomClient.ts'
import { criarRepomFreteClient, lerErroFrete, lerOperationKey, montarCorpoContrato, RepomFreteNaoImplementado, situacaoProcessamento, validarContratoFrete, type ConfigRepomFrete, type PedidoContratoFrete } from './repomFreteClient.ts'

const cfg: ConfigRepomFrete = { ambiente: 'qa', credenciais: { user: 'USER_9520_SECRETO', version: '3.0', password: 'SENHA_9520_SECRETA', partner: '00000000000100' }, urlToken: 'https://exemplo.invalid/token' }
type Chamada = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }
function mock(resp: (c: Chamada, n: number) => { status: number; corpo: unknown } | 'timeout') {
  const chamadas: Chamada[] = []
  const fetchFn: Fetch = async (url, init) => {
    const c = { url, init: init ?? {} }
    chamadas.push(c)
    const x = resp(c, chamadas.length)
    if (x === 'timeout') { const e = new Error('abortado'); e.name = 'AbortError'; throw e }
    return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.corpo }
  }
  return { chamadas, fetchFn }
}
const ehToken = (c: Chamada) => c.url === 'https://exemplo.invalid/token'
const ok = (corpo: unknown, status = 200) => ({ status, corpo })

const contrato: PedidoContratoFrete = {
  identifier: 'C1', hiredNationalId: '165.453.460-91', operationIdentifier: '1', cardNumber: 0, routeTraceCode: 4, routeRouteCode: 123997, issueDate: '2026-11-12T12:00:00Z',
  totalFreightValue: 1500, totalLoadWeight: 20000, totalLoadValue: 40000, advanceMoneyValue: 300, branchCode: '1', ncm: '1005', anttCodeType: 1,
  vpr: { issue: false, oneWay: true, suspendedAxles: 0, returnSuspendedAxles: 0 }, entrega: { esperadaEm: '2026-11-15T12:00:00Z', tipoLocal: 'Branch' },
  motoristas: [{ cpf: '16545346091', principal: true }], documentos: [{ tipo: 'CTE', serie: '1', numero: '660', chave: '51220706315338003134550010000660901237179782', branchCode: '1' }],
  placas: ['lxl-6808'], destinatario: { documento: '06315338003134', nome: 'Destinatario Teste', tipo: 'Company' },
}

test('sem URL do token, URL de PRD ou credenciais: responde "não configurado" e NÃO chama a Repom', async () => {
  const m = mock(() => ok({}))
  const sem = criarRepomFreteClient({ ...cfg, urlToken: undefined }, m.fetchFn)
  const r = await sem.consultarMotorista('16545346091')
  assert.equal(r.ok, false)
  const prd = criarRepomFreteClient({ ...cfg, ambiente: 'prd' }, m.fetchFn) // PRD não tem URL base no guia
  assert.equal((await prd.tiposDeCarga()).ok, false)
  const semCred = criarRepomFreteClient({ ...cfg, credenciais: { ...cfg.credenciais, password: '' } }, m.fetchFn)
  assert.equal((await semCred.tiposDeCarga()).ok, false)
  assert.equal(m.chamadas.length, 0)
})
test('token com User, Version, Password e Partner; cacheado; 401 renova UMA vez', async () => {
  let tokens = 0
  const m = mock((c) => {
    if (ehToken(c)) return ok({ access_token: 'tok' + ++tokens, expires_in: 3600 })
    return c.init.headers?.authorization === 'Bearer tok1' ? { status: 401, corpo: null } : ok({ Response: { StatusCode: 200 }, Result: [{ CodeType: 1, Description: 'Granel sólido' }] })
  })
  const cli = criarRepomFreteClient(cfg, m.fetchFn)
  const a = await cli.tiposDeCarga()
  const b = await cli.tiposDeCarga()
  assert.ok(a.ok && b.ok)
  assert.equal(tokens, 2)
  const corpo = new URLSearchParams(m.chamadas[0]!.init.body)
  assert.equal(corpo.get('User'), 'USER_9520_SECRETO')
  assert.equal(corpo.get('Version'), '3.0')
  assert.equal(corpo.get('Partner'), '00000000000100')
  assert.match(m.chamadas.find((c) => !ehToken(c))!.url, /^https:\/\/qa\.repom\.com\.br\/Repom\.Frete\.WebAPI\/AnttTypes\/LoadTypes$/)
  // 401 permanente: duas tentativas e para
  const m2 = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : { status: 401, corpo: null }))
  assert.equal((await criarRepomFreteClient(cfg, m2.fetchFn).tiposDeCarga()).ok, false)
  assert.equal(m2.chamadas.filter((c) => !ehToken(c)).length, 2)
})
test('erros do Frete: {Errors:[...]}, lista [{Message}] e {Message} são lidos', () => {
  assert.deepEqual(lerErroFrete({ Response: { StatusCode: 400 }, Errors: [{ Message: 'repomfrete: O tipo de movimento 6449 não é válido para o Cliente.', ErrorCode: 113 }] }), { mensagem: 'repomfrete: O tipo de movimento 6449 não é válido para o Cliente.', codigo: '113' })
  assert.equal(lerErroFrete([{ Message: 'x', ErrorCode: 7 }])?.codigo, '7')
  assert.equal(lerErroFrete({ StatusCode: 400, Message: 'ruim' })?.mensagem, 'ruim')
  assert.equal(lerErroFrete({ StatusCode: 201, Message: 'OperationKey: 1c3e55cd-7436-44cc-8222-8e5bb887dd54' }), null)
  assert.equal(lerErroFrete({ Response: { StatusCode: 200 }, Result: [] }), null)
})
test('cadastros: caminhos e verbos do guia (Hired, Driver, Vehicle)', async () => {
  const m = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : ok({ StatusCode: 201, Message: '' }, 201)))
  const c = criarRepomFreteClient(cfg, m.fetchFn)
  await c.criarContratado({ Country: 'Brazil' })
  await c.consultarContratadoPorDocumento('165.453.460-91')
  await c.bloquearContratado('16545346091', true, 'teste')
  await c.consultarMotorista('16545346091')
  await c.consultarVeiculo('fgb-2110')
  await c.alterarVeiculo('FGB2110', {})
  const reqs = m.chamadas.filter((x) => !ehToken(x)).map((x) => `${x.init.method} ${x.url.replace('https://qa.repom.com.br/Repom.Frete.WebAPI', '')}`)
  assert.deepEqual(reqs, ['POST /Hired', 'GET /Hired/ByDocumente/Brazil/16545346091', 'PATCH /Hired/lockUnlock/Brazil/16545346091', 'GET /Driver/ByDocument/Brazil/16545346091', 'GET /Vehicle/ByDocument/Brazil/FGB2110', 'PUT /Vehicle/Brazil/FGB2110'])
  assert.deepEqual(JSON.parse(m.chamadas.find((x) => x.url.includes('lockUnlock'))!.init.body!), { Locked: true, LockedReason: 'teste' })
  assert.equal((await c.consultarMotorista('123')).ok, false) // CPF inválido recusa antes de chamar
})
test('rota automática: IBGE sem os 2 primeiros dígitos e sem zeros, versão 2.4, máximo 23 paradas', async () => {
  const m = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : ok({ Data: { Status: 1, RouteCode: '1', TraceCodeRepom: '2' }, Errors: [] })))
  const c = criarRepomFreteClient(cfg, m.fetchFn)
  await c.rotaAutomatica({ filial: '1', ibgeOrigem: '3550308', ibgeDestino: '3304557', idaVolta: true, identificador: 'R1', paradasIbge: ['3524709'] })
  const x = m.chamadas.find((y) => !ehToken(y))!
  assert.match(x.url, /\/RouteRequest\/RouteRequestAutomatic\?x-api-version=2\.4$/)
  assert.deepEqual(JSON.parse(x.init.body!), { BranchCode: '1', OriginIBGECode: 50308, DestinyIBGECode: 4557, RoundTrip: true, TraceIdentifier: 'R1', RouteStopIBGE: [24709] })
  assert.equal((await c.rotaAutomatica({ filial: '1', ibgeOrigem: '3550308', ibgeDestino: '3304557', idaVolta: false, paradasIbge: Array(24).fill('3524709') })).ok, false)
})
test('contrato: validação, corpo (array) com os nomes do guia e viagem digital (CardNumber 0)', () => {
  assert.equal(validarContratoFrete(contrato), null)
  assert.match(validarContratoFrete({ ...contrato, totalFreightValue: 0 }) ?? '', /frete/)
  assert.match(validarContratoFrete({ ...contrato, motoristas: [] }) ?? '', /motorista/)
  assert.match(validarContratoFrete({ ...contrato, documentos: [{ ...contrato.documentos[0]!, chave: '123' }] }) ?? '', /Chave/)
  assert.match(validarContratoFrete({ ...contrato, documentos: [] }) ?? '', /documento/)
  const corpo = montarCorpoContrato(contrato)
  assert.ok(Array.isArray(corpo))
  const c = corpo[0]! as Record<string, unknown>
  assert.equal(c.CardNumber, 0)
  assert.equal(c.HiredNationalId, '16545346091')
  assert.deepEqual(c.Vehicles, [{ Country: 'Brazil', LicensePlate: 'LXL6808' }])
  assert.equal((c.VPR as Record<string, unknown>).VPRSuspendedAxleNumber, '0')
  assert.equal('CIOTShippingType' in c, false)
  const tac = montarCorpoContrato({ ...contrato, ciotTacAgregado: { contratoExistenteId: 0 } })[0]! as Record<string, unknown>
  assert.equal(tac.CIOTShippingType, 3)
  assert.equal(tac.ExistingContractId, 0)
})
test('emitir contrato: aceita com OperationKey; timeout e 5xx NÃO reenviam e voltam INCERTOS', async () => {
  const m = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : ok({ StatusCode: 201, Message: 'OperationKey: 1c3e55cd-7436-44cc-8222-8e5bb887dd54' }, 201)))
  const r = await criarRepomFreteClient(cfg, m.fetchFn).emitirContrato(contrato)
  assert.equal(r.ok && r.dados.operationKey, '1c3e55cd-7436-44cc-8222-8e5bb887dd54')
  assert.match(m.chamadas.at(-1)!.url, /\/Shipping\?x-api-version=3\.0$/)
  assert.equal(lerOperationKey({ Message: 'sem chave' }), null)
  const t = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : 'timeout'))
  const rt = await criarRepomFreteClient(cfg, t.fetchFn).emitirContrato(contrato)
  assert.equal(rt.ok === false && rt.incerto, true)
  assert.equal(t.chamadas.filter((c) => !ehToken(c)).length, 1)
  const e5 = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : { status: 502, corpo: null }))
  const r5 = await criarRepomFreteClient(cfg, e5.fetchFn).emitirContrato(contrato)
  assert.equal(r5.ok === false && r5.incerto, true)
  assert.equal(e5.chamadas.filter((c) => !ehToken(c)).length, 1)
  const inval = mock(() => ok({}))
  assert.equal((await criarRepomFreteClient(cfg, inval.fetchFn).emitirContrato({ ...contrato, placas: [] })).ok, false)
  assert.equal(inval.chamadas.length, 0)
})
test('status do processamento: Finished sem erros = emitido; com erros = erro; senão processando', async () => {
  assert.equal(situacaoProcessamento({ shippingId: 1, identifier: 'a', status: 'Finished', erros: [] }), 'emitido')
  assert.equal(situacaoProcessamento({ shippingId: null, identifier: 'a', status: 'Finished', erros: ['x'] }), 'erro')
  assert.equal(situacaoProcessamento({ shippingId: null, identifier: 'a', status: 'Processing', erros: [] }), 'processando')
  const m = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : ok({ Response: { StatusCode: 200 }, Result: { OperationKey: 'k', Results: [{ ShippingId: 1719781, Identifier: '6483', Status: 'Finished', Errors: [] }] } })))
  const r = await criarRepomFreteClient(cfg, m.fetchFn).consultarStatusPorChave('1c3e55cd-7436-44cc-8222-8e5bb887dd54')
  assert.equal(r.ok && r.dados[0]!.shippingId, 1719781)
  assert.match(m.chamadas.at(-1)!.url, /\/Shipping\/StatusProcessing\/ByOperationKey\//)
})
test('cancelar, interromper, TAC-agregado, pagamento e quitação: caminhos e corpos do guia', async () => {
  const m = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : ok({ StatusCode: 200, Message: 'ok' })))
  const c = criarRepomFreteClient(cfg, m.fetchFn)
  await c.cancelarContrato(1719725)
  await c.interromperContrato('1720343')
  await c.encerrarCiotAgregado('123')
  await c.cancelarCiotAgregado('123', 'erro')
  await c.retificarCiotAgregado({ ciot: '123', veiculos: [{ placa: 'ABC1D23', rntrc: '000300027' }], quantidade: 1, preco: 1 })
  await c.autorizarPagamento([{ shippingId: 1719704, identifier: '123987', branchCode: '1', dataPagamento: '2026-11-20' }])
  await c.quitarViagem({ branchCode: '1', shippingId: 1719704, documentos: [{ numero: '123', serie: '1', branchCode: '1', tipo: 'CTE', status: 'Delivered' }] })
  await c.cancelarQuitacao(1719704)
  await c.consultarPracasVpr('6483')
  const reqs = m.chamadas.filter((x) => !ehToken(x)).map((x) => `${x.init.method} ${x.url.replace('https://qa.repom.com.br/Repom.Frete.WebAPI', '')}`)
  assert.deepEqual(reqs, [
    'PATCH /Shipping/Cancel/1719725', 'PATCH /Shipping/Interruption/1720343', 'POST /Shipping/CIOTAggregate/ClosingCIOT/?x-api-version=3.0', 'POST /Shipping/CIOTAggregate/CancelCIOT/?x-api-version=3',
    'PATCH /Shipping/CIOTAggregate/ShippingRectification/?x-api-version=3', 'POST /PaymentAuthorization', 'POST /ShippingPayment', 'PATCH /ShippingPayment/Cancel/1719704', 'GET /VPR/TollList/ByShippingIdentifier/6483',
  ])
  const q = JSON.parse(m.chamadas.find((x) => x.url.endsWith('/ShippingPayment') && x.init.method === 'POST')!.init.body!)
  assert.equal(q.Documents[0].DocumentStatus, 'Delivered')
  assert.equal((await c.cancelarContrato('abc')).ok, false)
})
test('o que o guia deixa ambíguo ou sem detalhe é NÃO IMPLEMENTADO e cita a dúvida', async () => {
  const c = criarRepomFreteClient(cfg, async () => ok({}) as never)
  for (const [m, d] of [['consultarSaldoCliente', 'D-F15'], ['adiantarSaldoFrete', 'D-F11'], ['alterarDocumentoQuitacao', 'D-F13'], ['consultarContratosPorStatus', 'D-F09'], ['listarOperacoes', 'D-F05']] as const) {
    await assert.rejects(() => (c[m] as () => Promise<never>)(), (e: Error) => e instanceof RepomFreteNaoImplementado && e.message.includes(d))
  }
})
test('nenhum segredo em erro ou resposta', async () => {
  const m = mock((c) => (ehToken(c) ? { status: 401, corpo: { access_token: 'TOKEN_VAZADO', Password: 'SENHA_9520_SECRETA' } } : ok({})))
  const r = await criarRepomFreteClient(cfg, m.fetchFn).emitirContrato(contrato)
  const t = JSON.stringify(r)
  for (const s of ['SENHA_9520_SECRETA', 'USER_9520_SECRETO', 'TOKEN_VAZADO', '00000000000100']) assert.ok(!t.includes(s), s)
})
