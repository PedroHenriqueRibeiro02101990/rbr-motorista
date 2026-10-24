// node --test supabase-functions/_shared/efreteClient.test.ts
// Respostas simuladas: sem rede e sem segredos (valores falsos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarClienteEfrete, ehErroDeSessao, limparSegredos, interpretarResposta, montarRequisicao, varianteUsuario, type ConfigEfrete } from './efreteClient.ts'

const CFG: ConfigEfrete = { baseUrl: 'https://dev.efrete.com.br', usuario: 'usuario falso', senha: 'senha-falsa', integrador: 'hash-falso' }
type Chamada = { url: string; method: string; body: Record<string, unknown> | null }

function servidor(respostas: Array<(c: Chamada) => { status?: number; json?: unknown; texto?: string }>) {
  const chamadas: Chamada[] = []
  let i = 0
  const f = (async (url: string, init: RequestInit) => {
    const c: Chamada = { url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null }
    chamadas.push(c)
    const r = respostas[Math.min(i++, respostas.length - 1)](c)
    return new Response(r.texto ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200 })
  }) as unknown as typeof fetch
  return { f, chamadas }
}

test('URL: GET leva campos na query (listas em JSON); POST leva JSON no corpo; base sem /services duplicado', () => {
  const g = montarRequisicao('https://dev.efrete.com.br/services/', 'Pef', 'ConsultaSituacaoTransportador', 'GET', { A: '1', Veiculos: [{ Placa: 'ABC1D23' }], Nada: null })
  const u = new URL(g.url)
  assert.equal(u.pathname, '/services/Pef/ConsultaSituacaoTransportador')
  assert.equal(u.searchParams.get('A'), '1')
  assert.equal(u.searchParams.get('Veiculos'), '[{"Placa":"ABC1D23"}]')
  assert.equal(u.searchParams.has('Nada'), false)
  const p = montarRequisicao('https://dev.efrete.com.br', 'Logon', 'Logout', 'POST', { Token: 't' })
  assert.equal(p.init.method, 'POST')
  assert.equal(p.init.body, '{"Token":"t"}')
})

test('interpretar: HTTP, JSON inválido e Sucesso/Excecao', () => {
  assert.deepEqual(interpretarResposta(200, '{"Sucesso":true,"X":1}'), { ok: true, dados: { Sucesso: true, X: 1 } })
  const e = interpretarResposta(200, '{"Sucesso":false,"Excecao":{"Mensagem":"RNTRC inválido","Codigo":12}}')
  assert.deepEqual(e, { ok: false, erro: { codigo: '12', mensagem: 'RNTRC inválido', http: 200 } })
  const h = interpretarResposta(405, 'Method Not Allowed')
  assert.equal(!h.ok && h.erro.codigo, 'HTTP_405')
  const t = interpretarResposta(200, '<html>')
  assert.equal(!t.ok && t.erro.codigo, 'RESPOSTA_INVALIDA')
})

test('login: guarda o token na memória e reaproveita; nunca loga segredo nem o token inteiro', async () => {
  const logs: string[] = []
  const s = servidor([() => ({ json: { Token: 'ABCD1234567890' } })])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f, log: (m) => logs.push(m) })
  const r1 = await c.login()
  const r2 = await c.login()
  assert.deepEqual(r1, { ok: true, dados: { tokenPrefixo: 'ABCD…' } })
  assert.ok(r2.ok)
  assert.equal(s.chamadas.length, 1) // segunda vez veio da memória
  const q = new URL(s.chamadas[0].url).searchParams
  assert.equal(q.get('Usuario'), 'usuario falso')
  assert.equal(q.get('Versao'), '1')
  const tudo = logs.join(' ')
  for (const segredo of ['senha-falsa', 'hash-falso', 'usuario falso', 'ABCD1234567890']) assert.ok(!tudo.includes(segredo), `log vazou ${segredo}`)
})

test('login: token nulo vira LOGIN_NULO, sem novas tentativas', async () => {
  const s = servidor([() => ({ json: { Token: null } })])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f })
  const r = await c.login()
  assert.equal(!r.ok && r.erro.codigo, 'LOGIN_NULO')
  assert.equal(s.chamadas.length, 1)
})

