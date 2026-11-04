// node --test gestor/test/divergenciasDocumentos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenciasDocumentos, pesoDoCte } from '../src/lib/divergenciasDocumentos.ts'

const ok = {
  pesoNf: 8721,
  valorNf: 5000,
  ncmNf: '49111090',
  cte: { quantidades: [{ quantidade: 8721 }], valor_total_carga: 5000 },
  mdfe: { peso_bruto: 8721, valor_total_carga: 5000, codigo_ncm_produto: '49111090' },
}

test('tudo igual: sem alertas', () => {
  assert.deepEqual(divergenciasDocumentos(ok), [])
})

test('NF sem peso: bloqueia e não inventa peso', () => {
  const a = divergenciasDocumentos({ ...ok, pesoNf: null, cte: null, mdfe: null })
  assert.equal(a.length, 1)
  assert.equal(a[0].gravidade, 'bloqueia')
  assert.match(a[0].texto, /não trouxe o peso/)
})

test('o caso real do dia: CIOT 4.000 kg x MDF-e 8.721 kg aparece como divergência entre CT-e e MDF-e', () => {
  const a = divergenciasDocumentos({ ...ok, cte: { quantidades: [{ quantidade: 4000 }], valor_total_carga: 5000 } })
  assert.ok(a.some((x) => x.gravidade === 'bloqueia' && /CT-e \(4\.000 kg\) e MDF-e \(8\.721 kg\)/.test(x.texto)))
})

test('valor e NCM divergentes', () => {
  const a = divergenciasDocumentos({ ...ok, mdfe: { peso_bruto: 8721, valor_total_carga: 4000, codigo_ncm_produto: '12345678' } })
  assert.ok(a.some((x) => /Valor da carga diferente/.test(x.texto)))
  assert.ok(a.some((x) => /NCM do MDF-e/.test(x.texto)))
})

test('pesoDoCte lê quantidades[0] com vírgula ou número', () => {
  assert.equal(pesoDoCte({ quantidades: [{ quantidade: '1234,5' }] }), 1234.5)
  assert.equal(pesoDoCte(null), null)
})
