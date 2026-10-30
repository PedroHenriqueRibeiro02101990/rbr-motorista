// F04 · Busca global: limpeza do termo e texto dos resultados ocultos. Regras puras.
export const MIN_BUSCA = 3

// Tira curingas do LIKE e espaços sobrando; devolve null se for curto demais para buscar.
export function termoDeBusca(bruto: string): string | null {
  const t = bruto.replace(/[\\%_,()"]/g, '').replace(/\s+/g, ' ').trim()
  return t.length >= MIN_BUSCA ? t : null
}

// O que a pessoa não vê = o que existe menos o que as políticas deixaram aparecer (nunca negativo).
export function ocultos(total: number, vistos: number): number {
  return Math.max(0, total - vistos)
}

export function textoOcultos(n: number): string | null {
  if (n <= 0) return null
  return n === 1 ? '1 resultado oculto pela sua função' : `${n} resultados ocultos pela sua função`
}
