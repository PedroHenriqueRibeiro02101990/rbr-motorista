// node --test gestor/test/vpoPassos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoVpo, passoDe, podeCancelar, podeComprar, registroDePassos, registroEmJson, type RequisicaoVpo } from '../src/lib/vpoPassos.ts'

let n = 0
const req = (acao: string, extra: Partial<RequisicaoVpo> = {}): RequisicaoVpo => ({
  id: `r${++n}`, acao, ambiente: 'homologacao', http_status: 200, id_vpo_antt: null, numero_viagem: null, id_recibo: null,
  total_viagem: null, erro: null, criado_em: `2026-10-29T10:${String(n).padStart(2, '0')}:00Z`, ...extra,
})

test('estado: nada, simulado, comprado, cancelado, e compra de novo depois de cancelar', () => {
  assert.equal(estadoVpo([]), 'nao_simulado')
  assert.equal(estadoVpo([req('consultar-tag')]), 'nao_simulado')
  assert.equal(estadoVpo([req('simular')]), 'simulado')
  assert.equal(estadoVpo([req('simular'), req('comprar')]), 'comprado')
  assert.equal(estadoVpo([req('simular'), req('comprar'), req('cancelar')]), 'cancelado')
  assert.equal(estadoVpo([req('simular'), req('comprar'), req('cancelar'), req('comprar')]), 'comprado')
})

test('chamada com erro ou sem resposta não muda o estado', () => {
  assert.equal(estadoVpo([req('simular', { http_status: 400, erro: 'x' })]), 'nao_simulado')
  assert.equal(estadoVpo([req('simular'), req('comprar', { http_status: null })]), 'simulado')
  assert.equal(estadoVpo([req('simular'), req('comprar'), req('cancelar', { http_status: 502, erro: 'caiu' })]), 'comprado')
})

test('ordem vem do horário, não da ordem do array', () => {
  const a = req('simular')
  const b = req('comprar')
  assert.equal(estadoVpo([b, a]), 'comprado')
})

test('botões liberados por estado', () => {
  assert.equal(podeComprar('nao_simulado'), false)
  assert.equal(podeComprar('simulado'), true)
  assert.equal(podeComprar('comprado'), false)
  assert.equal(podeComprar('cancelado'), true)
  assert.equal(podeCancelar('comprado'), true)
  assert.equal(podeCancelar('simulado'), false)
})

test('passo em português: sucesso com dados, erro com motivo, andamento', () => {
  const ok = passoDe(req('comprar', { id_vpo_antt: '123', numero_viagem: 'V9', total_viagem: 140.64 }))
  assert.equal(ok.resultado, 'ok')
  assert.match(ok.detalhe, /ID do vale 123/)
  assert.match(ok.detalhe, /viagem V9/)
  assert.match(ok.detalhe, /140,64/)
  const ruim = passoDe(req('simular', { http_status: 400, erro: 'Rota inválida' }))
  assert.equal(ruim.resultado, 'erro')
  assert.equal(ruim.detalhe, 'Rota inválida')
  assert.equal(passoDe(req('cancelar', { http_status: null })).resultado, 'andamento')
  assert.equal(passoDe(req('trocar-placa')).titulo, 'Troca de placa')
})

test('exportação em JSON: ordenada e sem nada com cara de credencial', () => {
  const r = req('simular', { request_json: { pontos: [1], access_token: 'abc', nested: { client_secret: 'x', ok: 1 } } })
  const txt = registroEmJson('op-1', [req('comprar'), r])
  assert.ok(!txt.includes('abc') && !txt.includes('"x"'))
  const j = JSON.parse(txt)
  assert.equal(j.operacao_id, 'op-1')
  assert.equal(j.passos[0].acao, 'simular') // o simular foi criado antes, mesmo estando em segundo no array
  assert.equal(registroDePassos([req('simular')]).length, 1)
})
