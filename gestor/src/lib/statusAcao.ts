// Regra G5: confirmacao de sucesso = linha de status PERMANENTE com data, hora e quem fez ("Lancado em 18/11 04:20 por Eduardo").
// Teste: node --test gestor/test/statusAcao.test.ts
export type FaseAcao = 'parado' | 'enviando' | 'ok' | 'erro'
export interface EstadoAcao { fase: FaseAcao; texto?: string; quando?: string | null; quem?: string | null }

const dois = (n: number) => String(n).padStart(2, '0')

/** "18/11 04:20" no fuso de Brasilia (UTC-3 fixo, sem horario de verao desde 2019). */
export function dataHoraCurta(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = new Date(typeof iso === 'string' ? iso : iso.toISOString())
  if (Number.isNaN(d.getTime())) return ''
  const b = new Date(d.getTime() - 3 * 3600_000)
  return `${dois(b.getUTCDate())}/${dois(b.getUTCMonth() + 1)} ${dois(b.getUTCHours())}:${dois(b.getUTCMinutes())}`
}

/** "Lancado em 18/11 04:20 por Eduardo" (verbo no passado vem do chamador: Lancado, Enviado, Emitido, Cancelado...). */
export function linhaConfirmacao(verbo: string, quando: string | Date | null | undefined, quem?: string | null): string {
  const dh = dataHoraCurta(quando)
  return `${verbo}${dh ? ` em ${dh}` : ''}${quem ? ` por ${quem}` : ''}`
}

export const TOAST_MS = 4000
