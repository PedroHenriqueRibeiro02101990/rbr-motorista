import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  classificarFalha, eixoMaisProximo, eixosValidos, linkWhatsApp, linhasConta, MENSAGEM_FALHA, opcaoDaMargem, papelPermitido, textoInterno, TIPOS_CARGA,
  type Entrada, type Resposta,
} from './modelo.ts'
import { consultar, corpoDaConsulta, dadosDemo, type Invocar } from './acesso.ts'
import { lerConsultas, lerPrefs, LIMITE_CONSULTAS, salvarConsulta, salvarPrefs, type Armazenamento } from './historico.ts'
import { projetar, rodoviaPrincipal } from './mapa.ts'

const ENT: Entrada = { origem: { cidade: 'São Paulo', uf: 'SP' }, destino: { cidade: 'Belo Horizonte', uf: 'MG' }, tipoCarga: 'Carga Geral', eixos: 6, incluirVolta: false }
const memoria = (): Armazenamento & { m: Map<string, string> } => {
  const m = new Map<string, string>()
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const realista = (volta = false): Resposta => ({ ...dadosDemo({ ...ENT, incluirVolta: volta }), demo: false, avisos: [], emTeste: false })

test('ida x volta: pede incluir_volta so quando marcado e traz ida, volta e total', async () => {
  let corpo: Record<string, unknown> = {}
  const invocar: Invocar = async (c) => { corpo = c; return { data: realista(c.incluir_volta === true), error: null } }
  const so = await consultar(ENT, invocar)
  assert.equal(corpo.incluir_volta, false)
  assert.ok(so.ok && so.resposta.pedagio?.volta === null)
  const iv = await consultar({ ...ENT, incluirVolta: true }, invocar)
  assert.equal(corpo.incluir_volta, true)
  assert.ok(iv.ok && iv.resposta.pedagio?.total === 410.4 && iv.resposta.pedagio.ida === 205.2 && iv.resposta.pedagio.volta === 205.2)
  assert.equal(corpo.tabela, 'A') // sempre Tabela A
})

test('troca de carga com eixo invalido: vai para o valido mais proximo', () => {
  const linhas = [{ tipo_carga: 'Conteinerizada', eixos: 3 }, { tipo_carga: 'Conteinerizada', eixos: 4 }, { tipo_carga: 'Conteinerizada', eixos: 6 }, { tipo_carga: 'Carga Geral', eixos: 2 }, { tipo_carga: 'Carga Geral', eixos: 9 }]
  assert.deepEqual(eixosValidos(linhas, 'Conteinerizada'), [3, 4, 6])
  assert.equal(eixoMaisProximo(5, [3, 4, 6]), 6) // 4 e 6 empatam: fica o maior
  assert.equal(eixoMaisProximo(9, [3, 4, 6]), 6)
  assert.equal(eixoMaisProximo(4, [3, 4, 6]), 4)
  assert.equal(TIPOS_CARGA.length, 12)
})

test('margem recalcula sem nova consulta (usa as opcoes ja devolvidas)', async () => {
  let chamadas = 0
  const r = realista()
  const c = await consultar(ENT, async () => { chamadas++; return { data: r, error: null } })
  assert.ok(c.ok)
  const o30 = opcaoDaMargem(c.resposta, 30)!, o40 = opcaoDaMargem(c.resposta, 40)!, o50 = opcaoDaMargem(c.resposta, 50)!
  assert.ok(o30.valorFinal! < o40.valorFinal! && o40.valorFinal! < o50.valorFinal!)
  assert.equal(o30.abaixoDoMinimo, true)
  assert.equal(chamadas, 1)
})

test('falha parcial: mostra o que deu certo e nunca inventa valor', () => {
  const r: Resposta = { ...realista(), pedagio: null, pedagioErro: 'Não consegui o pedágio agora. Informe o valor à mão.', custo: null, referencia: null }
  const t = textoInterno(ENT, r, null, '2026-11-26T12:00:00Z')
  assert.match(t, /Piso ANTT: R\$\s?5\.094,80/)
  assert.match(t, /Pedágio: não calculado/)
  assert.doesNotMatch(t, /Referência de venda/)
})

test('sem acesso: so gestor_rbr entra', () => {
  assert.equal(papelPermitido('gestor_rbr'), true)
  for (const p of ['agenciador', 'titular_motorista', 'comercial', null, undefined, '']) assert.equal(papelPermitido(p), false)
})

test('login expirado, funcao desligada e offline', async () => {
  assert.equal(classificarFalha({ status: 401 }), 'sessao')
  assert.equal(classificarFalha({ message: 'JWT expired' }), 'sessao')
  assert.equal(classificarFalha({ status: 503 }), 'desligado')
  assert.equal(classificarFalha({ message: 'Failed to fetch' }), 'offline')
  assert.equal(classificarFalha({ online: false }), 'offline')
  const exp = await consultar(ENT, async () => ({ data: null, error: { status: 401, message: 'Invalid JWT' } }))
  assert.deepEqual(exp, { ok: false, falha: 'sessao' })
  const deslig = await consultar(ENT, async () => ({ data: { ok: false, desligado: true, erro: 'Roteirização Repom desligada' }, error: { status: 503 } }))
  assert.deepEqual(deslig, { ok: false, falha: 'desligado' })
  const off = await consultar(ENT, async () => { throw new Error('Failed to fetch') })
  assert.deepEqual(off, { ok: false, falha: 'offline' })
  assert.deepEqual(await consultar(ENT, async () => { throw new Error('x') }, false), { ok: false, falha: 'offline' })
  assert.match(MENSAGEM_FALHA.sessao, /sessão expirou/)
})

test('funcao ainda nao publicada (404): demonstracao marcada; nunca vai para o historico', async () => {
  const c = await consultar(ENT, async () => ({ data: null, error: { status: 404 } }))
  assert.ok(c.ok && c.resposta.demo === true)
  const a = memoria()
  salvarConsulta({ quando: '2026-11-26T12:00:00Z', entrada: ENT, resposta: (c as { resposta: Resposta }).resposta }, a)
  assert.equal(lerConsultas(a).length, 0)
})

test('historico guarda as ultimas 20 e as ultimas escolhas; sem armazenamento funciona', () => {
  const a = memoria()
  for (let i = 0; i < 25; i++) salvarConsulta({ quando: `2026-11-${String(i + 1).padStart(2, '0')}T12:00:00Z`, entrada: ENT, resposta: realista() }, a)
  assert.equal(lerConsultas(a).length, LIMITE_CONSULTAS)
  salvarPrefs({ tipoCarga: 'Neogranel', eixos: 5, incluirVolta: true, margem: 50 }, a)
  assert.equal(lerPrefs(a).eixos, 5)
  assert.equal(lerPrefs(null).eixos, 6) // padrao
  const quebrado: Armazenamento = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
  assert.equal(lerPrefs(quebrado).margem, 40)
  assert.deepEqual(lerConsultas(quebrado), [])
  assert.doesNotThrow(() => salvarPrefs(lerPrefs(), quebrado))
})

test('texto interno (copiar e WhatsApp): sem linguagem de proposta ao cliente', () => {
  const r = realista()
  const o = opcaoDaMargem(r, 40)
  const t = textoInterno(ENT, r, o, '2026-11-26T12:00:00Z')
  assert.match(t, /Rota: São Paulo\/SP → Belo Horizonte\/MG/)
  assert.match(t, /Carga geral, 6 eixos, só ida/)
  assert.match(t, /Distância: 587 km/)
  assert.match(t, /Custo \(piso \+ pedágio\): R\$\s?5\.300,00/)
  assert.match(t, /Referência de venda: R\$\s?8\.100,44/)
  assert.match(t, /Só referência, não é cotação/)
  assert.match(t, /Consulta de 26\/11\/2026/)
  assert.doesNotMatch(t, /proposta|prezado|orçamento|valor para você/i)
  assert.ok(linkWhatsApp(t).startsWith('https://wa.me/?text='))
  assert.ok(linhasConta(ENT, r, o).some(([k]) => k.startsWith('Piso ANTT')))
})

test('mapa: projeta a geometria real dentro da caixa; sem geometria nao ha trajeto nem praca', () => {
  const t = projetar([[-46.6, -23.5], [-45.5, -22.4], [-44.5, -21.0], [-43.9, -19.9]])!
  for (const p of t.pontos) assert.ok(p.x >= 0 && p.x <= 340 && p.y >= 0 && p.y <= 118)
  assert.ok(t.inicio.y > t.fim.y) // BH (norte) fica acima de SP
  assert.ok(t.inicio.x < t.fim.x)
  assert.equal(projetar(null), null)
  assert.equal(projetar([[1, 1]]), null)
  assert.equal(rodoviaPrincipal('BR-381 / SP-070'), 'BR-381')
  assert.equal(rodoviaPrincipal(null), null)
  assert.equal(rodoviaPrincipal('sem rodovia'), null)
})

test('corpo da consulta leva IBGE quando conhecido e nenhum segredo', () => {
  const c = corpoDaConsulta({ ...ENT, origem: { ...ENT.origem, ibge: '3550308' } })
  assert.equal(c.ibge_origem, '3550308')
  assert.doesNotMatch(JSON.stringify(c), /senha|token|secret|authorization/i)
})

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? (n === 'node_modules' || n === 'dist' ? [] : arquivos(p)) : [p]
  })
}
test('nenhum segredo no front (so a chave publishable, que e publica)', () => {
  const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  for (const f of arquivos(raiz).filter((x) => /\.(ts|tsx|css)$/.test(x) && !/\.test\.ts$/.test(x))) {
    const txt = readFileSync(f, 'utf8')
    assert.doesNotMatch(txt, /service_role|eyJhbGciOi|sb_secret_|REPOM_[A-Z_]*(SENHA|LOGIN)|SUPABASE_SERVICE/i, f)
  }
})
