// Vale-pedágio obrigatório (VPO, Lei 10.209/2001): interface única do fornecedor, no mesmo espírito do ProvedorCiot
// (efreteClient.ts), para o resto do ERP não depender de quem vende o vale.
// Estado (2026-10-24): nenhum fornecedor escolhido. As duas implementações abaixo são vazias e lançam
// "não implementado — aguardando manual"; nada aqui faz chamada de rede.
// Sem fornecedor configurado (VPO_FORNECEDOR vazio), o fluxo continua o de hoje: o gestor compra o vale no portal e
// digita IDVPO, valor e CNPJ da fornecedora em operacao_ciot_vpo (vpo_idvpo, vpo_valor, vpo_cnpj_fornecedora,
// vpo_tipo, vpo_categoria_combinacao). O MDF-e continua exigindo o IDVPO quando a rota tem pedágio (mdfe.ts).
// Sem dependências do Deno (testes em vpoProvedor.test.ts).

export type FornecedorVpo = 'nspedagio' | 'repom'

export interface ErroVpo {
  codigo: string // NAO_IMPLEMENTADO ou o código do fornecedor
  mensagem: string
  protocolo?: string
}
export type ResultadoVpo<T> = { ok: true; dados: T } | { ok: false; erro: ErroVpo }

// O que a operação já sabe para comprar o vale (operacoes + veículos + rota). Os campos que o fornecedor pedir a
// mais entram aqui quando o manual chegar.
export interface PedidoVpo {
  operacaoId: string
  cnpjResponsavelPagamento: string // a RBR (embarcadora/contratante paga o vale)
  placas: string[] // tração + reboques
  categoriaCombinacao: string | null // mesma tabela do MDF-e (categoriaCombinacao em mdfe.ts)
  origemIbge: string | null
  destinoIbge: string | null
  valorEstimado: number | null // cotacoes.pedagio
  inicioViagem: string | null // ISO
}

// Espelha as colunas vpo_* de operacao_ciot_vpo, que o MDF-e lê.
export interface VpoEmitido {
  idvpo: string
  valor: number
  cnpjFornecedora: string
  tipo: string | null
  categoriaCombinacao: string | null
  protocolo: string | null
}

export interface SituacaoVpoFornecedor {
  idvpo: string
  status: 'emitido' | 'cancelado' | 'utilizado' | 'desconhecido'
  valor: number | null
}

export interface ProvedorVpo {
  readonly fornecedor: FornecedorVpo
  emitir(pedido: PedidoVpo): Promise<ResultadoVpo<VpoEmitido>>
  consultar(idvpo: string): Promise<ResultadoVpo<SituacaoVpoFornecedor>>
  cancelar(idvpo: string, motivo: string): Promise<ResultadoVpo<{ protocolo: string | null }>>
}

export const MENSAGEM_NAO_IMPLEMENTADO = 'não implementado — aguardando manual'

export class VpoNaoImplementado extends Error {
  readonly codigo = 'NAO_IMPLEMENTADO'
  readonly fornecedor: FornecedorVpo
  readonly metodo: 'emitir' | 'consultar' | 'cancelar'
  constructor(fornecedor: FornecedorVpo, metodo: 'emitir' | 'consultar' | 'cancelar') {
    super(`${NOME_FORNECEDOR[fornecedor]} (${metodo}): ${MENSAGEM_NAO_IMPLEMENTADO}`)
    this.name = 'VpoNaoImplementado'
    this.fornecedor = fornecedor
    this.metodo = metodo
  }
}

export const NOME_FORNECEDOR: Record<FornecedorVpo, string> = { nspedagio: 'NSPEDÁGIO', repom: 'Repom' }

function naoImplementado(fornecedor: FornecedorVpo): ProvedorVpo {
  return {
    fornecedor,
    emitir: () => Promise.reject(new VpoNaoImplementado(fornecedor, 'emitir')),
    consultar: () => Promise.reject(new VpoNaoImplementado(fornecedor, 'consultar')),
    cancelar: () => Promise.reject(new VpoNaoImplementado(fornecedor, 'cancelar')),
  }
}

// NSPEDÁGIO. Aguardando o manual da API.
export function criarProvedorNsPedagio(): ProvedorVpo {
  return naoImplementado('nspedagio')
}

// Repom: fornecedora usada até aqui pelo portal (CIOT origem 'rbr_repom' e IDVPO digitado à mão). Aguardando o
// manual da API para trocar a digitação pela compra direta.
export function criarProvedorRepom(): ProvedorVpo {
  return naoImplementado('repom')
}

// Fornecedor configurado (variável VPO_FORNECEDOR, não é segredo). Vazio ou desconhecido = null = fluxo manual.
export function fornecedorVpoConfigurado(valor: string | null | undefined): FornecedorVpo | null {
  const v = String(valor ?? '').trim().toLowerCase()
  return v === 'nspedagio' || v === 'repom' ? v : null
}

export function criarProvedorVpo(valor: string | null | undefined): ProvedorVpo | null {
  const f = fornecedorVpoConfigurado(valor)
  if (f === 'nspedagio') return criarProvedorNsPedagio()
  if (f === 'repom') return criarProvedorRepom()
  return null
}

// Situação do VPO de uma operação (cotacoes.pedagio + operacao_ciot_vpo.vpo_idvpo + fornecedor configurado).
// Não muda nenhuma regra: o bloqueio do MDF-e sem IDVPO continua em mdfe.ts. Aqui só se decide o que mostrar.
export type SituacaoVpo =
  | { aplicavel: false; modo: null; status: 'nao_aplicavel'; rotulo: string }
  | { aplicavel: true; modo: 'manual' | 'fornecedor'; status: 'pendente' | 'informado'; rotulo: string; fornecedor: FornecedorVpo | null }

export function situacaoVpo(d: { pedagio: number | null | undefined; vpoIdvpo: string | null | undefined; fornecedor: FornecedorVpo | null }): SituacaoVpo {
  if (!(Number(d.pedagio) > 0)) return { aplicavel: false, modo: null, status: 'nao_aplicavel', rotulo: 'Rota sem pedágio: sem vale-pedágio' }
  const idvpo = String(d.vpoIdvpo ?? '').trim()
  const modo = d.fornecedor ? 'fornecedor' : 'manual'
  if (idvpo) return { aplicavel: true, modo, status: 'informado', rotulo: `IDVPO ${idvpo}`, fornecedor: d.fornecedor }
  return {
    aplicavel: true,
    modo,
    status: 'pendente',
    rotulo: d.fornecedor
      ? `VPO pendente: aguardando a compra pela ${NOME_FORNECEDOR[d.fornecedor]}`
      : 'VPO manual: compre no portal do fornecedor e preencha o IDVPO',
    fornecedor: d.fornecedor,
  }
}
