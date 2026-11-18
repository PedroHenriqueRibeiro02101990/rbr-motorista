// node --test gestor/test/repomConfirmacao.test.ts
// Regra da tela de prévia/confirmação do Repom (a tela só desenha; tudo que decide está em src/lib/repomConfirmacao.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REPOM_UI_HABILITADA, acoesDoCliente, assinaturaDoFormulario, erroCurto, estadoDaTrava, funcaoDoCliente, lerDadosJson, lerPrevia, lerValor, montarEntradaEnvio, montarEntradaPrevia,
  nomeValido, podeEnviar, previaExpirada, resumoDaPrevia, statusDoEnvio, validarFormulario, type FormularioRepom, type PreviaRecebida,
} from '../src/lib/repomConfirmacao.ts'

const form: FormularioRepom = { cliente: '9501', operacaoId: 'op-1', valor: '50,40', rota: 'SP-RJ', dadosJson: '{"placa":"ABC1D23","numeroEixos":2}' }
const previa: PreviaRecebida = { previa: { valor: 50.4, motorista: 'Fulano', placa: 'ABC1D23', carreta: 'DEF4G56', rota: 'SP-RJ', eixos: 6 }, previa_hash: 'abc123', ambiente: 'qa', emTeste: true, maximo: 3000 }
const agora = 1_700_000_000_000

test('a tela fica desligada por padrão (sem VITE_REPOM_UI = "sim")', () => {
  assert.equal(REPOM_UI_HABILITADA, false)
})

test('cada cliente chama a função e as ações certas', () => {
  assert.equal(funcaoDoCliente('9501'), 'repom-vpo')
  assert.equal(funcaoDoCliente('9520'), 'repom-frete')
  assert.deepEqual(acoesDoCliente('9501'), { previa: 'previa', emitir: 'emitir' })
  assert.deepEqual(acoesDoCliente('9520'), { previa: 'previa_contrato', emitir: 'emitir_contrato' })
})

test('formulário: pede operação, valor maior que zero e JSON válido', () => {
  assert.equal(validarFormulario(form), null)
  assert.match(validarFormulario({ ...form, operacaoId: ' ' }) ?? '', /operação/)
  assert.match(validarFormulario({ ...form, valor: '0' }) ?? '', /valor/i)
  assert.match(validarFormulario({ ...form, valor: 'abc' }) ?? '', /valor/i)
  assert.match(validarFormulario({ ...form, dadosJson: '' }) ?? '', /Cole/)
  assert.match(validarFormulario({ ...form, dadosJson: '{ruim' }) ?? '', /JSON/)
  assert.match(validarFormulario({ ...form, dadosJson: '[1]' }) ?? '', /objeto/)
  assert.equal(lerValor('1.234,5'), null) // milhar com ponto não é aceito: melhor recusar que errar o valor
  assert.equal(lerValor('50,4'), 50.4)
  assert.equal(lerDadosJson('{"a":1}').ok, true)
})

test('prévia: monta a entrada da ação de prévia sem confirmação', () => {
  const e = montarEntradaPrevia(form)
  assert.equal(e.acao, 'previa')
  assert.equal(e.operacao_id, 'op-1')
  assert.equal(e.valor, 50.4)
  assert.equal(e.rota_descricao, 'SP-RJ')
  assert.deepEqual(e.pedido, { placa: 'ABC1D23', numeroEixos: 2 })
  assert.equal('confirmacao' in e, false)
  const f = montarEntradaPrevia({ ...form, cliente: '9520' })
  assert.equal(f.acao, 'previa_contrato')
  assert.deepEqual(f.contrato, { placa: 'ABC1D23', numeroEixos: 2 })
  assert.equal('pedido' in f, false)
})

test('envio: leva o previa_hash, o nome e a hora da confirmação', () => {
  const e = montarEntradaEnvio(form, 'abc123', '  Maria Souza ', new Date(agora))
  assert.equal(e.acao, 'emitir')
  assert.deepEqual(e.confirmacao, { nome: 'Maria Souza', em: new Date(agora).toISOString(), previa_hash: 'abc123' })
  assert.equal(montarEntradaEnvio({ ...form, cliente: '9520' }, 'h', 'Maria', new Date(agora)).acao, 'emitir_contrato')
})

test('lerPrevia aceita só prévia completa com ambiente qa ou prd', () => {
  assert.deepEqual(lerPrevia(previa), previa)
  assert.equal(lerPrevia(null), null)
  assert.equal(lerPrevia({ ok: false, erro: 'x' }), null)
  assert.equal(lerPrevia({ ...previa, previa_hash: '' }), null)
  assert.equal(lerPrevia({ ...previa, ambiente: 'dev' }), null)
})

