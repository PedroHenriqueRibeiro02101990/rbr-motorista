// node --test supabase/functions/_shared/refDocumento.test.ts  (sem rede, sem Focus)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calcularRef, refBase, versaoDaRef } from './refDocumento.ts'

const OP = '11111111-2222-3333-4444-555555555555'

test('primeira emissao usa a ref de sempre (v1), sem sufixo', () => {
  assert.deepEqual(calcularRef('cte', OP, null), { ref: `rbr-cte-${OP}`, versao: 1, reemissao: false })
  assert.deepEqual(calcularRef('mdfe', OP, undefined), { ref: `rbr-mdfe-${OP}`, versao: 1, reemissao: false })
})
test('nada muda quando nao ha reemissao: tentativa depois de erro ou pendente mantem a ref gravada', () => {
  for (const status of ['erro', 'pendente', 'bloqueado', 'emitido']) {
    assert.equal(calcularRef('cte', OP, { referencia: `rbr-cte-${OP}`, status }).ref, `rbr-cte-${OP}`)
  }
  assert.equal(calcularRef('cte', OP, { referencia: `rbr-cte-${OP}-v2`, status: 'erro' }).ref, `rbr-cte-${OP}-v2`)
  assert.equal(calcularRef('mdfe', OP, { referencia: null, status: 'bloqueado' }).ref, `rbr-mdfe-${OP}`)
})
test('reemissao depois de cancelar usa v2, depois v3', () => {
  const v2 = calcularRef('cte', OP, { referencia: `rbr-cte-${OP}`, status: 'cancelado' })
  assert.deepEqual(v2, { ref: `rbr-cte-${OP}-v2`, versao: 2, reemissao: true })
  const v3 = calcularRef('cte', OP, { referencia: `rbr-cte-${OP}-v2`, status: 'cancelado' })
  assert.equal(v3.ref, `rbr-cte-${OP}-v3`)
})
test('MDF-e: reemissao depois de cancelar OU de encerrar; CT-e encerrado nao e tratado como final', () => {
  assert.equal(calcularRef('mdfe', OP, { referencia: `rbr-mdfe-${OP}`, status: 'cancelado' }).ref, `rbr-mdfe-${OP}-v2`)
  assert.equal(calcularRef('mdfe', OP, { referencia: `rbr-mdfe-${OP}`, status: 'emitido', encerrado_em: '2026-11-12T10:00:00Z' }).ref, `rbr-mdfe-${OP}-v2`)
  assert.equal(calcularRef('cte', OP, { referencia: `rbr-cte-${OP}`, status: 'emitido', encerrado_em: '2026-11-12T10:00:00Z' }).reemissao, false)
})
test('ref de outra operacao ou de outro tipo nunca e reaproveitada', () => {
  assert.equal(calcularRef('cte', OP, { referencia: 'rbr-cte-outra-op', status: 'erro' }).ref, `rbr-cte-${OP}`)
  assert.equal(versaoDaRef('lixo', refBase('cte', OP)), 1)
  assert.equal(versaoDaRef(`rbr-cte-${OP}-vx`, refBase('cte', OP)), 1)
})
test('historico preservado: a migracao cria a tabela de versoes com RLS forcado e sem escrita para usuario; as funcoes usam a ref calculada', () => {
  const dir = new URL('../../../', import.meta.url)
  const mig = readFileSync(new URL('supabase-migrations/20261112-1300-documentacao-versoes.sql', dir), 'utf8').replace(/\r\n/g, '\n')
  assert.doesNotMatch(mig, /\bdrop\s+(table|column|index|constraint)\b/i)
  assert.doesNotMatch(mig, /\b(delete\s+from|truncate)\b/i)
  assert.match(mig, /force row level security/)
  assert.match(mig, /revoke insert, update, delete on public\.documentacao_operacao_versoes from authenticated/)
  assert.doesNotMatch(mig, /create policy[^;]*for (insert|update|delete|all)/i)
  for (const f of ['emitir-cte', 'emitir-mdfe']) {
    const src = readFileSync(new URL(`supabase/functions/${f}/index.ts`, dir), 'utf8')
    assert.match(src, /calcularRef\(/)
    assert.doesNotMatch(src, /const ref = `rbr-/)
  }
})
