// node --test supabase/functions/_shared/repomClient.test.ts   (sem rede: tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as r from './repomClient.ts'
import { pedagioPorRota, type PedagioCache, type Repositorio, type RotaCache } from './repomPedagio.ts'

const cfg: r.ConfigRepom = { ambiente: 'qa', codigoCliente: '9501', roteirizacaoLogin: 'LOGIN_SECRETO', roteirizacaoSenha: 'SENHA_SECRETA', valePedagioLogin: 'x', valePedagioSenha: 'y' }

type Chamada = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }
function mock(respostas: (c: Chamada, n: number) => { status: number; corpo: unknown }) {
  const chamadas: Chamada[] = []
  const fetchFn: r.Fetch = async (url, init) => {
    const c = { url, init: init ?? {} }
    chamadas.push(c)
    const x = respostas(c, chamadas.length)
    return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.corpo }
  }
  return { chamadas, fetchFn }
}
const ehToken = (c: Chamada) => c.url.includes('/connect/token')

test('IBGE: 1801012 vira 1012; zeros à esquerda; inválidos recusados', () => {
  assert.equal(r.ibgeParaRepom('1801012'), '1012')
  assert.equal(r.ibgeParaRepom('3550308'), '50308')
  assert.equal(r.ibgeParaRepom(5300108), '108')
  assert.throws(() => r.ibgeParaRepom('55030'))
  assert.throws(() => r.ibgeParaRepom(null))
})
test('ambiente: padrão qa; prd só quando pedido; URLs por ambiente', () => {
  assert.equal(r.ambienteRepom(undefined), 'qa')
  assert.equal(r.ambienteRepom('PRD'), 'prd')
  assert.match(r.urlsRepom('qa').roteirizacao, /roteirizacaoa/)
  assert.match(r.urlsRepom('prd').tokenRoteirizacao, /^https:\/\/www\.repom/)
})
test('corpo da rota: IBGE normalizado, eixos em texto, regras de paradas', () => {
  const c = r.montarCorpoRota({ codigoRoteiroCliente: 'R1', origem: { ibge: '3550308', uf: 'sp' }, destino: { ibge: '1801012', uf: 'AC' }, idaVolta: true })
  assert.deepEqual(c.Origem, { CodigoIBGE: '50308', Estado: 'SP' })
  assert.equal(c.Destino.CodigoIBGE, '1012')
  assert.equal(r.montarCorpoPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 6 }).NumeroEixos, '6')
  const base = { codigoRoteiroCliente: 'R1', origem: { ibge: '3550308', uf: 'SP' }, destino: { ibge: '3304557', uf: 'RJ' }, idaVolta: false }
  assert.match(r.validarPedidoRota({ ...base, paradas: [{ ibge: '3550308', uf: 'SP' }] }) ?? '', /repetir/)
  assert.match(r.validarPedidoRota({ ...base, codigoRoteiroCliente: '12345678901' }) ?? '', /10/)
  assert.equal(r.validarPedidoRota(base), null)
})
test('token é cacheado: duas consultas, um só pedido de token', async () => {
  const m = mock((c) => (ehToken(c) ? { status: 200, corpo: { access_token: 'tok1', expires_in: 3600 } } : { status: 200, corpo: { valorTotalVpr: 100, valorVprIda: 100, descricaoPercurso: 'BR-116' } }))
  const cli = r.criarRepomClient(cfg, m.fetchFn)
  await cli.consultarPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 5 })
  await cli.consultarPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 5 })
  assert.equal(m.chamadas.filter(ehToken).length, 1)
})
test('401 renova o token uma vez e repete', async () => {
  let tokens = 0
  const m = mock((c) => {
    if (ehToken(c)) return { status: 200, corpo: { access_token: 'tok' + ++tokens, expires_in: 3600 } }
    return c.init.headers?.authorization === 'Bearer tok1' ? { status: 401, corpo: null } : { status: 200, corpo: { valorTotalVpr: 250.5 } }
  })
  const res = await r.criarRepomClient(cfg, m.fetchFn).consultarPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 5 })
  assert.equal(res.ok, true)
  assert.equal(tokens, 2)
})
test('erro 5xx vira mensagem simples (cotação cai no manual) e não lança', async () => {
  const m = mock((c) => (ehToken(c) ? { status: 200, corpo: { access_token: 't' } } : { status: 503, corpo: { detalhe: 'x' } }))
  const res = await r.criarRepomClient(cfg, m.fetchFn).consultarPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 5 })
  assert.equal(res.ok, false)
  if (!res.ok) assert.match(res.erro, /manualmente/)
})
test('sem credenciais não chama nada', async () => {
  const m = mock(() => ({ status: 200, corpo: {} }))
  const res = await r.criarRepomClient({ ...cfg, roteirizacaoLogin: '', roteirizacaoSenha: '' }, m.fetchFn).consultarPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 5 })
  assert.equal(res.ok, false)
  assert.equal(m.chamadas.length, 0)
})
test('nenhum segredo/token em erro, resposta higienizada ou chamadas de log', async () => {
  const m = mock((c) => (ehToken(c) ? { status: 401, corpo: { access_token: 'TOKEN_VAZADO', senha: 'SENHA_SECRETA' } } : { status: 200, corpo: {} }))
  const res = await r.criarRepomClient(cfg, m.fetchFn).consultarPedagio({ codigoRoteiro: 'a', codigoPercurso: 'b', eixos: 5 })
  const texto = JSON.stringify(res)
  assert.ok(!texto.includes('SENHA_SECRETA') && !texto.includes('LOGIN_SECRETO') && !texto.includes('TOKEN_VAZADO'))
  const h = JSON.stringify(r.higienizar({ a: 1, access_token: 'z', aninhado: { Senha: 'q', ok: 2 } }))
  assert.ok(!h.includes('"z"') && !h.includes('"q"') && h.includes('"ok":2'))
})

