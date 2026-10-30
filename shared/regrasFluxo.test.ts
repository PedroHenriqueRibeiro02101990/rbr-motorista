// node --test shared/regrasFluxo.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as r from './regrasFluxo.ts'

const H = 3_600_000
test('C02/C04: planos de troca por momento', () => {
  assert.equal(r.planoDeTroca('motorista', 'M0').soGestor, false)
  assert.ok(r.planoDeTroca('motorista', 'M0').passos.includes('Novo aceite do motorista.'))
  assert.match(r.planoDeTroca('motorista', 'M2', { horasParaInicioCiot: 30 }).passos.join(' '), /cancelar e reemitir/)
  assert.match(r.planoDeTroca('motorista', 'M2', { horasParaInicioCiot: 10 }).passos.join(' '), /encerrar e emitir outro/)
  const m3 = r.planoDeTroca('motorista', 'M3')
  assert.equal(m3.soGestor, true)
  assert.match(m3.passos.join(' '), /seguradora/)
  const v3 = r.planoDeTroca('veiculo', 'M3')
  assert.equal(v3.soGestor, true)
  assert.match(v3.passos.join(' '), /Reaverbar ANTES de sair/)
  const v1 = r.planoDeTroca('veiculo', 'M1', { eixosMudaram: true })
  assert.equal(v1.nivelA, true)
  assert.match(v1.passos.join(' '), /nível A/)
  assert.match(r.planoDeTroca('veiculo', 'M1').passos[0], /trocar a placa/)
})
test('C05: carta de correção', () => {
  assert.equal(r.cartaCorrecaoPermitida('endereço do destino', 0).pode, true)
  assert.equal(r.cartaCorrecaoPermitida('Valor do frete', 0).pode, false)
  assert.equal(r.cartaCorrecaoPermitida('data de emissão', 0).pode, false)
  assert.equal(r.cartaCorrecaoPermitida('observação', 20).pode, false)
})
test('A06/C12: ref versionada e contingência de 168 h', () => {
  assert.equal(r.proximaRef('rbr-mdfe-abc'), 'rbr-mdfe-abc-v2')
  assert.equal(r.proximaRef('rbr-mdfe-abc-v2'), 'rbr-mdfe-abc-v3')
  assert.equal(r.contingenciaMdfeVencida(0, 168 * H), false)
  assert.equal(r.contingenciaMdfeVencida(0, 168 * H + 1), true)
})
test('D04: níveis A a D', () => {
  assert.equal(r.nivelDaAlteracao('valor', false), 'A')
  assert.equal(r.nivelDaAlteracao('eixos', false), 'A')
  assert.equal(r.nivelDaAlteracao('motorista', false), 'B')
  assert.equal(r.nivelDaAlteracao('recado', false), 'C')
  assert.equal(r.nivelDaAlteracao('data', true), 'D')
})
test('D03: checklist de 11 itens', () => {
  const ok = {
    motoristaEVeiculo: true, aceiteMotorista: true, grAprovada: true, exigenciasAtendidas: true,
    pesoKg: 20000, capacidadeKg: 27000, valorMercadoria: 500_000, tetoSeguro: 1_000_000,
    temNfe: true, datasEContatos: true, pisoAnttOk: true, cnhNascimento: true, pixMotorista: true,
  }
  assert.equal(r.checklistCompletar(ok).itens.length, 11)
  assert.equal(r.checklistCompletar(ok).pronta, true)
  const ruim = r.checklistCompletar({ ...ok, pesoKg: 30000, valorMercadoria: 2_000_000 })
  assert.equal(ruim.pronta, false)
  assert.deepEqual(ruim.itens.filter((i) => !i.ok).map((i) => i.id), ['peso', 'seguro'])
  assert.equal(r.checklistCompletar({ ...ok, capacidadeKg: null }).pronta, false)
})
test('D10: ocorrência leva ao fluxo certo', () => {
  assert.match(r.fluxoDaOcorrencia('quebra').proximo, /troca de veículo/)
  assert.match(r.fluxoDaOcorrencia('roubo').proximo, /seguradora/)
  assert.equal(r.fluxoDaOcorrencia('atraso').avisaQuemCotou, true)
})
test('E02/E12: margem e cotação vencida', () => {
  assert.equal(r.faixaDeMargem(28.9).cor, 'vermelho')
  assert.equal(r.faixaDeMargem(25).abaixoDoPiso, true)
  assert.equal(r.faixaDeMargem(30).cor, 'amarelo')
  assert.equal(r.faixaDeMargem(32).palavra, 'Médio')
  assert.equal(r.faixaDeMargem(32.1).palavra, 'Bom')
  assert.equal(r.sugereAfrouxar(14), false)
  assert.equal(r.sugereAfrouxar(15), true)
  assert.equal(r.diasVencida(0, 3 * 24 * H), 3)
  assert.equal(r.diasVencida(10, 5), 0)
})
test('F03: destino e escalonamento do aviso', () => {
  assert.equal(r.destinoDoAviso({ ultimoAMexer: 'Bruno', donoDaEtapa: 'Fiscal' }), 'Bruno')
  assert.equal(r.destinoDoAviso({ donoDaEtapa: 'Fiscal' }), 'Fiscal')
  assert.deepEqual(r.escalonamento(0, 1 * H), { sobeAoGestor: false, email: false })
  assert.deepEqual(r.escalonamento(0, 2 * H), { sobeAoGestor: true, email: false })
  assert.deepEqual(r.escalonamento(0, 5 * H, true), { sobeAoGestor: true, email: true })
  assert.deepEqual(r.escalonamento(0, 5 * H), { sobeAoGestor: true, email: false })
})
test('G07/G04: disjuntor e auditor de dinheiro', () => {
  assert.equal(r.disjuntorAberto([{ tipo: 'saldo_baixo', grave: true }]), true)
  assert.equal(r.disjuntorAberto([{ tipo: 'saldo_baixo', grave: true }], true), false)
  assert.equal(r.disjuntorAberto([{ tipo: 'outro', grave: true }]), false)
  assert.deepEqual(r.divergenciasDeValor({ cotacao: 1000, cte: 1000, ciot: 1000, financeiro: 1000 }), [])
  assert.equal(r.divergenciasDeValor({ cotacao: 1000, cte: 1000, ciot: 900, financeiro: null }).length, 1)
})

