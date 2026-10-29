import type { Etapa, EstadoEtapa, IdEtapa } from './etapasOperacao'

// Abas do painel da operação. As etapas continuam as de etapasOperacao.ts; aqui só se decide em que aba cada uma aparece.
// Testes: node --test gestor/test/abasOperacao.test.ts
export type IdAba = 'resumo' | 'fiscal' | 'motorista' | 'financeiro' | 'historico'

export const ABAS: { id: IdAba; rotulo: string }[] = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'fiscal', rotulo: 'NF-e e documentos fiscais' },
  { id: 'motorista', rotulo: 'Motorista e veículo' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'historico', rotulo: 'Histórico' },
]

export function abaValida(v: string | null | undefined): IdAba {
  return ABAS.some((a) => a.id === v) ? (v as IdAba) : 'resumo'
}

const ABA_DA_ETAPA: Record<IdEtapa, IdAba> = {
  motorista: 'motorista',
  gr: 'motorista',
  aet: 'motorista',
  rastreio: 'motorista',
  documento: 'fiscal',
  averbacao_allianz: 'fiscal',
  ciot: 'fiscal',
  mdfe: 'fiscal',
  averbacao_sompo: 'fiscal',
  viagem: 'fiscal', // inclui "Finalizar viagem" (encerrar o MDF-e)
  pagamento: 'financeiro',
  liberar: 'resumo',
}

export function abaDaEtapa(id: IdEtapa): IdAba {
  return ABA_DA_ETAPA[id]
}

// Sinal na aba: vermelho se algum passo dela está com problema, amarelo se há algo a fazer agora, nada se está em dia.
export type SinalAba = 'problema' | 'atual' | null

export function sinaisDasAbas(etapas: Pick<Etapa, 'id' | 'estado'>[]): Record<IdAba, SinalAba> {
  const sinais: Record<IdAba, SinalAba> = { resumo: null, fiscal: null, motorista: null, financeiro: null, historico: null }
  const peso = (e: EstadoEtapa): number => (e === 'problema' ? 2 : e === 'atual' ? 1 : 0)
  for (const e of etapas) {
    const aba = abaDaEtapa(e.id)
    const atual = sinais[aba] === 'problema' ? 2 : sinais[aba] === 'atual' ? 1 : 0
    if (peso(e.estado) > atual) sinais[aba] = e.estado === 'problema' ? 'problema' : 'atual'
  }
  return sinais
}
