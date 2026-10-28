// node --test gestor/test/ordemColeta.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faltasOrdem, ordemCompleta, rascunhoOrdemColeta, type FonteOrdem } from '../src/lib/ordemColeta.ts'

const fonte: FonteOrdem = {
  operacao: { id: '150cbc5d-96a2-41a7-bf5b-4b112efad3cc', coleta_prevista: '2026-10-24T11:00:00Z', peso_bruto: 100 },
  cotacao: {
    cidade_origem: 'CAMPINAS', uf_origem: 'SP', cidade_destino: 'HORTOLANDIA', uf_destino: 'SP',
    nf_remetente_endereco: { logradouro: 'Av. Paulista', numero: '777', bairro: 'Bela Vista', municipio: 'São Paulo', uf: 'SP', cep: '01311914', telefone: '1153977966' },
    nf_produto_predominante: 'Material de teste', peso_bruto_kg: 100, nf_numero: '2', nf_chave_acesso: '3526',
  },
  cliente: { logradouro: 'Rua das Flores', numero_endereco: '10', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', cep: '13010-000', nome_contato_comercial: 'Ana', celular_whatsapp: '19999990000' },
  documentos: [{ tipo: 'cte', status: 'emitido', numero_documento: '3' }, { tipo: 'mdfe', status: 'cancelado', numero_documento: '2' }],
  motorista: { nome: 'Motorista Teste' },
  veiculo: { placa: 'TST1E34' },
}

test('remetente em outra cidade: usa o endereço do cliente na cidade de origem', () => {
  const r = rascunhoOrdemColeta(fonte)
  assert.equal(r.endereco_carregamento, 'Rua das Flores, 10 — Centro')
  assert.equal(r.cep_carregamento, '13010000')
  assert.equal(r.contato_nome, 'Ana')
  assert.deepEqual(r.documentos, [{ tipo: 'nfe', numero: '2' }, { tipo: 'cte', numero: '3' }]) // MDF-e cancelado fica fora
})

test('coleta em outro local tem prioridade', () => {
  const r = rascunhoOrdemColeta({ ...fonte, cotacao: { ...fonte.cotacao!, origem_cep: '37567-000', origem_endereco: 'Rod. MG-290, km 12', cidade_origem: 'São Sebastião da Bela Vista', uf_origem: 'MG' } })
  assert.equal(r.endereco_carregamento, 'Rod. MG-290, km 12')
  assert.equal(r.cep_carregamento, '37567000')
  assert.equal(r.cidade_carregamento, 'São Sebastião da Bela Vista')
})

test('remetente da NF-e na cidade de origem vem antes do cliente', () => {
  const r = rascunhoOrdemColeta({ ...fonte, cotacao: { ...fonte.cotacao!, cidade_origem: 'São Paulo' } })
  assert.equal(r.endereco_carregamento, 'Av. Paulista, 777 — Bela Vista')
})

test('código, rota e o que falta', () => {
  const r = rascunhoOrdemColeta({ ...fonte, cliente: null, operacao: { ...fonte.operacao, coleta_prevista: null } })
  assert.equal(r.contato_telefone, '1153977966') // sem cliente, usa o telefone do remetente da NF-e
  assert.deepEqual(faltasOrdem(r), ['endereço de carregamento', 'data da coleta'])
  assert.deepEqual(faltasOrdem({ ...r, contato_telefone: null }), ['endereço de carregamento', 'contato no local', 'data da coleta'])
  const o = ordemCompleta(fonte, rascunhoOrdemColeta(fonte), 2, '2026-10-23T12:00:00Z')
  assert.equal(o.codigo, '150CBC5D-v2')
  assert.equal(o.rota, 'CAMPINAS/SP → HORTOLANDIA/SP')
})
