// Testes da linha do tempo da operação (src/lib/etapasOperacao.ts). Rodar na raiz do repositório:
//   node --test gestor/test/etapasOperacao.test.ts
// Fica fora de src/ porque o tsc do gestor não carrega os tipos do Node (node:test).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etapasDaOperacao, pendenciasLiberacao, proximoPasso } from '../src/lib/etapasOperacao.ts'
import type { DetalheOperacao } from '../src/lib/operacaoDetalhe'

type DocParcial = { tipo: string; status: string; exigido: boolean; dispensa_motivo?: string | null; conferencia_status?: string; referencia?: string | null; chave_acesso?: string | null; numero_documento?: string | null; arquivo_path?: string | null; ambiente?: string | null }

function op(opts: {
  docs: DocParcial[]
  tipoDoc?: string | null
  frotaPropria?: boolean
  pedagio?: number
  condicao?: boolean
  alocado?: boolean
  status?: string
  rcv?: string | null
  ciot?: string | null
  vpo?: string | null
}): DetalheOperacao {
  return {
    operacao: {
      id: 'op',
      status: opts.status ?? 'aguardando_liberacao_fiscal',
      tipo_documento_cliente: opts.tipoDoc === undefined ? 'cte_mdfe' : opts.tipoDoc,
      veiculo_id: opts.alocado === false ? null : 'v',
      pessoa_alocada_id: opts.alocado === false ? null : 'p',
      bloqueio_fiscal: false,
      liberada_em: null,
    },
    cotacao: { pedagio: opts.pedagio ?? 0 },
    veiculo: opts.alocado === false ? null : { is_veiculo_proprio: opts.frotaPropria ?? false },
    condicao: opts.condicao === false ? null : { id: 'c' },
    documentos: opts.docs.map((x) => ({
      dispensa_motivo: null,
      conferencia_status: 'nao_conferido',
      referencia: null,
      chave_acesso: null,
      numero_documento: null,
      arquivo_path: null,
      ambiente: 'producao',
      ...x,
    })),
    averbacaoRcv: opts.rcv ? { averbacao_rcv_status: opts.rcv, averbacao_rcv_numero: null, averbacao_rcv_erro: null, averbacao_rcv_resposta: null, averbacao_rcv_em: null } : null,
    ciotVpo: { ciot: opts.ciot ?? null, ciot_status: null, ciot_origem: null, ciot_ambiente: null, vpo_idvpo: opts.vpo ?? null, numero_averbacao: null },
  } as unknown as DetalheOperacao
}

const TESTE = 'Operação de teste (eh_teste)'

// Operação de teste de R$ 1,00 como está no banco em 2026-10-16.
const opTeste = op({
  rcv: 'emitido',
  docs: [
    { tipo: 'cte', status: 'emitido', exigido: true, referencia: 'r', chave_acesso: 'k', numero_documento: '3' },
    { tipo: 'mdfe', status: 'emitido', exigido: true, referencia: 'r', chave_acesso: 'k', numero_documento: '2' },
    { tipo: 'atm', status: 'emitido', exigido: false, dispensa_motivo: TESTE, numero_documento: 'O8CK' },
    { tipo: 'ciot', status: 'pendente', exigido: false, dispensa_motivo: TESTE },
    { tipo: 'vpo', status: 'pendente', exigido: false, dispensa_motivo: TESTE },
    { tipo: 'gr', status: 'pendente', exigido: false, dispensa_motivo: TESTE },
    { tipo: 'wialon', status: 'pendente', exigido: false, dispensa_motivo: TESTE },
    { tipo: 'aet', status: 'pendente', exigido: false, dispensa_motivo: TESTE },
  ],
})

