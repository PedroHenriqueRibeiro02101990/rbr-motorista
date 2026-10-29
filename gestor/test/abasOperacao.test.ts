// node --test gestor/test/abasOperacao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ABAS, abaDaEtapa, abaValida, sinaisDasAbas } from '../src/lib/abasOperacao.ts'
import { oQueFalta, type Etapa, type IdEtapa } from '../src/lib/etapasOperacao.ts'

test('toda etapa cai em exatamente uma aba conhecida', () => {
  const ids: IdEtapa[] = ['motorista', 'gr', 'aet', 'rastreio', 'documento', 'averbacao_allianz', 'ciot', 'pagamento', 'mdfe', 'averbacao_sompo', 'liberar', 'viagem']
  for (const id of ids) assert.ok(ABAS.some((a) => a.id === abaDaEtapa(id)), id)
  assert.equal(abaDaEtapa('mdfe'), 'fiscal')
  assert.equal(abaDaEtapa('ciot'), 'fiscal')
  assert.equal(abaDaEtapa('viagem'), 'fiscal')
  assert.equal(abaDaEtapa('gr'), 'motorista')
  assert.equal(abaDaEtapa('pagamento'), 'financeiro')
})
test('aba da URL inválida volta para o Resumo', () => {
  assert.equal(abaValida('fiscal'), 'fiscal')
  assert.equal(abaValida('xyz'), 'resumo')
  assert.equal(abaValida(null), 'resumo')
})
test('sinais: problema vence "agora"; concluída e futura não sinalizam', () => {
  const e = (id: IdEtapa, estado: Etapa['estado']): Etapa => ({ id, titulo: id, estado })
  const s = sinaisDasAbas([e('motorista', 'concluida'), e('documento', 'atual'), e('mdfe', 'problema'), e('pagamento', 'futura')])
  assert.equal(s.motorista, null)
  assert.equal(s.fiscal, 'problema')
  assert.equal(s.financeiro, null)
})
test('o que falta: vazio quando concluída', () => {
  assert.equal(oQueFalta({ id: 'documento', titulo: 'CT-e', estado: 'concluida' }), null)
  assert.equal(oQueFalta({ id: 'documento', titulo: 'CT-e', estado: 'atual' }), 'Emitir o CT-e na tela Fiscal')
  assert.equal(oQueFalta({ id: 'mdfe', titulo: 'MDF-e', estado: 'processando' }), 'aguardando o retorno')
})
