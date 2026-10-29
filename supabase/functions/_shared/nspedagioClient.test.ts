// node --test supabase/functions/_shared/nspedagioClient.test.ts   (sem rede, sem segredos: fetch falso)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_SIMULADO,
  chaveIdempotencia,
  corpoCompra,
  corpoSimulacao,
  criarNsPedagio,
  criarNsPedagioReal,
  lerCompra,
  lerMeiosPagamento,
  lerSimulacao,
  validarCompra,
  type PedidoCompra,
} from './nspedagioClient.ts'

const CFG = { baseUrl: 'https://ns.exemplo/api/', authUrl: 'https://ns.exemplo/auth/token', clientId: 'id-falso', clientSecret: 'segredo-falso', cnpj: '11.222.333/0001-81' }
const PEDIDO: PedidoCompra = {
  idDocumentoTransporte: 100001,
  placa: 'GYI1732',
  nEixos: 5,
  inicioVigencia: '20261101',
  fimVigencia: '20261105',
  cnpjTransportadora: '22064101000169',
  cnpjCpfSubcontratado: '123.456.789-09',
  pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }],
}
const resp = (status: number, corpo: unknown) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status })

test('corpo da simulação: IBGE ou cidade+UF, como na coleção Postman', () => {
  assert.deepEqual(corpoSimulacao({ pontos: [{ codIbge: '3550308' }, { state: 'mg', city: 'Belo Horizonte' }] }), {
    positions: { position: [{ codIbge: '3550308', eixoSuspenso: false }, { country: 'BR', state: 'MG', city: 'BELO HORIZONTE', eixoSuspenso: false }] },
  })
})

test('corpo da compra: número numérico, só dígitos nos CNPJ/CPF e vigência AAAAMMDD', () => {
  const c = corpoCompra(PEDIDO, CFG.cnpj) as { routes: { route: Record<string, unknown>[] }[] }
  const r = c.routes[0].route[0]
  assert.equal(r.idDocumentoTransporte, 100001)
  assert.equal(r.cnpj, '11222333000181')
  assert.equal(r.cnpjCpfSubcontratado, '12345678909')
  assert.equal(r.neixos, '5')
  assert.equal(r.inicioVigencia, '20261101')
})

test('validações antes de comprar: tag, vigência de no máximo 15 dias, eixos e rota', () => {
  assert.equal(validarCompra(PEDIDO, true), null)
  assert.match(validarCompra(PEDIDO, false)!, /tag/)
  assert.match(validarCompra({ ...PEDIDO, fimVigencia: '20261120' }, true)!, /15 dias/)
  assert.match(validarCompra({ ...PEDIDO, fimVigencia: '20261031' }, true)!, /anterior/)
  assert.match(validarCompra({ ...PEDIDO, nEixos: 1 }, true)!, /eixos/)
  assert.match(validarCompra({ ...PEDIDO, pontos: [{ codIbge: '3550308' }] }, true)!, /origem e destino/)
  assert.match(validarCompra({ ...PEDIDO, pontos: [{ codIbge: '12' }, { codIbge: '3106200' }] }, true)!, /IBGE/)
  assert.match(validarCompra({ ...PEDIDO, idDocumentoTransporte: 0 }, true)!, /Número da operação/)
})

test('chave de idempotência: operação + placa + início da vigência', () => {
  assert.equal(chaveIdempotencia('op-1', 'gyi-1732', '2026-11-01'), 'vpo:op-1:GYI1732:20261101')
})

test('lê a simulação real (formato de 29/10/2026) e a lista de meios de pagamento', () => {
  const s = lerSimulacao({ origem: 'SAO PAULO - SP', destino: 'BELO HORIZONTE - MG', distancia: 600.35, valor02Eixos: 56.24, valor05Eixos: 140.64 })!
  assert.equal(s.distanciaKm, 600.35)
  assert.equal(s.valorPorEixos[5], 140.64)
  assert.equal(lerSimulacao({ erro: 'x' }), null)
  const m = lerMeiosPagamento([
    { status: { messageKey: 'STATUS_VEICULO_SUCESSO', descricao: 'ativo' }, tag: '123', nroEixo: 2, meansOfPayment: 'CONECTCAR' },
    { status: { messageKey: '4', descricao: 'indisponível' }, tag: null, nroEixo: null, meansOfPayment: 'SEM_PARAR_PARCEIROS' },
  ])
  assert.equal(m[0].ativo, true)
  assert.equal(m[1].ativo, false)
})

test('lê a compra mesmo aninhada e não inventa campo ausente', () => {
  assert.deepEqual(lerCompra({ x: { idVpoAntt: 987, numeroViagem: 'V1', idRecibo: 'R1', totalViagem: '140,64' } }), { idVpoAntt: '987', numeroViagem: 'V1', idRecibo: 'R1', totalViagem: 140.64 })
  assert.deepEqual(lerCompra({}), { idVpoAntt: null, numeroViagem: null, idRecibo: null, totalViagem: null })
})

