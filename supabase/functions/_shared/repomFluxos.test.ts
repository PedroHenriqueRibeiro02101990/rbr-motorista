// node --test supabase/functions/_shared/repomFluxos.test.ts   (sem rede: repositório em memória e Repom simulada)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Fetch } from './repomClient.ts'
import { fluxoFrete, fluxoVpo, hashPrevia, previaDoVale, registroPublico, type DepsFluxo, type EntradaVpo } from './repomFluxos.ts'
import { executarComEstado, identificadorContratoDe, podeLiberarMdfe, processoCodigoDe, sanitizarPayload, type RegistroOperacaoRepom, type RepositorioOperacaoRepom } from './repomOperacao.ts'
import { decidirConfirmacao, decidirValor, decidirOperacao, valorMaximoOperacao, VALOR_MAXIMO_PADRAO } from './repomTrava.ts'
import { criarRepomVprClient, type PedidoVale } from './repomVprClient.ts'
import { criarRepomFreteClient, type PedidoContratoFrete } from './repomFreteClient.ts'
import { corsPara, origemPermitida } from './repomHttp.ts'

const OP = '11111111-1111-1111-1111-111111111111'
const AGORA = Date.parse('2026-11-12T15:00:00Z')
const conf = (extra: Record<string, unknown> = {}) => ({ nome: 'Pedro Gestor', em: new Date(AGORA - 60_000).toISOString(), ...extra })

function repoMemoria() {
  const linhas: RegistroOperacaoRepom[] = []
  const repo: RepositorioOperacaoRepom = {
    async buscar(o, t, a) { return linhas.find((x) => x.operacao_id === o && x.tipo === t && x.ambiente === a) ?? null },
    async criar(r) { const x = { ...r, id: 'id' + (linhas.length + 1), criado_em: 'x', atualizado_em: 'x' } as RegistroOperacaoRepom; linhas.push(x); return x },
    async atualizar(id, p) { const x = linhas.find((y) => y.id === id)!; Object.assign(x, p); return x },
  }
  return { linhas, repo }
}
function deps(repo: RepositorioOperacaoRepom, extra: Partial<DepsFluxo> = {}): DepsFluxo {
  return { repo, ambiente: 'qa', apiLiberada: true, valorMaximo: 3000, antesDeChamar: async () => null, agora: AGORA, ...extra }
}

type Chamada = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }
function mock(resp: (c: Chamada, n: number) => { status: number; corpo: unknown } | 'timeout') {
  const chamadas: Chamada[] = []
  const fetchFn: Fetch = async (url, init) => {
    const c = { url, init: init ?? {} }
    chamadas.push(c)
    const x = resp(c, chamadas.length)
    if (x === 'timeout') { const e = new Error('abortado'); e.name = 'AbortError'; throw e }
    return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.corpo }
  }
  return { chamadas, fetchFn }
}
const tokenVale = { authenticated: true, created: '2025-11-12 17:00:19', expiration: '2025-11-13 17:00:18', accessToken: 'tv' }
const valeOk = { result: { status: true }, statusCarga: 'Carregado', viagemAtiva: true, codigoViagem: 10164586, codigoViagemRepom: 100, idvpoAntt: ['53281139708594652971'], valor: 50.4, tag: '8990', tipoEmissao: 'Pedágio Eletrônico', pracas: [] }
const vprCfg = { ambiente: 'qa' as const, roteirizacaoLogin: 'LOGIN_ROT_SECRETO', roteirizacaoSenha: 'SENHA_ROT_SECRETA', valePedagioLogin: 'USUARIO_VALE_SECRETO', valePedagioSenha: 'SENHA_VALE_SECRETA' }
const ehTokenVale = (c: Chamada) => c.url.endsWith('/api/Token')
const ehEmissao = (c: Chamada) => c.url.endsWith('/RepomViagem/ValePedagio')

