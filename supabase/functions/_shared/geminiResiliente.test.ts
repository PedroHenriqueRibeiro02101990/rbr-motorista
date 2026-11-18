// node --test supabase/functions/_shared/geminiResiliente.test.ts   (mocks do fetch; relogio simulado; NAO chama o Gemini)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chamarGemini, rodarComLimite, textoDaResposta, ORCAMENTO_TOTAL_MS, type Deps } from './geminiResiliente.ts'

type Cenario = { demora: number; status?: number; corpo?: unknown }
/** Relogio virtual: `dormir` e `demora` avancam o tempo; o timeout (agendar) aborta a chamada quando demora >= limite. */
function simulador(cenarios: Cenario[]) {
  let t = 0; let chamadas = 0; const modelos: string[] = []; const pausas: number[] = []
  let pendente: { fn: () => void; ms: number } | null = null
  const deps: Deps = {
    agora: () => t,
    dormir: async (ms) => { pausas.push(ms); t += ms },
    agendar: (fn, ms) => { pendente = { fn, ms }; return () => { pendente = null } },
    fetch: async (url) => {
      modelos.push(url.match(/models\/([^:]+):/)![1])
      const c = cenarios[Math.min(chamadas++, cenarios.length - 1)]
      const p = pendente as { fn: () => void; ms: number } | null
      if (p && c.demora >= p.ms) { t += p.ms; p.fn(); const e = new Error('abortado'); (e as Error & { name: string }).name = 'AbortError'; throw e }
      t += c.demora
      const status = c.status ?? 200
      return { ok: status >= 200 && status < 300, status, json: async () => c.corpo ?? { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }, text: async () => '' }
    },
  }
  return { deps, get chamadas() { return chamadas }, get tempo() { return t }, modelos, pausas }
}
const opc = { chave: 'k', modelo: 'modelo-a', corpo: {} }

test('(i) 503 duas vezes e 200 na terceira: sucesso, com pausa de 3 s depois de cada 503', async () => {
  const s = simulador([{ demora: 2000, status: 503 }, { demora: 2000, status: 503 }, { demora: 8000 }])
  const r = await chamarGemini(opc, s.deps)
  assert.equal(r.ok, true); assert.equal(r.tentativas, 3); assert.deepEqual(s.pausas, [3000, 3000])
  assert.equal(textoDaResposta((r as { json: unknown }).json), '{"ok":true}')
})
test('(ii) 503 sempre: erro ia_indisponivel em menos de 100 s simulados, sem chegar ao limite do Supabase', async () => {
  const s = simulador([{ demora: 5000, status: 503 }])
  const r = await chamarGemini(opc, s.deps)
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.codigo, 'ia_indisponivel'); assert.equal(r.tentativas, 4); assert.match(r.mensagem, /ocupada agora/); assert.match(r.detalhe, /gemini=503/); assert.ok(!/key|k$/.test(r.detalhe.replace(/gemini|tentativas|motivo/g, ''))) }
  assert.ok(s.tempo < ORCAMENTO_TOTAL_MS, `tempo ${s.tempo}`)
})
test('(iii) timeout na 1a tentativa e sucesso na 2a: sem pausa depois do timeout', async () => {
  const s = simulador([{ demora: 99_000 }, { demora: 7000 }])
  const r = await chamarGemini(opc, s.deps)
  assert.equal(r.ok, true); assert.equal(r.tentativas, 2); assert.deepEqual(s.pausas, [])
  assert.equal(s.tempo, 15_000 + 7000) // 1a tentativa estourou em 15 s
})
test('timeout em todas: 15+20+25+25 s, nunca passa de 100 s', async () => {
  const s = simulador([{ demora: 999_000 }])
  const r = await chamarGemini(opc, s.deps)
  assert.equal(r.ok, false); assert.equal(s.tempo, 85_000); assert.ok(s.tempo < ORCAMENTO_TOTAL_MS)
  if (!r.ok) assert.match(r.detalhe, /motivo=timeout/)
})
test('(iv) 400, 401, 403 e 404: sem repeticao, mensagem clara', async () => {
  for (const st of [400, 401, 403, 404]) {
    const s = simulador([{ demora: 100, status: st }])
    const r = await chamarGemini(opc, s.deps)
    assert.equal(s.chamadas, 1); assert.equal(r.ok, false)
    if (!r.ok) { assert.equal(r.codigo, 'ia_recusou'); assert.equal(r.status, st) }
  }
})
test('modelo alternativo (se existir) so na ultima tentativa; sem alternativo repete o mesmo', async () => {
  const s = simulador([{ demora: 100, status: 503 }])
  await chamarGemini({ ...opc, modeloAlternativo: 'modelo-b' }, s.deps)
  assert.deepEqual(s.modelos, ['modelo-a', 'modelo-a', 'modelo-a', 'modelo-b'])
  const s2 = simulador([{ demora: 100, status: 503 }]); await chamarGemini(opc, s2.deps)
  assert.deepEqual(s2.modelos, ['modelo-a', 'modelo-a', 'modelo-a', 'modelo-a'])
})
test('erro de rede repete sem pausa; 500 e 429 repetem com pausa', async () => {
  const s = simulador([{ demora: 100, status: 429 }, { demora: 100, status: 500 }, { demora: 100 }])
  assert.equal((await chamarGemini(opc, s.deps)).ok, true); assert.deepEqual(s.pausas, [3000, 3000])
})
test('(v) cinco arquivos com concorrencia 2, um falha: os outros quatro entram e o total simulado fica abaixo de 60 s (8 s por leitura)', async () => {
  let t = 0; let ativos = 0; let maxAtivos = 0
  const leitura = (falha: boolean) => async () => {
    ativos++; maxAtivos = Math.max(maxAtivos, ativos)
    await Promise.resolve()
    ativos--
    return falha ? { ok: false as const } : { ok: true as const }
  }
  // tempo simulado: cada leitura = 8 s; com 2 em paralelo, 5 leituras = ceil(5/2) * 8 = 24 s
  const r = await rodarComLimite([leitura(false), leitura(true), leitura(false), leitura(false), leitura(false)], 2)
  t = Math.ceil(5 / 2) * 8
  assert.equal(r.filter((x) => x.ok).length, 4); assert.equal(r.filter((x) => !x.ok).length, 1)
  assert.ok(maxAtivos <= 2); assert.ok(t < 60)
})
test('concorrencia nunca passa do limite de 2', async () => {
  let ativos = 0, max = 0
  const tarefa = () => async () => { ativos++; max = Math.max(max, ativos); await new Promise((r) => setTimeout(r, 5)); ativos--; return 1 }
  await rodarComLimite(Array.from({ length: 7 }, tarefa), 2)
  assert.equal(max, 2)
})
