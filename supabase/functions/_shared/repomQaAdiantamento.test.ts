// node --test supabase/functions/_shared/repomQaAdiantamento.test.ts   (sem rede; CPFs/CNPJs abaixo são FICTÍCIOS)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClienteRepomFrete, PedidoContratoFrete, ResultadoFrete } from './repomFreteClient.ts'
import { montarCorpoContrato, validarContratoFrete } from './repomFreteClient.ts'
import { IBGE_DESTINO, IBGE_ORIGEM, ADIANTAMENTO, FRETE_TOTAL, MAX_TENTATIVAS_EMISSAO, chaveValida, classificarFalhaEmissao, conferirModelo, dvChaveAcesso, escolherCargaGeral, lerModeloContrato, lerTiposCarga, montarPedidoAdiantamento, novaChaveCte, novoIdentifier } from './repomQaAdiantamento.ts'
import { executarQaTeste, type DepsQaTeste } from './repomQaTeste.ts'

const ok = <T>(dados: T, http = 200): ResultadoFrete<T> => ({ ok: true, http, dados, bruto: dados })
const erro = (http: number, msg: string, codigoErro: string | null = null, incerto?: boolean): ResultadoFrete<never> => ({ ok: false, http, erro: msg, codigoErro, incerto, bruto: { x: 'SEGREDO_Z' } })

const base43 = '5126110631533800313455001000066090123717978'.slice(0, 43)
const CHAVE_MODELO = base43 + String(dvChaveAcesso(base43))
const MODELO_GET = {
  ShippingId: 2166947, Identifier: 'RBRC4943103', Status: 'InTransit', HiredNationalId: '11122224687', OperationIdentifier: 'OP1', CardNumber: 0,
  BrazilianRouteTraceCode: 11, BrazilianRouteRouteCode: 22, BranchCode: '1', LoadBrazilianNCM: '10059010', TotalLoadWeight: 20000, TotalLoadValue: 40000,
  ShippingPayment: { ExpectedDeliveryLocationType: 'DigitalPayment' },
  Drivers: [{ Country: 'Brazil', NationalId: '33344442853', Main: true }],
  Vehicles: [{ Country: 'Brazil', LicensePlate: 'BIS4025' }],
  Documents: [{ BranchCode: '1', DocumentType: 'CTE', Series: '1', Number: '660', EletronicKey: CHAVE_MODELO }],
  ShippingReceiver: { Country: 'Brazil', NationalId: '06315338003134', Name: 'Destinatario Teste', ReceiverType: 'Company' },
}
const TIPOS = [{ CodeType: 1, Description: 'Granel sólido' }, { CodeType: 5, Description: 'Carga Geral' }]
const AGORA = new Date('2026-11-24T18:30:15Z')

test('DV da chave de acesso: módulo 11; chaveValida confere; chave de modelo gerada aqui é válida', () => {
  assert.equal(chaveValida(CHAVE_MODELO), true)
  assert.equal(chaveValida(CHAVE_MODELO.slice(0, 43) + String((Number(CHAVE_MODELO[43]) + 1) % 10)), false)
  assert.equal(chaveValida('123'), false)
})

test('nova chave: 44 dígitos, DV correto, UF/CNPJ/modelo/série do modelo, AAMM de agora, número NOVO; número/série do documento batem com a chave', () => {
  const m = lerModeloContrato(MODELO_GET) as { modelo: ReturnType<typeof lerModeloContrato> extends { modelo: infer M } ? M : never }
  const a = novaChaveCte(m.modelo.documento, AGORA, () => 0.5)
  const b = novaChaveCte(m.modelo.documento, AGORA, () => 0.25)
  assert.equal(chaveValida(a.chave), true); assert.equal(chaveValida(b.chave), true); assert.notEqual(a.chave, b.chave)
  assert.equal(a.chave.slice(0, 2), CHAVE_MODELO.slice(0, 2)); assert.equal(a.chave.slice(2, 6), '2611'); assert.equal(a.chave.slice(6, 20), CHAVE_MODELO.slice(6, 20))
  assert.equal(a.chave.slice(20, 25), CHAVE_MODELO.slice(20, 25)); assert.equal(String(Number(a.chave.slice(25, 34))), a.numero); assert.notEqual(a.chave, CHAVE_MODELO)
})

test('identifier novo e único: RBRQA + data e hora (UTC)', () => {
  assert.equal(novoIdentifier(AGORA), 'RBRQA261124183015')
  assert.notEqual(novoIdentifier(AGORA), novoIdentifier(new Date(AGORA.getTime() + 1000)))
})

