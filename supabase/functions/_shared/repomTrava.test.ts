// node --test supabase/functions/_shared/repomTrava.test.ts  (sem rede: tudo com mock)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidirLimite, decidirTrava, inicioDoDia, limiteDiario, travaLiberada } from './repomTrava.ts'
import { pedagioPorRota, type PedagioCache, type Repositorio, type RotaCache } from './repomPedagio.ts'
import { criarRepomClient, type ClienteRepom, type Fetch } from './repomClient.ts'

const ENTRADA = { ibgeOrigem: '3550308', ufOrigem: 'SP', ibgeDestino: '3304557', ufDestino: 'RJ', idaVolta: false, eixos: 5 }

function repoEmMemoria(inicial?: { rota: RotaCache; pedagio: PedagioCache }): Repositorio & { gravacoes: number } {
  let rota: RotaCache | null = inicial?.rota ?? null
  let ped: PedagioCache | null = inicial?.pedagio ?? null
  const r = {
    gravacoes: 0,
    async buscarRota() { return rota },
    async gravarRota(x: { codigo_roteiro_repom: string; codigo_percurso_repom: string }) { rota = { id: 'r1', codigo_roteiro_repom: x.codigo_roteiro_repom, codigo_percurso_repom: x.codigo_percurso_repom, descricao_percurso: null }; return rota },
    async buscarPedagio() { return ped },
    async gravarPedagio(p: { valor_total: number; valor_ida: number | null; valor_volta: number | null }) { r.gravacoes++; ped = { valor_total: p.valor_total, valor_ida: p.valor_ida, valor_volta: p.valor_volta, consultado_em: new Date().toISOString(), validade_dias: 30 } },
  }
  return r as never
}
function clienteContador(): ClienteRepom & { chamadas: number } {
  const c = {
    chamadas: 0,
    ambiente: 'qa' as const,
    async cadastrarRota() { c.chamadas++; return { ok: true as const, http: 200, dados: { codigoRoteiroRepom: 'A', codigoPercursoRepom: 'B', distanciaKm: 10 }, bruto: {} } },
    async consultarPedagio() { c.chamadas++; return { ok: true as const, http: 200, dados: { valorTotal: 99.9, valorIda: 99.9, valorVolta: null, descricaoPercurso: 'BR-116' }, bruto: {} } },
    async verificarToken() { c.chamadas++; return { ok: true } },
  }
  return c as never
}
const cfg = (login = 'L', senha = 'S') => ({ ambiente: 'qa' as const, codigoCliente: '9501', roteirizacaoLogin: login, roteirizacaoSenha: senha, valePedagioLogin: '', valePedagioSenha: '' })

