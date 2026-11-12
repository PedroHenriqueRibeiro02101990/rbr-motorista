// Ref enviada à Focus para CT-e e MDF-e, VERSIONADA. A primeira emissão continua com a ref de sempre (rbr-cte-<op>, rbr-mdfe-<op>), que é a v1,
// para não afetar nada já emitido. Depois de cancelar (ou encerrar o MDF-e) a Focus não aceita a mesma ref; a reemissão usa -v2, -v3...
// Sem Deno e sem rede: testes em refDocumento.test.ts.

export type TipoRef = 'cte' | 'mdfe'
export type DocAtual = { referencia?: string | null; status?: string | null; encerrado_em?: string | null } | null | undefined

export const refBase = (tipo: TipoRef, operacaoId: string) => `rbr-${tipo}-${operacaoId}`

/** Versão que a ref representa: a base é v1; `${base}-vN` é vN; qualquer outra coisa conta como v1. */
export function versaoDaRef(ref: string | null | undefined, base: string): number {
  if (!ref || ref === base) return 1
  const m = ref.startsWith(`${base}-v`) ? /^(\d+)$/.exec(ref.slice(base.length + 2)) : null
  const n = m ? Number(m[1]) : 1
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/** O documento anterior chegou a um estado final na Focus: cancelado, ou MDF-e encerrado. Só então a ref não pode ser reaproveitada. */
export function documentoFinalizado(tipo: TipoRef, d: DocAtual): boolean {
  if (!d) return false
  if (d.status === 'cancelado') return true
  return tipo === 'mdfe' && !!d.encerrado_em
}

/** Primeira emissão e novas tentativas (erro, pendente): mesma ref de antes. Reemissão depois de cancelar/encerrar: próxima versão. */
export function calcularRef(tipo: TipoRef, operacaoId: string, d: DocAtual): { ref: string; versao: number; reemissao: boolean } {
  const base = refBase(tipo, operacaoId)
  const atual = versaoDaRef(d?.referencia, base)
  if (documentoFinalizado(tipo, d)) {
    const versao = atual + 1
    return { ref: `${base}-v${versao}`, versao, reemissao: true }
  }
  // Tentativa repetida: mantém a ref gravada (se for desta operação e do tipo), senão a base.
  const ref = d?.referencia && (d.referencia === base || d.referencia.startsWith(`${base}-v`)) ? d.referencia : base
  return { ref, versao: versaoDaRef(ref, base), reemissao: false }
}
