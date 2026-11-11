// Vale-pedágio que demora: regras puras (sem Deno, sem banco, sem rede) usadas pela função nspedagio-vpo.
// O NSPEDAGIO leva alguns minutos para comprar ou cancelar (teste de 11/11: ~3 min). A função corta a espera
// (LIMITE_CHAMADA_MS), marca a linha como "em processamento" e a tela confere o recibo sozinha.
// Testes: node --test supabase/functions/_shared/vpoAndamento.test.ts

import type { ProvedorNsPedagio, ResultadoNs, CompraVpo } from './nspedagioClient.ts'

// Abaixo do limite de 150 s da edge function, com folga para token e gravação.
export const LIMITE_CHAMADA_MS = 95_000
// Tempo que a tela espera pelo recibo antes de mostrar "Não confirmado".
export const ESPERA_MAXIMA_MS = 5 * 60_000
export const INTERVALO_RECIBO_MS = 15_000

export type LinhaVpo = {
  id: string
  acao: string
  situacao: string | null
  http_status: number | null
  erro: string | null
  criado_em: string
  processando_desde?: string | null
}

const ACOES_LENTAS = ['comprar', 'cancelar', 'trocar-placa']
export const acaoPodeDemorar = (acao: string) => ACOES_LENTAS.includes(acao)

export const ehTimeout = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')

// Em processamento: marcada pela função, ou enviada e sem nenhuma resposta nem erro (a função pode ter sido cortada antes de marcar).
export function emProcessamento(l: LinhaVpo): boolean {
  if (!acaoPodeDemorar(l.acao)) return false
  if (l.situacao === 'em_processamento') return true
  return l.situacao == null && l.http_status == null && l.erro == null
}
export const inicioDoProcessamento = (l: LinhaVpo) => new Date(l.processando_desde ?? l.criado_em).getTime()

export type DecisaoCompra =
  | { tipo: 'liberado' }
  | { tipo: 'conferir_recibo'; linha: LinhaVpo }
  | { tipo: 'bloqueado'; motivo: string }

// Antes de comprar: nunca uma segunda compra enquanto há compra (ou cancelamento/troca) em processamento.
// Havendo pendência, a função primeiro olha o recibo: se a viagem existe, a compra "já foi feita"; se não, segue bloqueado.
export function decidirAntesDeComprar(linhas: LinhaVpo[]): DecisaoCompra {
  const pendente = linhas.filter(emProcessamento).sort((a, b) => inicioDoProcessamento(b) - inicioDoProcessamento(a))[0]
  if (!pendente) return { tipo: 'liberado' }
  return { tipo: 'conferir_recibo', linha: pendente }
}
export const MOTIVO_COMPRA_EM_ANDAMENTO = 'Já existe uma compra do vale-pedágio em processamento para esta operação. Aguarde o recibo ou consulte de novo; nada foi comprado outra vez.'
export const MOTIVO_CANCELAMENTO_EM_ANDAMENTO = 'Há um cancelamento do vale-pedágio em processamento nesta operação. Aguarde ele terminar antes de comprar.'

export type Andamento = 'comprar' | 'cancelar'
export type Veredito =
  | { situacao: 'concluida'; dados: CompraVpo; bruto: unknown } // compra apareceu no recibo
  | { situacao: 'cancelada'; bruto: unknown } // recibo "não localizado" depois de pedir o cancelamento
  | { situacao: 'aguardando'; detalhe: string | null } // ainda não dá para afirmar
  | { situacao: 'erro'; detalhe: string } // falha de verdade ao consultar (rede/HTTP): não conclui nada

// Lê o resultado de "recibo" conforme o que se espera.
//  comprar:  recibo com viagem = comprou; "não localizado" = ainda não (ou nunca).
//  cancelar: recibo com viagem = ainda existe; "não localizado" = cancelado.
export function interpretarRecibo(esperando: Andamento, r: ResultadoNs<CompraVpo>): Veredito {
  if (r.ok) {
    if (esperando === 'comprar') return { situacao: 'concluida', dados: r.dados, bruto: r.bruto }
    return { situacao: 'aguardando', detalhe: 'O vale ainda aparece no NSPEDAGIO; o cancelamento não terminou.' }
  }
  if (r.naoLocalizado) {
    if (esperando === 'cancelar') return { situacao: 'cancelada', bruto: r.bruto }
    return { situacao: 'aguardando', detalhe: null }
  }
  return { situacao: 'erro', detalhe: r.erro }
}

export async function conferirRecibo(prov: ProvedorNsPedagio, esperando: Andamento, numeroOperacao: number): Promise<Veredito> {
  try {
    return interpretarRecibo(esperando, await prov.recibo(numeroOperacao))
  } catch (e) {
    return { situacao: 'erro', detalhe: ehTimeout(e) ? 'O NSPEDAGIO ainda não respondeu à consulta do recibo.' : e instanceof Error ? e.message : 'Falha ao consultar o recibo.' }
  }
}
