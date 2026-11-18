// CIOT na tela: o Repom mostra 16 dígitos (12 do CIOT + 4 do verificador); o banco guarda separado
// (operacao_ciot_vpo.ciot e ciot_verificador). Aceita 12 ou 16 dígitos, com ou sem máscara/barra.
export function separarCiotDigitado(texto: unknown): { ciot: string; verificador: string | null } | null {
  const d = String(texto ?? '').replace(/\D/g, '')
  if (d.length === 12) return { ciot: d, verificador: null }
  if (d.length === 16) return { ciot: d.slice(0, 12), verificador: d.slice(12) }
  return null
}
