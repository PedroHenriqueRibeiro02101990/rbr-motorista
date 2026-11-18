// node --test supabase/functions/_shared/lancamentoManual.test.ts   (dados sinteticos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completarPadroes, ehOperacaoManual, etapaCiot, etapaVpo, IPEF_REPOM_CNPJ, mascaraCiot, preVooMdfe, resumoFaltaMdfe, separarCiot, temBloqueio, validarLancamento, type EstadoPreVoo } from './lancamentoManual.ts'

test('regra central: real manual so mostra o cartao novo; demo e teste ficam como estao', () => {
  assert.equal(ehOperacaoManual({ ciot_origem: 'rbr_repom' }), true)
  assert.equal(ehOperacaoManual({}), true)
  assert.equal(ehOperacaoManual({ modo_demonstracao: true, ciot_origem: 'rbr_repom' }), false)
  assert.equal(ehOperacaoManual({ eh_teste: true }), false)
})
test('CIOT de 16 digitos vira 12 + 4', () => {
  assert.deepEqual(separarCiot('5200480384321483'), { ciot: '520048038432', verificador: '1483' })
  assert.deepEqual(separarCiot('5200 4803 8432'), { ciot: '520048038432', verificador: '' })
  assert.equal(separarCiot('123'), null)
  assert.equal(mascaraCiot('520047919729', '6226'), '5200 4791 9729-6226')
})
test('validacoes: IDVPO 20 digitos, valor > 0, verificador 4, piso so avisa', () => {
  assert.equal(validarLancamento({ idvpo: '123' })[0].nivel, 'bloqueio')
  assert.equal(validarLancamento({ idvpo: '96670000000000000001' })[0].nivel, 'ok')
  assert.equal(validarLancamento({ vpo_valor: 0 })[0].nivel, 'bloqueio')
  assert.equal(validarLancamento({ ciot: '520048038432', ciot_verificador: '12' })[0].campo, 'ciot_verificador')
  assert.equal(validarLancamento({ ciot: '5200480384321483' })[0].nivel, 'ok')
  const v = validarLancamento({ valor_frete: 1000, piso_antt: 3500 })
  assert.deepEqual(v.map((x) => x.nivel), ['aviso'])
  assert.ok(validarLancamento({ valor_frete: 1000, adiantamento: 200, saldo: 100 }).some((x) => /738/.test(x.mensagem)))
})
test('padroes derivados: categoria pelos eixos, IPEF da Repom e CNPJ da RBR', () => {
  const r = completarPadroes({ origem_repom: true }, { cnpj_rbr: '69115969000104', eixos_combinacao: 6 })
  assert.equal(r.categoria_combinacao, '08'); assert.equal(r.pagto_cnpj_ipef, IPEF_REPOM_CNPJ); assert.equal(r.ciot_cnpj_responsavel, '69115969000104')
})
test('esteira: concluida so com dado completo; senao diz o que falta', () => {
  assert.equal(etapaVpo({ vpo_idvpo: '96670000000000000001', vpo_valor: 236.27 }).concluida, true)
  assert.match(etapaVpo({ vpo_idvpo: '96670000000000000001', vpo_valor: 236.27 }).texto, /VPO 9667\.\.\. R\$ 236,27/)
  assert.deepEqual(etapaVpo({ vpo_valor: 0 }).faltam, ['IDVPO', 'valor do vale'])
  assert.equal(etapaCiot({ ciot: '520047919729', ciot_verificador: '6226' }).concluida, true)
  assert.deepEqual(etapaCiot({ ciot: '5200480384321483' }).faltam.length, 2)
  assert.equal(etapaCiot(null).texto, 'Ainda nao lancado')
})
const base = (): EstadoPreVoo => ({
  cte: { status: 'emitido', chave_acesso: '35261069115969000104570010000000011211536013' }, averbacaoCte: { status: 'emitido' },
  ciotVpo: { ciot: '520048038432', ciot_verificador: '1483', ciot_status: 'emitido', ciot_ambiente: 'producao', ciot_origem: 'rbr_repom', vpo_idvpo: '96670000000000000001', vpo_valor: 236.27, vpo_categoria_combinacao: '08', pagto_cnpj_ipef: IPEF_REPOM_CNPJ, numero_averbacao: '123' },
  temPedagio: true, contratoExigeCiot: true, cepCarregamento: '65285000', cepDescarregamento: '65285-000', ncm: '12019000',
  tracao: { tara_kg: 8100, eixos: 3, tipo: 'cavalo' }, reboques: [{ tara_kg: 9170, e_reboque: true }], ufInicio: 'MA', ufFim: 'MA',
})
test('pre-voo completo: nenhum bloqueio', () => assert.equal(temBloqueio(preVooMdfe(base())), false))
test('pre-voo: so bloqueia o que o orgao externo bloqueia; regra interna e aviso', () => {
  const e = base(); e.cte = null; e.ciotVpo = { ...e.ciotVpo!, ciot: '5200480384321483', ciot_verificador: null, pagto_cnpj_ipef: null, ciot_status: 'refazer' }; e.reboques = []
  const r = preVooMdfe(e)
  const b = r.filter((x) => x.nivel === 'bloqueio').map((x) => x.campo)
  assert.ok(['cte', 'ciot', 'destino_pagamento', 'reboque'].every((c) => b.includes(c)), b.join())
  assert.equal(r.find((x) => x.campo === 'ciot_status')?.nivel, 'aviso')
  assert.match(resumoFaltaMdfe(r), /^Falta: CT-e, CIOT/)
})
test('pre-voo: CEP invalido bloqueia; NCM ausente e averbacao so avisam; homologacao bloqueia', () => {
  const e = base(); e.cepDescarregamento = '1329'; e.ncm = null; e.averbacaoCte = null; e.ciotVpo!.ciot_ambiente = 'homologacao'
  const r = preVooMdfe(e)
  assert.equal(r.find((x) => x.campo === 'cep_descarregamento')?.nivel, 'bloqueio')
  assert.equal(r.find((x) => x.campo === 'ncm')?.nivel, 'aviso'); assert.equal(r.find((x) => x.campo === 'averbacao_cte')?.nivel, 'aviso')
  assert.equal(r.find((x) => x.campo === 'ciot_ambiente')?.nivel, 'bloqueio')
})
