// node --test gestor/test/painelOperacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoCurto, resumoNfes, vizinhos } from '../src/lib/painelOperacao.ts'

test('código curto: OP- + 4 primeiros caracteres do id', () => {
  assert.equal(codigoCurto('0CA2b1f4-1111-2222-3333-444455556666'), 'OP-0ca2')
})
test('vizinhos: meio, primeira, última e fora da lista', () => {
  const ids = ['a', 'b', 'c']
  assert.deepEqual(vizinhos(ids, 'b'), { posicao: 2, total: 3, anteriorId: 'a', proximaId: 'c' })
  assert.deepEqual(vizinhos(ids, 'a'), { posicao: 1, total: 3, anteriorId: null, proximaId: 'b' })
  assert.deepEqual(vizinhos(ids, 'c'), { posicao: 3, total: 3, anteriorId: 'b', proximaId: null })
  assert.equal(vizinhos(ids, 'x'), null)
})
test('resumo das NF-es', () => {
  assert.equal(resumoNfes([]), 'sem NF-e')
  assert.equal(resumoNfes(['10', '11']), '10, 11')
  assert.equal(resumoNfes(['1', '2', '3', '4', '5']), '1, 2, 3 +2')
})