test('resumo mostra cliente, ambiente, valor, rota e placas', () => {
  const r = resumoDaPrevia(previa, '9501')
  const m = Object.fromEntries(r.map((l) => [l.rotulo, l.valor]))
  assert.match(m['Cliente Repom']!, /9501/)
  assert.match(m['Ambiente']!, /QA/)
  assert.match(m['Valor']!, /50,40/)
  assert.equal(m['Rota'], 'SP-RJ')
  assert.equal(m['Placa'], 'ABC1D23 + DEF4G56')
  assert.match(resumoDaPrevia({ ...previa, ambiente: 'prd' }, '9520').find((l) => l.rotulo === 'Ambiente')!.valor, /Produção/)
})

test('trava: 503 = desligada; prévia completa = ligada; o resto = não conferida', () => {
  assert.equal(estadoDaTrava(503, { erro: 'desligada' }), 'desligada')
  assert.equal(estadoDaTrava(200, previa), 'ligada')
  assert.equal(estadoDaTrava(422, { erro: 'dados ruins' }), 'desconhecida')
})

test('nome do responsável: 3 letras ou mais', () => {
  assert.equal(nomeValido('  ab '), false)
  assert.equal(nomeValido('Ana'), true)
})

test('prévia expira antes dos 15 min da API', () => {
  assert.equal(previaExpirada(null, agora), true)
  assert.equal(previaExpirada(agora - 60_000, agora), false)
  assert.equal(previaExpirada(agora - 14 * 60_000 - 1, agora), true)
})

test('só envia com prévia, dados iguais, trava ligada, nome e confirmação marcada', () => {
  const ok = { previa, formularioMudou: false, nome: 'Maria', confirmou: true, ocupado: false, trava: 'ligada' as const, geradaEm: agora - 1000, agora }
  assert.deepEqual(podeEnviar(ok), { pode: true, motivo: null })
  assert.match(podeEnviar({ ...ok, previa: null }).motivo ?? '', /prévia/)
  assert.match(podeEnviar({ ...ok, formularioMudou: true }).motivo ?? '', /mudaram/)
  assert.match(podeEnviar({ ...ok, geradaEm: agora - 20 * 60_000 }).motivo ?? '', /velha/)
  assert.match(podeEnviar({ ...ok, trava: 'desligada' }).motivo ?? '', /trava/i)
  assert.match(podeEnviar({ ...ok, nome: 'Jo' }).motivo ?? '', /nome/)
  assert.match(podeEnviar({ ...ok, confirmou: false }).motivo ?? '', /confirmação/)
  assert.equal(podeEnviar({ ...ok, ocupado: true }).pode, false)
})

test('mudar qualquer campo muda a assinatura (a prévia antiga deixa de valer)', () => {
  const a = assinaturaDoFormulario(form)
  assert.equal(assinaturaDoFormulario({ ...form }), a)
  for (const p of [{ valor: '51' }, { operacaoId: 'op-2' }, { rota: 'X' }, { dadosJson: '{}' }, { cliente: '9520' as const }]) assert.notEqual(assinaturaDoFormulario({ ...form, ...p }), a)
})

test('erro curto: máximo 200, sem token nem senha', () => {
  const sujo = 'falhou Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij password=SENHA_SECRETA "access_token":"TOKEN_SECRETO" senha: outra_senha'
  const l = erroCurto(sujo)
  for (const s of ['SENHA_SECRETA', 'TOKEN_SECRETO', 'outra_senha', 'eyJhbGci']) assert.equal(l.includes(s), false, s)
  assert.ok(erroCurto('x'.repeat(500)).length <= 200)
  assert.equal(erroCurto(null), 'Não foi possível concluir.')
})

test('status do envio: 200 enviado, 202 incerto (não reenviar), erro curto nos demais', () => {
  assert.deepEqual(statusDoEnvio(200, { ok: true, registro: { estado: 'emitido' } }), { tipo: 'emitido', texto: 'Estado: emitido' })
  assert.equal(statusDoEnvio(202, { ok: false, erro: 'Repom demorou', incerto: true }).tipo, 'incerto')
  assert.equal(statusDoEnvio(200, { ok: true, registro: { estado: 'enviado' } }).tipo, 'incerto')
  const e = statusDoEnvio(400, { erro: 'Os dados mudaram depois da prévia. password=123' })
  assert.equal(e.tipo, 'erro')
  assert.equal(e.texto.includes('123'), false)
  assert.equal(statusDoEnvio(503, {}).tipo, 'erro')
})
