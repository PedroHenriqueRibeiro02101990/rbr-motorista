// Peças visuais e utilitários do Radar. As classes (.card, .chip, .btn...) vêm de radar.css (protótipo), sempre sob .rdr.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { db } from '../lib/prospeccaoDb'

const ICONES: Record<string, string> = {
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18 7"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  empresas: '<path d="M4 20V9l6-3v14M10 20V4l10 4v12M3 20h18M13 11h3M13 15h3"/>',
  aprovar: '<path d="M4 6h16v12H4z"/><path d="m8 12 3 3 5-6"/>',
  caixa: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  jornada: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7.3 11 16.7 6M7.3 13l9.4 5"/>',
  relatorios: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajustes: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="17" r="2.5"/>',
  curso: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',
  replyall: '<path d="M7 14 2 9l5-5"/><path d="M12 14 7 9l5-5"/><path d="M7 9h8a6 6 0 0 1 6 6v3"/>',
  fwd: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v3"/>',
  arch: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  draft: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  spam: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/>',
  fire: '<path d="M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10 17.4a1.7 1.7 0 0 1-2.4-2.4L15 7.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dl: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  voltar: '<path d="M15 18 9 12l6-6"/>',
}
export function Ic({ n, className = '' }: { n: string; className?: string }) {
  return <svg className={`i ${className}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONES[n] ?? '' }} />
}

// ---- toast (um só, global) -----------------------------------------------------------------------------
const ouvintes = new Set<(t: string) => void>()
export const toast = (t: string) => ouvintes.forEach((f) => f(t))
export function ToastRadar() {
  const [t, setT] = useState('')
  const [on, setOn] = useState(false)
  useEffect(() => {
    let k: ReturnType<typeof setTimeout>
    const f = (msg: string) => { setT(msg); setOn(true); clearTimeout(k); k = setTimeout(() => setOn(false), 2600) }
    ouvintes.add(f)
    return () => { ouvintes.delete(f); clearTimeout(k) }
  }, [])
  return <div className={`toast${on ? ' show' : ''}`} role="status">{t}</div>
}

// ---- contexto ------------------------------------------------------------------------------------------
export type Flags = Record<string, string>
export type RadarCtx = {
  exemplos: boolean; flags: Flags; ehPedro: boolean; pessoaId: string
  irPara: (aba: string) => void; recarregar: () => void; tick: number; slot: HTMLElement | null
}
export const Ctx = createContext<RadarCtx | null>(null)
export function useRadar(): RadarCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('Fora do Radar')
  return c
}

export function Anel({ n }: { n: number }) {
  const c = 2 * Math.PI * 18
  const cor = n >= 70 ? 'var(--goldbtn)' : n >= 45 ? 'var(--ice)' : 'var(--line2)'
  return (
    <div className="ring">
      <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--surface3)" strokeWidth="4" /><circle cx="22" cy="22" r="18" fill="none" stroke={cor} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((c * n) / 100).toFixed(1)} ${c.toFixed(1)}`} /></svg>
      <b>{Math.round(n)}</b>
    </div>
  )
}
export function FaixaExemplo() {
  return <div className="note" style={{ background: 'var(--warnbg)' }}><Ic n="info" /><div><b>Exemplo: nada disto está no banco.</b> Você pode clicar em tudo; nada é gravado.</div></div>
}
export function Vazio({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }

/** Consulta ao banco que nunca derruba a tela: erro vira { erro } e a aba mostra estado vazio claro. */
export type Resultado<T> = { dados: T; erro: string | null; carregando: boolean }
export function useConsulta<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, vazio: T, deps: unknown[]): Resultado<T> & { refazer: () => void } {
  const [r, setR] = useState<Resultado<T>>({ dados: vazio, erro: null, carregando: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    setR((x) => ({ ...x, carregando: true }))
    void Promise.resolve(fn()).then(({ data, error }) => { if (vivo) setR({ dados: (data ?? vazio) as T, erro: error ? mensagemDeErro(error.message) : null, carregando: false }) },
      (e: unknown) => { if (vivo) setR({ dados: vazio, erro: mensagemDeErro(e instanceof Error ? e.message : String(e)), carregando: false }) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { ...r, refazer: () => setN((x) => x + 1) }
}
export function mensagemDeErro(m: string): string {
  if (/does not exist|could not find|schema cache|relation .* does not exist|function .* does not exist/i.test(m)) return 'O banco ainda não recebeu a migração do Radar (20261119-0100-radar-modulo.sql). Aplique-a e atualize a tela.'
  if (/permission|row-level|jwt/i.test(m)) return 'Sem permissão para ver estes dados.'
  return m
}
export function AvisoErro({ erro }: { erro: string | null }) {
  if (!erro) return null
  return <div className="note" style={{ background: 'var(--warnbg)' }}><Ic n="info" /><div>{erro}</div></div>
}

export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
export function quando(iso: string): string {
  const d = new Date(iso)
  const ymd = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(x)
  if (ymd(d) === hojeSP()) return horaCurta(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}
export const rpc = (nome: string, args?: Record<string, unknown>) => db.rpc(nome, args)

/** Botões do cabeçalho da aba (ficam no topo, ao lado do título, como no protótipo). */
export function Acoes({ children }: { children: ReactNode }) {
  const { slot } = useRadar()
  return slot ? createPortal(children, slot) : null
}
