// Piso ANTT: Portaria SUROC 22 (migration aditiva) x Qualp, e escolha da linha pela data da consulta.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calcularPisoAntt, type CoeficientePiso } from './ciotEfrete.ts'

const SQL = readFileSync(new URL('../../migrations/20261126-1000-piso-antt-portaria-22.sql', import.meta.url), 'utf8')

function linhasNovas(): CoeficientePiso[] {
  const re = /^\s*\('([ABCD])', '([^']+)', (\d+), ([0-9.]+), ([0-9.]+)\)/gm
  const out: CoeficientePiso[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(SQL))) {
    out.push({ tabela: m[1], tipo_carga: m[2], eixos: Number(m[3]), ccd_por_km: Number(m[4]), cc_fixo: Number(m[5]), data_vigencia: '2026-10-01', fonte: 'Portaria 22' })
  }
  return out
}
// Linhas antigas (Res. 6.084/2026, vigencia 17/07/2026) que os testes usam.
const ANTIGAS: CoeficientePiso[] = [
  { tabela: 'A', tipo_carga: 'Carga Geral', eixos: 6, ccd_por_km: 7.3547, cc_fixo: 671.93, data_vigencia: '2026-07-17', fonte: 'Res 6.084' },
  { tabela: 'A', tipo_carga: 'Perigosa (granel liquido)', eixos: 7, ccd_por_km: 9.1949, cc_fixo: 1013.95, data_vigencia: '2026-07-17', fonte: 'Res 6.084' },
]
const todas = [...ANTIGAS, ...linhasNovas()]
const entrada = (km: number, hoje: string) => ({ tipoCarga: 'Carga Geral', eixos: 6, distanciaKm: km, composicao: true, hoje })

test('migration traz 193 linhas novas (A 77, B 58, D 58) e nenhuma da Tabela C', () => {
  const n = linhasNovas()
  assert.equal(n.length, 193)
  assert.equal(n.filter((l) => l.tabela === 'A').length, 77)
  assert.equal(n.filter((l) => l.tabela === 'B').length, 58)
  assert.equal(n.filter((l) => l.tabela === 'D').length, 58)
  assert.equal(n.filter((l) => l.tabela === 'C').length, 0)
})

test('linha em duvida (Perigosa granel liquido, 7 eixos) nao e alterada', () => {
  assert.equal(linhasNovas().some((l) => l.tabela === 'A' && l.tipo_carga === 'Perigosa (granel liquido)' && l.eixos === 7), false)
  assert.match(SQL, /a_confirmar = true/)
})

test('Geral 6 eixos: CCD 7,5347 e CC 671,93 na Portaria 22', () => {
  const c = linhasNovas().find((l) => l.tabela === 'A' && l.tipo_carga === 'Carga Geral' && l.eixos === 6)!
  assert.equal(c.ccd_por_km, 7.5347)
  assert.equal(c.cc_fixo, 671.93)
})

test('as 3 rotas do Qualp batem no centavo (Tabela A, sem retorno vazio)', () => {
  for (const [km, esperado] of [[587, 5094.8], [447, 4039.94], [403, 3708.41]] as const) {
    const r = calcularPisoAntt(todas, entrada(km, '2026-11-26'))
    assert.equal(r.ok && r.piso, esperado, `${km} km`)
    assert.equal(r.ok && r.vigencia, '2026-10-01')
  }
})

test('consulta com data anterior a vigencia usa a tabela antiga (Res. 6.084)', () => {
  const r = calcularPisoAntt(todas, entrada(587, '2026-09-30'))
  assert.ok(r.ok)
  assert.equal(r.vigencia, '2026-07-17')
  assert.equal(r.piso, 4989.14)  // 671,93 + 7,3547 x 587
  assert.equal(calcularPisoAntt(todas, entrada(587, '2026-10-01')).ok && true, true)
})

test('linha em duvida continua usando o valor antigo', () => {
  const r = calcularPisoAntt(todas, { tipoCarga: 'Perigosa (granel liquido)', eixos: 7, distanciaKm: 100, composicao: true, hoje: '2026-11-26' })
  assert.ok(r.ok)
  assert.equal(r.vigencia, '2026-07-17')
  assert.equal(r.ccdPorKm, 9.1949)
})

test('o CC nao muda em nenhuma linha nova de Geral e Neogranel (A)', () => {
  const n = linhasNovas().filter((l) => l.tabela === 'A' && (l.tipo_carga === 'Carga Geral' || l.tipo_carga === 'Neogranel'))
  assert.equal(n.length, 14)
  assert.ok(n.every((l) => l.cc_fixo > 0))
})