const pedido: Omit<PedidoVale, 'processoCodigoCliente'> = {
  placa: 'ABC1D23', numeroEixos: 2, carretaPlaca: 'DEF4G56', carretaNumeroEixos: 4, nomeTransportador: 'Transportadora Teste', documentoTransportador: '00000000000100',
  nomeMotorista: 'Motorista Teste', documentoMotorista: '00000000000', cnpjFilial: '00000000000100', usuarioEmissao: 'Usuario Teste', roteiro: { roteiroCodigo: 140476, percursoCodigo: 334 },
}
async function entradaEmitir(extra: Partial<EntradaVpo> = {}): Promise<EntradaVpo> {
  const previa = previaDoVale({ ...pedido, processoCodigoCliente: 'PREVIA' }, 50.4, 'SP-RJ')
  return { acao: 'emitir', operacao_id: OP, pedido, valor: 50.4, rota_descricao: 'SP-RJ', confirmacao: conf({ previa_hash: await hashPrevia(previa) }), ...extra }
}

// ---------- travas ----------
test('trava desligada (REPOM_API_LIBERADA diferente de "sim"): 503 e NÃO chama a Repom', async () => {
  const { repo, linhas } = repoMemoria()
  const m = mock(() => ({ status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  const s = await fluxoVpo(await entradaEmitir(), vpr, deps(repo, { apiLiberada: false }))
  assert.equal(s.status, 503)
  assert.equal(m.chamadas.length, 0)
  assert.equal(linhas.length, 0) // nem registro
  assert.equal((await fluxoVpo({ acao: 'tag', placa: 'ABC1D23' }, vpr, deps(repo, { apiLiberada: false }))).status, 503)
  const frete = criarRepomFreteClient({ ambiente: 'qa', credenciais: { user: 'a', version: '3', password: 'b', partner: 'c' }, urlToken: 'https://x.invalid/t' }, m.fetchFn)
  assert.equal((await fluxoFrete({ acao: 'cadastro', recurso: 'tipos_carga' }, frete, deps(repo, { apiLiberada: false }))).status, 503)
  assert.equal(m.chamadas.length, 0)
})
test('valor máximo: padrão 3000; acima disso 422 sem chamar a Repom; igual ao máximo passa; sem valor é recusado', async () => {
  assert.equal(valorMaximoOperacao(undefined), VALOR_MAXIMO_PADRAO)
  assert.equal(valorMaximoOperacao('abc'), 3000)
  assert.equal(valorMaximoOperacao('0'), 3000)
  assert.equal(valorMaximoOperacao('1500,50'), 1500.5)
  assert.equal(decidirValor(3000, 3000).permitido, true)
  const acima = decidirValor(3000.01, 3000)
  assert.ok(!acima.permitido && acima.status === 422)
  assert.equal(decidirValor(null, 3000).permitido, false)
  assert.equal(decidirValor(-1, 3000).permitido, false)
  const { repo, linhas } = repoMemoria()
  const m = mock(() => ({ status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  const e = await entradaEmitir({ valor: 3500, confirmacao: conf({ previa_hash: await hashPrevia(previaDoVale({ ...pedido, processoCodigoCliente: 'P' }, 3500, 'SP-RJ')) }) })
  const s = await fluxoVpo(e, vpr, deps(repo))
  assert.equal(s.status, 422)
  assert.equal(m.chamadas.length, 0)
  assert.equal(linhas.length, 0)
})
test('confirmação humana: sem nome, velha ou futura é recusada (400); a prévia precisa bater', async () => {
  assert.equal(decidirConfirmacao({ nome: 'Ana Gestora', em: new Date(AGORA - 1000).toISOString() }, AGORA).permitido, true)
  for (const c of [undefined, { nome: '', em: new Date(AGORA).toISOString() }, { nome: 'Ana', em: 'ontem' }, { nome: 'Ana Gestora', em: new Date(AGORA - 3_600_000).toISOString() }, { nome: 'Ana Gestora', em: new Date(AGORA + 3_600_000).toISOString() }]) {
    const v = decidirConfirmacao(c as never, AGORA)
    assert.ok(!v.permitido && v.status === 400)
  }
  assert.equal(decidirOperacao({ acao: 'consulta', apiLiberada: true, maximo: 3000 }).permitido, true) // leitura não pede confirmação
  const { repo } = repoMemoria()
  const m = mock(() => ({ status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  assert.equal((await fluxoVpo(await entradaEmitir({ confirmacao: undefined }), vpr, deps(repo))).status, 400)
  assert.equal((await fluxoVpo(await entradaEmitir({ confirmacao: conf({ previa_hash: 'errado' }) }), vpr, deps(repo))).status, 400)
  assert.equal(m.chamadas.length, 0)
})
test('limite diário: 429 sem chamar a Repom (emissão e consulta de TAG); cache não passa por aqui', async () => {
  const { repo } = repoMemoria()
  const m = mock(() => ({ status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  const cheio = deps(repo, { antesDeChamar: async () => 'Limite diário de consultas à Repom atingido.' })
  assert.equal((await fluxoVpo(await entradaEmitir(), vpr, cheio)).status, 429)
  assert.equal((await fluxoVpo({ acao: 'tag', placa: 'ABC1D23' }, vpr, cheio)).status, 429)
  assert.equal(m.chamadas.length, 0)
})

// ---------- emissão, estado e idempotência ----------
test('emitir vale: grava "enviado" antes, grava os códigos, payload sanitizado, e a prévia não chama a Repom', async () => {
  const { repo, linhas } = repoMemoria()
  const estados: string[] = []
  const repoEspia: RepositorioOperacaoRepom = { ...repo, async atualizar(id, p) { if (p.estado) estados.push(p.estado); return repo.atualizar(id, p) } }
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale } : { status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  const previa = await fluxoVpo({ acao: 'previa', operacao_id: OP, pedido, valor: 50.4, rota_descricao: 'SP-RJ' }, vpr, deps(repoEspia))
  assert.equal(previa.status, 200)
  assert.equal(m.chamadas.length, 0)
  assert.equal((previa.corpo.previa as { eixos: number }).eixos, 6)
  const s = await fluxoVpo(await entradaEmitir(), vpr, deps(repoEspia))
  assert.equal(s.status, 200)
  assert.deepEqual(estados, ['enviado', 'emitido'])
  const reg = linhas[0]!
  assert.equal(reg.estado, 'emitido')
  assert.equal(reg.codigo_viagem, '10164586')
  assert.equal(reg.idvpo, '53281139708594652971')
  assert.equal(reg.ambiente, 'qa')
  assert.equal(reg.confirmado_por, 'Pedro Gestor')
  assert.equal(reg.chave_externa, await processoCodigoDe(OP, 0))
  assert.ok(reg.chave_externa.length <= 20)
  const salvo = JSON.stringify(reg.payload_sanitizado)
  for (const x of ['Motorista Teste', 'Transportadora Teste', 'ABC1D23', '00000000000100']) assert.ok(!salvo.includes(x), x)
  // a visão pública não traz payload nem segredo
  const pub = JSON.stringify(registroPublico(reg))
  assert.ok(!pub.includes('payload') && !pub.includes('SENHA'))
})
test('idempotência: segunda emissão da mesma operação NÃO chama a Repom de novo (processoCodigoCliente estável)', async () => {
  const { repo, linhas } = repoMemoria()
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale } : { status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  const antes = m.chamadas.filter(ehEmissao).length
  const s2 = await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal(s2.status, 200)
  assert.equal(s2.corpo.jaExistia, true)
  assert.equal(m.chamadas.filter(ehEmissao).length, antes)
  assert.equal(linhas.length, 1)
  assert.equal(await processoCodigoDe(OP, 0), await processoCodigoDe(OP, 0))
  assert.notEqual(await processoCodigoDe(OP, 0), await processoCodigoDe(OP, 1))
})
test('timeout na emissão: fica "enviado", NÃO reenvia nem na próxima chamada (sem como conferir sem codigoViagem)', async () => {
  const { repo, linhas } = repoMemoria()
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale } : 'timeout'))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  const s = await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal(s.status, 202)
  assert.equal(linhas[0]!.estado, 'enviado')
  const s2 = await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal(s2.status, 409)
  assert.equal(s2.corpo.conferirNoPortal, true)
  assert.equal(m.chamadas.filter(ehEmissao).length, 1) // UMA emissão em toda a história
})
test('5xx na emissão: idem (incerto, não reenvia); com codigoViagem conhecido, a próxima chamada CONSULTA antes de qualquer reenvio', async () => {
  const { repo, linhas } = repoMemoria()
  let falha = true
  const m = mock((c) => {
    if (ehTokenVale(c)) return { status: 200, corpo: tokenVale }
    if (ehEmissao(c)) return falha ? { status: 500, corpo: null } : { status: 200, corpo: valeOk }
    return { status: 200, corpo: valeOk } // consulta por codigoViagem
  })
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  assert.equal((await fluxoVpo(await entradaEmitir(), vpr, deps(repo))).status, 202)
  linhas[0]!.codigo_viagem = '10164586' // suponha que a pessoa informou/obteve o código no portal
  falha = false
  const s = await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal(s.status, 200)
  assert.equal(linhas[0]!.estado, 'emitido')
  assert.equal(m.chamadas.filter(ehEmissao).length, 1) // consultou, não reemitiu
  assert.ok(m.chamadas.some((c) => c.url.includes('/RepomViagem/ID?ID=10164586')))
})
test('erro definitivo da Repom (347): estado "erro" e nova tentativa usa nova chave; cancelado também', async () => {
  const { repo, linhas } = repoMemoria()
  let n = 0
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale } : ++n === 1 ? { status: 200, corpo: { result: { status: false, descricao: 'Placa: Placa informada invalida.', numeroErro: '347' } } } : { status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  const a = await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal(a.status, 422)
  assert.equal(linhas[0]!.estado, 'erro')
  const chave0 = linhas[0]!.chave_externa
  const b = await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal(b.status, 200)
  assert.equal(linhas[0]!.tentativa, 1)
  assert.notEqual(linhas[0]!.chave_externa, chave0)
})
test('cancelar vale: só o emitido; 325 (já cancelada) conta como cancelado', async () => {
  const { repo, linhas } = repoMemoria()
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale } : c.url.endsWith('/CancelaViagem') ? { status: 200, corpo: { result: { status: false, descricao: 'Viagem já se encontra cancelada.', numeroErro: '325' } } } : { status: 200, corpo: valeOk }))
  const vpr = criarRepomVprClient(vprCfg, m.fetchFn)
  assert.equal((await fluxoVpo({ acao: 'cancelar', operacao_id: OP, usuario: 'Pedro' }, vpr, deps(repo))).status, 404)
  await fluxoVpo(await entradaEmitir(), vpr, deps(repo))
  assert.equal((await fluxoVpo({ acao: 'cancelar', operacao_id: OP, usuario: 'Pedro Gestor' }, vpr, deps(repo))).status, 200)
  assert.equal(linhas[0]!.estado, 'cancelado')
})
test('homologação nunca vira produção e nunca libera MDF-e em produção', async () => {
  assert.equal(podeLiberarMdfe({ ambiente: 'qa', estado: 'emitido' }), false)
  assert.equal(podeLiberarMdfe({ ambiente: 'prd', estado: 'enviado' }), false)
  assert.equal(podeLiberarMdfe({ ambiente: 'prd', estado: 'emitido' }), true)
  assert.equal(podeLiberarMdfe(null), false)
  const { repo, linhas } = repoMemoria()
  const m = mock((c) => (ehTokenVale(c) ? { status: 200, corpo: tokenVale } : { status: 200, corpo: valeOk }))
  await fluxoVpo(await entradaEmitir(), criarRepomVprClient(vprCfg, m.fetchFn), deps(repo))
  assert.equal(linhas[0]!.ambiente, 'qa')
  assert.equal(podeLiberarMdfe(linhas[0]!), false)
  // registro de qa não é achado quando o ambiente é prd (não reaproveita homologação como produção)
  assert.equal(await repo.buscar(OP, 'vpo', 'prd'), null)
})
test('executarComEstado: "enviado" com conferência que não acha recomeça com nova chave; indefinido nunca reenvia', async () => {
  const { repo, linhas } = repoMemoria()
  let enviados = 0
  const base = { repo, operacaoId: OP, tipo: 'vpo' as const, acao: 'emitir_vale' as const, ambiente: 'qa' as const, apiLiberada: true, valorMaximo: 3000, valor: 10, confirmacao: conf(), chaveExterna: async (t: number) => 'K' + t, payload: {}, agora: AGORA }
  await executarComEstado({ ...base, async enviar() { enviados++; return { ok: false, erro: 'timeout', incerto: true } } })
  assert.equal(linhas[0]!.estado, 'enviado')
  const indef = await executarComEstado({ ...base, conferir: async () => ({ achou: 'indefinido', erro: 'x' }), async enviar() { enviados++; return { ok: true, patch: {} } } })
  assert.equal(indef.ok, false)
  assert.equal(enviados, 1)
  const nova = await executarComEstado({ ...base, conferir: async () => ({ achou: false }), async enviar() { enviados++; return { ok: true, patch: {} } } })
  assert.equal(nova.ok, true)
  assert.equal(enviados, 2)
  assert.equal(linhas[0]!.chave_externa, 'K1')
})
test('sanitizarPayload: sem nome, documento, placa, cartão, token ou senha; mantém valores e códigos', () => {
  const s = JSON.stringify(sanitizarPayload({ NomeMotorista: 'Fulano', DocumentoMotorista: '123', Placa: 'ABC1D23', CardNumber: 9, TotalFreightValue: 1500, processoCodigoCliente: 'V1', Password: 'x', access_token: 't', Roteiro: { RoteiroCodigo: 5 } }))
  for (const x of ['Fulano', '123', 'ABC1D23', '"x"', '"t"']) assert.ok(!s.includes(x), x)
  assert.ok(s.includes('1500') && s.includes('V1') && s.includes('"RoteiroCodigo":5'))
})

// ---------- frete ----------
const contrato: Omit<PedidoContratoFrete, 'identifier'> = {
  hiredNationalId: '16545346091', operationIdentifier: '1', cardNumber: 0, routeTraceCode: 4, routeRouteCode: 123997, issueDate: '2026-11-12T12:00:00Z', totalFreightValue: 1500, totalLoadWeight: 20000, totalLoadValue: 40000,
  advanceMoneyValue: 300, branchCode: '1', ncm: '1005', anttCodeType: 1, vpr: { issue: false, oneWay: true, suspendedAxles: 0, returnSuspendedAxles: 0 }, entrega: { esperadaEm: '2026-11-15T12:00:00Z', tipoLocal: 'Branch' },
  motoristas: [{ cpf: '16545346091', principal: true }], documentos: [{ tipo: 'CTE', serie: '1', numero: '660', chave: '51220706315338003134550010000660901237179782', branchCode: '1' }], placas: ['LXL6808'],
  destinatario: { documento: '06315338003134', nome: 'Destinatario Teste', tipo: 'Company' },
}
const freteCfg = { ambiente: 'qa' as const, credenciais: { user: 'USER_9520_SECRETO', version: '3.0', password: 'SENHA_9520_SECRETA', partner: '00000000000100' }, urlToken: 'https://exemplo.invalid/token' }
const ehTokenFrete = (c: Chamada) => c.url === 'https://exemplo.invalid/token'
const ehPostShipping = (c: Chamada) => c.init.method === 'POST' && /\/Shipping\?x-api-version/.test(c.url)

test('frete: emissão é assíncrona (fica "enviado" com OperationKey) e a consulta confirma; reemissão não chama a Repom', async () => {
  const { repo, linhas } = repoMemoria()
  const m = mock((c) => {
    if (ehTokenFrete(c)) return { status: 200, corpo: { access_token: 't' } }
    if (ehPostShipping(c)) return { status: 201, corpo: { StatusCode: 201, Message: 'OperationKey: 1c3e55cd-7436-44cc-8222-8e5bb887dd54' } }
    if (c.url.includes('ByOperationKey')) return { status: 200, corpo: { Result: { OperationKey: 'k', Results: [{ ShippingId: 1719781, Identifier: 'X', Status: 'Finished', Errors: [] }] } } }
    return { status: 200, corpo: { Result: { ShippingId: 1719781, CIOT: '0180003614179105', Status: 'InTransit' } } }
  })
  const frete = criarRepomFreteClient(freteCfg, m.fetchFn)
  const ident = await identificadorContratoDe(OP, 0)
  const previa = await fluxoFrete({ acao: 'previa_contrato', operacao_id: OP, contrato }, frete, deps(repo))
  assert.equal(previa.status, 200)
  assert.equal(m.chamadas.length, 0)
  const hash = previa.corpo.previa_hash as string
  const e = { acao: 'emitir_contrato' as const, operacao_id: OP, contrato, confirmacao: conf({ previa_hash: hash }) }
  const s = await fluxoFrete(e, frete, deps(repo))
  assert.equal(s.status, 200)
  assert.equal(linhas[0]!.estado, 'enviado') // aceito, ainda não emitido
  assert.equal(linhas[0]!.operation_key, '1c3e55cd-7436-44cc-8222-8e5bb887dd54')
  assert.equal(linhas[0]!.chave_externa, ident)
  const c = await fluxoFrete({ acao: 'consultar_contrato', operacao_id: OP }, frete, deps(repo))
  assert.equal(c.status, 200)
  assert.equal(linhas[0]!.estado, 'emitido')
  assert.equal(linhas[0]!.codigo_contrato, '1719781')
  assert.equal(linhas[0]!.ciot, '0180003614179105')
  const posts = m.chamadas.filter(ehPostShipping).length
  const r = await fluxoFrete(e, frete, deps(repo))
  assert.equal(r.corpo.jaExistia, true)
  assert.equal(m.chamadas.filter(ehPostShipping).length, posts)
})
test('frete: timeout na emissão não reenvia e a próxima chamada confere por Identifier antes', async () => {
  const { repo, linhas } = repoMemoria()
  let achou = false
  const m = mock((c) => {
    if (ehTokenFrete(c)) return { status: 200, corpo: { access_token: 't' } }
    if (ehPostShipping(c)) return 'timeout'
    return achou ? { status: 200, corpo: { Result: { ShippingId: 77, CIOT: '1' } } } : { status: 404, corpo: null }
  })
  const frete = criarRepomFreteClient(freteCfg, m.fetchFn)
  const previa = await fluxoFrete({ acao: 'previa_contrato', operacao_id: OP, contrato }, frete, deps(repo))
  const e = { acao: 'emitir_contrato' as const, operacao_id: OP, contrato, confirmacao: conf({ previa_hash: previa.corpo.previa_hash as string }) }
  assert.equal((await fluxoFrete(e, frete, deps(repo))).status, 202)
  assert.equal(linhas[0]!.estado, 'enviado')
  achou = true
  const s2 = await fluxoFrete(e, frete, deps(repo))
  assert.equal(s2.status, 200)
  assert.equal(linhas[0]!.estado, 'emitido')
  assert.equal(m.chamadas.filter(ehPostShipping).length, 1) // consultou o Identifier em vez de reemitir
})
test('frete: valor do contrato acima do máximo = 422; pagamento só com contrato emitido, confirmação e valor', async () => {
  const { repo } = repoMemoria()
  const m = mock((c) => (ehTokenFrete(c) ? { status: 200, corpo: { access_token: 't' } } : { status: 200, corpo: {} }))
  const frete = criarRepomFreteClient(freteCfg, m.fetchFn)
  const caro = { ...contrato, totalFreightValue: 9000 }
  const previa = await fluxoFrete({ acao: 'previa_contrato', operacao_id: OP, contrato: caro }, frete, deps(repo))
  const s = await fluxoFrete({ acao: 'emitir_contrato', operacao_id: OP, contrato: caro, confirmacao: conf({ previa_hash: previa.corpo.previa_hash as string }) }, frete, deps(repo))
  assert.equal(s.status, 422)
  assert.equal(m.chamadas.length, 0)
  const p = await fluxoFrete({ acao: 'quitar', operacao_id: OP, valor: 100, confirmacao: conf(), dados: { branchCode: '1', documentos: [] } }, frete, deps(repo))
  assert.equal(p.status, 409) // sem contrato emitido
  assert.equal(m.chamadas.length, 0)
})
test('frete: pagamento (autorizar) com contrato emitido, valor acima do máximo = 422, dentro = vai; "enviado" sem resposta nunca reenvia', async () => {
  const { repo, linhas } = repoMemoria()
  await repo.criar({ operacao_id: OP, tipo: 'ciot', ambiente: 'qa', estado: 'emitido', tentativa: 0, chave_externa: 'C1', codigo_viagem: null, codigo_viagem_repom: null, idvpo: null, codigo_contrato: '1719704', ciot: '1', operation_key: null, valor: 1500, payload_sanitizado: null, resposta_sanitizada: null, erro: null, confirmado_por: 'x', confirmado_em: null })
  let timeout = false
  const m = mock((c) => (ehTokenFrete(c) ? { status: 200, corpo: { access_token: 't' } } : timeout ? 'timeout' : { status: 200, corpo: { StatusCode: 200 } }))
  const frete = criarRepomFreteClient(freteCfg, m.fetchFn)
  const dados = { branchCode: '1', dataPagamento: '2026-11-20' }
  assert.equal((await fluxoFrete({ acao: 'autorizar_pagamento', operacao_id: OP, valor: 5000, confirmacao: conf(), dados }, frete, deps(repo))).status, 422)
  assert.equal(m.chamadas.length, 0)
  timeout = true
  assert.equal((await fluxoFrete({ acao: 'autorizar_pagamento', operacao_id: OP, valor: 1500, confirmacao: conf(), dados }, frete, deps(repo))).status, 202)
  assert.equal(linhas.find((x) => x.tipo === 'pagamento')!.estado, 'enviado')
  timeout = false
  const again = await fluxoFrete({ acao: 'autorizar_pagamento', operacao_id: OP, valor: 1500, confirmacao: conf(), dados }, frete, deps(repo))
  assert.equal(again.status, 409) // sem como conferir pela API: vai ao portal, não reenvia
  assert.equal(m.chamadas.filter((c) => c.url.endsWith('/PaymentAuthorization')).length, 1)
})
test('nenhum segredo em log, resposta ou registro de nenhum fluxo', async () => {
  const { repo, linhas } = repoMemoria()
  const m = mock((c) => (ehTokenVale(c) ? { status: 401, corpo: { accessToken: 'TOKEN_VAZADO', senha: 'SENHA_VALE_SECRETA' } } : { status: 200, corpo: valeOk }))
  const s = await fluxoVpo(await entradaEmitir(), criarRepomVprClient(vprCfg, m.fetchFn), deps(repo))
  const tudo = JSON.stringify([s, linhas])
  for (const x of ['SENHA_VALE_SECRETA', 'USUARIO_VALE_SECRETO', 'TOKEN_VAZADO', 'SENHA_ROT_SECRETA', 'LOGIN_ROT_SECRETO']) assert.ok(!tudo.includes(x), x)
})

// ---------- CORS e acesso ----------
test('CORS restrito: só produção, previews do time e REPOM_CORS_ORIGENS; nunca "*"', () => {
  assert.equal(origemPermitida('https://rbr-motorista.vercel.app', ''), true)
  assert.equal(origemPermitida('https://rbr-gestor-git-feat-front-aprovado-rbr4.vercel.app', ''), true)
  assert.equal(origemPermitida('https://malicioso.example.com', ''), false)
  assert.equal(origemPermitida('https://app.rbr.com.br', 'https://app.rbr.com.br, https://outro.com'), true)
  assert.equal(corsPara('https://malicioso.example.com', '')['Access-Control-Allow-Origin'], undefined)
  assert.equal(corsPara('https://rbr-motorista.vercel.app', '')['Access-Control-Allow-Origin'], 'https://rbr-motorista.vercel.app')
  for (const f of ['repom-vpo', 'repom-frete', 'repom-status', 'repom-pedagio-rota']) {
    const src = readFileSync(new URL(`../${f}/index.ts`, import.meta.url), 'utf8') + readFileSync(new URL('./repomEdge.ts', import.meta.url), 'utf8')
    assert.ok(!/Allow-Origin["']\s*:\s*["']\*/.test(src), f)
  }
})
test('funções novas: só gestor_rbr, verify_jwt documentado e sem leitura de tabela pelo agenciador (RLS só gestor)', () => {
  const edge = readFileSync(new URL('./repomEdge.ts', import.meta.url), 'utf8')
  assert.match(edge, /papel !== "gestor_rbr"/)
  assert.ok(!/agenciador/.test(edge))
  for (const f of ['repom-vpo', 'repom-frete']) assert.match(readFileSync(new URL(`../${f}/index.ts`, import.meta.url), 'utf8'), /verify_jwt = true; só gestor_rbr/)
  const sql = readFileSync(new URL('../../../supabase-migrations/20261112-1400-repom-operacoes.sql', import.meta.url), 'utf8')
  const pol = sql.match(/create policy [^;]+;/g) ?? []
  assert.equal(pol.length, 1)
  assert.match(pol[0]!, /for select/)
  assert.match(pol[0]!, /gestor_rbr/)
  assert.match(sql, /revoke insert, update, delete on public\.repom_operacoes from authenticated/)
  assert.match(sql, /revoke all on public\.repom_operacoes from anon/)
  assert.match(sql, /'nao', 'REPOM_API_LIBERADA'/)
  assert.ok(!/create or replace function[^;]*security definer/i.test(sql)) // nenhuma função nova que leia segredo
  assert.match(readFileSync(new URL('../../rollback/rollback-20261112-1400-repom-operacoes.sql', import.meta.url), 'utf8'), /drop table if exists public\.repom_operacoes/)
})
