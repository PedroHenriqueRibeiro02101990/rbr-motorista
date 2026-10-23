// node --test gestor/test/crm.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acaoVencida, etapaDaCotacao, ordenarFila, rotuloPrazo } from '../src/lib/crm.ts'

const agora = new Date('2026-10-23T15:00:00Z')
const l = (id: string, x: Partial<{ status: string; criado_em: string; proxima_acao_em: string | null; primeiro_contato_em: string | null }>) => ({
  id, status: 'novo', criado_em: '2026-10-23T10:00:00Z', proxima_acao_em: null, primeiro_contato_em: null, ...x,
})

test('fila: vencida primeiro, depois sem contato, depois o mais antigo; fechados fora', () => {
  const fila = ordenarFila(
    [
      l('contatado-futuro', { status: 'em_contato', primeiro_contato_em: '2026-10-23T11:00:00Z', proxima_acao_em: '2026-10-24T12:00:00Z' }),
      l('sem-contato', { proxima_acao_em: '2026-10-23T18:00:00Z' }),
      l('vencida', { status: 'em_contato', primeiro_contato_em: '2026-10-22T11:00:00Z', proxima_acao_em: '2026-10-23T14:00:00Z' }),
      l('ganho', { status: 'ganho' }),
      l('sem-contato-antigo', { criado_em: '2026-10-20T10:00:00Z', proxima_acao_em: '2026-10-23T16:00:00Z' }),
    ],
    agora,
  )
  assert.deepEqual(fila.map((x) => x.id), ['vencida', 'sem-contato-antigo', 'sem-contato', 'contatado-futuro'])
})

test('prazo e vencimento', () => {
  assert.equal(acaoVencida({ proxima_acao_em: '2026-10-23T14:59:00Z' }, agora), true)
  assert.equal(rotuloPrazo('2026-10-23T15:15:00Z', agora), 'em 15 min')
  assert.equal(rotuloPrazo('2026-10-23T13:00:00Z', agora), 'vencida há 2 h')
  assert.equal(rotuloPrazo(null, agora), 'sem prazo')
})

test('etapa da oportunidade pela cotação', () => {
  assert.equal(etapaDaCotacao('rascunho'), 'qualificacao')
  assert.equal(etapaDaCotacao('enviada'), 'cotacao_enviada')
  assert.equal(etapaDaCotacao('convertida'), 'ganha')
})
