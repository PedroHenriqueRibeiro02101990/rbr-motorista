import type { ReactNode } from 'react'

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const pct = (n: number) => (n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rbr-card p-4 md:p-5 ${className}`}>{children}</div>
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-1">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">{children}</h1>
      {sub && <p className="text-[13px] text-[color:var(--rbr-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

export function Esqueleto({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="rbr-skeleton h-16" />
      ))}
    </div>
  )
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="rbr-card p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-gold)' }}>✦</div>
      <div className="rbr-display font-bold text-[color:var(--rbr-navy-dark)]">{titulo}</div>
      <p className="text-[13px] text-[color:var(--rbr-muted)] mt-1 max-w-sm mx-auto">{texto}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

export function Aviso({ tom, children }: { tom: 'amarelo' | 'vermelho' | 'verde' | 'azul'; children: ReactNode }) {
  const m = {
    amarelo: { bg: 'var(--rbr-warning-bg)', c: 'var(--rbr-navy-dark)' },
    vermelho: { bg: '#FBE9E9', c: '#9b1c1c' },
    verde: { bg: '#E3F5EA', c: '#14532d' },
    azul: { bg: 'var(--rbr-muted-bg)', c: 'var(--rbr-navy)' },
  }[tom]
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-[13px] font-semibold" style={{ background: m.bg, color: m.c }} role="status">
      {children}
    </div>
  )
}

export function Botao({ children, onClick, tipo = 'primario', desabilitado, titulo }: { children: ReactNode; onClick?: () => void; tipo?: 'primario' | 'dourado' | 'neutro' | 'perigo'; desabilitado?: boolean; titulo?: string }) {
  const st = {
    primario: { background: 'var(--rbr-btn, #1e2761)', color: '#fff' },
    dourado: { background: 'var(--rbr-gold)', color: '#fff' },
    neutro: { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' },
    perigo: { background: '#FBE9E9', color: 'var(--rbr-danger)' },
  }[tipo]
  return (
    <button type="button" title={titulo} disabled={desabilitado} onClick={onClick} className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed" style={st}>
      {children}
    </button>
  )
}

export function Selo({ texto, bg, cor }: { texto: string; bg: string; cor: string }) {
  return <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: bg, color: cor }}>{texto}</span>
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg" style={{ background: 'var(--rbr-btn, #1e2761)', color: '#fff' }} role="status">
      {msg}
    </div>
  )
}

/** Selo do agenciador no cabecalho: logotipo em quadrado branco (max 36px) ou iniciais numa bolinha navy. */
export function SeloAgenciador({ nome, logoUrl }: { nome: string; logoUrl?: string | null }) {
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
  return (
    <div className="flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'var(--rbr-border)' }}>
      {logoUrl ? (
        <span className="bg-white rounded-lg p-0.5 flex items-center justify-center border" style={{ borderColor: 'var(--rbr-border)', height: 36, minWidth: 36 }}>
          <img src={logoUrl} alt={nome} style={{ maxHeight: 32, maxWidth: 80, objectFit: 'contain' }} />
        </span>
      ) : (
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--rbr-btn, #1e2761)', color: '#fff' }}>{ini}</span>
      )}
      <span className="hidden sm:block text-[11px] leading-tight font-semibold text-[color:var(--rbr-muted)]">Agenciador<br />parceiro RBR</span>
    </div>
  )
}
