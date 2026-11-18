// node --test supabase/functions/_shared/unidades-br.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lerPesoKg, formatarKg, mascaraMoeda, valorDeDigitos, precisaConfirmarTeto, textoConfirmacaoTeto,
  paraNumeroBR, exigirValorReais, exigirPesoKg, pesoDeDocumento,
} from './unidades-br.ts'

test('G1: 25,5 e 25.5 sao recusados com a mensagem; 25500 e aceito', () => {
  for (const x of ['25,5', '25.5']) {
    const r = lerPesoKg(x)
    assert.equal(r.ok, false)
    assert.equal(!r.ok && r.mensagem, 'Tara e em kg. Voce quis dizer 25.500?')
  }
  assert.deepEqual(lerPesoKg('25500'), { ok: true, kg: 25500 })
  assert.deepEqual(lerPesoKg('25.500 kg'), { ok: true, kg: 25500 })
  assert.equal(formatarKg(25500), '25.500 kg')
})

test('G2: mascara de centavos', () => {
  assert.equal(mascaraMoeda('1'), 'R$ 0,01')
  assert.equal(mascaraMoeda('150'), 'R$ 1,50')
  assert.equal(mascaraMoeda('150025'), 'R$ 1.500,25')
  assert.equal(mascaraMoeda('10000000'), 'R$ 100.000,00')
  assert.equal(valorDeDigitos('150025'), 1500.25)
  assert.equal(precisaConfirmarTeto(valorDeDigitos('10000000')), true)
  assert.equal(precisaConfirmarTeto(1500.25), false)
  assert.equal(textoConfirmacaoTeto(100000), 'Confirma R$ 100.000,00?')
})

test('servidor recusa texto no lugar de numero e peso nao inteiro', () => {
  assert.throws(() => exigirValorReais('1500,25' as unknown, 'frete'), /esperava numero/)
  assert.throws(() => exigirPesoKg('25500' as unknown, 'tara'), /esperava numero/)
  assert.throws(() => exigirPesoKg(25.5, 'tara'), /Voce quis dizer 25.500/)
  assert.equal(exigirPesoKg(25500, 'tara'), 25500)
  assert.equal(exigirValorReais(24210.33, 'ciot'), 24210.33)
})

test('formato brasileiro de valor lido de PDF', () => {
  assert.equal(paraNumeroBR('R$ 24.210,33'), 24210.33)
  assert.equal(paraNumeroBR('19.368,26'), 19368.26)
  assert.equal(paraNumeroBR('1.500'), 1500)
  assert.equal(paraNumeroBR('abc'), null)
})

test('CRLV: toneladas viram kg com registro; 7.980 fica; "*.*" vira null com motivo', () => {
  assert.deepEqual(pesoDeDocumento(25.5), { kg: 25500, convertidoDeTonelada: true, aviso: '25,5 t para 25.500 kg' })
  assert.equal(pesoDeDocumento(9.8).kg, 9800)
  assert.equal(pesoDeDocumento('16.33').kg, 16330)
  assert.deepEqual(pesoDeDocumento('7.980'), { kg: 7980, convertidoDeTonelada: false })
  assert.equal(pesoDeDocumento(7980).convertidoDeTonelada, false)
  const v = pesoDeDocumento('*.*')
  assert.equal(v.kg, null)
  assert.match(v.motivoNulo ?? '', /vazio/)
})
