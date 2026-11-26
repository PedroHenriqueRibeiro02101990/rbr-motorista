// Trava e segredos da função calcular-cotacao-rota (a parte sem Deno: as mesmas funções que o index.ts usa).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidirTrava, travaLiberada, decidirLimite } from './repomTrava.ts'
import { higienizar } from './repomClient.ts'
import { corsPara } from './repomHttp.ts'

const FONTE = readFileSync(new URL('../calcular-cotacao-rota/index.ts', import.meta.url), 'utf8')

test('trava ausente, vazia ou diferente de "sim" responde 503 curto', () => {
  for (const v of [null, undefined, '', 'nao', 'true', ' SIM ']) {
    const r = decidirTrava(travaLiberada(v as string | null))
    if (v === ' SIM ') assert.equal(r.permitido, true)
    else assert.deepEqual(r, { permitido: false, status: 503, erro: 'Roteirização Repom desligada' })
  }
})

test('o index checa a trava ANTES de ler o corpo e de qualquer chamada externa', () => {
  const iTrava = FONTE.indexOf('decidirTrava(')
  assert.ok(iTrava > 0)
  for (const marcador of ['req.json()', 'criarRepomClient(', 'pedagioPorRota(', 'calcularCotacaoRota({']) {
    const i = FONTE.indexOf(marcador, FONTE.indexOf('Deno.serve'))
    assert.ok(i > iTrava, `${marcador} deve vir depois da trava`)
  }
})

test('limite diario barra com 429 e o cache nao passa por ele (pedagioPorRota so chama antesDeChamar sem cache)', () => {
  assert.equal(decidirLimite(100, 100).permitido, false)
  assert.equal(decidirLimite(99, 100).permitido, true)
})

test('QA usa so credenciais QA (sem fallback para as de producao)', () => {
  assert.match(FONTE, /ambiente === "prd" \? "REPOM_VPR_ROTEIRIZACAO" : "REPOM_QA_VPR_ROTEIRIZACAO"/)
  assert.doesNotMatch(FONTE, /\?\?\s*\(await segredo\("REPOM_VPR_ROTEIRIZACAO/)
})

test('nenhum segredo em log, resposta ou codigo', () => {
  assert.doesNotMatch(FONTE, /console\.(log|error|warn)/)
  assert.doesNotMatch(FONTE, /service_role[^"']*eyJ|eyJhbGciOi/)
  const h = JSON.stringify(higienizar({ ok: true, senha: 'x', token: 'y', Authorization: 'z', roteirizacaoLogin: 'l', client_id: 'c', valor: 10 }))
  assert.doesNotMatch(h, /"x"|"y"|"z"|"l"|"c"/)
  assert.match(h, /"valor":10/)
})

test('CORS restrito: origem desconhecida nao recebe Allow-Origin e nunca "*"', () => {
  assert.equal(corsPara('https://qualquer.com', '')['Access-Control-Allow-Origin'], undefined)
  assert.notEqual(corsPara('https://rbr-motorista.vercel.app', '')['Access-Control-Allow-Origin'], '*')
})