test('trava: so o texto "sim" libera; ausente, nao e vazio mantem desligado (503)', () => {
  assert.equal(travaLiberada('sim'), true)
  assert.equal(travaLiberada(' SIM '), true)
  for (const v of [null, undefined, '', 'nao', 'true', '1']) assert.equal(travaLiberada(v), false)
  const v = decidirTrava(false)
  assert.equal(v.permitido, false)
  if (!v.permitido) {
    assert.equal(v.status, 503)
    assert.equal(v.erro, 'Roteirização Repom desligada')
  }
  assert.equal(decidirTrava(true).permitido, true)
})
test('limite diario: padrao 100, valor invalido cai no padrao, acima do limite devolve 429', () => {
  assert.equal(limiteDiario(undefined), 100)
  assert.equal(limiteDiario('abc'), 100)
  assert.equal(limiteDiario('0'), 100)
  assert.equal(limiteDiario('-5'), 100)
  assert.equal(limiteDiario('250'), 250)
  assert.equal(decidirLimite(99, 100).permitido, true)
  const v = decidirLimite(100, 100)
  assert.equal(v.permitido, false)
  if (!v.permitido) assert.equal(v.status, 429)
})
test('inicio do dia em Brasilia (UTC-3)', () => {
  assert.equal(inicioDoDia(Date.parse('2026-11-12T10:00:00Z')), '2026-11-12T03:00:00.000Z')
  assert.equal(inicioDoDia(Date.parse('2026-11-12T01:00:00Z')), '2026-11-11T03:00:00.000Z')
})
test('limite diario atingido: barra ANTES de chamar a Repom', async () => {
  const cli = clienteContador()
  const r = await pedagioPorRota(ENTRADA, repoEmMemoria(), cli, Date.now(), async () => 'Limite diário de consultas à Repom atingido.')
  assert.equal(r.ok, false)
  assert.equal(r.limite, true)
  assert.equal(cli.chamadas, 0)
})
test('cache de 30 dias: nao chama a Repom e nao aciona a checagem do limite (nao conta)', async () => {
  const cache = { rota: { id: 'r1', codigo_roteiro_repom: 'A', codigo_percurso_repom: 'B', descricao_percurso: 'BR-116' }, pedagio: { valor_total: 80, valor_ida: 80, valor_volta: null, consultado_em: new Date(Date.now() - 10 * 86_400_000).toISOString(), validade_dias: 30 } }
  const cli = clienteContador()
  let checagens = 0
  const r = await pedagioPorRota(ENTRADA, repoEmMemoria(cache), cli, Date.now(), async () => { checagens++; return null })
  assert.equal(r.ok, true)
  assert.equal(r.doCache, true)
  assert.equal(r.valor, 80)
  assert.equal(cli.chamadas, 0)
  assert.equal(checagens, 0)
})
test('cache vencido (mais de 30 dias) volta a consultar e passa pela checagem do limite', async () => {
  const velho = { rota: { id: 'r1', codigo_roteiro_repom: 'A', codigo_percurso_repom: 'B', descricao_percurso: null }, pedagio: { valor_total: 80, valor_ida: 80, valor_volta: null, consultado_em: new Date(Date.now() - 31 * 86_400_000).toISOString(), validade_dias: 30 } }
  const cli = clienteContador()
  let checagens = 0
  const r = await pedagioPorRota(ENTRADA, repoEmMemoria(velho), cli, Date.now(), async () => { checagens++; return null })
  assert.equal(r.doCache, false)
  assert.equal(checagens, 1)
  assert.ok(cli.chamadas >= 1)
})
test('erro 5xx da Repom: devolve ok:false com mensagem (cai no manual) e nao grava cache', async () => {
  const fetchFn: Fetch = async (url) => (url.includes('/connect/token') ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) } : { ok: false, status: 503, json: async () => ({}) })
  const cli = criarRepomClient(cfg(), fetchFn)
  const repo = repoEmMemoria()
  const r = await pedagioPorRota(ENTRADA, repo, cli)
  assert.equal(r.ok, false)
  assert.ok(r.erro && r.erro.length > 0)
  assert.equal(repo.gravacoes, 0)
})
test('nenhum segredo em log ou resposta: resposta e erro nunca carregam login, senha ou token', async () => {
  const fetchFn: Fetch = async (url) => (url.includes('/connect/token') ? { ok: true, status: 200, json: async () => ({ access_token: 'TOKEN_SECRETO', expires_in: 3600 }) } : { ok: false, status: 500, json: async () => ({ message: 'x' }) })
  const cli = criarRepomClient(cfg('LOGIN_SECRETO', 'SENHA_SECRETA'), fetchFn)
  const r = await pedagioPorRota(ENTRADA, repoEmMemoria(), cli)
  const texto = JSON.stringify(r)
  for (const s of ['LOGIN_SECRETO', 'SENHA_SECRETA', 'TOKEN_SECRETO']) assert.equal(texto.includes(s), false)
  assert.equal(JSON.stringify(await cli.verificarToken()).includes('TOKEN_SECRETO'), false)
})
test('verificarToken faz UMA chamada e so ao token (nem rota nem pedagio)', async () => {
  const urls: string[] = []
  const fetchFn: Fetch = async (url) => {
    urls.push(url)
    return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
  }
  const cli = criarRepomClient(cfg(), fetchFn)
  assert.deepEqual(await cli.verificarToken(), { ok: true })
  assert.equal(urls.length, 1)
  assert.match(urls[0], /connect\/token/)
})
test('funcoes: trava lida de REPOM_ROTEIRIZACAO_LIBERADA, sem log e agenciador sem leitura das tabelas', () => {
  const dir = new URL('../../../', import.meta.url)
  const rota = readFileSync(new URL('supabase/functions/repom-pedagio-rota/index.ts', dir), 'utf8')
  const status = readFileSync(new URL('supabase/functions/repom-status/index.ts', dir), 'utf8')
  const mig = readFileSync(new URL('supabase-migrations/20261106-1000-repom-base.sql', dir), 'utf8')
  assert.match(rota, /REPOM_ROTEIRIZACAO_LIBERADA/)
  assert.match(rota, /decidirTrava/)
  assert.match(status, /usoHoje/)
  assert.doesNotMatch(status + rota, /console\.(log|error)/)
  const policies = mig.match(/create policy [^;]+;/g) ?? []
  assert.equal(policies.length, 3)
  for (const p of policies) assert.match(p, /current_papel\(\) = 'gestor_rbr'/)
  assert.doesNotMatch(mig, /grant (select|all)[^;]*\bto (anon|authenticated)/i)
})
