// node --test gestor/test/erroSupabase.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemErroSalvar } from '../src/lib/erroSupabase.ts'

test('objeto do Supabase (não é Error) mostra o motivo real', () => {
  assert.equal(mensagemErroSalvar({ message: 'Informe o número da nota.' }, 'padrão'), 'Informe o número da nota.')
})
test('CPF duplicado', () => {
  const e = { code: '23505', message: 'duplicate key value violates unique constraint "pessoas_cpf_key"' }
  assert.equal(mensagemErroSalvar(e, 'padrão'), 'Já existe um cadastro com esse CPF.')
})
test('campo obrigatório vazio', () => {
  const e = { code: '23502', message: 'null value in column "nome" of relation "pessoas" violates not-null constraint' }
  assert.match(mensagemErroSalvar(e, 'padrão'), /"nome"/)
})
test('sem mensagem cai no padrão', () => {
  assert.equal(mensagemErroSalvar(null, 'padrão'), 'padrão')
})
