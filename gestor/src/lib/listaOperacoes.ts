// Filtros extras da lista compacta de operações (data, cliente, motorista). Sem React e sem rede.
// Testes: node --test gestor/test/listaOperacoes.test.ts

export const SEM_MOTORISTA = '__sem_motorista__'

export type FiltrosLista = {
  de: string // AAAA-MM-DD (data de criação da operação), '' = sem limite
  ate: string
  clienteId: string // '' = todos
  motoristaId: string // '' = todos; SEM_MOTORISTA = ainda sem motorista alocado
}

export const FILTROS_VAZIOS: FiltrosLista = { de: '', ate: '', clienteId: '', motoristaId: '' }

export function temFiltro(f: FiltrosLista): boolean {
  return !!(f.de || f.ate || f.clienteId || f.motoristaId)
}

// Dia (no fuso do navegador) de um instante ISO, no formato AAAA-MM-DD.
export function diaLocal(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function passaFiltrosLista(op: { criadaEm: string; clienteId: string | null; motoristaId: string | null }, f: FiltrosLista): boolean {
  if (f.de || f.ate) {
    const dia = diaLocal(op.criadaEm)
    if (f.de && dia < f.de) return false
    if (f.ate && dia > f.ate) return false
  }
  if (f.clienteId && op.clienteId !== f.clienteId) return false
  if (f.motoristaId === SEM_MOTORISTA) return !op.motoristaId
  if (f.motoristaId && op.motoristaId !== f.motoristaId) return false
  return true
}
