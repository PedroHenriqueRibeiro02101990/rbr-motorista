// Acompanhamento do vale-pedágio que demora (compra ou cancelamento): a tela confere o recibo a cada 15 s por até 5 min.
// Sem React e sem rede (a consulta e a espera entram por parâmetro), para testar com node --test gestor/test/vpoAcompanhar.test.ts
import { ESPERA_MAXIMA_MS, INTERVALO_RECIBO_MS } from './vpoPassos.ts'

export type RespostaAcompanhamento = { situacao?: 'concluida' | 'cancelada' | 'aguardando' | 'nada_pendente'; ok?: boolean; aviso?: string; erro?: string }
export type Desfecho = 'concluida' | 'cancelada' | 'nada_pendente' | 'nao_confirmado' | 'interrompido'

export async function acompanharRecibo(p: {
  consultar: () => Promise<RespostaAcompanhamento>
  esperar: (ms: number) => Promise<void>
  agora: () => number
  desde: number
  intervaloMs?: number
  limiteMs?: number
  interrompido?: () => boolean
  aoConsultar?: (tentativa: number) => void
}): Promise<Desfecho> {
  const intervalo = p.intervaloMs ?? INTERVALO_RECIBO_MS
  const limite = p.limiteMs ?? ESPERA_MAXIMA_MS
  let tentativa = 0
  for (;;) {
    if (p.interrompido?.()) return 'interrompido'
    tentativa++
    p.aoConsultar?.(tentativa)
    const r = await p.consultar().catch(() => ({ situacao: 'aguardando' as const }))
    if (r.situacao === 'concluida' || r.situacao === 'cancelada' || r.situacao === 'nada_pendente') return r.situacao
    // Passou do prazo (contado desde o início da compra) ou não cabe mais outra rodada: para de esperar.
    if (p.agora() + intervalo - p.desde > limite) return 'nao_confirmado'
    await p.esperar(intervalo)
  }
}
