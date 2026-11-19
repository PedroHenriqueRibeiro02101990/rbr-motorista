// node --test supabase/functions/_shared/validacoes-cadastro.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placaValida, cpfValido, cnpjValido, validarTara, validarVeiculo, validarCnh, validarRntrc, eReboquePorTipoCrlv, tipoTransportadorMdfe, validarProprietario } from './validacoes-cadastro.ts'

test('placa antiga e Mercosul; CPF e CNPJ com digito verificador', () => {
  assert.ok(placaValida('ABC1234') && placaValida('MKT6E78') && !placaValida('AB12345'))
  assert.ok(cpfValido('529.982.247-25') && !cpfValido('111.111.111-11') && !cpfValido('529.982.247-24'))
  assert.ok(cnpjValido('11.222.333/0001-81') && !cnpjValido('11.222.333/0001-82'))
})
test('tara: 25.5, 26, 500 e 35000 bloqueiam com a mensagem da G1; faixa usual so avisa', () => {
  const cav = { tipo_veiculo: 'cavalo', quantidade_eixos: 3 }
  for (const t of [25.5, 26, 35000, 500]) {
    const a = validarTara({ ...cav, tara_kg: t })
    assert.equal(a[0].nivel, 'bloqueio'); assert.equal(a[0].mensagem, 'Tara e em kg. Voce quis dizer 25.500?')
  }
  assert.equal(validarTara({ ...cav, tara_kg: 8000 })[0].nivel, 'ok')
  assert.equal(validarTara({ ...cav, tara_kg: 12500 })[0].nivel, 'aviso')
  assert.equal(validarTara({ tipo_veiculo: 'carreta', e_reboque: true, quantidade_eixos: 3, tara_kg: 9.8 })[0].nivel, 'bloqueio')
  assert.equal(validarTara({ tipo_veiculo: 'carreta', e_reboque: true, quantidade_eixos: 3, tara_kg: 11000 })[0].nivel, 'aviso')
})
test('cavalo com PBT usado como tara e recusado', () => {
  const a = validarTara({ tipo_veiculo: 'cavalo', tara_kg: 16000, pbt_kg: 16000 })
  assert.ok(a.some((x) => x.nivel === 'bloqueio' && /PBT/.test(x.mensagem)))
})
test('especie do CRLV marca e_reboque', () => {
  assert.equal(eReboquePorTipoCrlv('SEMIRREBOQUE'), true)
  assert.equal(eReboquePorTipoCrlv('Reboque'), true)
  assert.equal(eReboquePorTipoCrlv('CAMINHAO TRATOR'), false)
  assert.equal(eReboquePorTipoCrlv('CAMINHAO'), null)
})
test('cavalo sem carreta vinculada avisa; placa do CRLV diferente bloqueia', () => {
  const v = { placa: 'MKT6E78', tipo_veiculo: 'cavalo', tipo_crlv: 'caminhao trator', quantidade_eixos: 3, tara_kg: 9000 }
  assert.ok(validarVeiculo(v).some((x) => x.campo === 'carreta' && x.nivel === 'aviso'))
  assert.ok(!validarVeiculo({ ...v, carreta_vinculada: true }).some((x) => x.campo === 'carreta'))
  assert.ok(validarVeiculo(v, { placaDigitada: 'MKT6E78', placaCrlv: 'AAA1B23' }).some((x) => x.nivel === 'bloqueio' && x.campo === 'placa'))
})
test('CNH: vencida bloqueia, a vencer em 30 dias avisa, menor de 18 bloqueia', () => {
  assert.equal(validarCnh({ validade: '2026-11-01' }, '2026-11-18')[0].nivel, 'bloqueio')
  assert.equal(validarCnh({ validade: '2026-12-10' }, '2026-11-18')[0].nivel, 'aviso')
  assert.equal(validarCnh({ validade: '2030-01-01' }, '2026-11-18')[0].nivel, 'ok')
  assert.ok(validarCnh({ validade: '2030-01-01', data_nascimento: '2010-01-01' }, '2026-11-18').some((x) => x.nivel === 'bloqueio'))
})
test('RNTRC: sem consulta ou vencido e aviso; so inativo confirmado bloqueia', () => {
  assert.equal(validarRntrc({ status: null }, '2026-11-18')[0].nivel, 'aviso')
  assert.equal(validarRntrc({ status: 'ativo', validade: '2026-01-01' }, '2026-11-18')[0].nivel, 'aviso')
  assert.equal(validarRntrc({ status: 'inativo' }, '2026-11-18')[0].nivel, 'bloqueio')
  assert.equal(validarRntrc({ status: 'ativo', validade: '2027-01-01' }, '2026-11-18')[0].nivel, 'ok')
})
test('proprietario diferente do motorista: aviso com o tipo de transportador', () => {
  assert.equal(tipoTransportadorMdfe('52998224725'), 'TAC')
  const a = validarProprietario({ proprietario_documento: '52998224725', motorista_documento: '11144477735' })
  assert.deepEqual(a.map((x) => x.nivel), ['aviso']); assert.match(a[0].mensagem, /TAC/)
})

// ---- Auditoria 19/11: tipo do veiculo pelo CRLV (o emissor do MDF-e le veiculos.tipo_veiculo) ----
import { tipoVeiculoDoCrlv } from './validacoes-cadastro.ts'
test('tipoVeiculoDoCrlv: trator=cavalo, reboque=semirreboque, caminhao pelos eixos, duvida=null', () => {
  assert.equal(tipoVeiculoDoCrlv('CAMINHAO TRATOR', 3).tipo, 'cavalo mecanico')
  assert.equal(tipoVeiculoDoCrlv('SEMIRREBOQUE', 3).tipo, 'semirreboque')
  assert.deepEqual(tipoVeiculoDoCrlv('CARGA/CAMINHAO', 3), { tipo: 'truck', inferido: true })
  assert.deepEqual(tipoVeiculoDoCrlv('CAMINHAO', 2), { tipo: 'toco', inferido: true })
  assert.equal(tipoVeiculoDoCrlv('CAMINHAO', null).tipo, null)
  assert.equal(tipoVeiculoDoCrlv('CARGA/VAN', 2).tipo, 'van')
  assert.equal(tipoVeiculoDoCrlv('CARAVANA', 2).tipo, null) // "van" dentro de outra palavra nao conta
  assert.equal(tipoVeiculoDoCrlv(null, 3).tipo, null)
})
