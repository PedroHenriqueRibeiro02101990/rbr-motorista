import { formatMoney } from '@rbr/shared/format'

// Esteira do serviço no topo da Operação/Fiscal (visuais Operacao-Servico e Operacao-Viagem): Cotação → Operação → Fiscal → Liberação → Viagem.
// A etapa vem do status da operação; só apresentação.
const ETAPAS = ['Cotação', 'Operação', 'Fiscal', 'Liberação', 'Viagem']
const POR_STATUS: Record<string, number> = {
  alocando_motorista: 1,
  aguardando_assumir: 1,
  aguardando_aceite_motorista: 1,
  pausada_por_alteracao: 1,
  aguardando_liberacao_fiscal: 2,
  em_emissao: 2,
  devolvida_pelo_fiscal: 2,
  aguardando_liberacao_gestor: 3,
  ordem_liberada: 3,
  liberada_coleta: 3,
  carregando: 3,
  em_transito: 4,
  em_viagem: 4,
  finalizando: 4,
  entregue: 4,
  finalizada: 4,
  fechada: 4,
}

export function etapaDoStatus(status: string): number {
  return POR_STATUS[status] ?? 1
}

export default function PassosServico({ status }: { status: string }) {
  const atual = etapaDoStatus(status)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {ETAPAS.map((e, i) => (
        <span key={e} className="flex items-center gap-1.5">
          {i > 0 && <span className="w-3.5 h-0.5" style={{ background: i <= atual ? '#1a9b57' : '#d5d9e6' }} />}
          <span
            className="text-[12px] font-extrabold rounded-full px-3 py-1.5 border"
            style={i < atual ? { background: '#1a9b57', color: '#fff', borderColor: '#1a9b57' } : i === atual ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#8a91ad', borderColor: '#d5d9e6' }}
          >
            {i < atual ? '✓ ' : ''}
            {e}
          </span>
        </span>
      ))}
    </div>
  )
}

export function FaixaResumo({ itens }: { itens: { rotulo: string; valor: string | number | null | undefined }[] }) {
  return (
    <div className="bg-white border rounded-2xl px-4 py-2.5 flex items-center gap-x-6 gap-y-1 flex-wrap text-[13px]" style={{ borderColor: 'var(--rbr-border)' }}>
      {itens.map((i) => (
        <span key={i.rotulo} style={{ color: 'var(--rbr-muted)' }}>
          {i.rotulo} <b style={{ color: 'var(--rbr-navy-dark)' }}>{i.valor ?? '—'}</b>
        </span>
      ))}
    </div>
  )
}

export const moeda = formatMoney
