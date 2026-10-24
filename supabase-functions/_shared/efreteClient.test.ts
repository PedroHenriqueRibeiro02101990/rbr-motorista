// node --test supabase-functions/_shared/efreteClient.test.ts
// Respostas simuladas: sem rede e sem segredos (valores falsos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarClienteEfrete, ehErroDeSessao, interpretarRespostaProxy, limparSegredos, modoConexao, interpretarResposta, montarRequisicao, varianteUsuario, type ConfigEfrete } from './efreteClient.ts'

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
  // login é POST com JSON no corpo (o servidor real recusa GET)
  assert.equal(s.chamadas[0].method, 'POST')
  assert.equal(s.chamadas[0].body?.Usuario, 'usuario falso')
  assert.equal(s.chamadas[0].body?.Versao, 1)
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
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: s.f, verboLogin: 'GET' }) // GET põe credenciais na URL
  const r = await c.login()
  assert.ok(!r.ok)
  if (r.ok) return
  for (const v of ['senha-falsa', 'hash-falso', 'usuario falso', 'usuario+falso', 'usuario%20falso']) assert.ok(!r.erro.mensagem.includes(v), `vazou ${v}`)
  assert.ok(r.erro.mensagem.includes('[oculto]'))
  assert.equal(limparSegredos('abc', ['ab']), 'abc') // valores curtos demais não são trocados
})

test('erro de rede (que traz a URL) também sai sem credencial', async () => {
  const quebra = (async (url: string) => {
    throw new TypeError(`error sending request for url (${url})`)
  }) as unknown as typeof fetch
  const c = criarClienteEfrete({ carregarConfig: async () => CFG, fetch: quebra, verboLogin: 'GET' })
  const r = await c.login()
  assert.ok(!r.ok && r.erro.codigo === 'REDE')
  if (r.ok) return
  for (const v of ['senha-falsa', 'hash-falso', 'usuario+falso']) assert.ok(!r.erro.mensagem.includes(v), `vazou ${v}`)
})

// ---- Modo proxy (Vercel) ----
const CFG_PROXY: ConfigEfrete = { ...CFG, proxyUrl: 'https://proxy.exemplo/api/efrete', proxyChave: 'chave-proxy-falsa' }
const respProxy = (status: number, corpo: unknown) => ({ json: { status, corpo: typeof corpo === 'string' ? corpo : JSON.stringify(corpo), duracaoMs: 120 } })

test('modo: proxy só com URL e chave; senão direto', () => {
  assert.equal(modoConexao(CFG), 'direto')
  assert.equal(modoConexao({ proxyUrl: 'https://x', proxyChave: null }), 'direto')
  assert.equal(modoConexao(CFG_PROXY), 'proxy')
})

test('proxy: toda chamada vai ao proxy com a chave no cabeçalho e o pedido {metodoHttp, caminho, corpo}', async () => {
  const cab: Record<string, string>[] = []
  const chamadas: Chamada[] = []
  const respostas = [respProxy(200, { Token: 'TOKPROXY1' }), respProxy(200, { Sucesso: true, RNTRCAtivo: true, TACouEquiparado: true, Veiculos: [{ Placa: 'BWP6E54', FazParteDaFrota: false }] })]
  let i = 0
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, method: String(init.method), body: JSON.parse(String(init.body)) })
    cab.push(init.headers as Record<string, string>)
    return new Response(JSON.stringify(respostas[i++].json), { status: 200 })
  }) as unknown as typeof fetch
  const c = criarClienteEfrete({ carregarConfig: async () => CFG_PROXY, fetch: f })
  assert.equal(await c.modo(), 'proxy')
  const r = await c.consultarSituacaoTransportador({ interessadoCpfCnpj: '69115969000104', transportadorCpfCnpj: '48384601000171', rntrc: '55887888', placas: ['BWP6E54'] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.dados.tacOuEquiparado, true)
  assert.deepEqual(chamadas.map((x) => x.url), ['https://proxy.exemplo/api/efrete', 'https://proxy.exemplo/api/efrete'])
  assert.equal(cab[0]['x-rbr-proxy-key'], 'chave-proxy-falsa')
  assert.deepEqual([chamadas[0].body?.metodoHttp, chamadas[0].body?.caminho], ['POST', '/services/Logon/Login'])
  assert.equal((chamadas[0].body?.corpo as Record<string, unknown>).Usuario, 'usuario falso')
  assert.equal(chamadas[1].body?.caminho, '/services/Pef/ConsultaSituacaoTransportador')
  assert.equal((chamadas[1].body?.corpo as Record<string, unknown>).Token, 'TOKPROXY1')
})

test('proxy: chave errada (404), caminho fora da lista (400), efrete caiu (502) e timeout (504)', async () => {
  const casos: [number, unknown, string][] = [
    [404, { erro: 'Não encontrado.' }, 'PROXY_RECUSOU'],
    [400, { erro: 'Caminho não permitido.' }, 'PROXY_PEDIDO'],
    [502, { erro: 'A efrete fechou a conexão.', codigo: 'EFRETE_CONEXAO' }, 'EFRETE_CONEXAO'],
    [504, { erro: 'A efrete não respondeu a tempo.', codigo: 'EFRETE_TIMEOUT' }, 'EFRETE_TIMEOUT'],
  ]
  for (const [http, corpo, codigo] of casos) {
    const r = interpretarRespostaProxy(http, JSON.stringify(corpo))
    assert.equal(!r.ok && r.erro.codigo, codigo, String(http))
  }
  // erro de negócio da efrete atravessa o proxy igual ao modo direto
  const neg = interpretarRespostaProxy(200, JSON.stringify({ status: 200, corpo: '{"Sucesso":false,"Excecao":{"Mensagem":"Integrador não cadastrado","Codigo":null}}' }))
  assert.equal(!neg.ok && neg.erro.mensagem, 'Integrador não cadastrado')
})

test('proxy: erro de rede/timeout não vaza a chave do proxy nem credenciais', async () => {
  const quebra = (async () => {
    throw new TypeError('error sending request for url (https://proxy.exemplo/api/efrete) chave-proxy-falsa senha-falsa')
  }) as unknown as typeof fetch
  const c = criarClienteEfrete({ carregarConfig: async () => CFG_PROXY, fetch: quebra })
  const r = await c.login()
  assert.ok(!r.ok && r.erro.codigo === 'REDE')
  if (r.ok) return
  for (const v of ['chave-proxy-falsa', 'senha-falsa']) assert.ok(!r.erro.mensagem.includes(v), `vazou ${v}`)
  const lento = (async (_u: string, init: RequestInit) =>
    new Promise((_ok, falha) => init.signal?.addEventListener('abort', () => falha(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch
  const c2 = criarClienteEfrete({ carregarConfig: async () => CFG_PROXY, fetch: lento, timeoutMs: 20 })
  const t = await c2.login()
  assert.equal(!t.ok && t.erro.codigo, 'TIMEOUT')
})

test('erro da efrete traz o ProtocoloServico quando vier', () => {
  const r = interpretarResposta(200, JSON.stringify({ Sucesso: false, Excecao: { Codigo: 1, Mensagem: 'Rejeição: X' }, ProtocoloServico: 6126300 }))
  assert.deepEqual(r, { ok: false, erro: { codigo: '1', mensagem: 'Rejeição: X', http: 200, protocolo: '6126300' } })
  const sem = interpretarResposta(200, JSON.stringify({ Sucesso: false, Excecao: { Mensagem: 'Y' } }))
  assert.equal(!sem.ok && sem.erro.protocolo, undefined)
})
