// node --test gestor/test/fiscalV3.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FISCAL_V3_HABILITADO } from '../src/lib/fiscalV3.ts'

const le = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('flag da aba Fiscal v3 sai desligada', () => assert.equal(FISCAL_V3_HABILITADO, false))

test('campo tipo_vale_pedagio nao existe no formulario novo nem no que ele envia', () => {
  const card = le('../src/components/operacao/CartaoFiscalManual.tsx')
  assert.ok(!/tipo_vale_pedagio|vpo_tipo|Tipo do vale/i.test(card))
})

test('operacao real manual mostra so o cartao novo; os cartoes NSTech/efrete so aparecem sem a flag ou em DEMO/teste', () => {
  const fiscal = le('../src/pages/Fiscal.tsx')
  assert.match(fiscal, /fiscalManualV3 = FISCAL_V3_HABILITADO && !modoDemonstracaoAtivo\(op, docs\) && op\.eh_teste !== true/)
  assert.match(fiscal, /ofereceCteMdfe && fiscalManualV3 && <CartaoFiscalManual/)
  assert.match(fiscal, /ofereceCteMdfe && !fiscalManualV3 && <CiotEfrete/)
  assert.match(fiscal, /ofereceCteMdfe && !fiscalManualV3 && <CartaoVpo/)
})

test('o bloco "Algo errado? Devolver esta operacao" continua como esta (fora do desenho)', () => {
  const esteira = le('../src/components/operacao/EsteiraV3.tsx')
  assert.match(esteira, /ALGO ERRADO\?/); assert.match(esteira, /DevolverOperacao/)
})

test('a esteira nova nao conta a averbacao como bloco e le do banco (nao de estado local)', () => {
  const esteira = le('../src/components/operacao/EsteiraV3.tsx')
  assert.match(esteira, /DE 4 CONCLUIDAS/)
  assert.match(esteira, /Averbacao RCTR-C \(automatica\)/); assert.match(esteira, /Aguardando o MDF-e/)
  assert.match(esteira, /postgres_changes/)
})
