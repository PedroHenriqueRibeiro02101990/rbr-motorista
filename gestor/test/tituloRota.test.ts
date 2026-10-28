// node --test gestor/test/tituloRota.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tituloRota } from '../src/lib/tituloRota.ts'

test('formato CIDADE/UF → CIDADE/UF, em maiúsculas', () => {
  assert.equal(tituloRota({ cidade_origem: 'Campinas', uf_origem: 'sp', cidade_destino: 'Curitiba', uf_destino: 'PR' }), 'CAMPINAS/SP → CURITIBA/PR')
})

test('parte faltando vira ?', () => {
  assert.equal(tituloRota({ cidade_origem: 'Itupeva', uf_origem: 'SP' }), 'ITUPEVA/SP → ?')
  assert.equal(tituloRota({ cidade_origem: 'Itupeva', uf_origem: null, cidade_destino: 'Jundiaí', uf_destino: 'SP' }), 'ITUPEVA/? → JUNDIAÍ/SP')
})

test('várias entregas sem destino único', () => {
  assert.equal(tituloRota({ cidade_origem: 'Campinas', uf_origem: 'SP', tipo_cotacao: 'varias_entregas' }), 'CAMPINAS/SP → VÁRIOS DESTINOS')
})
