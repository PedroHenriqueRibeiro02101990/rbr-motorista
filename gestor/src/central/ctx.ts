// Contexto comum às seções da Central: dados carregados, confirmação em janela e aviso rápido.
import { createContext, useContext } from 'react'
import type { Batimento, Comando, RegistroLinha, UsoLinha } from '../lib/centralDb'
import type { RoboLinha } from '../lib/central'

export type Pedido = { titulo: string; texto: string; ok: string; perigoso?: boolean }
export type Painel = {
  robos: RoboLinha[]; batimentos: Batimento[]; uso: UsoLinha[]; comandos: Comando[]; registro: RegistroLinha[]
  sugestoesPendentes: number; filaSdr: number
}
export type CentralCtx = {
  painel: Painel; flags: Record<string, string>; agora: Date
  confirmar: (p: Pedido) => Promise<boolean>
  aviso: (msg: string) => void
  recarregar: () => void
  executar: (fazer: () => Promise<string | void>) => Promise<void>   // roda, mostra erro em português, recarrega
}
export const CentralContexto = createContext<CentralCtx | null>(null)
export function useCentral(): CentralCtx {
  const c = useContext(CentralContexto)
  if (!c) throw new Error('Fora da Central')
  return c
}
export function ultimoBatimento(p: Painel): Batimento | null { return p.batimentos[0] ?? null }
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'
}
export const fmtN = (n: number) => n.toLocaleString('pt-BR')
