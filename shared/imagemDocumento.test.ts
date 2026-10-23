// node --test shared/imagemDocumento.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhoDocumento, dimensoesAlvo, ehImagem } from './imagemDocumento.ts'

test('reduz para 1600 px no maior lado, mantendo a proporção', () => {
  assert.deepEqual(dimensoesAlvo(4032, 3024), { largura: 1600, altura: 1200 })
  assert.deepEqual(dimensoesAlvo(3024, 4032), { largura: 1200, altura: 1600 })
})

test('não aumenta foto pequena e ignora tamanho inválido', () => {
  assert.deepEqual(dimensoesAlvo(800, 600), { largura: 800, altura: 600 })
  assert.deepEqual(dimensoesAlvo(0, 600), { largura: 0, altura: 0 })
})

test('caminho no Storage: pessoa/<id>/<tipo>-<timestamp>.jpg', () => {
  assert.equal(caminhoDocumento('abc', 'cnh', 1792700000000), 'pessoa/abc/cnh-1792700000000.jpg')
})

test('reconhece imagem pelo MIME', () => {
  assert.equal(ehImagem('image/heic'), true)
  assert.equal(ehImagem('application/pdf'), false)
  assert.equal(ehImagem(null), false)
})