test('leitura do modelo: aceita a resposta do GET, confere por FINAIS e placa, e PARA se faltar algo', () => {
  const r = lerModeloContrato(MODELO_GET)
  assert.ok('modelo' in r); if (!('modelo' in r)) return
  assert.equal(r.modelo.ncm, '1005'); assert.equal(r.modelo.cardNumber, 0); assert.equal(conferirModelo(r.modelo), null)
  assert.match(conferirModelo({ ...r.modelo, placas: ['AAA0000'] }) ?? '', /placa/)
  assert.match(conferirModelo({ ...r.modelo, hiredNationalId: '11122220000' }) ?? '', /prestador/)
  assert.equal(conferirModelo({ ...r.modelo, cardNumber: 700023471 }), null) // o GET devolve o cartão da conta digital; a emissão envia CardNumber 0
  for (const falta of [{ Documents: [] }, { Drivers: [] }, { Vehicles: [] }, { ShippingReceiver: null }, { BrazilianRouteRouteCode: undefined }, { LoadBrazilianNCM: '12' }]) {
    assert.ok('erro' in lerModeloContrato({ ...MODELO_GET, ...falta }), JSON.stringify(falta))
  }
})

test('pedido: frete 3.500, adiantamento 10, SEST, NCM de 4, CardNumber 0, sem CheckDocument/DeliveryLocationType, MinimumFreightCost com 4 chaves, e passa na validação do cliente', () => {
  const lm = lerModeloContrato(MODELO_GET)
  if (!('modelo' in lm)) throw new Error('modelo')
  const { pedido } = montarPedidoAdiantamento(lm.modelo, AGORA, 5, () => 0.5)
  assert.equal(pedido.totalFreightValue, FRETE_TOTAL); assert.equal(pedido.totalFreightValue, 3500); assert.equal(pedido.advanceMoneyValue, ADIANTAMENTO); assert.equal(pedido.advanceMoneyValue, 10)
  assert.equal(pedido.cardNumber, 0); assert.equal(pedido.ncm.length, 4); assert.deepEqual(pedido.impostos, [{ tipo: 'SEST', valor: 10.5 }])
  assert.match(pedido.identifier, /^RBRQA/); assert.equal(pedido.hiredNationalId, '11122224687')
  assert.equal(validarContratoFrete(pedido as PedidoContratoFrete), null)
  const corpo = montarCorpoContrato(pedido)[0] as Record<string, unknown>
  assert.deepEqual(Object.keys(corpo.MinimumFreightCost as object), ['DistanceTravel', 'EmptyReturn', 'HighPerformanceTransport', 'VeichleComposition'])
  const d0 = (corpo.Documents as Record<string, unknown>[])[0]
  assert.equal('CheckDocument' in d0, false); assert.equal('DeliveryLocationType' in d0, false); assert.equal(chaveValida(String(d0.EletronicKey)), true)
  assert.equal(corpo.AdvanceMoneyValue, 10); assert.equal(corpo.LoadBrazilianANTTCodeType, 5)
})

test('tipos de carga: lê Id/Description e escolhe "carga geral"; sem ela, devolve null (a emissão PARA)', () => {
  const t = lerTiposCarga({ Result: TIPOS })
  assert.equal(escolherCargaGeral(t)?.id, 5); assert.equal(lerTiposCarga([{ Id: 5, Description: 'Carga Geral' }]).length, 1); assert.equal(escolherCargaGeral(lerTiposCarga([{ CodeType: 1, Description: 'Granel' }])), null)
  assert.deepEqual(lerTiposCarga('x'), [])
})

test('classificação da falha: Saldo Insuficiente responde sobre o saldo; 2768 é pendência da Karen; o resto NÃO responde sobre o saldo', () => {
  assert.equal(classificarFalhaEmissao(['Saldo Insuficiente para o adiantamento']), 'saldo')
  assert.equal(classificarFalhaEmissao(['x'], '2768'), '2768'); assert.equal(classificarFalhaEmissao(['Erro 2768 ControleSaldo']), '2768')
  for (const t of ['Chave do documento inválida', 'Valor abaixo do piso mínimo da ANTT', 'Veículo não pertence ao prestador', 'Imposto obrigatório']) assert.equal(classificarFalhaEmissao([t]), 'outro')
})

