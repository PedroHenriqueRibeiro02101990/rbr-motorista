import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularCotacaoRota, type DepsCotacaoRota, type EntradaCotacaoRota, type CoefEscolhido } from './cotacaoRota.ts'
import type { SaidaPedagio, EntradaPedagio } from './repomPedagio.ts'
import { pedagioPorRota, type Repositorio } from './repomPedagio.ts'
import type { ClienteRepom } from './repomClient.ts'

const CIDADES: Record<string, { ibge: string; lat: number; lon: number }> = {
  'SP': { ibge: '3550308', lat: -23.55, lon: -46.63 },
  'BH': { ibge: '3106200', lat: -19.92, lon: -43.94 },
}
const COEF_GERAL6: CoefEscolhido = { ccd: 7.5347, cc: 671.93, vigencia: '2026-10-01', fonte: 'Portaria 22', aConfirmar: false }

function deps(sobre: Partial<DepsCotacaoRota> = {}, contagem = { osrm: 0, pedagio: 0 }): DepsCotacaoRota {
  return {
    hoje: '2026-11-26',
    ambiente: 'qa',
    async resolverCidade(c) { return CIDADES[c.cidade] ?? null },
    async osrm() { contagem.osrm++; return { km: 587, horas: 7.9, geometria: [[-46.6, -23.5], [-43.9, -19.9]] } },
    async coeficiente() { return COEF_GERAL6 },
    async pedagio(_e: EntradaPedagio): Promise<SaidaPedagio> { contagem.pedagio++; return { ok: true, valor: 205.2, valorIda: 205.2, valorVolta: null, descricaoPercurso: 'BR-381', consultadoEm: '2026-11-26T12:00:00.000Z', doCache: false, distanciaKmRepom: 590 } },
    parametros: { aliquota: 0.06, margemMin: 0.26, fatorRetornoVazio: null },
    ...sobre,
  }
}
const ENT: EntradaCotacaoRota = { origem: { cidade: 'SP', uf: 'SP' }, destino: { cidade: 'BH', uf: 'MG' }, tipoCarga: 'Carga Geral', eixos: 6 }

test('so ida (padrao): km, piso sem retorno vazio e pedagio so de ida', async () => {
  const r = await calcularCotacaoRota(ENT, deps())
  assert.equal(r.incluirVolta, false)
  assert.equal(r.km, 587)
  assert.equal(r.piso?.valor, 5094.8) // bate com o Qualp
  assert.equal(r.piso?.comRetornoVazio, false)
  assert.equal(r.pedagio?.total, 205.2)
  assert.equal(r.pedagio?.ida, 205.2)
  assert.equal(r.pedagio?.volta, null)
  assert.equal(r.custo, 5300)
  assert.deepEqual(r.referencia?.map((x) => x.lucroPct), [30, 40, 50])
  assert.equal(r.referencia?.[1].valorFinal, 8100.44)
  assert.equal(r.rotaEnviadaRepom, 'IBGE')
  assert.equal(r.emTeste, true)
})

test('ida e volta: pedagio com ida, volta e total; retorno vazio so entra com fator configurado', async () => {
  let pedido: EntradaPedagio | null = null
  const d = deps({
    async pedagio(e) { pedido = e; return { ok: true, valor: 410.4, valorIda: 205.2, valorVolta: 205.2, descricaoPercurso: 'BR-381', consultadoEm: '2026-11-26T12:00:00.000Z', doCache: false } },
  })
  const sem = await calcularCotacaoRota({ ...ENT, incluirVolta: true }, d)
  assert.equal(pedido!.idaVolta, true)
  assert.deepEqual([sem.pedagio?.ida, sem.pedagio?.volta, sem.pedagio?.total], [205.2, 205.2, 410.4])
  assert.equal(sem.piso?.comRetornoVazio, false)
  assert.equal(sem.piso?.valor, 5094.8)
  assert.ok(sem.avisos.some((a) => /Retorno vazio não incluído/.test(a)))
  const com = await calcularCotacaoRota({ ...ENT, incluirVolta: true }, { ...d, parametros: { ...d.parametros, fatorRetornoVazio: 0.92 } })
  assert.equal(com.piso?.comRetornoVazio, true)
  assert.equal(com.piso?.valor, Math.round((671.93 + 7.5347 * 587 * 1.92) * 100) / 100)
})

test('piso usa a tabela vigente na data da consulta', async () => {
  let dataUsada = ''
  await calcularCotacaoRota({ ...ENT, dataConsulta: '2026-09-30' }, deps({ async coeficiente(_t, _c, _e, data) { dataUsada = data; return COEF_GERAL6 } }))
  assert.equal(dataUsada, '2026-09-30')
})

test('Repom fora do ar: devolve km e piso e a mensagem do pedagio, sem inventar valor', async () => {
  const r = await calcularCotacaoRota(ENT, deps({ async pedagio() { throw new Error('REDE') } }))
  assert.equal(r.ok, true)
  assert.equal(r.km, 587)
  assert.equal(r.piso?.valor, 5094.8)
  assert.equal(r.pedagio, null)
  assert.match(r.pedagioErro ?? '', /Informe o valor à mão/)
  assert.equal(r.custo, null)
  assert.equal(r.referencia, null)
})

