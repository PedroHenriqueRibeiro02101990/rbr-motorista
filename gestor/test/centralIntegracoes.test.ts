// node --test gestor/test/centralIntegracoes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acessoCentral, FORNECEDORES, resumir, semSegredo } from '../src/lib/centralIntegracoes.ts'

test('acesso: só gestor com a flag ligada; flag desligada ou outro papel não vê', () => {
  assert.equal(acessoCentral('gestor_rbr', 'true'), true)
  assert.equal(acessoCentral('gestor_rbr', undefined), false)
  assert.equal(acessoCentral('gestor_rbr', 'false'), false)
  for (const p of ['comercial', 'operacao', 'fiscal', 'financeiro', null, undefined]) assert.equal(acessoCentral(p, 'true'), false)
})

test('fornecedor sem dado mostra "sem registro" (nada inventado)', () => {
  const vpo = FORNECEDORES.find((f) => f.id === 'nspedagio')!
  assert.deepEqual(resumir(vpo, []), { ultimaChamada: null, resultado: 'sem registro', erros24h: null, ambiente: 'sem registro' })
  assert.equal(resumir(vpo, null).resultado, 'sem registro')
  const banco = FORNECEDORES.find((f) => f.id === 'bancos')!
  assert.equal(resumir(banco, null).erros24h, null)
})

test('conta erros só das últimas 24 horas e informa o último resultado', () => {
  const vpo = FORNECEDORES.find((f) => f.id === 'nspedagio')!
  const agora = new Date('2026-11-12T12:00:00Z')
  const r = resumir(vpo, [
    { criado_em: '2026-11-12T10:00:00Z', http_status: 200, erro: null, ambiente: 'homologacao' },
    { criado_em: '2026-11-12T09:00:00Z', http_status: 500, erro: 'falhou', ambiente: 'homologacao' },
    { criado_em: '2026-11-10T09:00:00Z', http_status: 500, erro: 'velho', ambiente: 'homologacao' },
  ], agora)
  assert.equal(r.erros24h, 1)
  assert.equal(r.resultado, 'ok (200)')
  assert.equal(r.ambiente, 'homologacao')
})

test('nenhum fornecedor expõe valor de segredo: credencial é só apontador; texto suspeito é ocultado', () => {
  for (const f of FORNECEDORES) assert.match(f.credencial, /painel do Supabase|sem integração/)
  assert.equal(semSegredo('Bearer abcdefgh12345678'), 'Bearer [oculto]')
  assert.equal(semSegredo('chave ' + 'A'.repeat(40)), 'chave [oculto]')
  assert.equal(semSegredo('erro simples'), 'erro simples')
})
