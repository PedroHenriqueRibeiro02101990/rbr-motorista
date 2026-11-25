// node --test supabase/functions/_shared/repomSeparacaoContas.test.ts
// Decisão de contrato Repom: DUAS contas. 9520 = só frete (contrato/CIOT); 9501 = só vale-pedágio (VPR) e roteirização.
// Estes testes FALHAM se o corpo do Shipping do Frete levar campo de vale-pedágio ou se o código de uma conta usar o segredo da outra.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { montarCorpoContrato, NO_VPR_FRETE, type PedidoContratoFrete } from './repomFreteClient.ts'
import { efeitoEmOperacaoCiotVpo } from './repomFluxos.ts'

const lerFonte = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const base: PedidoContratoFrete = {
  identifier: 'C1', hiredNationalId: '16545346091', operationIdentifier: '1', cardNumber: 0, routeTraceCode: 1, routeRouteCode: 148993, issueDate: '2026-11-12T12:00:00Z',
  totalFreightValue: 3500, totalLoadWeight: 20000, totalLoadValue: 40000, advanceMoneyValue: 10, branchCode: '1', ncm: '1005', anttCodeType: 1,
  entrega: { esperadaEm: '2026-11-15T12:00:00Z', tipoLocal: 'Branch' }, motoristas: [{ cpf: '16545346091', principal: true }],
  documentos: [{ tipo: 'CTE', serie: '1', numero: '660', chave: '51220706315338003134550010000660901237179782', branchCode: '1' }],
  placas: ['LXL6808'], destinatario: { documento: '06315338003134', nome: 'Destinatario Teste', tipo: 'Company' },
}
const chavesDe = (o: unknown, pref = ''): string[] =>
  Array.isArray(o) ? o.flatMap((x) => chavesDe(x, pref)) : o && typeof o === 'object' ? Object.entries(o as object).flatMap(([k, v]) => [pref + k, ...chavesDe(v, pref + k + '.')]) : []
const PROIBIDO = /vale|pedagio|pedágio|toll|vpo|vpr|idvpo|praca|praça|tag\b|eixossuspensos|utilizacarreta/i

test('corpo do Shipping: nenhum campo de vale-pedágio além do nó VPR neutro exigido pelo Swagger (Issue=false, eixos 0)', () => {
  const [corpo] = montarCorpoContrato(base)
  const suspeitas = chavesDe(corpo).filter((k) => PROIBIDO.test(k) && !k.startsWith('VPR'))
  assert.deepEqual(suspeitas, [])
  assert.deepEqual(corpo.VPR, { Issue: false, VPROneWay: true, VPRSuspendedAxleNumber: 0, VPRReturnSuspendedAxleNumber: 0 })
  assert.equal(corpo.VPR.Issue, false)
  assert.equal(Object.isFrozen(NO_VPR_FRETE), true)
  assert.equal('VPRCardNumber' in corpo, false)
})

test('o chamador não consegue ligar o vale pelo pedido do Frete, nem com campo extra (VPR e cartão de vale são ignorados)', () => {
  const [corpo] = montarCorpoContrato({ ...base, vpr: { issue: true, oneWay: false, suspendedAxles: 2, returnSuspendedAxles: 2 }, vprCardNumber: 123 } as unknown as PedidoContratoFrete)
  assert.equal(corpo.VPR.Issue, false)
  assert.equal(corpo.VPR.VPRSuspendedAxleNumber, 0)
  assert.equal('VPRCardNumber' in corpo, false)
  assert.equal(JSON.stringify(corpo).includes('123,'), false)
})

test('código do Frete (9520) não importa nem usa o cliente/segredos da conta 9501', () => {
  // (a função repom-qa-teste/index.ts hospeda as ações fixas do vale com SEUS segredos REPOM_QA_VPR_*; o módulo repomQaTeste.ts do Frete continua sem vale)
  for (const f of ['./repomFreteClient.ts', './repomFreteConfig.ts', './repomQaAdiantamento.ts', './repomQaTeste.ts', '../repom-frete/index.ts']) {
    const s = lerFonte(f).split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join(' ')
    assert.equal(/repomVprClient|repomVpoClient|repomQaVpr|REPOM_VPR_|REPOM_QA_VPR_/.test(s), false, f)
  }
  // o cliente do Frete nunca fala com os endpoints do vale
  const frete = lerFonte('./repomFreteClient.ts')
  assert.equal(/ValePedagio|\/VPR\/|ByVehiclesTag|RepomViagem/.test(frete), false)
})

test('código do vale (9501) não usa segredos nem endpoints do Frete (9520)', () => {
  for (const f of ['./repomVprClient.ts', './repomVpoClient.ts', '../repom-vpo/index.ts']) {
    const s = lerFonte(f)
    assert.equal(/REPOM_FRETE_|REPOM_QA_FRETE_|repomFreteClient|Repom\.Frete/.test(s), false, f)
  }
})

test('IDVPO só entra em operacao_ciot_vpo pela emissão do vale (9501); cancelar limpa; erro e outras situações não gravam', () => {
  const emitido = { status: 200, corpo: { ok: true, registro: { estado: 'emitido', idvpo: '12345678901234567890', valor: 321.5 } } }
  assert.deepEqual(efeitoEmOperacaoCiotVpo('emitir', emitido), { gravar: { vpo_idvpo: '12345678901234567890', vpo_valor: 321.5 } })
  assert.deepEqual(efeitoEmOperacaoCiotVpo('cancelar', { status: 200, corpo: { ok: true, registro: { estado: 'cancelado' } } }), { limpar: true })
  assert.equal(efeitoEmOperacaoCiotVpo('emitir', { status: 422, corpo: { ok: false } }), null)
  assert.equal(efeitoEmOperacaoCiotVpo('consultar', emitido), null)
  assert.equal(efeitoEmOperacaoCiotVpo('emitir', { status: 200, corpo: { ok: true, registro: { estado: 'enviado', idvpo: null } } }), null)
})