test('operação de teste: CT-e, Allianz, MDF-e e Sompo concluídos; sem CIOT/GR/AET; pronta para liberar', () => {
  const e = etapasDaOperacao(opTeste)
  assert.deepEqual(
    e.map((x) => [x.id, x.estado]),
    [
      ['motorista', 'concluida'],
      ['documento', 'concluida'],
      ['averbacao_allianz', 'concluida'],
      ['pagamento', 'concluida'],
      ['mdfe', 'concluida'],
      ['averbacao_sompo', 'concluida'],
      ['liberar', 'atual'],
    ],
  )
  assert.deepEqual(pendenciasLiberacao(opTeste), { bloqueiam: [], ressalvaveis: [] })
  const p = proximoPasso(opTeste, e)
  assert.equal(p.texto, 'Liberar para coleta')
  assert.equal(p.pronto, true)
})

test('frota própria: sem CIOT e sem pagamento ao motorista', () => {
  const o = op({
    frotaPropria: true,
    docs: [
      { tipo: 'cte', status: 'pendente', exigido: true },
      { tipo: 'mdfe', status: 'pendente', exigido: true },
      { tipo: 'ciot', status: 'pendente', exigido: true },
      { tipo: 'atm', status: 'pendente', exigido: true },
    ],
  })
  const ids = etapasDaOperacao(o).map((x) => x.id)
  assert.ok(!ids.includes('ciot'))
  assert.ok(!ids.includes('pagamento'))
  assert.equal(proximoPasso(o).texto, 'Emitir o CT-e na tela Fiscal')
})

test('NFS-e (intramunicipal): sem MDF-e nem averbações', () => {
  const o = op({ tipoDoc: 'nfse', docs: [{ tipo: 'nfse', status: 'pendente', exigido: true }] })
  const ids = etapasDaOperacao(o).map((x) => x.id)
  assert.deepEqual(ids, ['motorista', 'documento', 'pagamento', 'liberar'])
  assert.equal(etapasDaOperacao(o)[1].titulo, 'NFS-e')
})

test('parceiro TAC com pedágio: etapa "CIOT e vale-pedágio" até ter os dois', () => {
  const docs: DocParcial[] = [
    { tipo: 'cte', status: 'emitido', exigido: true, referencia: 'r', chave_acesso: 'k' },
    { tipo: 'ciot', status: 'pendente', exigido: true },
    { tipo: 'vpo', status: 'pendente', exigido: true },
  ]
  const sem = etapasDaOperacao(op({ pedagio: 50, docs }))
  assert.equal(sem.find((x) => x.id === 'ciot')?.titulo, 'CIOT e vale-pedágio')
  assert.equal(sem.find((x) => x.id === 'ciot')?.estado, 'atual')
  const com = etapasDaOperacao(op({ pedagio: 50, docs, ciot: '123456789012', vpo: 'ID1' }))
  assert.equal(com.find((x) => x.id === 'ciot')?.estado, 'concluida')
})

test('sem pedágio: só "CIOT"; documento que nem existe bloqueia a liberação', () => {
  const o = op({ docs: [{ tipo: 'ciot', status: 'pendente', exigido: true }, { tipo: 'cte', status: 'pendente', exigido: true }] })
  assert.equal(etapasDaOperacao(o).find((x) => x.id === 'ciot')?.titulo, 'CIOT')
  assert.deepEqual(pendenciasLiberacao(o).bloqueiam, ['CIOT', 'CT-e'])
})

test('MDF-e emitido sem resultado da Sompo: processando; erro vira problema e passa à frente', () => {
  const docs: DocParcial[] = [
    { tipo: 'cte', status: 'emitido', exigido: true },
    { tipo: 'mdfe', status: 'emitido', exigido: true },
  ]
  assert.equal(etapasDaOperacao(op({ docs })).find((x) => x.id === 'averbacao_sompo')?.estado, 'processando')
  const comErro = op({ docs, rcv: 'erro' })
  assert.equal(proximoPasso(comErro).texto, 'Resolver: Averbação Sompo (RC-V) - MDF-e')
})

test('sem motorista: primeiro passo é alocar', () => {
  const o = op({ alocado: false, condicao: false, status: 'alocando_motorista', docs: [] })
  assert.equal(proximoPasso(o).texto, 'Alocar motorista e veículo')
})
