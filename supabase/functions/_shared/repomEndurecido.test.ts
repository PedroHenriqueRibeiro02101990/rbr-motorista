// node --test supabase/functions/_shared/repomEndurecido.test.ts   (mocks; nenhuma chamada a Repom)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FilaPorChave, chaveFila, emitirOuAdotar, eventoDeErro, montarMinimumFreightCost, numeroDoCartao, podeAutorizarPagamento, preChecagemRepom, traduzirErroRepom, validarImplemento, validarPiso, validarVinculoCartao } from './repomEndurecido.ts'

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('dois contratos do mesmo prestador+motorista saem em fila, nunca em paralelo; prestadores diferentes seguem em paralelo', async () => {
  const fila = new FilaPorChave()
  const log: string[] = []; let ativos = 0, maxMesmo = 0
  const tarefa = (nome: string) => async () => { ativos++; maxMesmo = Math.max(maxMesmo, ativos); log.push(`ini ${nome}`); await dorme(15); log.push(`fim ${nome}`); ativos--; return nome }
  const k = chaveFila('11.222.333/0001-81', '529.982.247-25')
  await Promise.all([fila.rodar(k, tarefa('A1')), fila.rodar(k, tarefa('A2'))])
  assert.equal(maxMesmo, 1); assert.deepEqual(log, ['ini A1', 'fim A1', 'ini A2', 'fim A2'])
  ativos = 0; maxMesmo = 0
  await Promise.all([fila.rodar('x|1', tarefa('B1')), fila.rodar('y|2', tarefa('B2'))])
  assert.equal(maxMesmo, 2)
})
test('a fila segue mesmo se uma tarefa falhar', async () => {
  const fila = new FilaPorChave()
  await assert.rejects(fila.rodar('k', async () => { throw new Error('x') }))
  assert.equal(await fila.rodar('k', async () => 'ok'), 'ok')
})
test('reenvio apos timeout consulta o Identifier e adota o contrato existente (nunca cria de novo)', async () => {
  let emissoes = 0
  const r = await emitirOuAdotar('C123', {
    emitir: async () => { emissoes++; return { ok: false as const, erro: 'timeout', timeout: true } },
    consultarPorIdentifier: async () => ({ existe: true, codigoContrato: '999' }),
  })
  assert.deepEqual(r, { estado: 'adotado', codigoContrato: '999' }); assert.equal(emissoes, 1)
  const j = await emitirOuAdotar('C123', { emitir: async () => ({ ok: false as const, erro: 'Processo do cliente ja esta cadastrado' }), consultarPorIdentifier: async () => ({ existe: true, codigoContrato: '555' }) })
  assert.equal(j.estado, 'adotado')
  const n = await emitirOuAdotar('C123', { emitir: async () => ({ ok: false as const, erro: 'Processo do cliente já está cadastrado' }), consultarPorIdentifier: async () => ({ existe: false }) })
  assert.equal(n.estado, 'erro')
  assert.equal((await emitirOuAdotar('C1', { emitir: async () => ({ ok: true as const, codigoContrato: '7' }), consultarPorIdentifier: async () => ({ existe: false }) })).estado, 'emitido')
})
test('valor abaixo do piso bloqueia (CPN1377: R$ 1.000 rejeitada, R$ 3.500 aceita); sem piso configurado so avisa', () => {
  assert.equal(validarPiso(1000, 3000).ok, false)
  assert.equal(validarPiso(3500, 3000).ok, true)
  const s = validarPiso(1000, null); assert.equal(s.ok, true); assert.ok(s.aviso)
})
test('cavalo sem carreta bloqueia (AJE5040)', () => {
  assert.equal(validarImplemento({ eCavalo: true, carretas: 0 }).ok, false)
  assert.equal(validarImplemento({ eCavalo: true, carretas: 1 }).ok, true)
  assert.equal(validarImplemento({ eCavalo: false, carretas: 0 }).ok, true)
})
test('conta digital manda CardNumber 0; cartao fisico de outro motorista bloqueia (BWH3818)', () => {
  assert.equal(numeroDoCartao({ contaDigital: true, cartaoFisico: '123' }).cardNumber, 0)
  assert.equal(numeroDoCartao({ contaDigital: false, cartaoFisico: '700023471' }).cardNumber, '700023471')
  assert.ok(numeroDoCartao({ contaDigital: false }).erro)
  const v = [{ cartao: '700023471', prestadorDoc: '11222333000181', motoristaCpf: '52998224725' }]
  assert.equal(validarVinculoCartao('700023471', '11222333000181', '52998224725', v).ok, true)
  assert.equal(validarVinculoCartao('700023471', '11222333000181', '11144477735', v).ok, false)
  assert.equal(validarVinculoCartao('999', '1', '2', v).ok, true)
})
test('motorista nao cadastrado (801) e veiculo fora do prestador (760) bloqueiam com a mensagem certa, antes de enviar', () => {
  const p = preChecagemRepom({ motoristaCadastradoNaRepom: false, veiculoNoPrestador: false, eCavalo: false, temImplemento: false })
  assert.match(p[0].mensagem, /falta cadastrar o motorista na Repom/); assert.match(p[1].mensagem, /falar com a Karen/)
})
test('MinimumFreightCost sai como objeto com as 4 chaves', () => {
  const o = montarMinimumFreightCost({ distanceTravel: 850, emptyReturn: true, highPerformanceTransport: false, veichleComposition: 6 })
  assert.deepEqual(Object.keys(o), ['DistanceTravel', 'EmptyReturn', 'HighPerformanceTransport', 'VeichleComposition'])
  assert.equal(typeof o, 'object')
})
test('PaymentAuthorization antes de Quitada e recusada localmente; erro 2768 vira pendencia sem retry', () => {
  assert.equal(podeAutorizarPagamento('InTransit').ok, false); assert.equal(podeAutorizarPagamento('Quitada').ok, true)
  const e = traduzirErroRepom('Erro 2768: ControleSaldo nao configurado')
  assert.equal(e?.codigo, '2768'); assert.equal(e?.podeTentarDeNovo, false); assert.equal(e?.pendenciaExterna, true); assert.equal(e?.dono, 'Karen')
  assert.equal(traduzirErroRepom('801 motorista')?.dono, 'Eduardo')
  assert.equal(traduzirErroRepom('texto qualquer'), null)
})
test('evento de erro nao leva dados pessoais', () => {
  const ev = eventoDeErro('op-1', traduzirErroRepom('760')!)
  assert.ok(!/\d{11}/.test(JSON.stringify(ev))); assert.equal(ev.origem, 'repom')
})
test('760 com mensagem de data de pagamento e tratado a parte (dono Pedro, 1 nova tentativa com o dia seguinte); 760 sem data continua generico', () => {
  const d = traduzirErroRepom('A data de pagamento deve ser maior ou igual a data atual (760)')
  assert.equal(d?.codigo, '760'); assert.equal(d?.dono, 'Pedro'); assert.equal(d?.podeTentarDeNovo, true); assert.match(d!.mensagem, /dia seguinte/)
  const g = traduzirErroRepom('Erro 760: veiculo nao pertence ao prestador')
  assert.equal(g?.dono, 'Karen'); assert.equal(g?.podeTentarDeNovo, false); assert.match(g!.mensagem, /data de pagamento invalida/)
  assert.equal(podeAutorizarPagamento('Paid').ok, true)
})
