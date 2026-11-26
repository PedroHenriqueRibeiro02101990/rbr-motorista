// Piso ANTT: Portaria SUROC 22 (migrations aditivas 1000 + 1200) x Qualp, e escolha da linha pela data da consulta.
// Vigência oficial: DOU 29/09/2026 (edição extra), "entra em vigor no dia seguinte" = 30/09/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calcularPisoAntt, type CoeficientePiso } from './ciotEfrete.ts'

const LER = (nome: string) => readFileSync(new URL(`../../migrations/${nome}`, import.meta.url), 'utf8')
const SQL_1000 = LER('20261126-1000-piso-antt-portaria-22.sql')
const SQL_1200 = LER('20261126-1200-piso-antt-portaria-22-vigencia-oficial.sql')
const VIGENCIA = '2026-09-30'

function linhas(sql: string): CoeficientePiso[] {
  const re = /^\s*\('([ABCD])', '([^']+)', (\d+), ([0-9.]+), ([0-9.]+)\)/gm
  const out: CoeficientePiso[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    out.push({ tabela: m[1], tipo_carga: m[2], eixos: Number(m[3]), ccd_por_km: Number(m[4]), cc_fixo: Number(m[5]), data_vigencia: VIGENCIA, fonte: 'Portaria 22' })
  }
  return out
}
// Linhas antigas (Res. 6.084/2026, vigência 17/07/2026) que os testes usam.
const ANTIGAS: CoeficientePiso[] = [
  { tabela: 'A', tipo_carga: 'Carga Geral', eixos: 6, ccd_por_km: 7.3547, cc_fixo: 671.93, data_vigencia: '2026-07-17', fonte: 'Res 6.084' },
  { tabela: 'A', tipo_carga: 'Perigosa (granel liquido)', eixos: 7, ccd_por_km: 9.1949, cc_fixo: 1013.95, data_vigencia: '2026-07-17', fonte: 'Res 6.084' },
  { tabela: 'C', tipo_carga: 'Neogranel', eixos: 2, ccd_por_km: 3.1947, cc_fixo: 172.5, data_vigencia: '2026-07-17', fonte: 'Res 6.084' },
]
const todas = [...ANTIGAS, ...linhas(SQL_1000), ...linhas(SQL_1200)]
const entrada = (km: number, hoje: string) => ({ tipoCarga: 'Carga Geral', eixos: 6, distanciaKm: km, composicao: true, hoje })

test('migration 1000 traz 193 linhas (A 77, B 58, D 58); a 1200 traz a Tabela C (78) e a linha A confirmada (1)', () => {
  const a = linhas(SQL_1000)
  assert.equal(a.length, 193)
  assert.equal(a.filter((l) => l.tabela === 'A').length, 77)
  assert.equal(a.filter((l) => l.tabela === 'B').length, 58)
  assert.equal(a.filter((l) => l.tabela === 'D').length, 58)
  const b = linhas(SQL_1200)
  assert.equal(b.length, 79)
  assert.equal(b.filter((l) => l.tabela === 'C').length, 78)
  assert.equal(b.filter((l) => l.tabela === 'A').length, 1)
})

test('a 1200 corrige a vigencia para 30/09/2026 e nao apaga nada', () => {
  assert.match(SQL_1200, /set data_vigencia = date '2026-09-30'/)
  assert.match(SQL_1200, /vigencia_fim = date '2026-09-29'/)
  assert.doesNotMatch(SQL_1200.replace(/--.*$/gm, ''), /\b(delete|drop|truncate)\b/i)
  assert.match(SQL_1200, /esperava 272 linhas vigentes/)
})

test('linha antes em duvida (Perigosa granel liquido, 7 eixos): oficial 9,1849 entra', () => {
  const c = linhas(SQL_1200).find((l) => l.tabela === 'A' && l.tipo_carga === 'Perigosa (granel liquido)' && l.eixos === 7)!
  assert.equal(c.ccd_por_km, 9.1849)
  assert.equal(c.cc_fixo, 1013.95)
  const r = calcularPisoAntt(todas, { tipoCarga: 'Perigosa (granel liquido)', eixos: 7, distanciaKm: 100, composicao: true, hoje: '2026-11-26' })
  assert.ok(r.ok)
  assert.equal(r.ccdPorKm, 9.1849)
})

test('Tabela C: Neogranel 2 eixos 3,0767 (confirmado no texto oficial)', () => {
  const c = linhas(SQL_1200).find((l) => l.tabela === 'C' && l.tipo_carga === 'Neogranel' && l.eixos === 2)!
  assert.equal(c.ccd_por_km, 3.0767)
  assert.equal(c.cc_fixo, 172.5)
})

test('Geral 6 eixos: CCD 7,5347 e CC 671,93 na Portaria 22', () => {
  const c = linhas(SQL_1000).find((l) => l.tabela === 'A' && l.tipo_carga === 'Carga Geral' && l.eixos === 6)!
  assert.equal(c.ccd_por_km, 7.5347)
  assert.equal(c.cc_fixo, 671.93)
})

test('as 3 rotas do Qualp batem no centavo (Tabela A, sem retorno vazio)', () => {
  for (const [km, esperado] of [[587, 5094.8], [447, 4039.94], [403, 3708.41]] as const) {
    const r = calcularPisoAntt(todas, entrada(km, '2026-11-26'))
    assert.equal(r.ok && r.piso, esperado, `${km} km`)
    assert.equal(r.ok && r.vigencia, VIGENCIA)
  }
})

test('consulta com data anterior a vigencia (29/09) usa a tabela antiga; 30/09 ja usa a nova', () => {
  const antes = calcularPisoAntt(todas, entrada(587, '2026-09-29'))
  assert.ok(antes.ok)
  assert.equal(antes.vigencia, '2026-07-17')
  assert.equal(antes.piso, 4989.14) // 671,93 + 7,3547 x 587
  const dia = calcularPisoAntt(todas, entrada(587, '2026-09-30'))
  assert.ok(dia.ok)
  assert.equal(dia.vigencia, VIGENCIA)
  assert.equal(dia.piso, 5094.8)
})
