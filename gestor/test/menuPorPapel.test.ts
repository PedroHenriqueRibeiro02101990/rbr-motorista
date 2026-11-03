// node --test gestor/test/menuPorPapel.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeVerNoMenu } from '../src/lib/menuPorPapel.ts'

test('gestor vê tudo', () => {
  for (const r of ['/', '/cotacao', '/financeiro', '/saude-fiscal', '/qualquer']) assert.equal(podeVerNoMenu('gestor_rbr', r), true)
})

test('cada função vê só o seu', () => {
  assert.equal(podeVerNoMenu('comercial', '/cotacao'), true)
  assert.equal(podeVerNoMenu('comercial', '/financeiro'), false)
  assert.equal(podeVerNoMenu('operacao', '/operacoes'), true)
  assert.equal(podeVerNoMenu('operacao', '/fiscal'), false)
  assert.equal(podeVerNoMenu('fiscal', '/fiscal'), true)
  assert.equal(podeVerNoMenu('fiscal', '/cotacao'), false)
  assert.equal(podeVerNoMenu('financeiro', '/financeiro'), true)
  assert.equal(podeVerNoMenu('financeiro', '/mapa'), false)
})

test('todo mundo tem Início, Busca e Avisos; papel desconhecido só isso', () => {
  for (const p of ['comercial', 'operacao', 'fiscal', 'financeiro', 'outro', null, undefined]) {
    for (const r of ['/', '/busca', '/avisos']) assert.equal(podeVerNoMenu(p, r), true)
  }
  assert.equal(podeVerNoMenu('outro', '/operacoes'), false)
})

test('Serviços aparece para quem usa cotação, operações ou fiscal', () => {
  for (const p of ['comercial', 'operacao', 'fiscal', 'gestor_rbr']) assert.equal(podeVerNoMenu(p, '/servicos'), true)
  assert.equal(podeVerNoMenu('financeiro', '/servicos'), true) // financeiro vê operações
  assert.equal(podeVerNoMenu('outro', '/servicos'), false)
})
