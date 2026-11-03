// Menu por papel: cada função vê só o que usa. É conforto, não segurança: o que cada uma pode LER quem decide é o banco (RLS).
// Gestor vê tudo. Papel desconhecido vê só o básico (Início, Busca, Avisos).
const BASICO = ['/', '/busca', '/avisos']

const POR_PAPEL: Record<string, string[]> = {
  comercial: [...BASICO, '/cotacao', '/pre-cotacao', '/cadastros', '/meus-clientes'],
  operacao: [...BASICO, '/fila-do-dia', '/operacoes', '/mapa', '/cadastros', '/alteracoes'],
  fiscal: [...BASICO, '/operacoes', '/fiscal', '/saude-fiscal'],
  financeiro: [...BASICO, '/financeiro', '/notas-parceiros', '/operacoes'],
}

// Serviços reúne Cotação, Operações e Fiscal: aparece para quem usa qualquer um dos três.
const DENTRO_DE_SERVICOS = ['/cotacao', '/operacoes', '/fiscal']

export function podeVerNoMenu(papel: string | null | undefined, rota: string): boolean {
  if (papel === 'gestor_rbr') return true
  if (rota === '/servicos') return DENTRO_DE_SERVICOS.some((r) => (POR_PAPEL[papel ?? ''] ?? BASICO).includes(r))
  return (POR_PAPEL[papel ?? ''] ?? BASICO).includes(rota)
}
