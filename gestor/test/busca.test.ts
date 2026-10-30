// node --test gestor/test/busca.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ocultos, termoDeBusca, textoOcultos } from '../src/lib/busca.ts'

test('termo: tira curingas e espaços; curto demais não busca', () => {
  assert.equal(termoDeBusca('  Santos%  _  '), 'Santos')
  assert.equal(termoDeBusca('ab'), null)
  assert.equal(termoDeBusca('%%_'), null)
  assert.equal(termoDeBusca('São   Paulo'), 'São Paulo')
})

test('ocultos nunca fica negativo', () => {
  assert.equal(ocultos(5, 3), 2)
  assert.equal(ocultos(3, 3), 0)
  assert.equal(ocultos(2, 4), 0)
})

test('texto dos ocultos: nada quando zero, singular e plural', () => {
  assert.equal(textoOcultos(0), null)
  assert.equal(textoOcultos(1), '1 resultado oculto pela sua função')
  assert.equal(textoOcultos(7), '7 resultados ocultos pela sua função')
})
