import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemFalhaLeitura, preenchimentoDaLeitura, TIPO_EXTRACAO } from '../src/lib/leituraManual.ts'

test('A4: tipos de extracao por upload', () => {
  assert.equal(TIPO_EXTRACAO.vpo_pdf, 'vpr_vale_pedagio'); assert.equal(TIPO_EXTRACAO.ciot_pdf, 'contrato_ciot_repom')
})
test('A4: VPR preenche IDVPO e valor (valor_total) com selo de lido', () => {
  const r = preenchimentoDaLeitura('vpo_pdf', { idvpo: { valor: '93978714466952674631' }, valor_total: { valor: 236.27 }, placa: { valor: 'AWJ0B09' } })
  assert.deepEqual(r.valores, { idvpo: '93978714466952674631', vpo_valor: '236.27' }); assert.deepEqual(r.lidos.sort(), ['idvpo', 'vpo_valor'])
})
test('A4: contrato CIOT preenche CIOT (12 + verificador quando houver), frete e adiantamento', () => {
  const r = preenchimentoDaLeitura('ciot_pdf', { ciot: { valor: '520048413061' }, valor_frete: { valor: 24210.33 }, adiantamento: { valor: 7000 } }, { ciot_verificador: { valor: '1483' } })
  assert.deepEqual(r.valores, { ciot: '520048413061', ver: '1483', frete: '24210.33', adiant: '7000' })
  const sem = preenchimentoDaLeitura('ciot_pdf', { ciot: { valor: '520048413061XXXX' }, valor_frete: { valor: null } })
  assert.deepEqual(sem.valores, { ciot: '520048413061' }) // verificador mascarado: so os 12; nada lido nao vira campo
})
test('A4: falha mostra o erro da funcao e diz que o arquivo foi enviado', () => {
  assert.match(mensagemFalhaLeitura({ erro: 'IA ocupada', codigo: 'ia_indisponivel' }), /IA ocupada \(ia_indisponivel\).*arquivo foi enviado/)
  assert.match(mensagemFalhaLeitura(null), /não respondeu/)
})

test('auditoria 19/11: a categoria lida do VPR preenche o campo da tela (antes era lida e jogada fora)', () => {
  const r = preenchimentoDaLeitura('vpo_pdf', { idvpo: { valor: '96670000000000000001' }, valor_total: { valor: 236.27 }, categoria: { valor: '08' } })
  assert.equal(r.valores.categoria, '08'); assert.ok(r.lidos.includes('categoria'))
})
