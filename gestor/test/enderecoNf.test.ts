// node --test gestor/test/enderecoNf.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenciasEndereco } from '../src/lib/enderecoNf.ts'

const nf = { logradouro: 'Rua das Flores', numero: '100', bairro: 'Centro', municipio: 'Campinas', uf: 'SP', cep: '13010-000' }
const cad = { logradouro: 'RUA DAS FLORES', numero_endereco: '100', bairro: 'centro', cidade: 'Campinas', uf: 'SP', cep: '13010000' }

test('mesmo endereço (caixa, acento e pontuação diferentes): sem divergência', () => {
  assert.deepEqual(divergenciasEndereco(nf, cad), [])
})

test('número e CEP diferentes: a NF aparece como o valor que vence', () => {
  const d = divergenciasEndereco({ ...nf, numero: '200', cep: '13020-000' }, cad)
  assert.deepEqual(d.map((x) => x.campo).sort(), ['CEP', 'Número'])
  assert.equal(d.find((x) => x.campo === 'Número')!.nf, '200')
  assert.equal(d.find((x) => x.campo === 'Número')!.cadastro, '100')
})

test('campo vazio no cadastro não é divergência (a NF só completa)', () => {
  assert.deepEqual(divergenciasEndereco(nf, { ...cad, bairro: null, cep: '' }), [])
})

test('sem endereço de um dos lados: nada a comparar', () => {
  assert.deepEqual(divergenciasEndereco(null, cad), [])
  assert.deepEqual(divergenciasEndereco(nf, null), [])
})
