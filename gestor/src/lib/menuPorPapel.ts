// Menu por papel: cada função vê só o que usa. É conforto, não segurança: o que cada uma pode LER quem decide é o banco (RLS).
// Gestor vê tudo. Papel desconhecido vê só o básico (Início, Busca, Avisos).
const BASICO = ['/', '/busca', '/avisos']

const POR_PAPEL: Record<string, string[]> = {
  comercial: [...BASICO, '/cotacao', '/pre-cotacao', '/cadastros'],
  operacao: [...BASICO, '/fila-do-dia', '/operacoes', '/mapa', '/cadastros'],
  fiscal: [...BASICO, '/operacoes', '/fiscal', '/saude-fiscal'],
  financeiro: [...BASICO, '/financeiro', '/notas-parceiros', '/operacoes'],
}

export function podeVerNoMenu(papel: string | null | undefined, rota: string): boolean {
  if (papel === 'gestor_rbr') return true
  return (POR_PAPEL[papel ?? ''] ?? BASICO).includes(rota)
}
