// node --test gestor/test/navegacaoServico.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { destinosDoServico, urlSecao } from '../src/lib/navegacaoServico.ts'

const por = (l: ReturnType<typeof destinosDoServico>, s: string) => l.find((d) => d.secao === s)!

test('URLs de cada painel', () => {
  assert.equal(urlSecao('cotacao', 'c1'), '/cotacao?id=c1')
  assert.equal(urlSecao('operacao', 'o1'), '/operacoes?op=o1')
  assert.equal(urlSecao('fiscal', 'o1'), '/fiscal?op=o1')
})
test('no painel da operação: os três levam ao mesmo serviço', () => {
  const d = destinosDoServico({ atual: 'operacao', cotacaoId: 'c1', operacaoId: 'o1', ops: null })
  assert.equal(por(d, 'cotacao').url, '/cotacao?id=c1')
  assert.equal(por(d, 'operacao').atual, true)
  assert.equal(por(d, 'fiscal').url, '/fiscal?op=o1')
})
test('operação sem cotação: botão da cotação desligado com motivo', () => {
  const c = por(destinosDoServico({ atual: 'fiscal', cotacaoId: null, operacaoId: 'o1', ops: null }), 'cotacao')
  assert.equal(c.url, null)
  assert.match(c.motivo ?? '', /não nasceu de uma cotação/)
})
test('na cotação: sem operação desliga; uma leva direto; várias pedem escolha', () => {
  const sem = destinosDoServico({ atual: 'cotacao', cotacaoId: 'c1', operacaoId: null, ops: [] })
  assert.match(por(sem, 'operacao').motivo ?? '', /ainda não virou operação/)
  assert.match(por(sem, 'fiscal').motivo ?? '', /ainda não virou operação/)
  const uma = destinosDoServico({ atual: 'cotacao', cotacaoId: 'c1', operacaoId: null, ops: [{ id: 'o1', status: 'x' }] })
  assert.equal(por(uma, 'fiscal').url, '/fiscal?op=o1')
  const varias = destinosDoServico({ atual: 'cotacao', cotacaoId: 'c1', operacaoId: null, ops: [{ id: 'o1', status: 'x' }, { id: 'o2', status: 'y' }] })
  assert.equal(por(varias, 'operacao').url, null)
  assert.equal(por(varias, 'operacao').escolhas.length, 2)
  assert.equal(por(varias, 'operacao').motivo, null)
})
test('operações ainda carregando', () => {
  const d = destinosDoServico({ atual: 'cotacao', cotacaoId: 'c1', operacaoId: null, ops: null })
  assert.match(por(d, 'operacao').motivo ?? '', /Carregando/)
})
