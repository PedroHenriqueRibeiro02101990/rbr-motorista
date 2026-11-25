// node --test supabase/functions/_shared/leituraFila.test.ts   (sem rede; dados sinteticos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVISO_IA_GRATIS, faltantesDoNormalizado, lendoExpirou, marcarIaGratis, mesclarBrutos, paraBruto, provedorSeguro } from './leituraFila.ts'
import { normalizarExtracao } from './extracao-documentos.ts'
import { lerCnh } from './leitura-texto.ts'

const HOJE = '2026-11-25'

test('paraBruto aceita valor solto e valor aninhado; confianca nunca passa de media; "*.*" e vazio viram null', () => {
  const b = paraBruto('cnh', { nome: 'JOAO TESTE', cpf: { valor: '529.982.247-25', confianca: 'alta', trecho: 'CPF 529' }, categoria: '', validade: '*.*', campo_inventado: 'x' })
  assert.equal((b.nome as { valor: unknown }).valor, 'JOAO TESTE')
  assert.equal((b.nome as { confianca: string }).confianca, 'media')
  assert.equal((b.cpf as { confianca: string }).confianca, 'media') // "alta" da IA vira media
  assert.equal((b.categoria as { valor: unknown }).valor, null)
  assert.equal((b.validade as { valor: unknown }).valor, null)
  assert.equal('campo_inventado' in b, false)
})

test('foto lida pela IA passa pelas validacoes: CPF errado avisa, CNH vencida avisa, data em DD/MM/AAAA vira ISO, placa sem traco', () => {
  const n = marcarIaGratis(normalizarExtracao('cnh', paraBruto('cnh', { nome: 'JOAO TESTE', cpf: '529.982.247-26', validade: '15/03/2025', data_nascimento: '02/10/1980' }), HOJE))
  assert.equal(n.campos.validade.valor, '2025-03-15')
  assert.ok(n.avisos.includes('CNH vencida.'))
  assert.ok(n.avisos.some((a) => /CPF lido nao passa/.test(a)))
  assert.equal(n.avisos[0], AVISO_IA_GRATIS)
  const c = normalizarExtracao('crlv', paraBruto('crlv', { placa: 'abc-1d23', renavam: '0123456789-0' }), HOJE)
  assert.equal(c.campos.placa.valor, 'ABC1D23')
  assert.equal(c.campos.renavam.valor, '01234567890')
})

test('mesclar: o texto lido pelo parser tem prioridade; a IA so completa o que ficou vazio', () => {
  const texto = lerCnh('CARTEIRA NACIONAL DE HABILITACAO NOME E SOBRENOME\nJOAO DA SILVA TESTE\nCPF 529.982.247-25 Nº REGISTRO 01234567890 CAT. HAB. B')!
  const ia = paraBruto('cnh', { nome: 'NOME ERRADO DA IA', validade: '2031-03-15', data_nascimento: '1980-10-02' })
  const m = mesclarBrutos('cnh', texto, ia)
  assert.equal((m.nome as { valor: unknown }).valor, 'JOAO DA SILVA TESTE')
  assert.equal((m.validade as { valor: unknown }).valor, '2031-03-15')
  assert.equal((m.cpf as { valor: unknown }).valor, '52998224725')
})

test('faltantes do normalizado e provedor seguro', () => {
  const n = normalizarExtracao('rntrc', paraBruto('rntrc', { numero: '012345678' }), HOJE)
  assert.deepEqual(faltantesDoNormalizado(n, ['numero', 'titular', 'validade']), ['titular', 'validade'])
  assert.deepEqual(faltantesDoNormalizado(null, ['a']), ['a'])
  assert.equal(provedorSeguro('groq/llama-4-scout'), 'groq/llama-4-scout')
  assert.equal(provedorSeguro('x; drop table'), null)
})

test('linha lendo ha mais de 120 s expira; recente nao', () => {
  const agora = Date.parse('2026-11-25T12:00:00Z')
  assert.equal(lendoExpirou({ status: 'lendo', atualizado_em: '2026-11-25T11:57:00Z' }, agora), true)
  assert.equal(lendoExpirou({ status: 'lendo', atualizado_em: '2026-11-25T11:59:30Z' }, agora), false)
  assert.equal(lendoExpirou({ status: 'pendente', atualizado_em: '2026-11-25T11:00:00Z' }, agora), false)
})
