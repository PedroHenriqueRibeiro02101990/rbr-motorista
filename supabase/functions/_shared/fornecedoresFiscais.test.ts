// node --test --experimental-strip-types supabase/functions/_shared/fornecedoresFiscais.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarProvedor, fornecedorEfetivo, guardaFornecedor, padraoDo, type FornecedorFiscal } from './fornecedoresFiscais.ts'

const NSTECH: FornecedorFiscal = { id: 'nstech', nome: 'NSTech', capacidades: ['ciot', 'vpo'], ativo: true, disponivel_emissao: true, padrao_ciot: true, padrao_vpo: true }
const REPOM: FornecedorFiscal = { id: 'repom', nome: 'Repom', capacidades: ['ciot', 'vpo'], ativo: true, disponivel_emissao: false }
const CAT = [NSTECH, REPOM]

test('padrão é nstech para CIOT e VPO', () => {
  assert.equal(padraoDo(CAT, 'ciot'), 'nstech')
  assert.equal(padraoDo(CAT, 'vpo'), 'nstech')
  assert.deepEqual(fornecedorEfetivo({ tipo: 'vpo', escolha: null, catalogo: CAT }), { id: 'nstech', doPadrao: true })
})

test('CIOT e VPO podem ter fornecedores diferentes na mesma operação', () => {
  const escolha = { ciot_fornecedor: 'nstech', vpo_fornecedor: 'repom' }
  assert.equal(fornecedorEfetivo({ tipo: 'ciot', escolha, catalogo: CAT }).id, 'nstech')
  assert.equal(fornecedorEfetivo({ tipo: 'vpo', escolha, catalogo: CAT }).id, 'repom')
})

test('cancelar usa o fornecedor de origem mesmo se o padrão mudou depois', () => {
  const catalogoNovo = [{ ...NSTECH, padrao_vpo: false }, { ...REPOM, disponivel_emissao: true, padrao_vpo: true }]
  // vale emitido quando o padrão era nstech: a escolha gravada continua valendo
  assert.equal(fornecedorEfetivo({ tipo: 'vpo', escolha: { vpo_fornecedor: 'nstech' }, catalogo: catalogoNovo }).id, 'nstech')
  // sem escolha gravada, vale o padrão atual
  assert.equal(fornecedorEfetivo({ tipo: 'vpo', escolha: null, catalogo: catalogoNovo }).id, 'repom')
})

test('demonstração ignora a escolha e o padrão: sempre nstech', () => {
  assert.equal(fornecedorEfetivo({ tipo: 'ciot', escolha: { ciot_fornecedor: 'repom' }, catalogo: CAT, demo: true }).id, 'nstech')
})

test('fornecedor sem adaptador responde erro claro, sem chamar ninguém', () => {
  let chamou = false
  const adaptadores = { nstech: () => { chamou = true; return 'ok' } }
  const r = criarProvedor(adaptadores, CAT, 'vpo', 'repom')
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.erro, 'Fornecedor Repom ainda não está disponível para emitir.')
  assert.equal(chamou, false)
  // disponível no catálogo mas sem adaptador registrado: mesmo erro
  const r2 = criarProvedor(adaptadores, [NSTECH, { ...REPOM, disponivel_emissao: true }], 'ciot', 'repom')
  assert.equal(r2.ok, false)
  assert.equal(chamou, false)
  assert.equal(criarProvedor(adaptadores, CAT, 'ciot', 'nstech').ok, true)
})

function falso(catalogo: unknown, escolha: unknown, erroEscolha = false) {
  return {
    from: (t: string) => ({
      select: () => {
        const lista = Promise.resolve({ data: catalogo, error: null })
        return Object.assign(lista, { eq: () => ({ maybeSingle: () => Promise.resolve({ data: escolha, error: erroEscolha ? { message: 'x' } : null }) }) })
      },
      _t: t,
    }),
  }
}

test('guarda das funções: nstech passa; repom escolhido bloqueia; demo e falha de leitura não bloqueiam', async () => {
  assert.deepEqual(await guardaFornecedor(falso(CAT, null), 'op', 'vpo', false), { ok: true, fornecedor: 'nstech' })
  const r = await guardaFornecedor(falso(CAT, { vpo_fornecedor: 'repom' }), 'op', 'vpo', false)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.erro, 'Fornecedor Repom ainda não está disponível para emitir.')
  assert.equal((await guardaFornecedor(falso(CAT, { vpo_fornecedor: 'repom' }), 'op', 'vpo', true)).ok, true)
  assert.equal((await guardaFornecedor(falso(null, null), 'op', 'ciot', false)).ok, true) // tabela ainda não existe
  assert.equal((await guardaFornecedor(falso(CAT, null, true), 'op', 'ciot', false)).ok, true)
})
