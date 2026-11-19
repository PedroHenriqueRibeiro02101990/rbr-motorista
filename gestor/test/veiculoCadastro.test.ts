import { test } from 'node:test'
import assert from 'node:assert/strict'
import { achadosVeiculo, veiculoProprioParaGravar } from '../src/lib/veiculoCadastro.ts'

test('A7: veiculo com titular nunca grava is_veiculo_proprio = true', () => {
  assert.equal(veiculoProprioParaGravar(true, true), false); assert.equal(veiculoProprioParaGravar(true, false), false)
  assert.equal(veiculoProprioParaGravar(false, true), true)
})
test('A7: semirreboque sem e_reboque bloqueia; com e_reboque passa', () => {
  assert.deepEqual(achadosVeiculo({ tipo_veiculo: 'CARGA SEMI-REBOQUE', e_reboque: false }).map((a) => a.campo), ['e_reboque'])
  assert.equal(achadosVeiculo({ tipo_veiculo: 'Carreta', e_reboque: true }).length, 0)
})
test('A7: tara fora da faixa, cavalo com tara de PBT e tara igual a capacidade avisam (nao bloqueiam)', () => {
  const f = achadosVeiculo({ tipo_veiculo: 'Cavalo', tara_kg: '25.5' }); assert.equal(f[0].nivel, 'aviso'); assert.match(f[0].mensagem, /fora da faixa/)
  assert.match(achadosVeiculo({ tipo_veiculo: 'Cavalo mecânico', tara_kg: 16000 })[0].mensagem, /alta para cavalo/)
  assert.equal(achadosVeiculo({ tipo_veiculo: 'Cavalo mecânico', tara_kg: 9500 }).length, 0)
  assert.match(achadosVeiculo({ tipo_veiculo: 'Truck', tara_kg: 7000, capacidade_carga: 7000 })[0].mensagem, /igual à capacidade/)
})
test('A7: titular PF sem UF bloqueia; com UF ou PJ nao', () => {
  assert.equal(achadosVeiculo({}, { cpf: '123.456.789-09', uf: '' })[0].campo, 'uf_titular')
  assert.equal(achadosVeiculo({}, { cpf: '12345678909', uf: 'SP' }).length, 0)
  assert.equal(achadosVeiculo({}, { cnpj: '69115969000104', uf: '' }).length, 0)
})