// ---------- ações da função ----------
function montar(o: { rota?: ResultadoFrete<unknown>; modelo?: unknown; tipos?: unknown; emitir?: ResultadoFrete<{ operationKey: string | null }>; status?: ResultadoFrete<{ shippingId: number | null; identifier: string | null; status: string | null; erros: string[] }[]>[]; porIdent?: ResultadoFrete<unknown>; hist?: string[]; ultima?: string | null; cancelar?: ResultadoFrete<unknown>; depoisCancel?: unknown } = {}) {
  const chamadas: string[] = []
  const args: Record<string, unknown> = {}
  let nStatus = 0
  const frete = {
    verificarToken: async () => ({ ok: true }),
    consultarContratoPorViagem: async (id: unknown) => { chamadas.push(`viagem:${id}`); return ok(Number(id) === 2166947 ? (o.modelo ?? MODELO_GET) : (o.depoisCancel ?? { ShippingId: id, Status: 'Cancelado' })) },
    tiposDeCarga: async () => { chamadas.push('tipos'); return ok(o.tipos ?? TIPOS) },
    consultarRotaPorCodigo: async (t: number, r: number, e: number) => { chamadas.push(`rota:${t}/${r}/${e}`); return o.rota ?? ok({ TraceCode: t, RouteCode: r, Distance: 432.4, RoundTrip: false, Name: 'SAO PAULO/SP x RIO DE JANEIRO/RJ' }) },
    emitirContrato: async (p: PedidoContratoFrete) => { chamadas.push('emitir'); args.pedido = p; return o.emitir ?? ok({ operationKey: 'OP-KEY' }) },
    consultarStatusPorChave: async () => { chamadas.push('status'); const r = (o.status ?? [ok([{ shippingId: 9, identifier: 'x', status: 'Finished', erros: [] }])])[Math.min(nStatus++, (o.status ?? [1]).length - 1)]; return r },
    consultarContratoPorIdentificador: async (i: string) => { chamadas.push(`ident:${i}`); return o.porIdent ?? ok({ ShippingId: 777, Identifier: i, Status: 'InTransit', CIOT: '123456789012', AdvanceMoneyValue: 10 }) },
    cancelarContrato: async (id: unknown) => { chamadas.push(`cancelar:${id}`); args.cancelar = id; return o.cancelar ?? ok({}) },
    quitarViagem: async () => { chamadas.push('quitar'); return ok({}) },
    autorizarPagamento: async () => { chamadas.push('autorizar'); return ok({}) },
  } as unknown as ClienteRepomFrete
  const linhas: { acao: string; request?: unknown; status?: string; resposta?: Record<string, unknown> }[] = []
  const deps: DepsQaTeste = {
    ligado: true, ambiente: 'qa', frete, hoje: () => '2026-11-24', amanha: () => '2026-11-25', agora: () => AGORA, espera: async () => {},
    historico: async () => o.hist ?? [], ultimaEmissao: async () => (o.ultima === undefined ? 'RBRQA261124183015' : o.ultima),
    registrar: async (acao, request) => { linhas.push({ acao, request }); return String(linhas.length - 1) },
    concluir: async (id, r) => { Object.assign(linhas[Number(id)], { status: r.status, resposta: r.resposta as Record<string, unknown> }) },
  }
  return { deps, chamadas, args, linhas }
}
const EMITIR = { acao: 'emitir_adiantamento', confirmacao: { nome: 'Pedro' } }

test('ler_modelo: só leitura; mostra só os finais dos documentos e a lista de tipos de carga; nada de emitir', async () => {
  const m = montar()
  const r = await executarQaTeste({ acao: 'ler_modelo' }, m.deps)
  assert.equal(r.status, 200); assert.ok(!m.chamadas.includes('emitir'))
  const txt = JSON.stringify(r.corpo)
  assert.ok(!txt.includes('11122224687') && !txt.includes('33344442853') && !txt.includes('06315338003134') && !txt.includes(CHAVE_MODELO))
  assert.match(txt, /4687/); assert.match(txt, /Carga Geral/); assert.match(txt, /"confere_com_17_11":"sim"/)
})

test('emitir (caminho feliz): 1 emissão, consulta o processamento, lê o contrato criado e informa que o crédito chegou; grava identifier e shippingId', async () => {
  const m = montar()
  const r = await executarQaTeste(EMITIR, m.deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.credito_chegou, true); assert.equal(r.corpo.shippingId, 777); assert.equal(r.corpo.ciot, '123456789012')
  assert.equal(m.chamadas.filter((c) => c === 'emitir').length, 1); assert.ok(!m.chamadas.includes('quitar') && !m.chamadas.includes('autorizar'))
  assert.ok(!m.chamadas.includes('cancelar:2166947'))
  const ult = m.linhas.at(-1)!; assert.equal(ult.status, 'ok'); assert.equal(ult.resposta?.shippingId, 777); assert.match(String(ult.resposta?.identifier), /^RBRQA/)
  const p = m.args.pedido as PedidoContratoFrete; assert.equal(p.advanceMoneyValue, 10); assert.equal(p.totalFreightValue, 3500)
  assert.ok(!JSON.stringify(m.linhas).includes('11122224687'))
})

