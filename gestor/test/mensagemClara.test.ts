// node --test gestor/test/mensagemClara.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensagemClara } from '../src/lib/mensagemClara.ts'

test('rede, sessão e permissão viram português claro', () => {
  assert.match(mensagemClara(new TypeError('Failed to fetch')), /Sem conexão/)
  assert.match(mensagemClara({ message: 'JWT expired' }), /sessão expirou/)
  assert.match(mensagemClara({ message: 'new row violates row-level security policy for table "x"' }), /permissão/)
  assert.match(mensagemClara('Edge Function returned a non-2xx status code'), /servidor recusou/)
})
test('erro interno da efrete: sem o prefixo do robô e sem prometer duplicidade', () => {
  const m = mensagemClara('Sistema efrete (www.efrete.com.br): efreteErro adicionando operação de transporte: Erro interno. Tente novamente em alguns minutos.')
  assert.match(m, /erro interno/)
  assert.match(m, /não gera CIOT duplicado/)
})
test('mensagem de regra em português passa como está', () => {
  assert.equal(mensagemClara('Motorista sem CPF.'), 'Motorista sem CPF.')
})
test('vazio ou sem sentido cai no texto padrão (ou no informado)', () => {
  assert.match(mensagemClara(undefined), /Tente de novo/)
  assert.match(mensagemClara('[object Object]'), /Tente de novo/)
  assert.equal(mensagemClara(null, 'Não consegui emitir.'), 'Não consegui emitir.')
})
