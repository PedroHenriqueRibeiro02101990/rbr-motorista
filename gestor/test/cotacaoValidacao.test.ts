// node --test gestor/test/cotacaoValidacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { erroTipoCarga, MSG_TIPO_CARGA } from '../src/lib/cotacaoValidacao.ts'

test('tipo de carga vazio, só espaços ou nulo: erro com a mensagem', () => {
  for (const v of ['', '   ', null, undefined]) assert.equal(erroTipoCarga(v), MSG_TIPO_CARGA)
})

test('tipo de carga escolhido: sem erro', () => {
  assert.equal(erroTipoCarga('Carga Geral'), null)
  assert.equal(erroTipoCarga('Granel solido'), null)
})
