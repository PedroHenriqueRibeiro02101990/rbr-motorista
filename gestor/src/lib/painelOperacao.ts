// Regras puras do cabeçalho do painel da operação. Testes: node --test gestor/test/painelOperacao.test.ts

// Código curto exibido no cabeçalho (ex.: OP-0ca2): os 4 primeiros caracteres do id. A busca da lista já casa pelos 8 primeiros.
export function codigoCurto(id: string): string {
  return `OP-${id.replace(/-/g, '').slice(0, 4).toLowerCase()}`
}

export type Vizinhos = { posicao: number; total: number; anteriorId: string | null; proximaId: string | null }

// Anterior/próxima entre as operações da lista JÁ filtrada (na ordem em que aparece na tela).
// Se a operação aberta não está na lista (filtro mudou), não há vizinhos — a navegação some, o painel continua.
export function vizinhos(ids: string[], atualId: string): Vizinhos | null {
  const i = ids.indexOf(atualId)
  if (i < 0) return null
  return { posicao: i + 1, total: ids.length, anteriorId: i > 0 ? ids[i - 1] : null, proximaId: i < ids.length - 1 ? ids[i + 1] : null }
}

// NF-es no cabeçalho: até `max` números e "+N" para o resto.
export function resumoNfes(nfes: string[], max = 3): string {
  const lista = nfes.filter(Boolean)
  if (lista.length === 0) return 'sem NF-e'
  if (lista.length <= max) return lista.join(', ')
  return `${lista.slice(0, max).join(', ')} +${lista.length - max}`
}
