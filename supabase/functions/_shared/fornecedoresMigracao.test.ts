// Revisão em texto da migração 20261112-1100 e do rollback. node --test --experimental-strip-types supabase/functions/_shared/fornecedoresMigracao.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dir = new URL('../../../', import.meta.url)
const mig = readFileSync(new URL('supabase-migrations/20261112-1100-fornecedores-fiscais.sql', dir), 'utf8').replace(/\r\n/g, '\n')
const rol = readFileSync(new URL('supabase/rollback/rollback-20261112-1100-fornecedores-fiscais.sql', dir), 'utf8').replace(/\r\n/g, '\n')

test('migração só aditiva: nada apagado nem alterado de dados existentes', () => {
  assert.doesNotMatch(mig, /\bdrop\s+(table|column|index|function)\b/i)
  assert.doesNotMatch(mig, /\b(delete\s+from|truncate)\b/i)
  assert.doesNotMatch(mig, /\bupdate\s+public\.(operacoes|operacao_ciot_vpo|efrete_ciot_pedidos|vpo_requisicoes)\b/i)
  assert.doesNotMatch(mig, /alter\s+table[^;]*\b(drop|alter\s+column|rename)\b/i)
  assert.match(mig, /on conflict \(id\) do nothing/)
})
test('RLS ligado e forçado; leitura só gestor; sem escrita para usuário', () => {
  assert.match(mig, /enable row level security/)
  assert.match(mig, /force row level security/)
  assert.match(mig, /for select to authenticated\s+using \(public\.current_papel\(\)::text = 'gestor_rbr'\)/)
  assert.doesNotMatch(mig, /create policy[^;]*for (insert|update|delete|all)/i)
  assert.match(mig, /revoke insert, update, delete on public\.fornecedores_fiscais from authenticated/)
})
test('valores iniciais: nstech (ciot e vpo, disponível, padrão) e repom (ativa, indisponível)', () => {
  assert.match(mig, /\('nstech'.*array\['ciot','vpo'\], true, true,\s+'homologacao', 10, true,\s+true\)/)
  assert.match(mig, /\('repom'.*array\['ciot','vpo'\], true, false, 'homologacao', 20, false, false\)/)
})
test('funções: papel checado, demo recusada, trava de emissão e execute só para autenticados', () => {
  assert.match(mig, /not in \('fiscal', 'gestor_rbr'\)/)
  assert.match(mig, /<> 'gestor_rbr'/)
  assert.match(mig, /modo_demonstracao/)
  assert.match(mig, /cancele antes de trocar a empresa/)
  assert.match(mig, /revoke all on function public\.escolher_fornecedor_fiscal\(uuid, text, text\) from public, anon/)
  assert.match(mig, /grant execute on function public\.escolher_fornecedor_fiscal\(uuid, text, text\) to authenticated/)
})
test('rollback desfaz tudo que a migração criou', () => {
  for (const f of ['escolher_fornecedor_fiscal', 'definir_fornecedor_padrao']) assert.match(rol, new RegExp(`drop function if exists public\.${f}`))
  for (const c of ['ciot_fornecedor', 'vpo_fornecedor', 'fornecedor_escolhido_por', 'fornecedor_escolhido_em']) {
    assert.match(mig, new RegExp(`add column if not exists ${c}[ ,;]`))
    assert.match(rol, new RegExp(`drop column if exists ${c}[ ,;]`))
  }
  assert.match(rol, /drop table if exists public\.fornecedores_fiscais/)
})
