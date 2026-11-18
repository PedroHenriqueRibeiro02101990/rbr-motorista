// node --test supabase/functions/_shared/combinacaoVeicular.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriaCombinacao, eixosDaCombinacao } from './combinacaoVeicular.ts'

test('mapa de eixos para categoria da combinacao', () => {
  const esperado: Record<number, string> = { 2: '02', 3: '04', 4: '06', 5: '07', 6: '08', 7: '10', 8: '11', 9: '12', 10: '13', 11: '14', 15: '14' }
  for (const [e, c] of Object.entries(esperado)) assert.equal(categoriaCombinacao(Number(e)), c, `eixos ${e}`)
  assert.equal(categoriaCombinacao(null), null); assert.equal(categoriaCombinacao(1), null)
})
test('truck sem reboque (3 eixos) = 04; cavalo 3 + carreta 3 = 08', () => {
  assert.equal(categoriaCombinacao(eixosDaCombinacao({ quantidade_eixos: 3 }, [])), '04')
  assert.equal(categoriaCombinacao(eixosDaCombinacao({ quantidade_eixos: 3 }, [{ quantidade_eixos: 3 }])), '08')
  assert.equal(eixosDaCombinacao(null, []), null)
})
