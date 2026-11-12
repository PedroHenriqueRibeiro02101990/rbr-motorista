// node --test gestor/test/fornecedorFiscal.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloqueioTroca, opcoesFornecedor, padraoDoCatalogo, podeTrocarFornecedor, rotuloEtapa, seletorVisivel, textoEmpresa, type FornecedorFiscal } from '../src/lib/fornecedorFiscal.ts'

const CAT: FornecedorFiscal[] = [
  { id: 'repom', nome: 'Repom', capacidades: ['ciot', 'vpo'], ativo: true, disponivel_emissao: false, ordem: 20 },
  { id: 'nstech', nome: 'NSTech', capacidades: ['ciot', 'vpo'], ativo: true, disponivel_emissao: true, ordem: 10, padrao_ciot: true, padrao_vpo: true },
  { id: 'so_vale', nome: 'Só vale', capacidades: ['vpo'], ativo: true, disponivel_emissao: true, ordem: 30 },
  { id: 'velho', nome: 'Velho', capacidades: ['ciot', 'vpo'], ativo: false, disponivel_emissao: true, ordem: 40 },
]

test('padrão nstech e texto "(padrão)" quando não houve escolha', () => {
  assert.equal(padraoDoCatalogo(CAT, 'ciot'), 'nstech')
  assert.equal(textoEmpresa('vpo', null, CAT, false), 'NSTech (padrão)')
  assert.equal(textoEmpresa('vpo', 'nstech', CAT, false), 'NSTech')
  assert.equal(textoEmpresa('ciot', 'nstech', CAT, true), 'Emitido por NSTech')
})

test('opções: só ativos com a capacidade do cartão; indisponíveis desabilitados "em implantação"', () => {
  const ciot = opcoesFornecedor(CAT, 'ciot')
  assert.deepEqual(ciot.map((o) => o.id), ['nstech', 'repom'])
  assert.equal(ciot[1].desabilitada, true)
  assert.match(ciot[1].rotulo, /em implantação/)
  assert.deepEqual(opcoesFornecedor(CAT, 'vpo').map((o) => o.id), ['nstech', 'repom', 'so_vale'])
})

test('escolha e troca antes de emitir; bloqueio depois de emitir', () => {
  assert.equal(bloqueioTroca('ciot', { ciotStatus: null }), null)
  assert.equal(bloqueioTroca('ciot', { ciotStatus: 'cancelado' }), null)
  assert.match(bloqueioTroca('ciot', { ciotStatus: 'emitido' })!, /Cancele antes de trocar a empresa/)
  assert.equal(bloqueioTroca('vpo', { vpoIdvpo: null }), null)
  assert.match(bloqueioTroca('vpo', { vpoIdvpo: '669' })!, /Cancele antes de trocar a empresa/)
  assert.match(bloqueioTroca('vpo', { vpoEmAndamento: true })!, /Cancele antes/)
  // o bloqueio de um cartão não afeta o outro
  assert.equal(bloqueioTroca('vpo', { ciotStatus: 'emitido' }), null)
})

test('só Fiscal e gestor trocam; outros papéis não', () => {
  assert.equal(podeTrocarFornecedor('fiscal'), true)
  assert.equal(podeTrocarFornecedor('gestor_rbr'), true)
  for (const p of ['comercial', 'operacao', 'financeiro', 'agenciador', 'condutor', null, undefined]) assert.equal(podeTrocarFornecedor(p), false)
})

test('demonstração ignora o seletor; flag desligada também', () => {
  assert.equal(seletorVisivel(true, true), false)
  assert.equal(seletorVisivel(false, false), false)
  assert.equal(seletorVisivel(true, false), true)
})

test('rótulo da etapa para esteira e pré-voo', () => {
  assert.equal(rotuloEtapa('vpo', 'nstech'), 'VPO: NSPEDAGIO')
  assert.equal(rotuloEtapa('ciot', 'nstech'), 'CIOT: efrete')
  assert.equal(rotuloEtapa('vpo', 'repom', 'Repom'), 'VPO: Repom')
})

import { rotulosFornecedores } from '../src/lib/fornecedorFiscal.ts'
test('esteira e pré-voo: fornecedor de cada etapa, "(padrão)" sem escolha e "emitido por" depois de emitir', () => {
  assert.deepEqual(rotulosFornecedores(CAT, null), { ciot: 'CIOT: efrete (padrão)', vpo: 'VPO: NSPEDAGIO (padrão)' })
  assert.equal(rotulosFornecedores(CAT, { vpo_fornecedor: 'nstech' }).vpo, 'VPO: NSPEDAGIO')
  const emitido = rotulosFornecedores(CAT, { ciot_fornecedor: 'nstech', ciot_status: 'emitido', vpo_idvpo: '669' })
  assert.equal(emitido.ciot, 'CIOT: efrete · emitido por NSTech')
  assert.equal(emitido.vpo, 'VPO: NSPEDAGIO · emitido por NSTech')
  // CIOT cancelado volta a "a emitir" com o fornecedor atual
  assert.equal(rotulosFornecedores(CAT, { ciot_status: 'cancelado' }).ciot, 'CIOT: efrete (padrão)')
})

test('demonstração: seletor e texto novo não aparecem com a flag ligada nem desligada', () => {
  for (const flag of [true, false]) assert.equal(seletorVisivel(flag, true), false)
})
test('flag desligada: nada novo em nenhuma operação; ligada em operação comum: seletor e fornecedor aparecem', () => {
  assert.equal(seletorVisivel(false, false), false)
  assert.equal(seletorVisivel(true, false), true)
  assert.equal(rotulosFornecedores(CAT, null).vpo, 'VPO: NSPEDAGIO (padrão)')
})
test('papel sem permissão vê o fornecedor mas não troca', () => {
  assert.equal(podeTrocarFornecedor('operacao'), false)
  assert.equal(rotulosFornecedores(CAT, { vpo_fornecedor: 'nstech' }).vpo, 'VPO: NSPEDAGIO')
})
