// CPF / CNPJ (inclusive CNPJ alfanumérico, IN RFB 2.229/2024) e celular.

export function normalizarDoc(v: string | null | undefined): string {
  return String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function cpfValido(v: string): boolean {
  const d = normalizarDoc(v)
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const calc = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function cnpjValido(v: string): boolean {
  const d = normalizarDoc(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const val = (c: string) => c.charCodeAt(0) - 48
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let s = 0
    for (let i = 0; i < n; i++) s += val(d[i]) * pesos[i]
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

export function formatarDoc(v: string | null | undefined): string {
  const d = normalizarDoc(v)
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return v ?? ''
}

// Mostra só o começo e o fim (ex.: 529.•••.•••-25) — tela de quem não precisa do número inteiro.
export function mascararDoc(v: string | null | undefined): string {
  const d = normalizarDoc(v)
  if (d.length === 11) return `${d.slice(0, 3)}.•••.•••-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.•••.•••/••••-${d.slice(12)}`
  return v ?? ''
}

export function mascaraDocDigitando(v: string, tipo: 'PF' | 'PJ'): string {
  const d = normalizarDoc(v).slice(0, tipo === 'PF' ? 11 : 14)
  if (tipo === 'PF') {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return d
    .replace(/^(\w{2})(\w)/, '$1.$2')
    .replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/\.(\w{3})(\w)/, '.$1/$2')
    .replace(/(\w{4})(\d{1,2})$/, '$1-$2')
}

export function soDigitos(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '')
}

export function mascaraCelular(v: string): string {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function linkWhatsApp(celular: string | null | undefined, texto: string): string {
  let d = soDigitos(celular)
  if (d && d.length <= 11) d = '55' + d
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}
