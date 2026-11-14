// node --test supabase/functions/_shared/repomFreteToken.test.ts   (sem rede: tudo com mock)
// Login do Repom Frete (D-F02): formatos, leitura do token, cache, verificar_token, diagnosticar_token e base do saldo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fetch } from './repomClient.ts'
import { criarRepomFreteClient, erroCurtoToken, lerFormatoToken, lerTokenResposta, montarCorpoToken, type ConfigRepomFrete } from './repomFreteClient.ts'

const cfg: ConfigRepomFrete = { ambiente: 'qa', credenciais: { user: 'USER_9520_SECRETO', password: 'SENHA_9520_SECRETA', partner: '00000000000100' }, urlToken: 'https://exemplo.invalid/token' }
type Chamada = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }
function mock(resp: (c: Chamada, n: number) => { status: number; corpo: unknown }) {
  const chamadas: Chamada[] = []
  const fetchFn: Fetch = async (url, init) => {
    const c = { url, init: init ?? {} }
    chamadas.push(c)
    const x = resp(c, chamadas.length)
    return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.corpo }
  }
  return { chamadas, fetchFn }
}
const ehToken = (c: Chamada) => c.url === 'https://exemplo.invalid/token'
const ok = (corpo: unknown) => ({ status: 200, corpo })

test('login: os 3 formatos montam o corpo certo; Version só entra se preenchida', () => {
  const form = montarCorpoToken('form', cfg.credenciais)
  assert.equal(form.contentType, 'application/x-www-form-urlencoded')
  const f = new URLSearchParams(form.corpo)
  assert.deepEqual([f.get('grant_type'), f.get('username'), f.get('password'), f.get('partner'), f.get('Version')], ['password', 'USER_9520_SECRETO', 'SENHA_9520_SECRETA', '00000000000100', null])
  const pascal = new URLSearchParams(montarCorpoToken('form_pascal', cfg.credenciais).corpo)
  assert.deepEqual([pascal.get('grant_type'), pascal.get('User'), pascal.get('Password'), pascal.get('Partner'), pascal.get('username')], ['password', 'USER_9520_SECRETO', 'SENHA_9520_SECRETA', '00000000000100', null])
  const js = montarCorpoToken('json', { ...cfg.credenciais, version: '3.0' })
  assert.equal(js.contentType, 'application/json')
  assert.deepEqual(JSON.parse(js.corpo), { grant_type: 'password', User: 'USER_9520_SECRETO', Password: 'SENHA_9520_SECRETA', Partner: '00000000000100', Version: '3.0' })
  assert.equal('Version' in JSON.parse(montarCorpoToken('json', { ...cfg.credenciais, version: '  ' }).corpo), false)
  assert.equal(lerFormatoToken(undefined), 'form')
  assert.equal(lerFormatoToken(' JSON '), 'json')
  assert.equal(lerFormatoToken('xyz'), 'form')
})

test('login: o cliente envia o formato configurado', async () => {
  for (const [formato, tipo] of [['form', 'application/x-www-form-urlencoded'], ['form_pascal', 'application/x-www-form-urlencoded'], ['json', 'application/json']] as const) {
    const m = mock(() => ok({ access_token: 't' }))
    const cli = criarRepomFreteClient({ ...cfg, tokenFormato: formato }, m.fetchFn)
    assert.equal((await cli.verificarToken()).ok, true)
    assert.equal(m.chamadas[0]!.init.headers?.['content-type'], tipo)
    assert.equal(m.chamadas.length, 1)
  }
})

test('login: o token é lido de access_token, token, Token ou accessToken; validade opcional', () => {
  for (const k of ['access_token', 'token', 'Token', 'accessToken']) assert.equal(lerTokenResposta({ [k]: 'abc' })?.valor, 'abc')
  assert.equal(lerTokenResposta({ access_token: 'abc', expires_in: 120 })?.expiraEmSeg, 120)
  assert.equal(lerTokenResposta({ access_token: 'abc' })?.expiraEmSeg, null)
  assert.equal(lerTokenResposta({ outro: 'abc' }), null)
  assert.equal(lerTokenResposta(null), null)
  assert.equal(lerTokenResposta({ access_token: '  ' }), null)
})

test('login: cache até expirar (margem de 60 s); validade curta renova', async () => {
  let n = 0
  const m = mock((c) => (ehToken(c) ? ok({ Token: 'tk' + ++n, expires_in: 3600 }) : ok({ Result: [] })))
  const cli = criarRepomFreteClient(cfg, m.fetchFn)
  await cli.tiposDeCarga(); await cli.tiposDeCarga(); await cli.tiposDeCarga()
  assert.equal(n, 1)
  let k = 0
  const m2 = mock((c) => (ehToken(c) ? ok({ token: 'tk' + ++k, expires_in: 30 }) : ok({ Result: [] }))) // 30 s < margem de 60 s
  const cli2 = criarRepomFreteClient(cfg, m2.fetchFn)
  await cli2.tiposDeCarga(); await cli2.tiposDeCarga()
  assert.equal(k, 2)
})

