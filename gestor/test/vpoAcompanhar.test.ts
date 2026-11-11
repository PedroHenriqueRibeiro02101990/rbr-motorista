// node --test gestor/test/vpoAcompanhar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acompanharRecibo, type RespostaAcompanhamento } from '../src/lib/vpoAcompanhar.ts'
import { estadoVpo, pendenciaVpo, podeComprar, podeCancelar, passoDe, ESPERA_MAXIMA_MS, type RequisicaoVpo } from '../src/lib/vpoPassos.ts'

const T0 = Date.parse('2026-11-12T17:00:00Z')
// Relógio falso: "esperar" só avança o relógio (o teste não espera de verdade).
function relogio() {
  let t = T0
  return { agora: () => t, esperar: async (ms: number) => { t += ms }, esperas: [] as number[] }
}
function consultas(...respostas: RespostaAcompanhamento[]) {
  let i = 0
  const feitas = { n: 0 }
  return { feitas, consultar: async () => { feitas.n++; return respostas[Math.min(i++, respostas.length - 1)] } }
}

test('compra que demora e conclui: confere de 15 em 15 s e para quando o recibo aparece', async () => {
  const r = relogio()
  const c = consultas({ situacao: 'aguardando' }, { situacao: 'aguardando' }, { situacao: 'concluida' })
  const out = await acompanharRecibo({ ...c, agora: r.agora, esperar: r.esperar, desde: T0 })
  assert.equal(out, 'concluida')
  assert.equal(c.feitas.n, 3)
  assert.equal(r.agora() - T0, 30_000) // duas esperas de 15 s
})

test('compra que nunca conclui: para em 5 minutos com "nao_confirmado" (sem comprar de novo)', async () => {
  const r = relogio()
  const c = consultas({ situacao: 'aguardando' })
  const out = await acompanharRecibo({ ...c, agora: r.agora, esperar: r.esperar, desde: T0 })
  assert.equal(out, 'nao_confirmado')
  assert.ok(r.agora() - T0 <= ESPERA_MAXIMA_MS, 'não passa de 5 minutos')
  assert.ok(c.feitas.n >= 19 && c.feitas.n <= 21, `consultas: ${c.feitas.n}`)
})

test('cancelamento que demora: o vale ainda existe e depois "cancelada"', async () => {
  const r = relogio()
  const c = consultas({ situacao: 'aguardando' }, { situacao: 'aguardando' }, { situacao: 'cancelada' })
  assert.equal(await acompanharRecibo({ ...c, agora: r.agora, esperar: r.esperar, desde: T0 }), 'cancelada')
})

test('erro de rede numa consulta não derruba a espera', async () => {
  const r = relogio()
  let n = 0
  const consultar = async () => { if (++n < 3) throw new Error('rede'); return { situacao: 'concluida' as const } }
  assert.equal(await acompanharRecibo({ consultar, agora: r.agora, esperar: r.esperar, desde: T0 }), 'concluida')
})

test('tela fechada: interrompe sem consultar mais', async () => {
  const r = relogio()
  const c = consultas({ situacao: 'aguardando' })
  let fechou = false
  const out = await acompanharRecibo({ ...c, agora: r.agora, esperar: async (ms) => { await r.esperar(ms); fechou = true }, desde: T0, interrompido: () => fechou })
  assert.equal(out, 'interrompido')
  assert.equal(c.feitas.n, 1)
})

test('quem abre a tela depois de 5 min vê "nao_confirmado" e uma única conferência encerra a espera', async () => {
  const r = relogio()
  const c = consultas({ situacao: 'aguardando' })
  const out = await acompanharRecibo({ ...c, agora: r.agora, esperar: r.esperar, desde: T0 - 6 * 60_000 })
  assert.equal(out, 'nao_confirmado')
  assert.equal(c.feitas.n, 1)
})

// ---- estado da tela a partir de vpo_requisicoes ----
let n = 0
const req = (acao: string, extra: Partial<RequisicaoVpo> = {}): RequisicaoVpo => ({
  id: `r${++n}`, acao, ambiente: 'homologacao', http_status: 200, id_vpo_antt: null, numero_viagem: null, id_recibo: null,
  total_viagem: null, erro: null, criado_em: new Date(T0 + n * 1000).toISOString(), ...extra,
})
const emProc = (acao: string, desde = T0) => req(acao, { http_status: null, situacao: 'em_processamento', processando_desde: new Date(desde).toISOString() })

test('estado: compra em processamento = "comprando"; compra não pode ser repetida', () => {
  const reqs = [req('simular'), emProc('comprar')]
  assert.equal(estadoVpo(reqs, T0 + 60_000), 'comprando')
  assert.equal(podeComprar('comprando'), false)
  assert.equal(podeCancelar('comprando'), false)
})
test('estado: depois de 5 min sem recibo = "nao_confirmado" (ainda sem poder comprar)', () => {
  const reqs = [req('simular'), emProc('comprar')]
  assert.equal(estadoVpo(reqs, T0 + 6 * 60_000), 'nao_confirmado')
  assert.equal(podeComprar('nao_confirmado'), false)
})
test('estado: cancelamento em processamento = "cancelando"; ao concluir vira "cancelado"', () => {
  const comprada = req('comprar', { id_vpo_antt: 'X' })
  assert.equal(estadoVpo([req('simular'), comprada, emProc('cancelar')], T0 + 1000), 'cancelando')
  const resolvida = req('cancelar', { situacao: 'concluida' })
  assert.equal(estadoVpo([req('simular'), comprada, resolvida], T0 + 1000), 'cancelado')
})
test('estado: compra resolvida pelo recibo = "comprado"', () => {
  const resolvida = req('comprar', { situacao: 'concluida', id_vpo_antt: '669' })
  assert.equal(estadoVpo([req('simular'), resolvida], T0), 'comprado')
  assert.equal(pendenciaVpo([req('simular'), resolvida], T0), null)
})
test('linha enviada sem resposta nenhuma (função cortada) também conta como em processamento', () => {
  const orfa = req('comprar', { http_status: null, erro: null })
  assert.equal(pendenciaVpo([orfa], Date.parse(orfa.criado_em) + 1000)?.acao, 'comprar')
  assert.match(passoDe(emProc('comprar')).detalhe, /processamento/)
})
