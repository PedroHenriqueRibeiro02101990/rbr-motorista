// H01 · Bateria do fluxo de emissão e finalização: cenários de ponta a ponta sobre as regras puras (sem rede, sem emitir nada).
// node --test gestor/test/fluxoEmissaoFinalizacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { passosPendentes, resumoFinalizacao } from '../src/lib/finalizacao.ts'
import { ciotAusenteBloqueia, ciotEfreteSemValidade } from '../../supabase/functions/emitir-mdfe/mdfe.ts'
import {
  ciotObrigatorioNoMdfe,
  podeCancelarCiot,
  podeCancelarCte,
  podeCancelarMdfe,
  podeEncerrarCiot,
  podeEncerrarMdfe,
  podeSubstituirCte,
  vigenciaVpoValida,
} from '../../supabase/functions/_shared/prazos.ts'
import {
  andamentoDoCancelamento,
  dentroDaJanelaDeEmissao,
  deveConsultarSozinho,
  planoDeCancelamentoOperacao,
  podeReenviarAposTimeout,
  proximaRef,
  type EstadoEtapaCancelamento,
  type EtapaCancelamento,
} from '../../shared/regrasFluxo.ts'

const H = 3_600_000
const DIA = 24 * H
const BASE = Date.UTC(2026, 10, 2, 15, 0, 0) // 02/11/2026, antes da obrigatoriedade do CIOT no MDF-e

// ---- Emissão ----
test('emissão: só até a véspera da coleta (Brasília); no dia da coleta já não pode', () => {
  const coleta = Date.UTC(2026, 10, 5, 13, 0, 0) // 05/11 10h Brasília
  assert.equal(dentroDaJanelaDeEmissao(coleta, Date.UTC(2026, 10, 4, 23, 0, 0)), true) // 04/11 20h
  assert.equal(dentroDaJanelaDeEmissao(coleta, Date.UTC(2026, 10, 5, 4, 0, 0)), false) // 05/11 01h Brasília
})

test('emissão do MDF-e antes de 23/11: TAC sem CIOT NÃO bloqueia; depois bloqueia só em produção real', () => {
  assert.equal(ciotAusenteBloqueia(BASE, false, false), false)
  const depois = Date.UTC(2026, 10, 23, 3, 0, 0)
  assert.equal(ciotAusenteBloqueia(depois, false, false), true)
  assert.equal(ciotAusenteBloqueia(depois, true, false), false) // operação de teste
  assert.equal(ciotAusenteBloqueia(depois, false, true), false) // homologação
  assert.equal(ciotObrigatorioNoMdfe(depois - 1), false)
})

test('emissão do MDF-e: CIOT da efrete só vale emitido (cancelado, encerrado ou com erro travam)', () => {
  assert.equal(ciotEfreteSemValidade('efrete', 'emitido'), null)
  for (const st of ['cancelado', 'encerrado', 'pendente', 'refazer_troca_veiculo', '']) assert.notEqual(ciotEfreteSemValidade('efrete', st), null)
  assert.equal(ciotEfreteSemValidade('manual', 'cancelado'), null) // registro manual não é avaliado
})

test('emissão: timeout nunca reenvia sem consultar; só reenvia se o provedor confirmou que não existe', () => {
  assert.equal(podeReenviarAposTimeout(false, false), false)
  assert.equal(podeReenviarAposTimeout(true, null), false)
  assert.equal(podeReenviarAposTimeout(true, true), false)
  assert.equal(podeReenviarAposTimeout(true, false), true)
  assert.equal(deveConsultarSozinho(BASE - 11 * 60_000, BASE), true)
  assert.equal(deveConsultarSozinho(BASE - 5 * 60_000, BASE), false)
})

test('emissão: cada nova tentativa usa uma referência nova, nunca repete a anterior', () => {
  const r1 = proximaRef('rbr-mdfe-op-abc')
  const r2 = proximaRef(r1)
  assert.notEqual(r1, 'rbr-mdfe-op-abc')
  assert.notEqual(r2, r1)
})

test('vale-pedágio: vigência de até 15 dias', () => {
  assert.equal(vigenciaVpoValida(BASE, BASE + 15 * DIA).pode, true)
  assert.equal(vigenciaVpoValida(BASE, BASE + 16 * DIA).pode, false)
  assert.equal(vigenciaVpoValida(BASE, BASE - 1).pode, false)
})

// ---- Finalização ----
test('finalização: MDF-e e CIOT pendentes viram dois passos, na ordem MDF-e e CIOT', () => {
  const p = passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: false, ciotStatus: 'emitido' })
  assert.deepEqual(p.map((x) => x.id), ['mdfe', 'ciot'])
})