test('verificar_token: UMA tentativa, só formato/status/chaves/erro curto; não reenvia no 400 unsupported_grant_type nem no 401', async () => {
  const m = mock(() => ({ status: 400, corpo: { error: 'unsupported_grant_type' } }))
  const r = await criarRepomFreteClient({ ...cfg, tokenFormato: 'json' }, m.fetchFn).verificarTokenDetalhado()
  assert.deepEqual(r, { formato: 'json', http_status: 400, chaves_da_resposta: ['error'], erro_curto: 'unsupported_grant_type', ok: false })
  assert.equal(m.chamadas.length, 1)
  const m401 = mock(() => ({ status: 401, corpo: null }))
  assert.equal((await criarRepomFreteClient(cfg, m401.fetchFn).verificarTokenDetalhado()).http_status, 401)
  assert.equal(m401.chamadas.length, 1)
  const mok = mock(() => ok({ access_token: 'SEGREDO_TOKEN_XYZ', expires_in: 10, token_type: 'bearer' }))
  const rok = await criarRepomFreteClient(cfg, mok.fetchFn).verificarTokenDetalhado()
  assert.equal(rok.ok, true)
  assert.deepEqual(rok.chaves_da_resposta, ['access_token', 'expires_in', 'token_type'])
  assert.equal(JSON.stringify(rok).includes('SEGREDO_TOKEN_XYZ'), false)
})

test('verificar_token: erro curto tem no máximo 200 caracteres e apaga credenciais ecoadas', async () => {
  const eco = 'x'.repeat(300) + ' SENHA_9520_SECRETA USER_9520_SECRETO'
  const m = mock(() => ({ status: 400, corpo: { error_description: 'SENHA_9520_SECRETA ' + eco } }))
  const r = await criarRepomFreteClient(cfg, m.fetchFn).verificarTokenDetalhado()
  assert.ok((r.erro_curto ?? '').length <= 200)
  assert.equal(JSON.stringify(r).includes('SENHA_9520_SECRETA'), false)
  assert.equal(erroCurtoToken(null, 503, cfg.credenciais), 'A Repom está indisponível agora.')
  const semCfg = await criarRepomFreteClient({ ...cfg, urlToken: undefined }, m.fetchFn).verificarTokenDetalhado()
  assert.equal(semCfg.ok, false)
})

test('diagnosticar_token: tenta form, form_pascal e json (no máximo 3) e PARA no primeiro 2xx', async () => {
  const m = mock((c) => (c.init.headers?.['content-type'] === 'application/json' ? ok({ access_token: 't' }) : { status: 400, corpo: { error: 'unsupported_grant_type' } }))
  const d = await criarRepomFreteClient(cfg, m.fetchFn).diagnosticarToken()
  assert.equal(d.vencedor, 'json')
  assert.deepEqual(d.tentativas.map((t) => [t.formato, t.http_status]), [['form', 400], ['form_pascal', 400], ['json', 200]])
  assert.equal(m.chamadas.length, 3)
  const m2 = mock(() => ok({ access_token: 't' }))
  const d2 = await criarRepomFreteClient(cfg, m2.fetchFn).diagnosticarToken()
  assert.equal(d2.vencedor, 'form')
  assert.equal(m2.chamadas.length, 1)
  const m3 = mock(() => ({ status: 401, corpo: null }))
  const d3 = await criarRepomFreteClient(cfg, m3.fetchFn).diagnosticarToken()
  assert.equal(d3.vencedor, null)
  assert.equal(m3.chamadas.length, 3)
  assert.equal(JSON.stringify(d3).includes('SENHA_9520_SECRETA'), false)
})

test('saldo: base do Relatório derivada da base do Frete (Repom.Frete.Webapi -> Repom.Relatorio.WebAPI), inclusive em produção', async () => {
  const m = mock((c) => (ehToken(c) ? ok({ access_token: 't' }) : ok({ Result: 1 })))
  const cli = criarRepomFreteClient({ ...cfg, ambiente: 'prd', urlBase: 'https://www.repom.com.br/Repom.Frete.Webapi' }, m.fetchFn)
  await cli.consultarSaldoCliente('2026-11-01', '2026-11-14')
  assert.equal(m.chamadas.find((c) => !ehToken(c))!.url, 'https://www.repom.com.br/Repom.Relatorio.WebAPI/Balance/Financial/GetByDateInicialDateFinal/2026-11-01/2026-11-14')
})