// ---- fluxo com cache ----
function repoMemoria() {
  const rotas = new Map<string, RotaCache>()
  const pedagios = new Map<string, PedagioCache>()
  const repo: Repositorio = {
    async buscarRota(h) { return rotas.get(h) ?? null },
    async gravarRota(x) { const rc: RotaCache = { id: 'rota-' + x.chave_hash.slice(0, 6), codigo_roteiro_repom: x.codigo_roteiro_repom, codigo_percurso_repom: x.codigo_percurso_repom, descricao_percurso: null }; rotas.set(x.chave_hash, rc); return rc },
    async buscarPedagio(id, e, a, b) { return pedagios.get(`${id}|${e}|${a}|${b}`) ?? null },
    async gravarPedagio(p, desc) { pedagios.set(`${p.rota_id}|${p.eixos}|${p.eixos_suspensos_ida}|${p.eixos_suspensos_volta}`, { valor_total: p.valor_total, valor_ida: p.valor_ida, valor_volta: p.valor_volta, consultado_em: new Date().toISOString(), validade_dias: 30 }); for (const v of rotas.values()) v.descricao_percurso = desc },
  }
  return repo
}
const entrada = { ibgeOrigem: '3550308', ufOrigem: 'SP', ibgeDestino: '3304557', ufDestino: 'RJ', idaVolta: false, eixos: 5 }

test('cache: a segunda consulta não chama a Repom', async () => {
  const m = mock((c) => {
    if (ehToken(c)) return { status: 200, corpo: { access_token: 't', expires_in: 3600 } }
    if (c.url.endsWith('/Api/Rota')) return { status: 200, corpo: { codigoRoteiroRepom: '77', codigoPercursoRepom: '88' } }
    return { status: 200, corpo: { valorTotalVpr: 321.4, descricaoPercurso: 'Dutra' } }
  })
  const cli = r.criarRepomClient(cfg, m.fetchFn)
  const repo = repoMemoria()
  const a = await pedagioPorRota(entrada, repo, cli)
  const chamadasDepoisDaPrimeira = m.chamadas.length
  const b = await pedagioPorRota(entrada, repo, cli)
  assert.equal(a.ok && a.doCache, false)
  assert.equal(b.ok && b.doCache, true)
  assert.equal(b.valor, 321.4)
  assert.equal(m.chamadas.length, chamadasDepoisDaPrimeira)
})
test('falha da Repom no fluxo devolve erro sem quebrar; eixos inválidos nem consultam', async () => {
  const m = mock(() => ({ status: 500, corpo: null }))
  const cli = r.criarRepomClient(cfg, m.fetchFn)
  const f = await pedagioPorRota(entrada, repoMemoria(), cli)
  assert.equal(f.ok, false)
  const g = await pedagioPorRota({ ...entrada, eixos: 1 }, repoMemoria(), cli)
  assert.equal(g.ok, false)
})

test('UF pelo IBGE', () => {
  assert.equal(r.ufDoIbge('3550308'), 'SP')
  assert.equal(r.ufDoIbge('1801012'), null)
  assert.equal(r.ufDoIbge(null), null)
})
