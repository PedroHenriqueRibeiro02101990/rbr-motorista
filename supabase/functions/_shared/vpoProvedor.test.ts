// node --test supabase/functions/_shared/vpoProvedor.test.ts   (sem rede, sem segredos)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  criarProvedorNsPedagio,
  criarProvedorRepom,
  criarProvedorVpo,
  fornecedorVpoConfigurado,
  MENSAGEM_NAO_IMPLEMENTADO,
  situacaoVpo,
  VpoNaoImplementado,
  type PedidoVpo,
} from './vpoProvedor.ts'
import { montarMdfe, type DadosMdfe } from '../emitir-mdfe/mdfe.ts'

const PEDIDO: PedidoVpo = {
  operacaoId: '00000000-0000-0000-0000-000000000001',
  cnpjResponsavelPagamento: '69115969000104',
  placas: ['AAA1A11'],
  categoriaCombinacao: '07',
  origemIbge: '3550308',
  destinoIbge: '3509502',
  valorEstimado: 50,
  inicioViagem: '2026-10-24T08:00:00-03:00',
}

test('fornecedor não configurado: nenhum provedor, fluxo manual como hoje', () => {
  for (const v of [undefined, null, '', '  ', 'outro', 'sem_parar']) {
    assert.equal(fornecedorVpoConfigurado(v), null, String(v))
    assert.equal(criarProvedorVpo(v), null, String(v))
  }
  const s = situacaoVpo({ pedagio: 107.8, vpoIdvpo: null, fornecedor: null })
  assert.equal(s.aplicavel, true)
  assert.equal(s.modo, 'manual')
  assert.equal(s.status, 'pendente')
  assert.match(s.rotulo, /^VPO manual/)
  // IDVPO digitado à mão continua valendo
  const informado = situacaoVpo({ pedagio: 107.8, vpoIdvpo: ' 123456 ', fornecedor: null })
  assert.equal(informado.status, 'informado')
  assert.equal(informado.rotulo, 'IDVPO 123456')
  // rota sem pedágio: não se aplica
  assert.equal(situacaoVpo({ pedagio: 0, vpoIdvpo: null, fornecedor: null }).status, 'nao_aplicavel')
  assert.equal(situacaoVpo({ pedagio: null, vpoIdvpo: null, fornecedor: null }).status, 'nao_aplicavel')
})

test('fornecedor escolhido mas sem compra: VPO fica pendente com o nome do fornecedor', () => {
  assert.equal(fornecedorVpoConfigurado(' NSPEDAGIO '), 'nspedagio')
  assert.equal(fornecedorVpoConfigurado('Repom'), 'repom')
  const s = situacaoVpo({ pedagio: 50, vpoIdvpo: '', fornecedor: 'nspedagio' })
  assert.equal(s.modo, 'fornecedor')
  assert.equal(s.status, 'pendente')
  assert.match(s.rotulo, /NSPEDÁGIO/)
})

test('NSPEDÁGIO e Repom: emitir, consultar e cancelar lançam "não implementado — aguardando manual", sem rede', async () => {
  const fetchOriginal = globalThis.fetch
  let chamouRede = false
  globalThis.fetch = (() => {
    chamouRede = true
    throw new Error('não deveria chamar a rede')
  }) as typeof fetch
  try {
    for (const p of [criarProvedorNsPedagio(), criarProvedorRepom(), criarProvedorVpo('nspedagio')!, criarProvedorVpo('repom')!]) {
      for (const chamada of [() => p.emitir(PEDIDO), () => p.consultar('123'), () => p.cancelar('123', 'motivo do teste')]) {
        await assert.rejects(chamada, (e: unknown) => {
          assert.ok(e instanceof VpoNaoImplementado)
          assert.equal(e.codigo, 'NAO_IMPLEMENTADO')
          assert.ok(e.message.includes(MENSAGEM_NAO_IMPLEMENTADO))
          return true
        })
      }
    }
    assert.equal(criarProvedorNsPedagio().fornecedor, 'nspedagio')
    assert.equal(criarProvedorRepom().fornecedor, 'repom')
  } finally {
    globalThis.fetch = fetchOriginal
  }
  assert.equal(chamouRede, false)
})

// MDF-e: a regra existente não muda com o fornecedor. Rota com pedágio e sem IDVPO bloqueia; com IDVPO, valor e
// CNPJ da fornecedora, libera. Mínimo de dados do MDF-e em produção para isolar o bloqueio do VPO.
function mdfe(ciotVpo: Record<string, unknown>, pedagio: number) {
  const d: DadosMdfe = {
    op: {
      ambiente_fiscal: 'producao', ie_configurada: true, emitente_cnpj: '69115969000104', emitente_ie: '1', emitente_razao_social: 'RBR',
      veiculo_id: 'v', veiculo_rntrc_ativo: true, motorista_id: 'm', motorista_rntrc_ativo: true, motorista_nome: 'X', motorista_cpf: '11144477735',
      cidade_origem: 'SAO PAULO', uf_origem: 'SP', cidade_destino: 'CAMPINAS', uf_destino: 'SP', valor_nf: 5000,
    },
    pf: null,
    municipioEmitente: null,
    cte: { status: 'emitido', chave_acesso: '1'.repeat(44) },
    tracao: null,
    reboques: [],
    carregamento: { codigo_ibge: '3550308', cidade: 'São Paulo' },
    descarregamento: { codigo_ibge: '3509502', cidade: 'Campinas' },
    cotacao: { peso_bruto_kg: 1000, tipo_carga: 'Carga geral', produto: 'X', ncm: '49111090', pedagio },
    apolice: null,
    motorista: null,
    cliente: null,
    ciotVpo: { numero_averbacao: 'AVB', ...ciotVpo },
    condicao: null,
    agora: new Date('2026-10-24T12:00:00Z'),
  }
  return montarMdfe(d).bloqueios.filter((b) => /Vale-Ped/.test(b))
}

test('MDF-e continua bloqueado sem IDVPO quando há pedágio (com ou sem fornecedor configurado)', () => {
  const semIdvpo = mdfe({}, 107.8)
  assert.equal(semIdvpo.length, 1)
  assert.match(semIdvpo[0], /IDVPO\) não informado/)
  // situacaoVpo não mexe na regra: pendente no fornecedor = mesmo bloqueio no MDF-e
  assert.equal(situacaoVpo({ pedagio: 107.8, vpoIdvpo: null, fornecedor: 'repom' }).status, 'pendente')
  assert.deepEqual(mdfe({ vpo_idvpo: null }, 107.8), semIdvpo)
  // IDVPO sem valor nem CNPJ da fornecedora também bloqueia
  assert.equal(mdfe({ vpo_idvpo: '123456' }, 107.8).length, 2)
  // completo: libera
  assert.deepEqual(mdfe({ vpo_idvpo: '123456', vpo_valor: 107.8, vpo_cnpj_fornecedora: '11222333000181' }, 107.8), [])
  // sem pedágio: não exige
  assert.deepEqual(mdfe({}, 0), [])
})
