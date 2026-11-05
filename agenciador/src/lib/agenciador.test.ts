// node --test agenciador/src/lib/agenciador.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validarLogo, dimensoesFinais } from './logo.ts'
import { etapaDaOperacao } from './etapas.ts'

test('logo: so PNG/JPG/WebP ate 1 MB, SVG nunca', () => {
  assert.equal(validarLogo('image/png', 1000), null)
  assert.equal(validarLogo('image/jpeg', 1024 * 1024), null)
  assert.equal(validarLogo('image/webp', 10), null)
  assert.match(validarLogo('image/svg+xml', 10) ?? '', /SVG/)
  assert.match(validarLogo('image/png', 1024 * 1024 + 1) ?? '', /1 MB/)
})
test('logo: redimensiona para no maximo 512 px mantendo proporcao', () => {
  assert.deepEqual(dimensoesFinais(2000, 1000), { w: 512, h: 256 })
  assert.deepEqual(dimensoesFinais(100, 50), { w: 100, h: 50 })
})
test('linha do tempo em palavras simples', () => {
  assert.equal(etapaDaOperacao('alocando_motorista'), 0)
  assert.equal(etapaDaOperacao('em_transito'), 3)
  assert.equal(etapaDaOperacao('entregue'), 4)
})
test('demo: so monta com a variavel de Preview; flag de modulos RBR desligada por padrao', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /VITE_DEMO_AGENCIADOR === 'true'/)
  assert.match(app, /DEMO_AGENCIADOR && window\.location\.pathname\.startsWith\('\/demo'\)/)
  const flags = readFileSync(new URL('./flags.ts', import.meta.url), 'utf8')
  assert.match(flags, /VITE_AGENCIADOR_MODULOS_RBR === 'true'/)
})
