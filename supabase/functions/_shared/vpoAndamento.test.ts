// node --test supabase/functions/_shared/vpoAndamento.test.ts   (sem rede, sem segredos: fetch falso do NSPEDAGIO)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarNsPedagioReal, type PedidoCompra } from './nspedagioClient.ts'
import { LIMITE_CHAMADA_MS, conferirRecibo, decidirAntesDeComprar, ehTimeout, emProcessamento, interpretarRecibo, type LinhaVpo } from './vpoAndamento.ts'

const CFG = { baseUrl: 'https://ns.exemplo/api', authUrl: 'https://ns.exemplo/auth', clientId: 'id', clientSecret: 'segredo', cnpj: '69115969000104', compraLiberada: true }
const resp = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
const NAO_LOCALIZADO = [{ status: { id: 219, descricao: 'Recibo de Vale Pedágio não foi localizado.' }, dadosRetorno: null, nroTransporte: 100001 }]
const RECIBO_OK = { idVpoAntt: '66945710893203695291', numeroViagem: '77', idRecibo: 'R1', totalViagem: 140.64 }
const PEDIDO: PedidoCompra = { idDocumentoTransporte: 100001, placa: 'GYI1732', nEixos: 5, inicioVigencia: '20261112', fimVigencia: '20261116', cnpjTransportadora: '69115969000104', cnpjCpfSubcontratado: '12345678909', pontos: [{ codIbge: '3550308' }, { codIbge: '3106200' }] }
const erroTimeout = () => Object.assign(new Error('timeout'), { name: 'TimeoutError' })

// O NSPEDAGIO falso: a compra/cancelamento "estouram" o tempo; o recibo muda conforme o roteiro do teste.
function nsFalso(roteiro: { compra?: 'timeout' | 'ok'; cancelar?: 'timeout' | 'ok'; recibos: unknown[] }) {
  const chamadas: string[] = []
  let i = 0
  const f = async (url: string, init?: RequestInit) => {
    if (url === CFG.authUrl) return resp(200, { access_token: 't', expires_in: 600 })
    const metodo = init?.method ?? 'GET'
    chamadas.push(`${metodo} ${url.replace(CFG.baseUrl, '')}`)
    if (url.endsWith('valePedagio/recibo')) return resp(200, roteiro.recibos[Math.min(i++, roteiro.recibos.length - 1)])
    if (metodo === 'POST' && url.endsWith('valePedagio/')) {
      if (roteiro.compra === 'timeout') throw erroTimeout()
      return resp(200, RECIBO_OK)
    }
    if (metodo === 'DELETE') {
      if (roteiro.cancelar === 'timeout') throw erroTimeout()
      return resp(200, 'ok')
    }
    return resp(200, [])
  }
  return { f, chamadas }
}

const linha = (extra: Partial<LinhaVpo> = {}): LinhaVpo => ({ id: 'l1', acao: 'comprar', situacao: null, http_status: null, erro: null, criado_em: '2026-11-12T12:00:00Z', ...extra })

test('o limite da chamada fica abaixo do corte de 150 s da edge function e é maior que 60 s', () => {
  assert.ok(LIMITE_CHAMADA_MS > 60_000 && LIMITE_CHAMADA_MS < 150_000)
})

test('compra que demora e conclui: estoura o tempo, fica em processamento e o recibo fecha a compra', async () => {
  const ns = nsFalso({ compra: 'timeout', recibos: [NAO_LOCALIZADO, NAO_LOCALIZADO, RECIBO_OK] })
  const prov = criarNsPedagioReal(CFG, ns.f as never)
  // 1) a compra estoura: a função recebe um TimeoutError (não um erro seco) e marca a linha
  await assert.rejects(prov.comprar(PEDIDO), (e: unknown) => ehTimeout(e))
  const marcada = linha({ situacao: 'em_processamento', processando_desde: '2026-11-12T12:01:35Z' })
  assert.equal(emProcessamento(marcada), true)
  // 2) a tela consulta o recibo: duas vezes ainda não, na terceira aparece
  assert.deepEqual((await conferirRecibo(prov, 'comprar', 100001)).situacao, 'aguardando')
  assert.deepEqual((await conferirRecibo(prov, 'comprar', 100001)).situacao, 'aguardando')
  const v = await conferirRecibo(prov, 'comprar', 100001)
  assert.equal(v.situacao, 'concluida')
  if (v.situacao === 'concluida') {
    assert.equal(v.dados.idVpoAntt, '66945710893203695291')
    assert.equal(v.dados.numeroViagem, '77')
    assert.equal(v.dados.idRecibo, 'R1')
    assert.equal(v.dados.totalViagem, 140.64)
  }
  // a compra foi pedida UMA vez só
  assert.equal(ns.chamadas.filter((c) => c === 'POST /valePedagio/').length, 1)
})

