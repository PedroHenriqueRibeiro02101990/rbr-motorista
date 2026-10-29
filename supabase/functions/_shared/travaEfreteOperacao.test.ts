// node --test supabase/functions/_shared/travaEfreteOperacao.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MENSAGEM_HOMOLOGACAO_OPERACAO_REAL, travaEfreteOperacao } from './travaEfreteOperacao.ts'

const HOMOLOGACAO = 'https://dev.efrete.com.br'
const PRODUCAO = 'https://efrete.com.br'

test('homologação + operação real: recusa com a mensagem certa', () => {
  const r = travaEfreteOperacao({ baseUrl: HOMOLOGACAO, operacaoEhTeste: false })
  assert.deepEqual(r, { ok: false, motivo: 'Emissão de CIOT pela efrete está em homologação. Use o CIOT manual nesta operação.' })
  assert.equal(r.ok === false && r.motivo, MENSAGEM_HOMOLOGACAO_OPERACAO_REAL)
})

test('homologação + operação não encontrada (null): recusa', () => {
  assert.equal(travaEfreteOperacao({ baseUrl: HOMOLOGACAO, operacaoEhTeste: null }).ok, false)
})

test('homologação + operação de teste: passa', () => {
  assert.deepEqual(travaEfreteOperacao({ baseUrl: HOMOLOGACAO, operacaoEhTeste: true }), { ok: true })
})

test('produção não é afetada pela trava, com operação real ou de teste', () => {
  assert.deepEqual(travaEfreteOperacao({ baseUrl: PRODUCAO, operacaoEhTeste: false }), { ok: true })
  assert.deepEqual(travaEfreteOperacao({ baseUrl: PRODUCAO, operacaoEhTeste: true }), { ok: true })
  assert.deepEqual(travaEfreteOperacao({ baseUrl: PRODUCAO, operacaoEhTeste: null }), { ok: true })
})