test('finalização: sem CIOT da efrete só encerra o MDF-e; tudo encerrado não tem passo', () => {
  assert.deepEqual(passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: false, ciotStatus: null }).map((x) => x.id), ['mdfe'])
  assert.deepEqual(passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: true, ciotStatus: 'encerrado' }), [])
  assert.deepEqual(passosPendentes({ mdfeAutorizado: false, mdfeEncerrado: false, ciotStatus: null }), [])
})

test('finalização: se o CIOT falha, a próxima tentativa refaz só o CIOT', () => {
  const r = resumoFinalizacao([{ id: 'mdfe', ok: true }, { id: 'ciot', ok: false, erro: 'timeout' }])
  assert.equal(r.tudoCerto, false)
  assert.match(r.mensagem, /CIOT \(timeout\)/)
  const segunda = passosPendentes({ mdfeAutorizado: true, mdfeEncerrado: true, ciotStatus: 'emitido' })
  assert.deepEqual(segunda.map((x) => x.id), ['ciot'])
})

test('finalização: prazos de encerramento (MDF-e 30 dias; CIOT 5 dias, 30 se TAC agregado)', () => {
  assert.equal(podeEncerrarMdfe(BASE, BASE + 30 * DIA).pode, true)
  assert.equal(podeEncerrarMdfe(BASE, BASE + 31 * DIA).pode, false)
  assert.equal(podeEncerrarCiot(BASE, BASE + 5 * DIA).pode, true)
  assert.equal(podeEncerrarCiot(BASE, BASE + 6 * DIA).pode, false)
  assert.equal(podeEncerrarCiot(BASE, BASE + 20 * DIA, true).pode, true)
})

// ---- Cancelamento ----
test('cancelamento: CT-e só com MDF-e inativo e até 7 dias; depois, substituição até 60', () => {
  assert.equal(podeCancelarCte(BASE, BASE + 2 * DIA, true).pode, false)
  assert.equal(podeCancelarCte(BASE, BASE + 2 * DIA, false).pode, true)
  assert.equal(podeCancelarCte(BASE, BASE + 8 * DIA, false).pode, false)
  assert.equal(podeSubstituirCte(BASE, BASE + 59 * DIA).pode, true)
  assert.equal(podeSubstituirCte(BASE, BASE + 61 * DIA).pode, false)
})

test('cancelamento: MDF-e até 24 h e sem viagem iniciada; CIOT até 24 h antes do início', () => {
  assert.equal(podeCancelarMdfe(BASE, BASE + 23 * H, false).pode, true)
  assert.equal(podeCancelarMdfe(BASE, BASE + 25 * H, false).pode, false)
  assert.equal(podeCancelarMdfe(BASE, BASE + H, true).pode, false)
  assert.equal(podeCancelarCiot(BASE + 48 * H, BASE).pode, true)
  assert.equal(podeCancelarCiot(BASE + 10 * H, BASE).pode, false)
})

test('cancelar a operação inteira: ordem MDF-e, CIOT, VPO, averbação, CT-e; para no primeiro que trava', () => {
  const livre: EstadoEtapaCancelamento = { existe: true, dentroDoPrazo: true }
  const estado: Record<EtapaCancelamento, EstadoEtapaCancelamento> = {
    mdfe: livre,
    ciot: { existe: true, dentroDoPrazo: false, motivoPrazo: 'CIOT fora do prazo.' },
    vpo: livre,
    averbacao: { existe: false, dentroDoPrazo: true },
    cte: livre,
  }
  const plano = planoDeCancelamentoOperacao(estado)
  assert.deepEqual(plano.map((p) => p.etapa), ['mdfe', 'ciot', 'vpo', 'averbacao', 'cte'])
  assert.equal(plano[3].acao, 'pular')
  const a = andamentoDoCancelamento(plano, { mdfe: 'feito' })
  assert.deepEqual(a.feitos, ['mdfe'])
  assert.equal(a.paradoEm, 'ciot')
  assert.equal(a.motivo, 'CIOT fora do prazo.')
})

test('cancelar a operação inteira: falha em um passo para ali, sem seguir adiante', () => {
  const livre: EstadoEtapaCancelamento = { existe: true, dentroDoPrazo: true }
  const plano = planoDeCancelamentoOperacao({ mdfe: livre, ciot: livre, vpo: livre, averbacao: livre, cte: livre })
  const a = andamentoDoCancelamento(plano, { mdfe: 'feito', ciot: 'falhou' })
  assert.deepEqual(a.feitos, ['mdfe'])
  assert.equal(a.paradoEm, 'ciot')
  const completo = andamentoDoCancelamento(plano, { mdfe: 'feito', ciot: 'feito', vpo: 'feito', averbacao: 'feito', cte: 'feito' })
  assert.equal(completo.proximo, null)
  assert.equal(completo.paradoEm, null)
  assert.equal(completo.feitos.length, 5)
})