test('emitir: "Saldo Insuficiente" (no processamento) = o crédito NÃO entrou; responde sobre o saldo e para', async () => {
  const m = montar({ status: [ok([{ shippingId: null, identifier: 'x', status: 'Error', erros: ['Saldo Insuficiente'] }])] })
  const r = await executarQaTeste(EMITIR, m.deps)
  assert.equal(r.corpo.resultado, 'saldo'); assert.equal(r.corpo.responde_sobre_saldo, true); assert.equal(m.chamadas.filter((c) => c === 'emitir').length, 1)
  assert.ok(!m.chamadas.some((c) => c.startsWith('ident:')))
})

test('emitir: erro 2768 vira pendência da Karen, sem nova tentativa (na resposta direta e no processamento)', async () => {
  const a = montar({ emitir: erro(400, 'Erro 2768', '2768') })
  const ra = await executarQaTeste(EMITIR, a.deps)
  assert.equal(ra.corpo.resultado, '2768'); assert.equal((ra.corpo.pendencia_externa as { dono: string }).dono, 'Karen'); assert.equal(a.chamadas.filter((c) => c === 'emitir').length, 1)
  const b = montar({ status: [ok([{ shippingId: null, identifier: 'x', status: 'Error', erros: ['2768 ControleSaldo nao configurado'] }])] })
  assert.equal((await executarQaTeste(EMITIR, b.deps)).corpo.resultado, '2768')
})

test('emitir: falha que NÃO é saldo (documento, imposto, piso, veículo) explica e PARA sem responder sobre o saldo', async () => {
  for (const msg of ['Chave do documento inválida', 'Valor abaixo do piso da ANTT', 'Imposto do prestador obrigatório', 'Veículo fora do prestador']) {
    const m = montar({ emitir: erro(400, msg, '801') })
    const r = await executarQaTeste(EMITIR, m.deps)
    assert.equal(r.corpo.resultado, 'outro'); assert.equal(r.corpo.responde_sobre_saldo, false); assert.equal(r.corpo.parou, true); assert.equal(m.chamadas.filter((c) => c === 'emitir').length, 1)
  }
})

test('emitir: guardas — nome, máximo de 2 tentativas, contrato já emitido, modelo que não confere, sem "carga geral", resultado sem OperationKey', async () => {
  assert.equal((await executarQaTeste({ acao: 'emitir_adiantamento' }, montar().deps)).status, 400)
  for (const hist of [['erro', 'erro'], ['ok'], ['erro', 'ok']]) { const m = montar({ hist }); assert.equal((await executarQaTeste(EMITIR, m.deps)).corpo.parou, true); assert.ok(!m.chamadas.includes('emitir')) }
  const outro = montar({ modelo: { ...MODELO_GET, Vehicles: [{ LicensePlate: 'ZZZ9999' }] } })
  assert.equal((await executarQaTeste(EMITIR, outro.deps)).corpo.parou, true); assert.ok(!outro.chamadas.includes('emitir'))
  const semGeral = montar({ tipos: [{ CodeType: 1, Description: 'Granel' }] })
  assert.equal((await executarQaTeste(EMITIR, semGeral.deps)).corpo.parou, true); assert.ok(!semGeral.chamadas.includes('emitir'))
  const semChave = montar({ emitir: ok({ operationKey: null }) })
  assert.equal((await executarQaTeste(EMITIR, semChave.deps)).corpo.parou, true)
  assert.equal(MAX_TENTATIVAS_EMISSAO, 2)
})

test('emitir: ainda em processamento depois de 8 consultas -> para e manda conferir pelo identificador (não conta como resposta sobre saldo)', async () => {
  const m = montar({ status: [ok([{ shippingId: null, identifier: 'x', status: 'Processing', erros: [] }])] })
  const r = await executarQaTeste(EMITIR, m.deps)
  assert.equal(r.status, 504); assert.equal(m.chamadas.filter((c) => c === 'status').length, 8); assert.equal(r.corpo.resultado, undefined)
})