test('sem configuração completa: provedor SIMULADO, marcado, e nenhuma chamada de rede', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('não deveria chamar a rede') }) as typeof fetch
  try {
    for (const cfg of [null, undefined, {}, { ...CFG, clientSecret: '' }]) {
      const p = criarNsPedagio(cfg)
      assert.equal(p.simulado, true)
      const s = await p.simular({ pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }] })
      assert.ok(s.ok && s.dados.origem.includes(AVISO_SIMULADO))
      const c = await p.comprar(PEDIDO)
      assert.ok(c.ok && c.dados.idVpoAntt!.startsWith('SIM'))
    }
  } finally { globalThis.fetch = original }
})

test('provedor real: autentica uma vez, reaproveita o token e renova em 401', async () => {
  const chamadas: string[] = []
  let tokens = 0
  let primeiraConsulta = true
  const fetchFalso = async (url: string, init?: RequestInit) => {
    chamadas.push(`${init?.method ?? 'GET'} ${url}`)
    if (url === CFG.authUrl) { tokens++; return resp(200, { access_token: `tk${tokens}`, expires_in: 3600 }) }
    if (url.includes('veiculo/meioPagamento') && primeiraConsulta) { primeiraConsulta = false; return resp(401, '') }
    if (url.includes('veiculo/meioPagamento')) return resp(200, [{ status: { messageKey: 'STATUS_VEICULO_SUCESSO' }, tag: '1', nroEixo: 2, meansOfPayment: 'CONECTCAR' }])
    return resp(200, { origem: 'A', destino: 'B', distancia: 1, valor05Eixos: 9 })
  }
  const p = criarNsPedagioReal(CFG, fetchFalso)
  const t = await p.consultarTag('gyi1732')
  assert.ok(t.ok && t.dados[0].ativo)
  assert.equal(tokens, 2, 'renovou após o 401')
  const s = await p.simular({ pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }] })
  assert.ok(s.ok)
  assert.equal(tokens, 2, 'reaproveitou o token')
  assert.ok(chamadas.some((c) => c === 'GET https://ns.exemplo/api/veiculo/meioPagamento/GYI1732/11222333000181'))
})

test('compra, cancelamento e troca de placa reais ficam TRAVADOS até liberar de propósito, sem chamar a rede', async () => {
  let rede = 0
  const fetchFalso = async (url: string) => { rede++; return url === CFG.authUrl ? resp(200, { access_token: 't', expires_in: 60 }) : resp(200, {}) }
  const p = criarNsPedagioReal(CFG, fetchFalso)
  for (const r of [await p.comprar(PEDIDO), await p.cancelar(100001, 'teste'), await p.trocarPlaca(100001, 'FLM1H93', 'teste')]) {
    assert.equal(r.ok, false)
    assert.match((r as { erro: string }).erro, /travada/)
  }
  assert.equal(rede, 0)
  const liberado = criarNsPedagioReal({ ...CFG, compraLiberada: true }, async (url: string) =>
    url === CFG.authUrl ? resp(200, { access_token: 't', expires_in: 60 }) : resp(200, { idVpoAntt: 5, numeroViagem: 'V' }))
  const c = await liberado.comprar(PEDIDO)
  assert.ok(c.ok && c.dados.idVpoAntt === '5')
})

test('erro do NSPEDAGIO volta com HTTP e mensagem, e a resposta bruta é preservada para gravar', async () => {
  const p = criarNsPedagioReal(CFG, async (url: string) => (url === CFG.authUrl ? resp(200, { access_token: 't', expires_in: 60 }) : resp(400, '')))
  const r = await p.simular({ pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }] })
  assert.equal(r.ok, false)
  assert.equal(r.http, 400)
  assert.match((r as { erro: string }).erro, /HTTP 400/)
})

test('falha de autenticação não vaza segredo na mensagem', async () => {
  const p = criarNsPedagioReal(CFG, async () => resp(401, { error: 'invalid_client' }))
  await assert.rejects(p.simular({ pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }] }), (e: Error) => /autenticar/.test(e.message) && !e.message.includes(CFG.clientSecret))
})

test('recibo "não localizado" (HTTP 200) vira falha com a descrição do NSPEDAGIO', async () => {
  const naoLocalizado = [{ status: { id: 219, descricao: 'Recibo de Vale Pedágio não foi localizado.' }, dadosRetorno: null, nroTransporte: 100001 }]
  const p = criarNsPedagioReal(CFG, async (url: string) => (url === CFG.authUrl ? resp(200, { access_token: 't', expires_in: 60 }) : resp(200, naoLocalizado)))
  const r = await p.recibo(100001)
  assert.equal(r.ok, false)
  assert.match((r as { erro: string }).erro, /não foi localizado/)
})

test('chamada que passa do limite de tempo é abortada (não fica pendurada)', async () => {
  const pendurado = (url: string, init?: RequestInit) =>
    url === CFG.authUrl
      ? Promise.resolve(resp(200, { access_token: 't', expires_in: 60 }))
      : new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))
  const p = criarNsPedagioReal({ ...CFG, limiteMs: 50 }, pendurado as never)
  await assert.rejects(p.simular({ pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }] }), (e: Error) => e.name === 'TimeoutError')
})
