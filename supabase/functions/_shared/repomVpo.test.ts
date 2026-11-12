// node --test supabase/functions/_shared/repomVpo.test.ts   (sem rede)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarRepomVpoClient } from './repomVpoClient.ts'
import { criarRepomFreteEsqueleto } from './repomFrete.ts'
import { criarProvedorVpo } from './vpoProvedor.ts'
import type { Fetch } from './repomClient.ts'

const cfg = { ambiente: 'qa' as const, login: 'L', senha: 'S', codigoCliente: '9501' }
test('VPO Repom: token cacheado e consulta de TAG; 401 renova', async () => {
  let tokens = 0
  const urls: string[] = []
  const f: Fetch = async (url, init) => {
    urls.push(url)
    if (url.endsWith('/api/Token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' + ++tokens }) }
    if (init?.headers?.authorization === 'Bearer tok1') return { ok: false, status: 401, json: async () => null }
    return { ok: true, status: 200, json: async () => ({ possuiTag: true, operadora: 'X' }) }
  }
  const c = criarRepomVpoClient(cfg, f)
  const r = await c.consultarTag('abc-1d23')
  assert.equal(r.ok, true)
  assert.equal(tokens, 2)
  assert.ok(urls[0]!.startsWith('https://qa.repom.com.br'))
})
test('VPO Repom: emitir e cancelar seguem NAO IMPLEMENTADO e o provedor padrão não mudou', async () => {
  const c = criarRepomVpoClient(cfg, async () => ({ ok: true, status: 200, json: async () => ({}) }))
  await assert.rejects(() => c.emitir({} as never), /não implementado/)
  await assert.rejects(() => c.cancelar('1', 'x'), /não implementado/)
  assert.equal(criarProvedorVpo(undefined), null) // sem VPO_FORNECEDOR: fluxo manual como hoje
  assert.equal(criarProvedorVpo('nspedagio')?.fornecedor, 'nspedagio')
})
test('Repom Frete: só esqueleto, nenhum método funciona', async () => {
  const c = criarRepomFreteEsqueleto()
  await assert.rejects(() => c.emitir({}), /não implementado/)
  await assert.rejects(() => c.encerrar('1'), /não implementado/)
})
test('flag desligada: front não monta o botão e a função recusa (503) sem a trava do Vault', async () => {
  const { readFileSync } = await import('node:fs')
  const comp = readFileSync(new URL('../../../shared/CalcularPedagioRepom.tsx', import.meta.url), 'utf8')
  assert.match(comp, /VITE_REPOM_ROTEIRIZACAO_HABILITADO === 'true'/)
  assert.match(comp, /if \(!REPOM_FRONT_LIGADO\) return null/)
  const fn = readFileSync(new URL('../repom-pedagio-rota/index.ts', import.meta.url), 'utf8')
  assert.match(fn, /REPOM_ROTEIRIZACAO_LIBERADA/)
  assert.match(fn, /decidirTrava\(travaLiberada/)
})
test('RLS: migração só dá leitura ao gestor e nada ao agenciador', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../../../supabase-migrations/20261106-1000-repom-base.sql', import.meta.url), 'utf8')
  const pol = sql.match(/create policy [^;]+;/g) ?? []
  assert.equal(pol.length, 3)
  for (const p of pol) { assert.match(p, /for select/); assert.match(p, /gestor_rbr/) }
  assert.match(sql, /revoke insert, update, delete on public\.repom_rotas/)
  assert.match(sql, /grant execute on function public\.repom_segredo\(text\) to service_role/)
})
