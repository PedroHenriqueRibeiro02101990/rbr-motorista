// node --test shared/spreadAgenciador.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as s from './spreadAgenciador.ts'

const p: s.ParametrosRbr = { lucroMinPct: 0.15, lucroMinValor: 250, custoFinPctMes: 0.025, taxaTecnologia: 9.9 }
const e: s.EntradaCusto = { frete: 4000, pedagio: 300, seguroTag: 120, prazoDias: 30, aliquota: 0.06 }

test('soma das partes fecha o preco final', () => {
  for (const sp of [0, 100, 350.55, 1200]) {
    const c = s.precoPorSpread(e, p, sp)
    const soma = c.frete + c.pedagio + c.seguroTag + c.custoFinanceiro + c.lucroRbr + c.spread + c.imposto
    assert.ok(Math.abs(soma - c.precoFinal) <= 0.03, `${soma} vs ${c.precoFinal}`)
  }
})
test('spread em R$ e em % dao o mesmo preco; preco -> spread volta', () => {
  const a = s.precoPorSpread(e, p, 500)
  const pct = a.spread / a.precoFinal
  const b = s.precoPorSpreadPct(e, p, pct)
  assert.ok(Math.abs(a.precoFinal - b.precoFinal) <= 0.02)
  assert.ok(Math.abs(s.spreadPorPreco(e, p, a.precoFinal) - 500) <= 0.02)
})
test('lucro minimo vale o maior entre % e valor; custo financeiro proporcional ao prazo', () => {
  assert.equal(s.lucroMinimoRbr({ ...e, frete: 1000, pedagio: 0, seguroTag: 0 }, p), 250)
  assert.equal(s.lucroMinimoRbr(e, p), s.r2(4420 * 0.15))
  assert.equal(s.custoFinanceiro({ ...e, prazoDias: 0 }, p), 0)
  assert.equal(s.custoFinanceiro({ ...e, prazoDias: 60 }, p), s.r2(4420 * 0.025 * 2))
})
test('piso ANTT bloqueia, spread negativo bloqueia, limite avisa', () => {
  const base = s.precoPorSpread(e, p, 0).precoFinal
  assert.match(s.avaliar(e, p, base + 100, 0).erro ?? '', /piso/)
  assert.match(s.avaliar(e, p, 0, -1).erro ?? '', /negativo/)
  assert.equal(s.avaliar(e, p, base - 0.2, 0).erro, null)
  assert.ok(s.avaliar(e, p, base - 0.2, 0).aviso)
  const ok = s.avaliar(e, p, base - 500, 600)
  assert.equal(ok.erro, null)
  assert.equal(ok.spreadLiquido, 590.1)
  assert.ok(Math.abs(ok.margemPct - 600 / ok.precoFinal) < 1e-9)
})
