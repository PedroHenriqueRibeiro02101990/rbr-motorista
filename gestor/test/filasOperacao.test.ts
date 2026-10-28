// node --test gestor/test/filasOperacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casaBusca, contarFilas, filasDe, passaFila, type DadosFila } from '../src/lib/filasOperacao.ts'

const base: DadosFila = { id: '1', status: 'aguardando_liberacao_fiscal', pessoaAlocada: true, bloqueioFiscal: false, ehTeste: false, nfes: 2, docsComProblema: 0 }

test('sem motorista: cai só em "Sem motorista"', () => assert.deepEqual(filasDe({ ...base, pessoaAlocada: false, nfes: 0, status: 'alocando_motorista' }), ['sem_motorista']))
test('com motorista e sem NF-e: "Sem nota"', () => assert.deepEqual(filasDe({ ...base, nfes: 0 }), ['sem_nota']))
test('tudo certo e aguardando documentos: "Prontas para o fiscal"', () => assert.deepEqual(filasDe(base), ['prontas_fiscal']))
test('bloqueio fiscal ou documento com problema: "Para revisar", nunca "Prontas"', () => {
  assert.deepEqual(filasDe({ ...base, bloqueioFiscal: true }), ['para_revisar'])
  assert.deepEqual(filasDe({ ...base, docsComProblema: 1 }), ['para_revisar'])
})
test('operação encerrada não aparece em fila nenhuma', () => {
  for (const status of ['cancelada', 'fechada', 'entregue']) assert.deepEqual(filasDe({ ...base, status }), [])
})
test('contadores e "testes ocultos"', () => {
  const lista = [base, { ...base, id: '2', ehTeste: true }, { ...base, id: '3', pessoaAlocada: false, nfes: 0 }]
  assert.deepEqual(contarFilas(lista, false), { sem_motorista: 1, sem_nota: 0, para_revisar: 0, prontas_fiscal: 2 })
  assert.deepEqual(contarFilas(lista, true), { sem_motorista: 1, sem_nota: 0, para_revisar: 0, prontas_fiscal: 1 })
  assert.equal(passaFila({ ...base, ehTeste: true }, null, true), false)
  assert.equal(passaFila(base, 'prontas_fiscal', true), true)
  assert.equal(passaFila(base, 'sem_nota', true), false)
})
test('busca por placa, NF-e, cliente e código', () => {
  const c = { texto: ['Mills Industria', 'Santo André', '965ceb0d'], placas: ['RQW4D58', 'RRD5B39'], nfes: ['148461', '35261069115969000104550010000009991123456783'] }
  assert.equal(casaBusca('rqw-4d58', c), true)
  assert.equal(casaBusca('148461', c), true)
  assert.equal(casaBusca('mills', c), true)
  assert.equal(casaBusca('965ceb', c), true)
  assert.equal(casaBusca('zzz999', c), false)
  assert.equal(casaBusca('14', c), false)
  assert.equal(casaBusca('', c), true)
})
