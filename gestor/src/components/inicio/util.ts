import type { CargaMapa } from '../mapa/MapaOperacional'

// Mesma premissa da tela Mapa: média de 60 km/h, sem paradas.
const VELOCIDADE_MEDIA_KMH = 60

export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  return h < 48 ? `há ${h} h` : `há ${Math.floor(h / 24)} dias`
}

export function progresso(c: CargaMapa): number | null {
  if (!c.distancia_total_km || c.restante_km == null) return null
  return Math.max(0, Math.min(100, Math.round((1 - Number(c.restante_km) / Number(c.distancia_total_km)) * 100)))
}

// "~18:40", "amanhã ~09:10" ou "14/10 ~07:00", a partir do que falta pela última posição.
export function previsaoChegada(c: CargaMapa): string | null {
  if (c.status === 'entregue') return 'entregue'
  if (c.restante_km == null) return null
  const km = Number(c.restante_km)
  if (km < 5) return 'chegando'
  const chegada = new Date(Date.now() + (km / VELOCIDADE_MEDIA_KMH) * 3_600_000)
  const hora = chegada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = (d: Date) => d.toLocaleDateString('sv-SE')
  const amanha = new Date(Date.now() + 86_400_000)
  if (dia(chegada) === dia(new Date())) return `~${hora}`
  if (dia(chegada) === dia(amanha)) return `amanhã ~${hora}`
  return `${chegada.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ~${hora}`
}
