// node --test supabase/functions/_shared/repomFreteConfig.test.ts   (sem rede; valores são fictícios)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Fetch } from './repomClient.ts'
import { criarRepomFreteClient, urlProibidaEmQa } from './repomFreteClient.ts'
import { configFreteDoAmbiente } from './repomFreteConfig.ts'

const cofre: Record<string, string> = {
  REPOM_QA_FRETE_USER: 'QA_USER', REPOM_QA_FRETE_PASSWORD: 'QA_SENHA', REPOM_QA_FRETE_PARTNER: 'QA_PARTNER',
  REPOM_QA_FRETE_URL_TOKEN: 'https://qa.repom.com.br/Repom.Frete.Webapi/Token', REPOM_QA_FRETE_URL_BASE: 'https://qa.repom.com.br/Repom.Frete.Webapi',
  REPOM_FRETE_USER: 'PRD_USER', REPOM_FRETE_PASSWORD: 'PRD_SENHA', REPOM_FRETE_PARTNER: 'PRD_PARTNER',
  REPOM_FRETE_URL_TOKEN: 'https://www.repom.com.br/Repom.Frete.Webapi/Token', REPOM_FRETE_URL_BASE: 'https://www.repom.com.br/Repom.Frete.Webapi',
}
function leitor(c = cofre) {
  const lidos: string[] = []
  return { lidos, ler: async (n: string) => { lidos.push(n); return c[n] ?? null } }
}

test('REPOM_AMBIENTE=qa: usa só REPOM_QA_FRETE_* e nunca lê os de produção', async () => {
  const l = leitor()
  const cfg = await configFreteDoAmbiente('qa', l.ler)
  assert.equal(cfg.ambiente, 'qa')
  assert.equal(cfg.credenciais.user, 'QA_USER')
  assert.equal(cfg.credenciais.password, 'QA_SENHA')
  assert.equal(cfg.credenciais.partner, 'QA_PARTNER')
  assert.equal(cfg.urlToken, cofre.REPOM_QA_FRETE_URL_TOKEN)
  assert.equal(cfg.urlBase, cofre.REPOM_QA_FRETE_URL_BASE)
  assert.ok(l.lidos.length > 0 && l.lidos.every((n) => n.startsWith('REPOM_QA_FRETE_')), `leu: ${l.lidos.join(',')}`)
})

test('REPOM_AMBIENTE ausente, vazio ou estranho: padrão é qa (só REPOM_QA_*)', async () => {
  for (const v of [null, undefined, '', '  ', 'producao', 'QA']) {
    const l = leitor()
    const cfg = await configFreteDoAmbiente(v, l.ler)
    assert.equal(cfg.ambiente, 'qa', String(v))
    assert.equal(cfg.credenciais.user, 'QA_USER')
    assert.ok(l.lidos.every((n) => n.startsWith('REPOM_QA_FRETE_')))
  }
})

test('só REPOM_AMBIENTE=prd usa os segredos de produção (e nenhum de QA)', async () => {
  const l = leitor()
  const cfg = await configFreteDoAmbiente('prd', l.ler)
  assert.equal(cfg.ambiente, 'prd')
  assert.equal(cfg.credenciais.user, 'PRD_USER')
  assert.ok(l.lidos.every((n) => n.startsWith('REPOM_FRETE_')))
})

test('em qa, sem os REPOM_QA_* NÃO cai nos de produção: fica "não configurado"', async () => {
  const soProd = Object.fromEntries(Object.entries(cofre).filter(([k]) => !k.startsWith('REPOM_QA_')))
  const cfg = await configFreteDoAmbiente('qa', leitor(soProd).ler)
  assert.equal(cfg.credenciais.user, '')
  assert.equal(cfg.urlToken, undefined)
  assert.equal(cfg.urlBase, undefined)
})

test('urlProibidaEmQa: só qa.repom.com.br passa; outros hosts da Repom e URL inválida são barrados', () => {
  assert.equal(urlProibidaEmQa('https://qa.repom.com.br/Repom.Frete.Webapi/Token'), false)
  assert.equal(urlProibidaEmQa('https://www.repom.com.br/Repom.Frete.Webapi'), true)
  assert.equal(urlProibidaEmQa('https://repom.com.br/x'), true)
  assert.equal(urlProibidaEmQa('https://api.repom.com.br/x'), true)
  assert.equal(urlProibidaEmQa('https://qa.repom.com.br.evil.com/x'), false) // host de terceiros não é tratado aqui (segredos só vêm do Vault, cadastrados pelo gestor)
  assert.equal(urlProibidaEmQa('nao-e-url'), true)
})

test('client em qa recusa URL de produção (base ou token) e NÃO faz nenhuma chamada', async () => {
  const chamadas: string[] = []
  const f: Fetch = async (u) => { chamadas.push(u); return { ok: true, status: 200, json: async () => ({}) } }
  const base = { ambiente: 'qa' as const, credenciais: { user: 'u', password: 'p', partner: 'c' } }
  const prodBase = criarRepomFreteClient({ ...base, urlToken: 'https://qa.repom.com.br/Repom.Frete.Webapi/Token', urlBase: 'https://www.repom.com.br/Repom.Frete.Webapi' }, f)
  const prodToken = criarRepomFreteClient({ ...base, urlToken: 'https://www.repom.com.br/Repom.Frete.Webapi/Token', urlBase: 'https://qa.repom.com.br/Repom.Frete.Webapi' }, f)
  for (const c of [prodBase, prodToken]) {
    const r = await c.tiposDeCarga()
    assert.equal(r.ok, false)
    assert.match(String((r as { erro: string }).erro), /QA/)
  }
  assert.equal((await prodBase.verificarToken()).ok, false)
  assert.equal(chamadas.length, 0)
})

test('client em qa com URLs de QA segue normalmente (pede o token na URL de QA)', async () => {
  const chamadas: string[] = []
  const f: Fetch = async (u) => { chamadas.push(u); return { ok: true, status: 200, json: async () => ({ access_token: 'T', expires_in: 3600 }) } }
  const c = criarRepomFreteClient({ ambiente: 'qa', credenciais: { user: 'u', password: 'p', partner: 'c' }, urlToken: 'https://qa.repom.com.br/Repom.Frete.Webapi/Token', urlBase: 'https://qa.repom.com.br/Repom.Frete.Webapi' }, f)
  await c.tiposDeCarga()
  assert.equal(chamadas[0], 'https://qa.repom.com.br/Repom.Frete.Webapi/Token')
  assert.ok(chamadas.every((u) => u.startsWith('https://qa.repom.com.br/')))
})
