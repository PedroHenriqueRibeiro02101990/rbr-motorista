// node --test supabase/functions/_shared/saudeFiscal.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarSaudeFiscal, corGeral } from './saudeFiscal.ts'

const MIN = 60_000
const DIA = 24 * 60 * MIN
const agora = Date.UTC(2026, 9, 30, 15, 0)
const iso = (ms: number) => new Date(ms).toISOString()
const op = { id: 'o1', status: 'em_transito', entregue_em: null }

test('tudo em dia: verde', () => {
  const a = avaliarSaudeFiscal({ operacoes: [op], documentos: [], ciot: [], agora })
  assert.deepEqual(a, [])
  assert.equal(corGeral(a), 'verde')
})
test('documento pendente há mais de 10 min avisa; antes disso não', () => {
  const doc = (min: number) => ({ operacao_id: 'o1', tipo: 'mdfe', status: 'pendente', emitido_em: null, atualizado_em: iso(agora - min * MIN) })
  assert.equal(avaliarSaudeFiscal({ operacoes: [op], documentos: [doc(5)], ciot: [], agora }).length, 0)
  const a = avaliarSaudeFiscal({ operacoes: [op], documentos: [doc(11)], ciot: [], agora })
  assert.equal(a.length, 1); assert.equal(a[0].gravidade, 'amarelo')
})
test('CT-e emitido sem averbação há mais de 30 min é vermelho', () => {
  const cte = { operacao_id: 'o1', tipo: 'cte', status: 'emitido', emitido_em: iso(agora - 31 * MIN), atualizado_em: null }
  const a = avaliarSaudeFiscal({ operacoes: [op], documentos: [cte], ciot: [], agora })
  assert.equal(corGeral(a), 'vermelho')
  const atm = { operacao_id: 'o1', tipo: 'atm', status: 'emitido', emitido_em: iso(agora), atualizado_em: null }
  assert.equal(avaliarSaudeFiscal({ operacoes: [op], documentos: [cte, atm], ciot: [], agora }).length, 0)
})
test('MDF-e aberto depois da entrega, CIOT perto do prazo e VPO em operação cancelada', () => {
  const entregue = { ...op, status: 'entregue', entregue_em: iso(agora - 2 * DIA) }
  const mdfe = { operacao_id: 'o1', tipo: 'mdfe', status: 'emitido', emitido_em: iso(agora - 3 * DIA), atualizado_em: null }
  const ciot = { operacao_id: 'o1', ciot_status: 'emitido', ciot_fim_previsto: iso(agora - 4.5 * DIA), vpo_idvpo: null }
  const a = avaliarSaudeFiscal({ operacoes: [entregue], documentos: [mdfe], ciot: [ciot], agora })
  assert.equal(a.length, 2)
  const cancelada = { ...op, status: 'cancelada' }
  const b = avaliarSaudeFiscal({ operacoes: [cancelada], documentos: [], ciot: [{ operacao_id: 'o1', ciot_status: 'cancelado', ciot_fim_previsto: null, vpo_idvpo: '123' }], agora })
  assert.equal(corGeral(b), 'precisa_de_voce')
})
test('operação de teste é ignorada', () => {
  const teste = { ...op, eh_teste: true }
  const cte = { operacao_id: 'o1', tipo: 'cte', status: 'emitido', emitido_em: iso(agora - 60 * MIN), atualizado_em: null }
  assert.deepEqual(avaliarSaudeFiscal({ operacoes: [teste], documentos: [cte], ciot: [], agora }), [])
})
