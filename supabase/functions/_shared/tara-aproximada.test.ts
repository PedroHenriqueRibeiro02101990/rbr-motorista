// node --test supabase/functions/_shared/tara-aproximada.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverTara } from './tara-aproximada.ts'

const carreta = { tipo_veiculo: 'semirreboque', e_reboque: true, quantidade_eixos: 3, tipo_carroceria: 'aberta' }

test('AVD9I97: PBT 25.5 e capacidade 17.21 derivam 8.290 kg', () => {
  const r = resolverTara(carreta, { pbt_kg: 25500, capacidade_kg: 17210 })
  assert.equal(r.valor, 8290); assert.equal(r.origem, 'derivada_crlv')
})
test('QJR6644: 25.5 e 16.33 derivam 9.170 kg', () => {
  assert.equal(resolverTara(carreta, { pbt_kg: 25500, capacidade_kg: 16330 }).valor, 9170)
})
test('LXX2816: capacidade igual ao PBT nao deriva (cai no nivel 3)', () => {
  const r = resolverTara(carreta, { pbt_kg: 35000, capacidade_kg: 35000 })
  assert.notEqual(r.origem, 'derivada_crlv')
  assert.equal(r.origem, 'aproximada_tabela'); assert.equal(r.valor, 7000)
})
test('cavalo 2 eixos sem tara: 7.700 aproximada com aviso', () => {
  const r = resolverTara({ tipo_veiculo: 'cavalo mecanico', quantidade_eixos: 2 })
  assert.equal(r.valor, 7700); assert.equal(r.origem, 'aproximada_tabela'); assert.match(r.aviso ?? '', /aproximada/)
  assert.equal(resolverTara({ tipo_veiculo: 'caminhao trator', quantidade_eixos: 3 }).valor, 9500)
})
test('tara 25.5 absurda: ignorada, usa nivel 2 ou 3 com aviso e nao reescreve', () => {
  const v = { ...carreta, tara_kg: 25.5 }
  const r = resolverTara(v, { pbt_kg: 25500, capacidade_kg: 16330 })
  assert.equal(r.ignorouGravada, true); assert.equal(r.valor, 9170); assert.match(r.aviso ?? '', /ignorada/)
  assert.equal(v.tara_kg, 25.5)
  const c = resolverTara({ tipo_veiculo: 'cavalo', quantidade_eixos: 3, tara_kg: 26 })
  assert.equal(c.valor, 9500); assert.equal(c.ignorouGravada, true)
})
test('tara confirmada plausivel e usada (nivel 1)', () => {
  const r = resolverTara({ tipo_veiculo: 'cavalo', quantidade_eixos: 3, tara_kg: 8100 })
  assert.deepEqual([r.valor, r.origem, r.aviso], [8100, 'confirmada', null])
})
test('caminhao de chassi sem tara pede tara manual; carreta 2 eixos e basculante 3 eixos', () => {
  const r = resolverTara({ tipo_veiculo: 'truck', quantidade_eixos: 2 })
  assert.equal(r.pedirManual, true); assert.equal(r.valor, null)
  assert.equal(resolverTara({ tipo_veiculo: 'carreta', e_reboque: true, quantidade_eixos: 2, tipo_carroceria: 'aberta' }).pedirManual, true)
  assert.equal(resolverTara({ tipo_veiculo: 'carreta', e_reboque: true, quantidade_eixos: 3, tipo_carroceria: 'cacamba' }).valor, 9200)
})
