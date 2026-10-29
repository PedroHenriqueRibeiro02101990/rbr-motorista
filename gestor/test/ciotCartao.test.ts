// node --test gestor/test/ciotCartao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarConferencia, motivoNaoCancela, motivoValido, passosAntesDoCiot, pendencias, type Previa } from '../src/lib/ciotCartao.ts'

const pedido = { referencia: 'R', frete: 6100, pagamentos: [{ categoria: 'Adiantamento', valor: 1830, liberacao: 'x' }, { categoria: 'Quitacao', valor: 4270, liberacao: 'y' }], pix: 'CpfOuCnpj', placas: ['AAA0A00', 'BBB0B00'], notas: 2, pesoKg: 1000, ncm: '3923', distanciaKm: 188 }

test('prévia sem bloqueio: todas as linhas certas e nenhuma pendência', () => {
  const l = montarConferencia({ ok: true, bloqueios: [], pedido, piso: { ok: true, piso: 4870, tabela: 'A', tipoCarga: 'Carga Geral', eixos: 6, distanciaKm: 188 } })
  assert.equal(pendencias(l), 0)
  assert.ok(l.find((x) => x.id === 'pagamento')!.detalhe.includes('Saldo'))
})

test('bloqueios da função viram pendência no assunto certo, com "Corrigir"', () => {
  const p: Previa = { ok: true, pedido: null, bloqueios: ['Transportador sem chave Pix (o pagamento do CIOT vai por Pix).', 'Motorista sem CPF.', 'Operação sem NF-e do cliente: suba o XML.', 'Frete pago ao motorista R$ 1,00 abaixo do piso mínimo da ANTT R$ 2,00 (faltam R$ 1,00).'] }
  const l = montarConferencia(p)
  const pend = (id: string) => l.find((x) => x.id === id)!
  assert.equal(pend('pix').ok, false)
  assert.equal(pend('pix').corrigir, 'cadastro_motorista')
  assert.equal(pend('motorista').ok, false)
  assert.equal(pend('notas').ok, false)
  assert.equal(pend('piso').ok, false)
  assert.equal(pendencias(l), 4)
})

test('bloqueio desconhecido não some: vai para "Outros pontos"', () => {
  const l = montarConferencia({ ok: true, pedido: null, bloqueios: ['Coisa nova que a função passou a validar.'] })
  assert.equal(l.find((x) => x.id === 'outros')!.ok, false)
})

test('operação real em homologação: o motivo da função aparece como pendência', () => {
  const l = montarConferencia({ ok: false, motivo: 'Emissão de CIOT pela efrete está em homologação. Use o CIOT manual nesta operação.' })
  assert.ok(pendencias(l) >= 1)
  assert.equal(l[0].id, 'motivo')
})

test('passos antes do CIOT: CT-e e averbação; teste sem linha = "não exigido no teste"', () => {
  const docs = [{ tipo: 'cte', status: 'emitido', exigido: true, dispensa_motivo: null }]
  assert.deepEqual(passosAntesDoCiot(docs, true).map((p) => p.estado), ['ok', 'nao_exigido_teste'])
  assert.deepEqual(passosAntesDoCiot(docs, false).map((p) => p.estado), ['ok', 'pendente'])
  assert.deepEqual(passosAntesDoCiot([{ tipo: 'cte', status: 'pendente', exigido: true, dispensa_motivo: null }], true).map((p) => p.estado), ['pendente', 'nao_exigido_teste'])
})

test('cancelar: bloqueado com MDF-e existente, livre sem ele', () => {
  assert.ok(motivoNaoCancela([{ tipo: 'mdfe', status: 'emitido', exigido: true, dispensa_motivo: null }]))
  assert.equal(motivoNaoCancela([{ tipo: 'mdfe', status: 'cancelado', exigido: true, dispensa_motivo: null }]), null)
  assert.equal(motivoNaoCancela([]), null)
})

test('motivo do cancelamento: mínimo de 15 caracteres, sem contar espaços nas pontas', () => {
  assert.equal(motivoValido('curto'), false)
  assert.equal(motivoValido('   dez chars   '), false)
  assert.equal(motivoValido('dados do motorista errados'), true)
})

test('cancelar CIOT: até 24 h antes do início; depois disso mostra o motivo', () => {
  const agora = new Date('2026-10-30T12:00:00Z')
  assert.equal(motivoNaoCancela([], '2026-11-01T12:00:00Z', agora), null) // 48 h antes
  assert.equal(motivoNaoCancela([], '2026-10-31T13:00:00Z', agora), null) // 25 h antes
  assert.match(motivoNaoCancela([], '2026-10-31T11:00:00Z', agora)!, /prazo para cancelar/) // 23 h antes
  assert.match(motivoNaoCancela([], '2026-10-29T12:00:00Z', agora)!, /prazo para cancelar/) // já começou
  assert.equal(motivoNaoCancela([], null, agora), null) // sem data: não bloqueia
  // MDF-e continua vindo primeiro
  assert.match(motivoNaoCancela([{ tipo: 'mdfe', status: 'emitido', exigido: true }], '2026-11-05T12:00:00Z', agora)!, /MDF-e/)
})

test('piso sem pedido montado: mostra só o piso, não "R$ 0,00 contra piso"', () => {
  const l = montarConferencia({ ok: true, pedido: null, bloqueios: ['Transportador sem chave Pix (o pagamento do CIOT vai por Pix).'], piso: { ok: true, piso: 4870, tabela: 'A', tipoCarga: 'Carga Geral', eixos: 6, distanciaKm: 188 } })
  const piso = l.find((x) => x.id === 'piso')!
  assert.equal(piso.ok, true)
  assert.doesNotMatch(piso.detalhe, /0,00 contra/)
  assert.match(piso.detalhe, /Piso mínimo da ANTT/)
})
