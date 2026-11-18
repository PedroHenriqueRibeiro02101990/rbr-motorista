// node --test supabase/functions/_shared/repomPreVoo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faltaParaRepom, TIPOS_CARGA_ANTT } from './repomPreVoo.ts'

const completo = () => ({
  motorista: { nome: 'Joao', cpf: '52998224725', cnh_numero_registro: '1', data_nascimento: '1985-01-01', genero: 'M', rg_numero: '123', rg_orgao_emissor: 'SSP', rg_uf: 'MA', numero_dependentes: 0, celular: '98999991234', cep: '65285000', logradouro: 'Rua A' },
  prestador: { documento: '52998224725', rntrc: '123', optante_simples_nacional: false },
  veiculos: [{ placa: 'MKT6E78', quantidade_eixos: 3, e_reboque: false, tipo_veiculo: 'cavalo' }, { placa: 'MLN9A91', quantidade_eixos: 3, e_reboque: true, tipo_veiculo: 'semirreboque' }],
  operacao: { tipo_carga_antt: 5, entrega_prevista: '2026-11-25', ncm: '12019000', filial_repom: '1' },
})
test('cadastro completo: nada falta', () => assert.deepEqual(faltaParaRepom(completo()), []))
test('lista exatamente o que falta, em portugues, e some quando e corrigido (derivado do estado)', () => {
  const e = completo(); e.motorista.genero = null as never; e.motorista.rg_numero = null as never; e.operacao.filial_repom = null as never; e.operacao.tipo_carga_antt = null as never
  const f = faltaParaRepom(e).map((x) => x.campo)
  assert.deepEqual(f.sort(), ['filial_repom', 'genero', 'rg_numero', 'tipo_carga_antt'])
  e.motorista.genero = 'M'; e.motorista.rg_numero = '1'; e.operacao.filial_repom = '2'; e.operacao.tipo_carga_antt = 5
  assert.deepEqual(faltaParaRepom(e), [])
})
test('cavalo sem carreta, eixos e prestador sem Simples informado aparecem', () => {
  const e = completo(); e.veiculos = [{ placa: 'MKT6E78', quantidade_eixos: null as never, e_reboque: false, tipo_veiculo: 'cavalo' }]; e.prestador.optante_simples_nacional = null as never
  const f = faltaParaRepom(e).map((x) => x.campo)
  assert.ok(f.includes('implemento') && f.includes('quantidade_eixos') && f.includes('optante_simples_nacional'))
})
test('tipos de carga ANTT 1 a 8 vem do guia da Repom', () => { assert.equal(Object.keys(TIPOS_CARGA_ANTT).length, 8); assert.equal(TIPOS_CARGA_ANTT[5], 'Carga Geral') })
