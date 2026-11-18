// node --test supabase/functions/_shared/uploadsFiscais.test.ts   (mocks; nao toca producao)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhoArquivo, hashArquivo, montarEvento, planejarGravacao, validarArquivo } from './uploadsFiscais.ts'

test('upload aceita PDF/PNG/JPG no vale-pedagio e recusa o resto', () => {
  assert.equal(validarArquivo('vpo_pdf', { nome: 'vpr.pdf', tamanho: 1000, mime: 'application/pdf' }).ok, true)
  assert.equal(validarArquivo('vpo_pdf', { nome: 'vpr.PNG', tamanho: 1000, mime: 'image/png' }).ok, true)
  assert.equal(validarArquivo('vpo_pdf', { nome: 'vpr.jpg', tamanho: 1000, mime: 'image/jpeg' }).ok, true)
  assert.equal(validarArquivo('vpo_pdf', { nome: 'vpr.docx', tamanho: 1000 }).ok, false)
  assert.equal(validarArquivo('ciot_pdf', { nome: 'ciot.png', tamanho: 1000, mime: 'image/png' }).ok, false) // imagem so no vale-pedagio
  assert.equal(validarArquivo('nfe_xml', { nome: 'nfe.pdf', tamanho: 10 }).ok, false)
  assert.equal(validarArquivo('nfe_xml', { nome: 'nfe.xml', tamanho: 10, mime: 'text/xml' }).ok, true)
})
test('arquivo vazio e arquivo grande sao recusados com mensagem clara', () => {
  assert.match(validarArquivo('cte_pdf', { nome: 'a.pdf', tamanho: 0 }).mensagem ?? '', /vazio/)
  assert.match(validarArquivo('cte_pdf', { nome: 'a.pdf', tamanho: 11 * 1024 * 1024 }).mensagem ?? '', /10 MB/)
  assert.match(validarArquivo('nfe_xml', { nome: 'a.xml', tamanho: 3 * 1024 * 1024 }).mensagem ?? '', /2 MB/)
})
test('caminho {operacao}/{tipo}/{timestamp}-{nome sanitizado}', () => {
  assert.equal(caminhoArquivo('ciot_pdf', 'op-1', 'Contrato açúcar (1).pdf', 123), 'op-1/ciot/123-Contrato_acucar_1_.pdf')
})
test('mesmo arquivo (hash) avisa e nao duplica; troca mantem o historico', async () => {
  const h1 = await hashArquivo(new TextEncoder().encode('a')), h2 = await hashArquivo(new TextEncoder().encode('b'))
  assert.notEqual(h1, h2)
  assert.equal(planejarGravacao(null, h1).acao, 'criar')
  const ex = { arquivo_path: 'op/ciot/1-a.pdf', arquivo_hash: h1, versao: 1 }
  assert.equal(planejarGravacao(ex, h1).acao, 'duplicado')
  const t = planejarGravacao(ex, h2)
  assert.deepEqual(t, { acao: 'trocar', versao: 2, historico: ['op/ciot/1-a.pdf'] })
  const t3 = planejarGravacao({ ...ex, versao: 2, arquivo_historico: ['x'] }, h2)
  assert.deepEqual(t3.acao === 'trocar' && t3.historico, ['x', 'op/ciot/1-a.pdf'])
})
test('evento fiscal manual com origem e sucesso', () => {
  const e = montarEvento({ operacaoId: 'op', campo: 'vpo_pdf', evento: 'erro', atorId: 'u', sucesso: false, mensagem: 'falha' })
  assert.deepEqual([e.tipo_documento, e.evento, e.origem, e.origem_acao, e.sucesso], ['vpo', 'erro', 'manual', 'manual', false])
})