test('B15: plano de cancelamento em ordem inversa, um passo por vez', () => {
  const ok = { existe: true, dentroDoPrazo: true }
  const plano = r.planoDeCancelamentoOperacao({ mdfe: ok, ciot: ok, vpo: { existe: false, dentroDoPrazo: true }, averbacao: ok, cte: ok })
  assert.deepEqual(plano.map((p) => p.etapa), ['mdfe', 'ciot', 'vpo', 'averbacao', 'cte'])
  assert.equal(plano[2].acao, 'pular')
  assert.deepEqual(r.andamentoDoCancelamento(plano, {}), { feitos: [], paradoEm: null, proximo: 'mdfe' })
  assert.equal(r.andamentoDoCancelamento(plano, { mdfe: 'feito' }).proximo, 'ciot')
  const falha = r.andamentoDoCancelamento(plano, { mdfe: 'feito', ciot: 'falhou' })
  assert.deepEqual(falha.feitos, ['mdfe']); assert.equal(falha.paradoEm, 'ciot')
  const travado = r.planoDeCancelamentoOperacao({ mdfe: ok, ciot: { existe: true, dentroDoPrazo: false, motivoPrazo: 'Fora das 24 h' }, vpo: ok, averbacao: ok, cte: ok })
  assert.equal(r.andamentoDoCancelamento(travado, { mdfe: 'feito' }).motivo, 'Fora das 24 h')
  const completo = r.andamentoDoCancelamento(plano, { mdfe: 'feito', ciot: 'feito', averbacao: 'feito', cte: 'feito' })
  assert.equal(completo.proximo, null); assert.equal(completo.paradoEm, null); assert.equal(completo.feitos.length, 4)
})
test('B14/B18: janela de emissão e idempotência', () => {
  const coleta = Date.UTC(2026, 10, 10, 15, 0) // 10/11 12h Brasília
  assert.equal(r.dentroDaJanelaDeEmissao(coleta, Date.UTC(2026, 10, 9, 20, 0)), true) // véspera 17h
  assert.equal(r.dentroDaJanelaDeEmissao(coleta, Date.UTC(2026, 10, 10, 5, 0)), false) // no dia, 2h
  assert.equal(r.deveConsultarSozinho(0, 10 * 60_000), false)
  assert.equal(r.deveConsultarSozinho(0, 10 * 60_000 + 1), true)
  assert.equal(r.podeReenviarAposTimeout(false, false), false)
  assert.equal(r.podeReenviarAposTimeout(true, true), false)
  assert.equal(r.podeReenviarAposTimeout(true, false), true)
})
