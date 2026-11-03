// Aviso de retorno de uma ação (sucesso ou erro) em português, sem código cru. Qualquer parte do app chama mostrarToast;
// o ToastHost (montado no AppShell) escuta e mostra por alguns segundos.
export type TipoToast = 'sucesso' | 'erro'
export const EVENTO_TOAST = 'rbr:toast'

export function mostrarToast(texto: string, tipo: TipoToast = 'sucesso') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENTO_TOAST, { detail: { texto, tipo } }))
}

// Resumo da operação para o título dos pop-ups fiscais: "OP-xxxx - Cliente - Origem/UF > Destino/UF".
export function tituloOperacao(o: { codigo: string; cliente?: string | null; cidadeOrigem?: string | null; ufOrigem?: string | null; cidadeDestino?: string | null; ufDestino?: string | null }): string {
  const rota = `${o.cidadeOrigem ?? '?'}/${o.ufOrigem ?? '?'} > ${o.cidadeDestino ?? '?'}/${o.ufDestino ?? '?'}`
  return `${o.codigo} - ${o.cliente ?? 'Cliente a confirmar'} - ${rota}`
}
