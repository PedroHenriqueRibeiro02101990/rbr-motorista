import { useEffect, type ReactNode } from 'react'
import { IconX } from '../../icons-local'
import { SITUACAO } from '../../lib/financeiro'

export const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full bg-white focus:border-[color:var(--rbr-navy)]'
export const inputStyle = { borderColor: 'var(--rbr-border)' }
export const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'
export const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

export function Card({ children, className = '', titulo, acao }: { children: ReactNode; className?: string; titulo?: ReactNode; acao?: ReactNode }) {
  return (
    <section className={`bg-white border rounded-[18px] p-4 md:p-[18px] ${className}`} style={cardStyle}>
      {(titulo || acao) && (
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          {titulo && <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{titulo}</div>}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}

export function Pill({ situacao, texto }: { situacao: string; texto?: string }) {
  const s = SITUACAO[situacao] ?? { label: situacao, bg: '#F1F2F6', fg: '#6B7280' }
  return (
    <span className="inline-block text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {texto ?? s.label}
    </span>
  )
}

export function Botao({
  children,
  onClick,
  variante = 'primario',
  disabled,
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variante?: 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'ouro'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  const estilos: Record<string, React.CSSProperties> = {
    primario: { background: 'var(--rbr-navy)', color: '#fff' },
    secundario: { background: '#fff', color: 'var(--rbr-navy-dark)', border: '1px solid var(--rbr-border)' },
    perigo: { background: '#fff', color: 'var(--rbr-danger)', border: '1px solid #F3C4C4' },
    fantasma: { background: 'transparent', color: 'var(--rbr-navy)' },
    ouro: { background: 'var(--rbr-gold)', color: '#fff' },
  }
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={estilos[variante]}
    >
      {children}
    </button>
  )
}

export function Aviso({ tipo = 'erro', children, onFechar }: { tipo?: 'erro' | 'ok' | 'info' | 'atencao'; children: ReactNode; onFechar?: () => void }) {
  const cores = {
    erro: { background: '#FBE9E9', color: 'var(--rbr-danger)' },
    ok: { background: '#E7F5EC', color: 'var(--rbr-positive)' },
    info: { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' },
    atencao: { background: '#FDF1DC', color: '#8A5A00' },
  }
  return (
    <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-2" style={cores[tipo]}>
      <div className="flex-1 whitespace-pre-line">{children}</div>
      {onFechar && (
        <button type="button" onClick={onFechar} aria-label="Fechar aviso" className="opacity-70 hover:opacity-100">
          <IconX width={12} height={12} />
        </button>
      )}
    </div>
  )
}

// Pilha de modais abertos: Esc fecha só o de cima (ex.: baixa aberta por cima do detalhe).
const pilhaModais: number[] = []
let proximoModal = 1

export function Modal({ titulo, children, onFechar, largura = 'max-w-2xl' }: { titulo: ReactNode; children: ReactNode; onFechar: () => void; largura?: string }) {
  useEffect(() => {
    const meu = proximoModal++
    pilhaModais.push(meu)
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pilhaModais[pilhaModais.length - 1] === meu) onFechar()
    }
    window.addEventListener('keydown', esc)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      const i = pilhaModais.indexOf(meu)
      if (i >= 0) pilhaModais.splice(i, 1)
      document.body.style.overflow = antes
    }
  }, [onFechar])
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: 'rgba(18,23,61,0.45)' }} onMouseDown={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white w-full ${largura} max-h-[92dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-4 md:p-5 flex flex-col gap-3`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="rbr-display font-bold text-lg text-[color:var(--rbr-navy-dark)]">{titulo}</div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1 rounded hover:bg-[color:var(--rbr-muted-bg)]">
            <IconX width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({ label, children, className = '', dica }: { label: string; children: ReactNode; className?: string; dica?: ReactNode }) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      {children}
      {dica && <div className="text-[11px] text-[color:var(--rbr-muted)] mt-1">{dica}</div>}
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="text-sm text-[color:var(--rbr-muted)] text-center py-8">{children}</div>
}

export function Kpi({ label, valor, sub, tom }: { label: string; valor: string; sub?: ReactNode; tom?: 'bom' | 'ruim' | 'atencao' }) {
  const cor = tom === 'ruim' ? 'var(--rbr-danger)' : tom === 'bom' ? 'var(--rbr-positive)' : tom === 'atencao' ? '#8A5A00' : 'var(--rbr-navy-dark)'
  return (
    <div className="bg-white border rounded-[16px] p-3.5 flex flex-col gap-0.5 min-w-0" style={cardStyle}>
      <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)] truncate">{label}</div>
      <div className="rbr-display text-lg md:text-xl font-bold tabular-nums truncate" style={{ color: cor }}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-[color:var(--rbr-muted)] truncate">{sub}</div>}
    </div>
  )
}

export function Chips<V extends string>({ opcoes, valor, onChange }: { opcoes: { valor: V; label: string; qtd?: number }[]; valor: V; onChange: (v: V) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap" role="tablist">
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(o.valor)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap"
            style={{
              borderColor: ativo ? 'var(--rbr-navy)' : 'var(--rbr-border)',
              background: ativo ? 'var(--rbr-navy)' : '#fff',
              color: ativo ? '#fff' : 'var(--rbr-navy-dark)',
            }}
          >
            {o.label}
            {o.qtd != null && <span className="ml-1.5 opacity-70 tabular-nums">{o.qtd}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Carregando() {
  return <div className="text-sm text-[color:var(--rbr-muted)] py-8 text-center">Carregando…</div>
}