test('compra que nunca conclui: o recibo nunca aparece e o veredito é sempre "aguardando" (nunca compra de novo, nunca dá sucesso)', async () => {
  const ns = nsFalso({ compra: 'timeout', recibos: [NAO_LOCALIZADO] })
  const prov = criarNsPedagioReal(CFG, ns.f as never)
  await assert.rejects(prov.comprar(PEDIDO), (e: unknown) => ehTimeout(e))
  for (let k = 0; k < 20; k++) assert.equal((await conferirRecibo(prov, 'comprar', 100001)).situacao, 'aguardando')
  assert.equal(ns.chamadas.filter((c) => c === 'POST /valePedagio/').length, 1)
})

test('cancelamento que demora: o vale ainda aparece, depois "não localizado" = cancelado', async () => {
  const ns = nsFalso({ cancelar: 'timeout', recibos: [RECIBO_OK, RECIBO_OK, NAO_LOCALIZADO] })
  const prov = criarNsPedagioReal(CFG, ns.f as never)
  await assert.rejects(prov.cancelar(100001, 'teste de cancelamento'), (e: unknown) => ehTimeout(e))
  assert.equal((await conferirRecibo(prov, 'cancelar', 100001)).situacao, 'aguardando') // vale ainda existe
  assert.equal((await conferirRecibo(prov, 'cancelar', 100001)).situacao, 'aguardando')
  assert.equal((await conferirRecibo(prov, 'cancelar', 100001)).situacao, 'cancelada')
})

test('falha de rede ao consultar o recibo NÃO é tratada como cancelado nem como comprado', async () => {
  const f = async (url: string) => {
    if (url === CFG.authUrl) return resp(200, { access_token: 't', expires_in: 600 })
    return resp(500, 'erro interno')
  }
  const prov = criarNsPedagioReal(CFG, f as never)
  assert.equal((await conferirRecibo(prov, 'cancelar', 100001)).situacao, 'erro')
  assert.equal((await conferirRecibo(prov, 'comprar', 100001)).situacao, 'erro')
  const lancou = { recibo: async () => { throw erroTimeout() } } as never
  assert.equal((await conferirRecibo(lancou, 'cancelar', 1)).situacao, 'erro')
})

test('interpretarRecibo: tabela completa', () => {
  const ok = { ok: true as const, http: 200, dados: { idVpoAntt: 'X', numeroViagem: null, idRecibo: null, totalViagem: null }, bruto: {} }
  const nao = { ok: false as const, http: 200, erro: 'não localizado', bruto: {}, naoLocalizado: true as const }
  assert.equal(interpretarRecibo('comprar', ok).situacao, 'concluida')
  assert.equal(interpretarRecibo('comprar', nao).situacao, 'aguardando')
  assert.equal(interpretarRecibo('cancelar', ok).situacao, 'aguardando')
  assert.equal(interpretarRecibo('cancelar', nao).situacao, 'cancelada')
})

test('bloqueio de compra duplicada: compra em processamento manda conferir o recibo e nunca libera sozinha', () => {
  const emProc = linha({ situacao: 'em_processamento', processando_desde: '2026-11-12T12:01:35Z' })
  const d = decidirAntesDeComprar([emProc])
  assert.equal(d.tipo, 'conferir_recibo')
  // linha enviada sem resposta nenhuma (função cortada antes de marcar) também conta
  assert.equal(decidirAntesDeComprar([linha()]).tipo, 'conferir_recibo')
  // cancelamento em processamento também segura a compra
  assert.equal(decidirAntesDeComprar([linha({ acao: 'cancelar', situacao: 'em_processamento' })]).tipo, 'conferir_recibo')
})

test('compra liberada quando não há pendência (concluída, com erro, ou só consultas)', () => {
  assert.equal(decidirAntesDeComprar([]).tipo, 'liberado')
  assert.equal(decidirAntesDeComprar([linha({ situacao: 'concluida', http_status: 200 })]).tipo, 'liberado')
  assert.equal(decidirAntesDeComprar([linha({ erro: 'Placa inválida.' })]).tipo, 'liberado')
  assert.equal(decidirAntesDeComprar([linha({ acao: 'simular' })]).tipo, 'liberado')
  assert.equal(decidirAntesDeComprar([linha({ acao: 'recibo' })]).tipo, 'liberado')
})

test('duas compras seguidas pela função: a segunda acha o recibo e não compra de novo', async () => {
  const ns = nsFalso({ compra: 'timeout', recibos: [RECIBO_OK] })
  const prov = criarNsPedagioReal(CFG, ns.f as never)
  await assert.rejects(prov.comprar(PEDIDO), (e: unknown) => ehTimeout(e))
  assert.equal(decidirAntesDeComprar([linha({ situacao: 'em_processamento' })]).tipo, 'conferir_recibo')
  assert.equal((await conferirRecibo(prov, 'comprar', 100001)).situacao, 'concluida')
  assert.equal(ns.chamadas.filter((c) => c === 'POST /valePedagio/').length, 1)
})