test('token vence em 20 min e é refeito', async () => {
  let t = 0
  const s = servidor([() => ({ json: { Token: 'TOK1xxxx' } }), () => ({ json: { Token: 'TOK2xxxx' } })])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f, agora: () => t })
  await c.login()
  t = 19 * 60_000
  await c.login()
  assert.equal(s.chamadas.length, 1)
  t = 21 * 60_000
  await c.login()
  assert.equal(s.chamadas.length, 2)
  assert.equal(c.tokenPrefixo(), 'TOK2…')
})

test('chamar: injeta Integrador, Versao e Token; sessão caída refaz o login uma vez', async () => {
  const s = servidor([
    () => ({ json: { Token: 'TOK1xxxx' } }),
    () => ({ json: { Sucesso: false, Excecao: { Mensagem: 'Usuário não está logado', Codigo: 1 } } }),
    () => ({ json: { Token: 'TOK2xxxx' } }),
    (c) => ({ json: { Sucesso: true, RNTRCAtivo: true, TACouEquiparado: false, Veiculos: [{ Placa: 'RQW4D58', FazParteDaFrota: true }], eco: c.url } }),
  ])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f })
  const r = await c.consultarSituacaoTransportador({ interessadoCpfCnpj: '69.115.969/0001-04', transportadorCpfCnpj: '48.386.492/0001-21', rntrc: '56802388', placas: ['rqw-4d58'] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.dados.rntrcAtivo, true)
  assert.equal(r.dados.tacOuEquiparado, false)
  assert.deepEqual(r.dados.veiculos, [{ placa: 'RQW4D58', fazParteDaFrota: true }])
  assert.equal(s.chamadas.length, 4)
  const q = new URL(s.chamadas[3].url).searchParams
  assert.equal(q.get('Token'), 'TOK2xxxx')
  assert.equal(q.get('Integrador'), 'hash-falso')
  assert.equal(q.get('InteressadoCpfOuCnpj'), '69115969000104')
  assert.equal(q.get('Veiculos'), '[{"Placa":"RQW4D58"}]')
})

test('erro de negócio não refaz login; timeout vira erro estruturado', async () => {
  const s = servidor([() => ({ json: { Token: 'TOK1xxxx' } }), () => ({ json: { Sucesso: false, Excecao: { Mensagem: 'RNTRC não encontrado', Codigo: 7 } } })])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f })
  const r = await c.chamar('Pef', 'ConsultaSituacaoTransportador', 'GET', {})
  assert.deepEqual(!r.ok && r.erro, { codigo: '7', mensagem: 'RNTRC não encontrado', http: 200 })
  assert.equal(s.chamadas.length, 2)

  const lento = (async (_u: string, init: RequestInit) =>
    new Promise((_ok, falha) => init.signal?.addEventListener('abort', () => falha(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch
  const c2 = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: lento, timeoutMs: 20 })
  const t = await c2.login()
  assert.equal(!t.ok && t.erro.codigo, 'TIMEOUT')
})

test('logout manda POST com Token e limpa a memória', async () => {
  const s = servidor([() => ({ json: { Token: 'TOK1xxxx' } }), () => ({ json: { Sucesso: true } })])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f })
  await c.login()
  const r = await c.logout()
  assert.ok(r.ok)
  assert.equal(s.chamadas[1].method, 'POST')
  assert.equal(s.chamadas[1].body?.Token, 'TOK1xxxx')
  assert.equal(c.tokenPrefixo(), '(nulo)')
})

test('utilitários: variantes do usuário e detecção de sessão caída', () => {
  assert.equal(varianteUsuario('fulano@rbr cargo', 'sem_espaco'), 'fulano@rbrcargo')
  assert.equal(varianteUsuario('x', 'cnpj', '69.115.969/0001-04'), '69115969000104')
  assert.ok(ehErroDeSessao('Token não pode ser nulo'))
  assert.ok(ehErroDeSessao('Usuário não logado'))
  assert.ok(!ehErroDeSessao('RNTRC inválido'))
})

test('mensagem de erro do servidor nunca devolve credencial (nem codificada na URL)', async () => {
  const s = servidor([(c) => ({ status: 500, texto: `Erro em ${c.url}` })])
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f })
  const r = await c.login()
  assert.ok(!r.ok)
  if (r.ok) return
  for (const v of ['senha-falsa', 'hash-falso', 'usuario falso', 'usuario+falso', 'usuario%20falso']) assert.ok(!r.erro.mensagem.includes(v), `vazou ${v}`)
  assert.ok(r.erro.mensagem.includes('[oculto]'))
  assert.equal(limparSegredos('abc', ['ab']), 'abc') // valores curtos demais não são trocados
})
