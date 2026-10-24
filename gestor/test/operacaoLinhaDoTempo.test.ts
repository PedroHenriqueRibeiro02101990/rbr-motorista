// Testes da tela Operação (linha do tempo, painel lateral, cartão da GR). Rodar na raiz do repositório:
//   node --test gestor/test/operacaoLinhaDoTempo.test.ts
// Dados de exemplo: nenhum CPF, placa ou nome real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAPAS_PRINCIPAIS,
  etapasDaOperacao,
  pendenciasLiberacao,
  rotuloAcaoDocumento,
  separarEtapas,
  visualEtapa,
} from '../src/lib/etapasOperacao.ts'
import { dadosMotoristaVeiculo, faltandoCopia, textoCopia } from '../src/lib/copiaOperacao.ts'
import type { DetalheOperacao } from '../src/lib/operacaoDetalhe'

// Operação de exemplo em cte_mdfe, alocada, sem pedágio. `docs` são os documentos da operação.
function detalhe(docs: Record<string, unknown>[], extra: Record<string, unknown> = {}): DetalheOperacao {
  return {
    operacao: {
      id: 'op-exemplo',
      status: 'aguardando_liberacao_fiscal',
      tipo_documento_cliente: 'cte_mdfe',
      veiculo_id: 'v',
      pessoa_alocada_id: 'p',
      bloqueio_fiscal: false,
      liberada_em: null,
    },
    cotacao: { pedagio: 0 },
    veiculo: { is_veiculo_proprio: false, placa: 'ABC1D23' },
    reboques: [{ placa: 'EFG4H56' }],
    motorista: { nome: 'Motorista Exemplo', cpf: '000.000.000-00', cnh_numero_registro: '00000000000' },
    titular: { nome: 'Proprietário Exemplo' },
    condicao: { id: 'c' },
    documentos: docs.map((x) => ({
      dispensa_motivo: null,
      conferencia_status: 'nao_conferido',
      referencia: null,
      chave_acesso: null,
      numero_documento: null,
      arquivo_path: null,
      ambiente: 'producao',
      exigido: true,
      status: 'pendente',
      ...x,
    })),
    apolice: null,
    ciotVpo: null,
    averbacaoRcv: null,
    ...extra,
  } as unknown as DetalheOperacao
}

test('etapas principais seguem o desenho: motorista, GR, CT-e, averbações, CIOT, MDF-e, liberação', () => {
  assert.deepEqual(ETAPAS_PRINCIPAIS, ['motorista', 'gr', 'documento', 'averbacao_allianz', 'ciot', 'mdfe', 'averbacao_sompo', 'liberar'])
})

test('separarEtapas: AET fica recolhida e a lista não abre quando a atual é uma principal', () => {
  const d = detalhe([{ tipo: 'gr' }, { tipo: 'aet' }, { tipo: 'cte' }, { tipo: 'mdfe' }])
  const { principais, recolhidas, abrirRecolhidas } = separarEtapas(etapasDaOperacao(d))
  assert.ok(principais.some((e) => e.id === 'gr'))
  assert.ok(!principais.some((e) => e.id === 'aet'))
  assert.ok(recolhidas.some((e) => e.id === 'aet'))
  assert.equal(abrirRecolhidas, false)
})

test('separarEtapas: abre a lista recolhida quando a etapa atual está entre as extras', () => {
  // O motorista já está alocado; a AET é a primeira pendente, então a atual cai entre as recolhidas.
  const d = detalhe([{ tipo: 'gr', status: 'emitido', conferencia_status: 'ok' }, { tipo: 'aet' }, { tipo: 'cte' }])
  const { recolhidas, abrirRecolhidas } = separarEtapas(etapasDaOperacao(d))
  assert.equal(recolhidas.find((e) => e.id === 'aet')?.estado, 'atual')
  assert.equal(abrirRecolhidas, true)
})

test('bolinhas: verde com ✓ = concluída; azul com anel = atual; cinza = futura; vermelho = problema', () => {
  assert.deepEqual(visualEtapa('concluida'), { cor: '#137A45', marca: '✓', anel: false })
  assert.deepEqual(visualEtapa('atual'), { cor: 'var(--rbr-navy)', marca: '', anel: true })
  assert.deepEqual(visualEtapa('futura'), { cor: '#B8BDCC', marca: '', anel: false })
  assert.equal(visualEtapa('problema').marca, '!')
})

test('GR aparece como "Pesquisa GR (Shogun)" na linha do tempo', () => {
  const d = detalhe([{ tipo: 'gr' }, { tipo: 'cte' }])
  assert.equal(etapasDaOperacao(d).find((e) => e.id === 'gr')?.titulo, 'Pesquisa GR (Shogun)')
})

test('GR exigida e não cumprida bloqueia a liberação para coleta', () => {
  const d = detalhe([{ tipo: 'gr' }, { tipo: 'cte' }])
  assert.ok(pendenciasLiberacao(d).bloqueiam.includes('Pesquisa GR'))
})

test('GR com comprovante conferido deixa de bloquear a liberação', () => {
  const d = detalhe([{ tipo: 'gr', conferencia_status: 'ok', status: 'emitido' }, { tipo: 'cte', status: 'emitido' }])
  assert.equal(pendenciasLiberacao(d).bloqueiam.includes('Pesquisa GR'), false)
})

test('upload por documento leva o nome dele: Subir/Trocar CT-e, MDF-e, CIOT, averbação, comprovante GR', () => {
  assert.equal(rotuloAcaoDocumento('cte', false), 'Subir CT-e')
  assert.equal(rotuloAcaoDocumento('cte', true), 'Trocar CT-e')
  assert.equal(rotuloAcaoDocumento('mdfe', false), 'Subir MDF-e')
  assert.equal(rotuloAcaoDocumento('ciot', false), 'Subir CIOT')
  assert.equal(rotuloAcaoDocumento('atm', false), 'Subir averbação')
  assert.equal(rotuloAcaoDocumento('gr', true), 'Trocar comprovante GR')
  assert.equal(rotuloAcaoDocumento('tipo_novo', false), 'Subir arquivo')
})

test('dados da GR: placas de cavalo e reboque juntas; motorista, CPF, CNH e proprietário', () => {
  const linhas = dadosMotoristaVeiculo(detalhe([]))
  assert.deepEqual(
    linhas.map((l) => [l.rotulo, l.valor]),
    [
      ['Motorista', 'Motorista Exemplo'],
      ['CPF', '000.000.000-00'],
      ['CNH', '00000000000'],
      ['Placas', 'ABC1D23 / EFG4H56'],
      ['Proprietário', 'Proprietário Exemplo'],
    ],
  )
})

test('dados da GR: campo faltando aparece na lista de faltas e no texto para colar', () => {
  const d = detalhe([], { motorista: { nome: 'Motorista Exemplo', cpf: null, cnh_numero_registro: null } })
  const linhas = dadosMotoristaVeiculo(d)
  assert.deepEqual(faltandoCopia(linhas), ['CPF', 'CNH'])
  assert.match(textoCopia(linhas), /CPF: \(faltando\)/)
})
