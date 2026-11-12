// node --test supabase/functions/_shared/repomVpo.test.ts   (sem rede)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarRepomVpoClient } from './repomVpoClient.ts'
import { criarProvedorVpo } from './vpoProvedor.ts'
import type { Fetch } from './repomClient.ts'

const cfg = { ambiente: 'qa' as const, roteirizacaoLogin: '', roteirizacaoSenha: '', valePedagioLogin: 'L', valePedagioSenha: 'S' }
const tokenOk = { authenticated: true, created: '2025-11-12 17:00:19', expiration: '2025-11-13 17:00:18', accessToken: 'tok' }

test('VPO Repom: consulta de TAG pela API do manual (GET tags/placa, token usuario/senha) e 401 renova uma vez', async () => {
  let tokens = 0
  const chamadas: { url: string; method?: string; body?: string }[] = []
  const f: Fetch = async (url, init) => {
    chamadas.push({ url, method: init?.method, body: init?.body })
    if (url.endsWith('/api/Token')) return { ok: true, status: 200, json: async () => ({ ...tokenOk, accessToken: 'tok' + ++tokens }) }
    if (init?.headers?.authorization === 'Bearer tok1') return { ok: false, status: 401, json: async () => null }
    return { ok: true, status: 200, json: async () => [{ nomeTag: 'Tag Veloe', numeroTag: '1', codigoStatusTag: 1, statusTag: 'Ativa', apto: 'Sim' }] }
  }
  const c = criarRepomVpoClient(cfg, f)
  const r = await c.consultarTag('abc-1d23')
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.dados, { placa: 'abc-1d23', possuiTag: true, operadora: 'Tag Veloe' })
  assert.equal(tokens, 2)
  assert.deepEqual(JSON.parse(chamadas[0]!.body!), { usuario: 'L', senha: 'S' })
  const consulta = chamadas.find((x) => x.url.includes('/tags/placa'))!
  assert.equal(consulta.method, 'GET')
  assert.match(consulta.url, /^https:\/\/qa\.repom\.com\.br\/Repom\.ValePedagio\.WebAPI\/api\/RepomVeiculo\/tags\/placa\?placa=ABC1D23$/)
})
test('VPO Repom: TAG de banco (não apta) não é elegível', async () => {
  const f: Fetch = async (url) => (url.endsWith('/api/Token') ? { ok: true, status: 200, json: async () => tokenOk } : { ok: true, status: 200, json: async () => [{ nomeTag: 'Tag C6', codigoStatusTag: 1, statusTag: 'Ativa', apto: 'Não' }] })
  const r = await criarRepomVpoClient(cfg, f).consultarTag('ABC1D23')
  assert.equal(r.ok && r.dados.possuiTag, false)
})
test('VPO Repom: emissão e cancelamento pelo provedor genérico seguem sem implementação (vão pela função repom-vpo) e o provedor padrão não mudou', async () => {
  const c = criarRepomVpoClient(cfg, async () => ({ ok: true, status: 200, json: async () => ({}) }))
  await assert.rejects(() => c.emitir({} as never), /não implementado/)
  await assert.rejects(() => c.cancelar('1', 'x'), /não implementado/)
  assert.equal(criarProvedorVpo(undefined), null) // sem VPO_FORNECEDOR: fluxo manual como hoje
  assert.equal(criarProvedorVpo('nspedagio')?.fornecedor, 'nspedagio')
})
test('flag desligada: front não monta o botão e a função recusa (503) sem a trava do Vault', async () => {
  const { readFileSync } = await import('node:fs')
  const comp = readFileSync(new URL('../../../shared/CalcularPedagioRepom.tsx', import.meta.url), 'utf8')
  assert.match(comp, /VITE_REPOM_ROTEIRIZACAO_HABILITADO === 'true'/)
  assert.match(comp, /if \(!REPOM_FRONT_LIGADO \|\| !liberada\) return null/)
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
