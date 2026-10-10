import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'

// Cliente sem tipagem para as views e funções criadas em 10/10/2026 (ainda não estão em database.types.ts).
// Quando os tipos forem regenerados, trocar por `supabase` direto.
export const db = supabase as unknown as SupabaseClient

export function msgErro(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}

export const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const dataBr = (d: string | null | undefined) => {
  if (!d) return '—'
  const [a, m, dia] = d.slice(0, 10).split('-')
  return `${dia}/${m}/${a}`
}
