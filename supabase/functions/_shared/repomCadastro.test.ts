// node --test supabase/functions/_shared/repomCadastro.test.ts   (mocks; nenhuma chamada a Repom)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarCorpoMotoristaRepom, montarCorpoVeiculoRepom, preChecagemRepom } from './repomCadastro.ts'

test('motorista: corpo conforme o guia; o que falta vem listado', () => {
  const r = montarCorpoMotoristaRepom({ nome: 'Joao Teste', cpf: '529.982.247-25', cnh_numero_registro: '123', data_nascimento: '1985-03-02', celular: '(98) 99999-1234', logradouro: 'Rua A', cep: '65285-000' })
  assert.equal(r.corpo.NationalId, '52998224725'); assert.equal((r.corpo.Phones as { AreaCode: string }[])[0].AreaCode, '98')
  assert.deepEqual(r.faltando, ['genero (M ou F)'])
  assert.equal(montarCorpoMotoristaRepom({ nome: 'x', cpf: '52998224725', cnh_numero_registro: '1', data_nascimento: '1990-01-01', genero: 'F', celular: '98999991234' }).faltando.length, 0)
})
test('veiculo: carreta = Implement, cavalo = Traction; eixos viram AxleNN; proprietario PF ou PJ', () => {
  const car = montarCorpoVeiculoRepom({ placa: 'mln-9a91', quantidade_eixos: 3, e_reboque: true }, { nome: 'Dono', documento: '52998224725', rntrc: '123456789' })
  assert.equal(car.corpo.VehicleClassification, 'Implement'); assert.equal(car.corpo.VehicleAxles, 'Axle03'); assert.equal(car.corpo.LicensePlate, 'MLN9A91')
  assert.equal(car.faltando.length, 0)
  const cav = montarCorpoVeiculoRepom({ placa: 'MKT6E78', quantidade_eixos: 3, e_reboque: false }, { nome: 'Empresa', documento: '11222333000181', rntrc: '1' })
  assert.equal(cav.corpo.VehicleClassification, 'Traction'); assert.ok(cav.faltando.some((f) => /nome fantasia/.test(f)))
  assert.ok(montarCorpoVeiculoRepom({ placa: 'MKT6E78' }, {}).faltando.some((f) => /eixos/.test(f)))
})
test('pre-checagem: 801, 760 e cavalo sem implemento viram mensagem, nao envio', () => {
  const p = preChecagemRepom({ motoristaCadastradoNaRepom: false, veiculoNoPrestador: false, eCavalo: true, temImplemento: false })
  assert.deepEqual(p.map((x) => x.codigo), ['801', '760', 'implemento'])
  assert.match(p[1].mensagem, /Karen/)
  assert.deepEqual(preChecagemRepom({ motoristaCadastradoNaRepom: true, veiculoNoPrestador: true, eCavalo: true, temImplemento: true }), [])
})
