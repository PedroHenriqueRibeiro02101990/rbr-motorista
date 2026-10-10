import { Botao } from '../financeiro/ui'

export type TipoCotacaoValor = 'carga_unica' | 'veiculos_juntos' | 'varias_entregas'

const OPCOES: { valor: TipoCotacaoValor; titulo: string; sub: string; etiqueta?: string }[] = [
  { valor: 'carga_unica', titulo: 'Carga única', sub: '1 veículo, 1 destino', etiqueta: 'mais comum' },
  { valor: 'veiculos_juntos', titulo: 'Veículos juntos', sub: 'Vários veículos saem juntos' },
  { valor: 'varias_entregas', titulo: 'Várias entregas', sub: 'Vários destinos, cargas ao longo do tempo' },
]

export const TIPO_LABEL: Record<TipoCotacaoValor, string> = {
  carga_unica: 'Carga única',
  veiculos_juntos: 'Veículos juntos',
  varias_entregas: 'Várias entregas',
}

export type DestinoCargas = { key: string; nome: string; cargas: string }

// Escolha simples do tipo da cotação, no topo do formulário.
export default function TipoCotacao({
  tipo,
  onTipo,
  qtdVeiculos,
  onQtd,
  destinos,
  onCargas,
  onAdicionarDestinos,
  travado,
}: {
  tipo: TipoCotacaoValor
  onTipo: (t: TipoCotacaoValor) => void
  qtdVeiculos: number
  onQtd: (n: number) => void
  destinos: DestinoCargas[]
  onCargas: (key: string, valor: string) => void
  onAdicionarDestinos: () => void
  travado: boolean
}) {
  const total = destinos.reduce((s, d) => s + Math.max(1, Math.floor(Number(d.cargas) || 1)), 0)
  return (
    <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)', background: '#fff' }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-navy)]">Tipo da cotação</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {OPCOES.map((o) => {
          const ativo = o.valor === tipo
          return (
            <button
              key={o.valor}
              type="button"
              disabled={travado && !ativo}
              onClick={() => onTipo(o.valor)}
              aria-pressed={ativo}
              className="text-left rounded-xl border px-3 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: ativo ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                background: ativo ? 'var(--rbr-navy-tint)' : '#fff',
                boxShadow: ativo ? 'inset 0 0 0 1px var(--rbr-navy)' : undefined,
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">{o.titulo}</span>
                {o.etiqueta && (
                  <span className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: 'var(--rbr-gold)', color: '#fff' }}>
                    {o.etiqueta}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[color:var(--rbr-muted)] mt-0.5">{o.sub}</div>
            </button>
          )
        })}
      </div>

      {tipo === 'veiculos_juntos' && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">Quantos veículos</span>
          <div className="flex items-center gap-1.5">
            <Botao variante="secundario" disabled={travado || qtdVeiculos <= 2} onClick={() => onQtd(Math.max(2, qtdVeiculos - 1))}>
              −
            </Botao>
            <span className="w-10 text-center text-sm font-bold tabular-nums">{qtdVeiculos}</span>
            <Botao variante="secundario" disabled={travado || qtdVeiculos >= 50} onClick={() => onQtd(Math.min(50, qtdVeiculos + 1))}>
              +
            </Botao>
          </div>
          <span className="text-[11px] text-[color:var(--rbr-muted)]">Ao converter, cria {qtdVeiculos} operações ligadas.</span>
        </div>
      )}

      {tipo === 'varias_entregas' && (
        <div className="flex flex-col gap-2">
          {destinos.length === 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-[color:var(--rbr-muted)]">Nenhum destino ainda.</span>
              <Botao variante="secundario" onClick={onAdicionarDestinos}>
                + Adicionar destino
              </Botao>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="grid grid-cols-[1fr_96px] text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] px-3 py-1.5" style={{ background: 'var(--rbr-muted-bg)' }}>
                  <span>Destino</span>
                  <span>Nº de cargas</span>
                </div>
                {destinos.map((d, i) => (
                  <div key={d.key} className="grid grid-cols-[1fr_96px] items-center gap-2 px-3 py-1.5 border-t" style={{ borderColor: 'var(--rbr-border)' }}>
                    <span className="text-xs truncate">{d.nome.trim() || `Destino ${i + 1}`}</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={d.cargas}
                      onChange={(e) => onCargas(d.key, e.target.value)}
                      className="border rounded-lg px-2 py-1 text-sm outline-none w-full bg-white tabular-nums"
                      style={{ borderColor: 'var(--rbr-border)' }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">Total: {total} carga{total > 1 ? 's' : ''}</span>
                <Botao variante="fantasma" onClick={onAdicionarDestinos}>
                  + Adicionar destino
                </Botao>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
