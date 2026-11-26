import test from 'node:test'
import assert from 'node:assert/strict'
import { precoPorLucro, referenciaDeVenda, abaixoDoPisoDeMargem } from './precoCotacao.ts'

test('formula da cotacao: custo x (1+lucro) / (1 - aliquota x (1+lucro))', () => {
  const r = precoPorLucro({ custo: 5300, lucroFrac: 0.4, aliquota: 0.06 })
  assert.ok(r.ok)
  assert.equal(r.valorFinal, 8100.44) // 5300 x 1,4 / 0,916
  assert.equal(r.imposto, 486.03)
  assert.equal(r.lucro, 2314.41)
})

test('NAO e custo x (1+margem) / (1-imposto) (7.893,62)', () => {
  const r = precoPorLucro({ custo: 5300, lucroFrac: 0.4, aliquota: 0.06 })
  assert.ok(r.ok && r.valorFinal !== 7893.62)
})

test('custo financeiro repassado entra so no preco; o lucro desconta o custo financeiro', () => {
  const r = precoPorLucro({ custo: 1000, lucroFrac: 0.4, aliquota: 0.06, custoPreco: 1030, custoFin: 30 })
  assert.ok(r.ok)
  assert.equal(r.valorFinal, 1574.24) // 1030 x 1,4 / 0,916
  assert.equal(r.imposto, 94.45)
  assert.equal(r.lucro, 449.79) // 1574,24 - 1000 - 30 - 94,45
})

test('margem alta demais para a aliquota: nao fecha', () => {
  const r = precoPorLucro({ custo: 1000, lucroFrac: 20, aliquota: 0.06 })
  assert.equal(r.ok, false)
})

test('referencia 30/40/50 e aviso abaixo do piso de margem de 26%', () => {
  const o = referenciaDeVenda(5300, 0.06, 0.26)
  assert.deepEqual(o.map((x) => x.lucroPct), [30, 40, 50])
  assert.equal(o[0].abaixoDoMinimo, true) // 30% de lucro sobre custo -> margem ~23%
  assert.equal(o[1].abaixoDoMinimo, false) // 40% -> margem ~28,6%
  assert.equal(o[1].texto, 'Margem 40% . imposto 6%')
  assert.equal(abaixoDoPisoDeMargem(0.2595, 0.26), false) // tolerancia de centavos
})
