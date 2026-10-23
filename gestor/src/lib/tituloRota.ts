// Título da cotação no formato "CIDADE/UF → CIDADE/UF" (21/10: o card passa a ter a rota como título).
// Usado em pages/Cotacao.tsx (card da lista e cabeçalho do formulário); testes em gestor/test/tituloRota.test.ts.

const parte = (cidade: string | null | undefined, uf: string | null | undefined) => {
  const c = (cidade ?? '').trim().toUpperCase()
  const u = (uf ?? '').trim().toUpperCase()
  if (!c && !u) return '?'
  return `${c || '?'}/${u || '?'}`
}

export function tituloRota(c: {
  cidade_origem?: string | null
  uf_origem?: string | null
  cidade_destino?: string | null
  uf_destino?: string | null
  tipo_cotacao?: string | null
}): string {
  const origem = parte(c.cidade_origem, c.uf_origem)
  if (c.tipo_cotacao === 'varias_entregas' && !c.cidade_destino) return `${origem} → VÁRIOS DESTINOS`
  return `${origem} → ${parte(c.cidade_destino, c.uf_destino)}`
}
