import { formatMoney } from '@rbr/shared/format'

// Elementos do visual aprovado para a cotação (Cotacao-Formal / Margem): cartão de preço e faixa de margem.
// Só apresentação: os números vêm da composição que a própria tela já calcula (mesma conta do banco).

// Faixas de cor da margem do desenho aprovado: vermelho abaixo de 29%, amarelo de 29% a 32%, verde acima de 32%.
export const MARGEM_VERMELHO_ATE = 0.29
export const MARGEM_VERDE_DE = 0.32

export function faixaDaMargem(m: number | null): { nome: 'vermelho' | 'amarelo' | 'verde' | null; cor: string; fundo: string } {
  if (m == null) return { nome: null, cor: '#6b7390', fundo: '#eef0fa' }
  if (m < MARGEM_VERMELHO_ATE) return { nome: 'vermelho', cor: '#b42318', fundo: '#fbe3e1' }
  if (m <= MARGEM_VERDE_DE) return { nome: 'amarelo', cor: '#7a5200', fundo: '#fff0d6' }
  return { nome: 'verde', cor: '#1a6b3c', fundo: '#d6ecdf' }
}

export function FaixaMargem({ margem, piso }: { margem: number | null; piso?: number | null }) {
  const f = faixaDaMargem(margem)
  const pos = margem == null ? null : Math.max(0, Math.min(0.5, margem)) / 0.5
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span style={{ color: '#4a5275' }}>Margem</span>
        <span className="font-extrabold" style={{ color: f.cor }}>
          {margem == null ? '—' : `● ${(margem * 100).toFixed(1).replace('.', ',')}% · ${f.nome}`}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-visible flex" aria-hidden>
        <span style={{ width: `${(MARGEM_VERMELHO_ATE / 0.5) * 100}%`, background: '#f4b9b4' }} className="rounded-l-full" />
        <span style={{ width: `${((MARGEM_VERDE_DE - MARGEM_VERMELHO_ATE) / 0.5) * 100}%`, background: '#f3d388' }} />
        <span style={{ flex: 1, background: '#a9dcbc' }} className="rounded-r-full" />
        {pos != null && <span className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ left: `${pos * 100}%`, transform: 'translate(-50%, -50%)', background: f.cor }} />}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: '#8a91ad' }}>
        <span>0%</span>
        <span>vermelho abaixo de 29% · verde acima de 32%</span>
        <span>50%</span>
      </div>
      {piso != null && (
        <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
          Faixa mínima de gravação: {(piso * 100).toFixed(0)}%.
        </div>
      )}
    </div>
  )
}

export type LinhaPreco = { rotulo: string; dica?: string; valor: number | null; verde?: boolean }

export function PrecoCard({ linhas, valorCliente, margem, piso }: { linhas: LinhaPreco[]; valorCliente: number | null; margem: number | null; piso?: number | null }) {
  return (
    <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        PREÇO
      </div>
      <div className="flex flex-col gap-1.5">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between text-[14px]">
            <span style={{ color: '#4a5275' }}>
              {l.rotulo}
              {l.dica && <span className="text-[11px] ml-1.5" style={{ color: '#8a91ad' }}>({l.dica})</span>}
            </span>
            <span className="font-extrabold tabular-nums" style={{ color: l.verde ? '#1a6b3c' : 'var(--rbr-navy-dark)' }}>
              {formatMoney(l.valor)}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: '#eef0fa' }}>
        <span className="text-[13px] font-bold" style={{ color: '#1c2559' }}>
          Valor para o cliente
        </span>
        <span className="text-[26px] font-extrabold tabular-nums" style={{ color: '#1c2559' }}>
          {formatMoney(valorCliente)}
        </span>
      </div>
      <FaixaMargem margem={margem} piso={piso} />
    </div>
  )
}

const PASSOS = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'enviada', rotulo: 'Enviada ao cliente' },
  { id: 'convertida', rotulo: 'Aprovada' },
]

// Esteira de três passos do topo da cotação (Rascunho → Enviada ao cliente → Aprovada). Perdida aparece à parte.
export function PassosCotacao({ status }: { status: string }) {
  if (status === 'perdida') {
    return (
      <span className="text-[12px] font-bold rounded-full px-3 py-1.5" style={{ background: '#fbe3e1', color: '#b42318' }}>
        Perdida
      </span>
    )
  }
  const atual = Math.max(0, PASSOS.findIndex((p) => p.id === status))
  return (
    <div className="flex items-center gap-1.5">
      {PASSOS.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1.5">
          {i > 0 && <span className="w-4 h-0.5" style={{ background: i <= atual ? '#1a9b57' : '#d5d9e6' }} />}
          <span
            className="text-[12px] font-extrabold rounded-full px-3 py-1.5 border"
            style={i < atual ? { background: '#1a9b57', color: '#fff', borderColor: '#1a9b57' } : i === atual ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#8a91ad', borderColor: '#d5d9e6' }}
          >
            {i < atual ? '✓ ' : ''}
            {p.rotulo}
          </span>
        </span>
      ))}
    </div>
  )
}
