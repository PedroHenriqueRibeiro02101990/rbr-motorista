// node --test gestor/test/finalizacao.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passosPendentes, resumoFinalizacao } from '../src/lib/finalizacao.ts'

test('B11: passos pendentes mostram só o que falta', () => {
  assert.deepEqual(passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: false, ciotStatus: 'emitido' }).map((p) => p.id), ['mdfe', 'ciot'])
  assert.deepEqual(passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: true, ciotStatus: 'emitido' }).map((p) => p.id), ['ciot'])
  assert.deepEqual(passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: false, ciotStatus: null }).map((p) => p.id), ['mdfe'])
  assert.deepEqual(passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: true, ciotStatus: 'encerrado' }), [])
  assert.deepEqual(passosPendentes({ mdfeAutorizado: false, mdfeEncerrado: false, ciotStatus: 'cancelado' }), [])
})
test('B11: resumo diz qual falhou e o que já foi encerrado', () => {
  assert.equal(resumoFinalizacao([]).tudoCerto, true)
  assert.match(resumoFinalizacao([{ id: 'mdfe', ok: true }, { id: 'ciot', ok: true }]).mensagem, /MDF-e e CIOT/)
  const r = resumoFinalizacao([{ id: 'mdfe', ok: true }, { id: 'ciot', ok: false, erro: 'efrete fora do ar' }])
  assert.equal(r.tudoCerto, false)
  assert.match(r.mensagem, /CIOT \(efrete fora do ar\)/)
  assert.match(r.mensagem, /Já encerrado: MDF-e/)
})
