// Últimas escolhas e últimas 20 consultas no aparelho. localStorage dentro de try/catch: sem armazenamento, o app funciona igual.
import type { Consulta, Entrada } from './modelo.ts'

export interface Armazenamento { getItem(k: string): string | null; setItem(k: string, v: string): void }
const K_PREFS = 'calc-rbr:prefs'
const K_CONSULTAS = 'calc-rbr:consultas'
export const LIMITE_CONSULTAS = 20

export interface Prefs { tipoCarga: string; eixos: number; incluirVolta: boolean; margem: number }
export const PREFS_PADRAO: Prefs = { tipoCarga: 'Carga Geral', eixos: 6, incluirVolta: false, margem: 40 }

const padrao = (): Armazenamento | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function lerPrefs(a: Armazenamento | null = padrao()): Prefs {
  try {
    const j = a?.getItem(K_PREFS)
    return j ? { ...PREFS_PADRAO, ...(JSON.parse(j) as Partial<Prefs>) } : PREFS_PADRAO
  } catch { return PREFS_PADRAO }
}
export function salvarPrefs(p: Prefs, a: Armazenamento | null = padrao()): void {
  try { a?.setItem(K_PREFS, JSON.stringify(p)) } catch { /* sem armazenamento */ }
}
export function lerConsultas(a: Armazenamento | null = padrao()): Consulta[] {
  try {
    const j = a?.getItem(K_CONSULTAS)
    const v = j ? JSON.parse(j) : []
    return Array.isArray(v) ? (v as Consulta[]) : []
  } catch { return [] }
}
/** Guarda a consulta no topo (só resultado de verdade, nunca demonstração) e corta em 20. */
export function salvarConsulta(c: Consulta, a: Armazenamento | null = padrao()): Consulta[] {
  if (c.resposta.demo || c.resposta.km == null) return lerConsultas(a)
  const lista = [c, ...lerConsultas(a)].slice(0, LIMITE_CONSULTAS)
  try { a?.setItem(K_CONSULTAS, JSON.stringify(lista)) } catch { /* sem armazenamento */ }
  return lista
}
export const entradaIgual = (x: Entrada, y: Entrada) => JSON.stringify(x) === JSON.stringify(y)
