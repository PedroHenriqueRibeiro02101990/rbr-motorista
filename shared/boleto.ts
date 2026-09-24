// Leitura de linha digitável / código de barras de boleto (bancário e arrecadação/concessionária).
// Tudo determinístico: confere os dígitos verificadores e extrai valor e vencimento sem depender de IA.

export interface BoletoInfo {
  tipo: 'bancario' | 'arrecadacao'
  valido: boolean
  valor: number | null
  vencimento: string | null // AAAA-MM-DD
  banco: string | null
  linha: string // só dígitos (47 ou 48)
  codigoBarras: string // 44 dígitos
}

const soDigitos = (s: string) => (s ?? '').replace(/\D/g, '')

function mod10(num: string): number {
  let soma = 0
  let peso = 2
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * peso
    if (p > 9) p = Math.floor(p / 10) + (p % 10)
    soma += p
    peso = peso === 2 ? 1 : 2
  }
  const r = soma % 10
  return r === 0 ? 0 : 10 - r
}

function mod11Bancario(num: string): number {
  let soma = 0
  let peso = 2
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const r = 11 - (soma % 11)
  return r === 0 || r === 10 || r === 11 ? 1 : r
}

function mod11Arrecadacao(num: string): number {
  let soma = 0
  let peso = 2
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const r = soma % 11
  if (r === 0 || r === 1) return 0
  if (r === 10) return 1
  return 11 - r
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Fator de vencimento: base 07/10/1997; a partir de 22/02/2025 o fator reiniciou em 1000.
function vencimentoPorFator(fator: number): string | null {
  if (!fator) return null
  const dia = 86400000
  const antiga = Date.UTC(1997, 9, 7) + fator * dia
  const nova = Date.UTC(2025, 1, 22) + (fator - 1000) * dia
  const hoje = Date.now()
  const escolhida = fator >= 1000 && Math.abs(nova - hoje) < Math.abs(antiga - hoje) ? nova : antiga
  return ymd(new Date(escolhida))
}

function bancarioDeBarras(cb: string): BoletoInfo {
  const dv = mod11Bancario(cb.slice(0, 4) + cb.slice(5))
  const valido = dv === Number(cb[4])
  const fator = Number(cb.slice(5, 9))
  const valor = Number(cb.slice(9, 19)) / 100
  const c1 = cb.slice(0, 4) + cb.slice(19, 24)
  const c2 = cb.slice(24, 34)
  const c3 = cb.slice(34, 44)
  const linha = c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + cb[4] + cb.slice(5, 19)
  return { tipo: 'bancario', valido, valor: valor > 0 ? valor : null, vencimento: vencimentoPorFator(fator), banco: cb.slice(0, 3), linha, codigoBarras: cb }
}

function arrecadacaoDeBarras(cb: string): BoletoInfo {
  const ref = cb[2]
  const usaMod10 = ref === '6' || ref === '7'
  const dvCalc = usaMod10 ? mod10(cb.slice(0, 3) + cb.slice(4)) : mod11Arrecadacao(cb.slice(0, 3) + cb.slice(4))
  const valido = dvCalc === Number(cb[3])
  const blocos = [0, 11, 22, 33].map((i) => cb.slice(i, i + 11))
  const linha = blocos.map((b) => b + (usaMod10 ? mod10(b) : mod11Arrecadacao(b))).join('')
  const valor = ref === '6' || ref === '8' ? Number(cb.slice(4, 15)) / 100 : null
  return { tipo: 'arrecadacao', valido, valor: valor && valor > 0 ? valor : null, vencimento: null, banco: null, linha, codigoBarras: cb }
}

export function lerBoleto(entrada: string): BoletoInfo | null {
  const d = soDigitos(entrada)
  if (d.length === 44) return d[0] === '8' ? arrecadacaoDeBarras(d) : bancarioDeBarras(d)
  if (d.length === 47) {
    const cb = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31)
    const info = bancarioDeBarras(cb)
    const camposOk = mod10(d.slice(0, 9)) === Number(d[9]) && mod10(d.slice(10, 20)) === Number(d[20]) && mod10(d.slice(21, 31)) === Number(d[31])
    return { ...info, valido: info.valido && camposOk, linha: d }
  }
  if (d.length === 48 && d[0] === '8') {
    const cb = [0, 12, 24, 36].map((i) => d.slice(i, i + 11)).join('')
    const info = arrecadacaoDeBarras(cb)
    return { ...info, linha: d }
  }
  return null
}

export function formatarLinhaDigitavel(linha: string): string {
  const d = soDigitos(linha)
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`
  }
  if (d.length === 48) return [0, 12, 24, 36].map((i) => `${d.slice(i, i + 11)}-${d[i + 11]}`).join(' ')
  return linha
}