test('OSRM fora do ar: sem km e sem piso (nunca linha reta); pedagio ainda e tentado', async () => {
  const r = await calcularCotacaoRota(ENT, deps({ async osrm() { return null } }))
  assert.equal(r.ok, false)
  assert.equal(r.km, null)
  assert.equal(r.piso, null)
  assert.ok(r.pedagio)
  assert.match(r.erro ?? '', /Não consegui calcular a rota/)
})

test('cidade sem IBGE: piso e km seguem, pedagio pede valor a mao', async () => {
  const r = await calcularCotacaoRota(ENT, deps({ async resolverCidade(c) { const x = CIDADES[c.cidade]; return x ? { ...x, ibge: null } : null } }))
  assert.equal(r.piso?.valor, 5094.8)
  assert.equal(r.pedagio, null)
  assert.match(r.pedagioErro ?? '', /IBGE/)
})

test('combinacao sem coeficiente: mensagem clara e pedagio segue', async () => {
  const r = await calcularCotacaoRota(ENT, deps({ async coeficiente() { return null } }))
  assert.match(r.pisoErro ?? '', /Não achei coeficiente/)
  assert.ok(r.pedagio)
})

test('linha a confirmar avisa', async () => {
  const r = await calcularCotacaoRota(ENT, deps({ async coeficiente() { return { ...COEF_GERAL6, aConfirmar: true } } }))
  assert.equal(r.piso?.aConfirmar, true)
  assert.ok(r.avisos.some((a) => /a confirmar/.test(a)))
})

test('entrada invalida e cidade nao localizada', async () => {
  assert.match((await calcularCotacaoRota({ ...ENT, eixos: 1 }, deps())).erro ?? '', /eixos/)
  assert.match((await calcularCotacaoRota({ ...ENT, origem: { cidade: 'XX', uf: 'SP' } }, deps())).erro ?? '', /origem/)
})

test('rotas do Qualp batem no centavo com o km do Qualp', async () => {
  for (const [km, piso] of [[587, 5094.8], [447, 4039.94], [403, 3708.41]] as const) {
    const r = await calcularCotacaoRota(ENT, deps({ async osrm() { return { km, horas: 5 } } }))
    assert.equal(r.piso?.valor, piso)
  }
})

test('cache de 30 dias: segunda consulta nao chama a Repom e nao conta no limite', async () => {
  const cadastros: number[] = []
  let limiteChamado = 0
  const memoria = { rota: null as null | { id: string; codigo_roteiro_repom: string; codigo_percurso_repom: string; descricao_percurso: string | null; distancia_km: number | null }, ped: null as null | { valor_total: number; valor_ida: number | null; valor_volta: number | null; consultado_em: string; validade_dias: number } }
  const repo: Repositorio = {
    async buscarRota() { return memoria.rota },
    async gravarRota(r) { memoria.rota = { id: 'r1', codigo_roteiro_repom: r.codigo_roteiro_repom, codigo_percurso_repom: r.codigo_percurso_repom, descricao_percurso: null, distancia_km: r.distancia_km }; return memoria.rota },
    async buscarPedagio() { return memoria.ped },
    async gravarPedagio(p) { memoria.ped = { valor_total: p.valor_total, valor_ida: p.valor_ida, valor_volta: p.valor_volta, consultado_em: new Date().toISOString(), validade_dias: 30 } },
  }
  const repom = {
    ambiente: 'qa',
    async cadastrarRota() { cadastros.push(1); return { ok: true, http: 200, dados: { codigoRoteiroRepom: '1', codigoPercursoRepom: '2', distanciaKm: 590 }, bruto: null } },
    async consultarPedagio() { return { ok: true, http: 200, dados: { valorTotal: 205.2, valorIda: 205.2, valorVolta: null, descricaoPercurso: 'BR-381' }, bruto: null } },
    async verificarToken() { return { ok: true } },
  } as unknown as ClienteRepom
  const antes = async () => { limiteChamado++; return null }
  const ped = (e: EntradaPedagio) => pedagioPorRota(e, repo, repom, Date.now(), antes)
  const r1 = await calcularCotacaoRota(ENT, deps({ pedagio: ped }))
  const r2 = await calcularCotacaoRota(ENT, deps({ pedagio: ped }))
  assert.equal(r1.pedagio?.doCache, false)
  assert.equal(r2.pedagio?.doCache, true)
  assert.equal(r2.pedagio?.distanciaKmRepom, 590)
  assert.equal(cadastros.length, 1)
  assert.equal(limiteChamado, 1) // so a primeira consulta passou pelo limite diario
})

test('nenhum segredo na saida', async () => {
  const txt = JSON.stringify(await calcularCotacaoRota(ENT, deps()))
  assert.doesNotMatch(txt, /senha|password|secret|token|authorization|client_?id|login/i)
})
