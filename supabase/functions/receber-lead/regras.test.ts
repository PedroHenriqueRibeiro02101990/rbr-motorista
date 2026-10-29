// node --test supabase-functions/receber-lead/regras.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cidadeUf, normalizarLead, prazoPrimeiraAcao } from './regras.ts'

const iso = (d: Date) => d.toISOString()

test('prazo: dentro do horário comercial = +15 min', () => {
  // quinta 23/10/2026 10:00 em Brasília = 13:00 UTC
  assert.equal(iso(prazoPrimeiraAcao(new Date('2026-10-23T13:00:00Z'))), '2026-10-23T13:15:00.000Z')
})

test('prazo: depois das 18h ou fim de semana = 8h15 do próximo dia útil', () => {
  // sexta 23/10 19:00 Brasília → segunda 26/10 08:15 Brasília (11:15 UTC)
  assert.equal(iso(prazoPrimeiraAcao(new Date('2026-10-23T22:00:00Z'))), '2026-10-26T11:15:00.000Z')
  // sábado 24/10 10:00 → segunda 08:15
  assert.equal(iso(prazoPrimeiraAcao(new Date('2026-10-24T13:00:00Z'))), '2026-10-26T11:15:00.000Z')
  // quinta 06:30 → mesma quinta 08:15
  assert.equal(iso(prazoPrimeiraAcao(new Date('2026-10-22T09:30:00Z'))), '2026-10-22T11:15:00.000Z')
})

test('cidade/UF em vários formatos', () => {
  assert.deepEqual(cidadeUf('Campinas/SP'), { cidade: 'Campinas', uf: 'SP' })
  assert.deepEqual(cidadeUf('São Sebastião da Bela Vista - mg'), { cidade: 'São Sebastião da Bela Vista', uf: 'MG' })
  assert.deepEqual(cidadeUf('Curitiba'), { cidade: 'Curitiba', uf: null })
})

test('formulário da LP atual (nomes com maiúscula e GCLID)', () => {
  const r = normalizarLead({ Nome: 'Ana', WhatsApp: '(11) 90000-0000', CNPJ: '12.345.678/0001-90', 'E-mail': 'ana@empresa.com', Origem: 'Itupeva/SP', Destino: 'Curitiba/PR', 'Veículo desejado': 'Carreta', GCLID: 'abc', utm_source: 'google', utm_campaign: 'frete-sp' })
  assert.ok('lead' in r)
  if (!('lead' in r)) return
  assert.equal(r.lead.tipo_pessoa, 'PJ')
  assert.equal(r.lead.cnpj, '12345678000190')
  assert.equal(r.lead.origem_uf, 'SP')
  assert.equal(r.lead.destino_cidade, 'Curitiba')
  assert.equal(r.lead.veiculo, 'Carreta')
  assert.equal(r.lead.gclid, 'abc')
  assert.equal(r.lead.utm_campaign, 'frete-sp')
})

test('validação e robô', () => {
  assert.deepEqual(normalizarLead({ whatsapp: '11900000000' }), { erro: 'Informe o nome.' })
  assert.deepEqual(normalizarLead({ nome: 'Ana' }), { erro: 'Informe o WhatsApp ou o e-mail.' })
  assert.deepEqual(normalizarLead({ nome: 'Ana', whatsapp: '123' }), { erro: 'WhatsApp inválido.' })
  assert.deepEqual(normalizarLead({ nome: 'Ana', whatsapp: '11900000000', _honey: 'x' }), { robo: true })
  const pf = normalizarLead({ nome: 'Ana', whatsapp: '11900000000', 'Tipo de cliente': 'Pessoa física' })
  assert.ok('lead' in pf && pf.lead.tipo_pessoa === 'PF')
})
