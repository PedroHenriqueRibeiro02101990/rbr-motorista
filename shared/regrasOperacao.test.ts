// node --test shared/regrasOperacao.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alertasDePrazo, esteiraDaOperacao, ordenarFila, situacaoApolice } from './regrasOperacao.ts'

const H = 3_600_000
const D = 24 * H
const t0 = Date.UTC(2026, 9, 30)

test('C08: ok abaixo de 80%, amarelo de 80% a 100%, travado acima', () => {
  assert.equal(situacaoApolice(700_000, 0, 1_000_000).nivel, 'ok')
  assert.equal(situacaoApolice(800_000, 0, 1_000_000).nivel, 'amarelo')
  assert.equal(situacaoApolice(1_000_000, 0, 1_000_000).pode_emitir, true)
  const t = situacaoApolice(600_000, 500_000, 1_000_000)
  assert.equal(t.nivel, 'travado'); assert.equal(t.pode_emitir, false)
  assert.equal(situacaoApolice(600_000, 500_000, 1_000_000, true).pode_emitir, true)
  assert.equal(situacaoApolice(1, 0, 0).pode_emitir, false)
})
test('D01: ordem pela coleta, urgente < 24 h, espera 2 h amarela e 4 h vermelha', () => {
  const r = ordenarFila([
    { id: 'b', coletaEm: t0 + 3 * D, esperandoDesde: t0 - 5 * H },
    { id: 'a', coletaEm: t0 + 12 * H, esperandoDesde: t0 - 2 * H },
    { id: 'c', coletaEm: null, esperandoDesde: t0 },
  ], t0)
  assert.deepEqual(r.map((i) => i.id), ['a', 'b', 'c'])
  assert.equal(r[0].urgente, true); assert.equal(r[0].espera, 'amarela')
  assert.equal(r[1].urgente, false); assert.equal(r[1].espera, 'vermelha')
  assert.equal(r[2].espera, 'normal')
})
test('D12: alertas de prazo da viagem', () => {
  assert.deepEqual(alertasDePrazo({}, t0), [])
  assert.equal(alertasDePrazo({ entregaPrevista: t0 - H }, t0).length, 1)
  assert.equal(alertasDePrazo({ entregaPrevista: t0 - H, finalizada: true }, t0).length, 0)
  assert.equal(alertasDePrazo({ ciotFimPrevisto: t0 - 4.5 * D }, t0).length, 1)
  assert.equal(alertasDePrazo({ mdfeEmitidoEm: t0 - 29 * D }, t0).length, 1)
  assert.equal(alertasDePrazo({ mdfeEmitidoEm: t0 - 29 * D, mdfeEncerrado: true }, t0).length, 0)
})
test('B13: esteira com não se aplica e motivo', () => {
  const e = esteiraDaOperacao({ temPedagio: false, frotaPropria: true })
  assert.equal(e.find((x) => x.etapa === 'vpo')?.aplica, false)
  assert.match(String(e.find((x) => x.etapa === 'ciot')?.motivo), /Frota própria/)
  assert.equal(esteiraDaOperacao({ temPedagio: true, frotaPropria: false }).every((x) => x.aplica), true)
})
