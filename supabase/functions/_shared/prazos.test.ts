// node --test supabase/functions/_shared/prazos.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ciotObrigatorioNoMdfe, diasParaCiotObrigatorio, podeCancelarCiot, podeCancelarCte, podeCancelarMdfe,
  podeEncerrarCiot, podeEncerrarMdfe, podeSubstituirCte, vigenciaVpoValida,
} from './prazos.ts'

const H = 3_600_000
const D = 24 * H
const t0 = Date.UTC(2026, 9, 1)

test('CT-e: cancela em 7 dias sem MDF-e ativo', () => {
  assert.equal(podeCancelarCte(t0, t0 + 7 * D, false).pode, true)
  assert.equal(podeCancelarCte(t0, t0 + 7 * D + 1, false).pode, false)
  assert.equal(podeCancelarCte(t0, t0 + D, true).pode, false)
})
test('CT-e: substituição em 60 dias', () => {
  assert.equal(podeSubstituirCte(t0, t0 + 60 * D).pode, true)
  assert.equal(podeSubstituirCte(t0, t0 + 60 * D + 1).pode, false)
})
test('MDF-e: cancela em 24 h e viagem não iniciada; encerra em 30 dias', () => {
  assert.equal(podeCancelarMdfe(t0, t0 + 24 * H, false).pode, true)
  assert.equal(podeCancelarMdfe(t0, t0 + 24 * H + 1, false).pode, false)
  assert.equal(podeCancelarMdfe(t0, t0 + H, true).pode, false)
  assert.equal(podeEncerrarMdfe(t0, t0 + 30 * D).pode, true)
  assert.equal(podeEncerrarMdfe(t0, t0 + 30 * D + 1).pode, false)
})
test('CIOT: cancela até 24 h antes do início; encerra em 5 dias (30 para TAC-Agregado)', () => {
  assert.equal(podeCancelarCiot(t0 + 24 * H, t0).pode, true)
  assert.equal(podeCancelarCiot(t0 + 24 * H - 1, t0).pode, false)
  assert.equal(podeEncerrarCiot(t0, t0 + 5 * D).pode, true)
  assert.equal(podeEncerrarCiot(t0, t0 + 5 * D + 1).pode, false)
  assert.equal(podeEncerrarCiot(t0, t0 + 30 * D, true).pode, true)
})
test('VPO: validade de até 15 dias', () => {
  assert.equal(vigenciaVpoValida(t0, t0 + 15 * D).pode, true)
  assert.equal(vigenciaVpoValida(t0, t0 + 15 * D + 1).pode, false)
  assert.equal(vigenciaVpoValida(t0 + D, t0).pode, false)
})
test('CIOT obrigatório no MDF-e a partir de 23/11/2026 (rejeição 684)', () => {
  assert.equal(ciotObrigatorioNoMdfe(Date.UTC(2026, 10, 22, 12)), false)
  assert.equal(ciotObrigatorioNoMdfe(Date.UTC(2026, 10, 23, 12)), true)
  assert.equal(diasParaCiotObrigatorio(Date.UTC(2026, 9, 30, 3)), 24)
})
