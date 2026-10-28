// Datas previstas de coleta e entrega da operação (operacoes.coleta_prevista / entrega_prevista).
// O CIOT usa as duas como início e fim da viagem. Sem React e sem rede, para testar com node --test.

// timestamptz -> valor de <input type="datetime-local"> (horário local)
export const paraInput = (v: string | null | undefined, fusoMin = new Date().getTimezoneOffset()) =>
  v ? new Date(new Date(v).getTime() - fusoMin * 60000).toISOString().slice(0, 16) : ''
export const doInput = (v: string) => (v ? new Date(v).toISOString() : null)

export function validarDatasPrevistas(coleta: string, entrega: string, agora = new Date()): string | null {
  if (!coleta && !entrega) return null
  if (!coleta || !entrega) return 'Informe a coleta e a entrega previstas, ou deixe as duas em branco.'
  const c = new Date(coleta).getTime()
  const e = new Date(entrega).getTime()
  if (!Number.isFinite(c) || !Number.isFinite(e)) return 'Data inválida.'
  if (e <= c) return 'A entrega prevista precisa ser depois da coleta prevista.'
  if (e < agora.getTime()) return 'A entrega prevista já passou.'
  return null
}
