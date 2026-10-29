// node --test gestor/test/listaOperacoes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FILTROS_VAZIOS, SEM_MOTORISTA, passaFiltrosLista, temFiltro } from '../src/lib/listaOperacoes.ts'

const op = { criadaEm: new Date(2026, 9, 20, 12, 0).toISOString(), clienteId: 'c1', motoristaId: 'm1' }

test('sem filtros passa tudo', () => {
  assert.equal(passaFiltrosLista(op, FILTROS_VAZIOS), true)
  assert.equal(temFiltro(FILTROS_VAZIOS), false)
})
test('período: limites inclusivos', () => {
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, de: '2026-10-20', ate: '2026-10-20' }), true)
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, de: '2026-10-21' }), false)
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, ate: '2026-10-19' }), false)
})
test('cliente e motorista', () => {
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, clienteId: 'c1' }), true)
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, clienteId: 'c2' }), false)
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, motoristaId: 'm2' }), false)
  assert.equal(passaFiltrosLista(op, { ...FILTROS_VAZIOS, motoristaId: SEM_MOTORISTA }), false)
  assert.equal(passaFiltrosLista({ ...op, motoristaId: null }, { ...FILTROS_VAZIOS, motoristaId: SEM_MOTORISTA }), true)
})
