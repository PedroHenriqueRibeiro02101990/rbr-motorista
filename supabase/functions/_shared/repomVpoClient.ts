// Repom Vale-Pedágio (VPR, cliente 9501) como provedor de VPO. Agora é uma CAMADA FINA sobre repomVprClient.ts (o adaptador único):
// token próprio e consulta de TAG por placa. A EMISSÃO, o cancelamento e a consulta do vale não passam por aqui: o PedidoVpo
// genérico não traz motorista, transportador, filial nem roteiro; isso é feito pela edge function repom-vpo (repomOperacao.ts), com
// trava, confirmação humana e estado/idempotência. NÃO está ligado a nada: o provedor padrão continua sendo o NSPEDÁGIO.
import type { Fetch, ResultadoRepom } from "./repomClient.ts"
import { criarRepomVprClient, placaApta, type ConfigRepomVpr } from './repomVprClient.ts'
import { VpoNaoImplementado, type PedidoVpo, type ProvedorVpo, type ResultadoVpo, type SituacaoVpoFornecedor, type VpoEmitido } from './vpoProvedor.ts'


export type ConfigRepomVpo = ConfigRepomVpr

export interface TagVeiculo {
  placa: string
  possuiTag: boolean // ao menos uma administradora com a TAG ativa e apta ao vale-pedágio
  operadora: string | null
}

export interface RepomVpoClient extends ProvedorVpo {
  consultarTag(placa: string): Promise<ResultadoRepom<TagVeiculo>>
}

export function criarRepomVpoClient(config: ConfigRepomVpo, fetchFn?: Fetch): RepomVpoClient {
  const vpr = criarRepomVprClient(config, fetchFn)
  return {
    fornecedor: 'repom',
    async consultarTag(placa) {
      const r = await vpr.consultarTag(placa)
      if (!r.ok) return { ok: false, http: r.http, erro: r.erro, bruto: r.bruto }
      const apta = r.dados.find((t) => t.apto && t.codigoStatusTag === 1)
      return { ok: true, http: r.http, bruto: r.bruto, dados: { placa, possuiTag: placaApta(r.dados), operadora: apta?.nomeTag ?? null } }
    },
    // A emissão é feita pela função repom-vpo (com trava e confirmação). Aqui continua sem implementação de propósito.
    emitir: (_p: PedidoVpo): Promise<ResultadoVpo<VpoEmitido>> => Promise.reject(new VpoNaoImplementado('repom', 'emitir')),
    consultar: (_id: string): Promise<ResultadoVpo<SituacaoVpoFornecedor>> => Promise.reject(new VpoNaoImplementado('repom', 'consultar')),
    cancelar: (_id: string, _m: string): Promise<ResultadoVpo<{ protocolo: string | null }>> => Promise.reject(new VpoNaoImplementado('repom', 'cancelar')),
  }
}
