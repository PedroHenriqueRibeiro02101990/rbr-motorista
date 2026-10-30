// node --test gestor/test/inicioPorFuncao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocosDaFuncao, funcaoInicial } from '../src/lib/inicioPorFuncao.ts'

test('Geral mostra tudo, sem atalhos extras', () => {
  const b = blocosDaFuncao('geral')
  assert.deepEqual([b.mapa, b.caixa, b.comercial], [true, true, true])
  assert.equal(b.atalhos.length, 0)
})

test('cada função vê só o seu bloco de números e tem atalhos', () => {
  assert.deepEqual(blocosDaFuncao('financeiro'), { mapa: false, caixa: true, comercial: false, atalhos: blocosDaFuncao('financeiro').atalhos })
  assert.equal(blocosDaFuncao('comercial').caixa, false)
  assert.equal(blocosDaFuncao('operacao').mapa, true)
  assert.equal(blocosDaFuncao('fiscal').mapa, false)
  for (const f of ['comercial', 'operacao', 'fiscal', 'financeiro'] as const) assert.ok(blocosDaFuncao(f).atalhos.length > 0)
})

test('visão inicial: função única vira a visão; várias ou nenhuma, Geral; escolha guardada vence', () => {
  assert.equal(funcaoInicial(['fiscal'], null), 'fiscal')
  assert.equal(funcaoInicial(['fiscal', 'financeiro'], null), 'geral')
  assert.equal(funcaoInicial([], null), 'geral')
  assert.equal(funcaoInicial(['fiscal'], 'comercial'), 'comercial')
  assert.equal(funcaoInicial(['fiscal'], 'lixo'), 'fiscal')
})
