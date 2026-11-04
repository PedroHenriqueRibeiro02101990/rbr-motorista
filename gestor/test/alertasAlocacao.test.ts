// node --test gestor/test/alertasAlocacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alertasDeAlocacao, type VeiculoAlocacao } from '../src/lib/alertasAlocacao.ts'

const HOJE = '2026-11-03'
const ok: VeiculoAlocacao = { placa: 'ABC1D23', crlv_exercicio: 2026, rntrc_status: 'ativo', rntrc_validade: '2027-05-01', tara_kg: 7500, quantidade_eixos: 5, uf_licenciamento: 'SP', is_veiculo_proprio: true }

test('veículo completo e em dia: sem alertas', () => {
  assert.deepEqual(alertasDeAlocacao(ok, null, HOJE), [])
})

test('CRLV de dois anos atrás vence; do ano anterior ainda vale; sem exercício bloqueia', () => {
  assert.match(alertasDeAlocacao({ ...ok, crlv_exercicio: 2024 }, null, HOJE)[0].texto, /CRLV vencido \(exercício 2024\)/)
  assert.deepEqual(alertasDeAlocacao({ ...ok, crlv_exercicio: 2025 }, null, HOJE), [])
  assert.match(alertasDeAlocacao({ ...ok, crlv_exercicio: null }, null, HOJE)[0].texto, /CRLV sem exercício/)
})

test('RNTRC do veículo inativo ou vencido bloqueia', () => {
  assert.match(alertasDeAlocacao({ ...ok, rntrc_status: 'inativo' }, null, HOJE)[0].texto, /RNTRC do veículo não está ativo/)
  assert.match(alertasDeAlocacao({ ...ok, rntrc_validade: '2026-10-01' }, null, HOJE)[0].texto, /RNTRC do veículo vencido/)
})

test('sem tara, sem UF de licenciamento (bloqueiam) e sem eixos (avisa)', () => {
  const a = alertasDeAlocacao({ ...ok, tara_kg: null, uf_licenciamento: null, quantidade_eixos: null }, null, HOJE)
  assert.equal(a.filter((x) => x.gravidade === 'bloqueia').length, 2)
  assert.equal(a.filter((x) => x.gravidade === 'avisa').length, 1)
})

test('veículo de terceiro: exige titular com RNTRC de 8 dígitos, ativo e em dia', () => {
  const terceiro = { ...ok, is_veiculo_proprio: false }
  assert.match(alertasDeAlocacao(terceiro, null, HOJE)[0].texto, /sem titular/)
  assert.match(alertasDeAlocacao(terceiro, { rntrc_numero: '123', rntrc_status: 'ativo' }, HOJE)[0].texto, /8 dígitos/)
  assert.match(alertasDeAlocacao(terceiro, { rntrc_numero: '012345678', rntrc_status: 'suspenso' }, HOJE)[0].texto, /titular não está ativo/)
  assert.match(alertasDeAlocacao(terceiro, { rntrc_numero: '12345678', rntrc_status: 'ativo', rntrc_validade: '2026-01-01' }, HOJE)[0].texto, /titular vencido/)
  assert.deepEqual(alertasDeAlocacao(terceiro, { rntrc_numero: '12345678', rntrc_status: 'ativo', rntrc_validade: '2027-01-01' }, HOJE), [])
})

test('sem veículo na sugestão: só avisa', () => {
  assert.equal(alertasDeAlocacao(null, null, HOJE)[0].gravidade, 'avisa')
})