test('cancelar: só o contrato criado por este teste (RBRQA...), confirma o status Cancelado e NUNCA toca no 2166947', async () => {
  const m = montar()
  const r = await executarQaTeste({ acao: 'cancelar_adiantamento', confirmacao: { nome: 'Pedro' } }, m.deps)
  assert.equal(r.status, 200); assert.equal(r.corpo.cancelado, true); assert.equal(m.args.cancelar, 777)
  assert.ok(!m.chamadas.includes('cancelar:2166947'))
  for (const c of [{ ultima: null }, { ultima: 'RBRC4943103' }, { porIdent: ok({ ShippingId: 2166947, Identifier: 'RBRQA261124183015', Status: 'Paid' }) }, { porIdent: erro(404, 'Não encontrado') }]) {
    const x = montar(c as never)
    const rr = await executarQaTeste({ acao: 'cancelar_adiantamento', confirmacao: { nome: 'Pedro' } }, x.deps)
    assert.equal(rr.corpo.parou, true, JSON.stringify(c)); assert.equal(x.chamadas.filter((q) => q.startsWith('cancelar:')).length, 0)
  }
  assert.equal((await executarQaTeste({ acao: 'cancelar_adiantamento' }, montar().deps)).status, 400)
})

test('cancelar: se a Repom recusar, para; se já estiver cancelado, não cancela de novo', async () => {
  const a = montar({ cancelar: erro(400, 'Contrato com movimento') })
  assert.equal((await executarQaTeste({ acao: 'cancelar_adiantamento', confirmacao: { nome: 'Pedro' } }, a.deps)).corpo.parou, true)
  const b = montar({ porIdent: ok({ ShippingId: 777, Identifier: 'RBRQA261124183015', Status: 'Cancelado' }) })
  const rb = await executarQaTeste({ acao: 'cancelar_adiantamento', confirmacao: { nome: 'Pedro' } }, b.deps)
  assert.equal(rb.corpo.ja_cancelado, true); assert.equal(b.chamadas.filter((q) => q.startsWith('cancelar:')).length, 0)
})

test('IBGE: o corpo leva BrazilianIBGECodeSource 3550308 e BrazilianIBGECodeDestination 3304557 (Repom exige, erro 725) e a distância da rota no piso', () => {
  const lm = lerModeloContrato(MODELO_GET)
  if (!('modelo' in lm)) throw new Error('modelo')
  const { pedido } = montarPedidoAdiantamento(lm.modelo, AGORA, 5, () => 0.5, { distanciaKm: 432.4 })
  const corpo = montarCorpoContrato(pedido)[0] as Record<string, unknown>
  assert.equal(corpo.BrazilianIBGECodeSource, '3550308'); assert.equal(corpo.BrazilianIBGECodeDestination, '3304557'); assert.equal(IBGE_ORIGEM, '3550308'); assert.equal(IBGE_DESTINO, '3304557')
  assert.equal(corpo.TravelledDistance, 432); assert.equal((corpo.MinimumFreightCost as { DistanceTravel: number }).DistanceTravel, 432)
  const sem = montarCorpoContrato(montarPedidoAdiantamento(lm.modelo, AGORA, 5, () => 0.5).pedido)[0] as Record<string, unknown>
  assert.equal(sem.TravelledDistance, 300) // sem a rota: distância padrão
})

test('emitir: lê a rota (GET) antes de emitir, usa a distância dela e os IBGE de 17/11; se a leitura da rota falhar, emite com a distância padrão e informa', async () => {
  const m = montar()
  const r = await executarQaTeste(EMITIR, m.deps)
  assert.equal(r.status, 200); assert.ok(m.chamadas.includes('rota:11/22/5'))
  const p = m.args.pedido as PedidoContratoFrete
  assert.equal(p.ibgeOrigem, '3550308'); assert.equal(p.ibgeDestino, '3304557'); assert.equal(p.distanciaKm, 432)
  const det = (r.corpo.etapas as { etapa: string; detalhe?: Record<string, unknown> }[]).find((e) => e.etapa === 'rota')?.detalhe
  assert.equal(det?.lida, true); assert.equal(det?.ibge_na_resposta, false)
  const falha = montar({ rota: erro(404, 'Rota não encontrada') })
  const r2 = await executarQaTeste(EMITIR, falha.deps)
  assert.equal(r2.status, 200); assert.equal((falha.args.pedido as PedidoContratoFrete).distanciaKm, 300)
  assert.equal((r2.corpo.etapas as { etapa: string; detalhe?: Record<string, unknown> }[]).find((e) => e.etapa === 'rota')?.detalhe?.lida, false)
})

test('emitir (tentativa 2, a última): com 1 tentativa anterior com erro de validação, ainda emite; com 2 anteriores, recusa', async () => {
  const ok2 = montar({ hist: ['erro'] })
  assert.equal((await executarQaTeste(EMITIR, ok2.deps)).status, 200)
  const nao = montar({ hist: ['erro', 'erro'] })
  assert.equal((await executarQaTeste(EMITIR, nao.deps)).corpo.parou, true); assert.ok(!nao.chamadas.includes('emitir'))
})
