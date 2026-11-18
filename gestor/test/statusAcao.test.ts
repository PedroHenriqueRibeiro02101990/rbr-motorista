// node --test gestor/test/statusAcao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataHoraCurta, linhaConfirmacao } from '../src/lib/statusAcao.ts'

test('linha permanente com data, hora e quem fez (horario de Brasilia)', () => {
  assert.equal(dataHoraCurta('2026-11-18T07:20:00Z'), '18/11 04:20')
  assert.equal(linhaConfirmacao('Lancado', '2026-11-18T07:20:00Z', 'Eduardo'), 'Lancado em 18/11 04:20 por Eduardo')
  assert.equal(linhaConfirmacao('Lancado', null), 'Lancado')
})
