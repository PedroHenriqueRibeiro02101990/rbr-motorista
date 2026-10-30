// node --test supabase/functions/proposta-publica/regras.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoValido, ipDaRequisicao, situacaoDoLink, validarAceite } from './regras.ts'

const agora = Date.UTC(2026, 10, 10, 12, 0, 0)

test('situação do link: válido, aceito, perdido e expirado (aceito vence os outros)', () => {
  assert.equal(situacaoDoLink({ expira_em: '2026-11-20T00:00:00Z', perdida_em: null, aceita_em: null }, agora), 'valido')
  assert.equal(situacaoDoLink({ expira_em: null, perdida_em: null, aceita_em: null }, agora), 'valido')
  assert.equal(situacaoDoLink({ expira_em: '2026-11-01T00:00:00Z', perdida_em: null, aceita_em: null }, agora), 'expirado')
  assert.equal(situacaoDoLink({ expira_em: '2026-11-20T00:00:00Z', perdida_em: '2026-11-05T00:00:00Z', aceita_em: null }, agora), 'perdido')
  assert.equal(situacaoDoLink({ expira_em: '2026-11-01T00:00:00Z', perdida_em: '2026-11-05T00:00:00Z', aceita_em: '2026-10-30T00:00:00Z' }, agora), 'aceito')
})

test('aceite exige nome e cargo; limpa espaços', () => {
  assert.deepEqual(validarAceite('  Maria   Souza ', ' Gerente  '), { ok: true, nome: 'Maria Souza', cargo: 'Gerente' })
  assert.equal(validarAceite('Ma', 'Gerente').ok, false)
  assert.equal(validarAceite('Maria Souza', '').ok, false)
  assert.equal(validarAceite(null, null).ok, false)
  assert.equal(validarAceite('x'.repeat(121), 'Gerente').ok, false)
})

test('código do link: só 32 caracteres hexadecimais minúsculos', () => {
  assert.equal(codigoValido('0123456789abcdef0123456789abcdef'), true)
  assert.equal(codigoValido('0123456789ABCDEF0123456789ABCDEF'), false)
  assert.equal(codigoValido("abc' or 1=1"), false)
  assert.equal(codigoValido(123), false)
  assert.equal(codigoValido(''), false)
})

test('ip: primeiro da cadeia; vazio ou enorme vira desconhecido', () => {
  assert.equal(ipDaRequisicao('203.0.113.9, 10.0.0.1'), '203.0.113.9')
  assert.equal(ipDaRequisicao(null), 'desconhecido')
  assert.equal(ipDaRequisicao('x'.repeat(100)), 'desconhecido')
})
