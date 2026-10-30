// node --test gestor/test/preVooEtapas.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abaDaPendencia, ROTULO_ABA } from '../src/lib/preVooEtapas.ts'

test('pendência de motorista, RNTRC e rastreio vai para a aba Motorista', () => {
  for (const i of ['motorista_veiculo', 'rntrc', 'rastreio']) assert.equal(abaDaPendencia(i), 'motorista')
})

test('valor e piso ANTT vão para o Financeiro', () => {
  assert.equal(abaDaPendencia('valor'), 'financeiro')
  assert.equal(abaDaPendencia('piso_antt'), 'financeiro')
})

test('o resto (nfe, ciot, averbação, bloqueio…) e item desconhecido vão para o Fiscal', () => {
  for (const i of ['nfe', 'ciot', 'averbacao', 'bloqueio_fiscal', 'seguro', 'item_novo_qualquer']) assert.equal(abaDaPendencia(i), 'fiscal')
})

test('todo destino tem rótulo de botão', () => {
  for (const a of ['fiscal', 'motorista', 'financeiro'] as const) assert.ok(ROTULO_ABA[a].startsWith('Ir para'))
})
