// Mini mapa: projeta a geometria REAL da rota (OSRM, já simplificada pela função) num SVG. Sem geometria, o mapa fica
// estilizado e SEM praças (nunca inventamos praça). Funções puras, testadas em mapa.test.ts.
export interface Ponto { x: number; y: number }
export interface Trajeto { d: string; inicio: Ponto; fim: Ponto; meio: Ponto; pontos: Ponto[] }

export const VIEW = { w: 340, h: 118 }
const MARGEM = { esq: 34, dir: 36, topo: 24, base: 30 }

/** geometria = [[lon, lat], ...]. Projeção equiretangular com correção de latitude; cabe na caixa mantendo a proporção. */
export function projetar(geo: [number, number][] | null | undefined): Trajeto | null {
  if (!geo || geo.length < 2) return null
  const lat0 = (geo.reduce((s, p) => s + p[1], 0) / geo.length) * (Math.PI / 180)
  const xs = geo.map((p) => p[0] * Math.cos(lat0))
  const ys = geo.map((p) => -p[1]) // norte para cima
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const caixaW = VIEW.w - MARGEM.esq - MARGEM.dir
  const caixaH = VIEW.h - MARGEM.topo - MARGEM.base
  const larg = Math.max(maxX - minX, 1e-9), alt = Math.max(maxY - minY, 1e-9)
  const esc = Math.min(caixaW / larg, caixaH / alt)
  const offX = MARGEM.esq + (caixaW - larg * esc) / 2
  const offY = MARGEM.topo + (caixaH - alt * esc) / 2
  const pontos = geo.map((_, i) => ({ x: round(offX + (xs[i] - minX) * esc), y: round(offY + (ys[i] - minY) * esc) }))
  // Curva suave passando pelos pontos do trajeto (quadráticas entre pontos médios).
  let d = `M${pontos[0].x} ${pontos[0].y}`
  for (let i = 1; i < pontos.length - 1; i++) {
    const m = { x: round((pontos[i].x + pontos[i + 1].x) / 2), y: round((pontos[i].y + pontos[i + 1].y) / 2) }
    d += `Q${pontos[i].x} ${pontos[i].y} ${m.x} ${m.y}`
  }
  const f = pontos[pontos.length - 1]
  d += `L${f.x} ${f.y}`
  return { d, inicio: pontos[0], fim: f, meio: pontos[Math.floor(pontos.length / 2)], pontos }
}
const round = (n: number) => Math.round(n * 10) / 10

/** Rodovia principal só se a Repom a informou (primeira "BR-381", "SP-070"...). Nunca inventada. */
export function rodoviaPrincipal(rodovias: string | null | undefined): string | null {
  const m = String(rodovias ?? '').match(/\b(BR|[A-Z]{2})[- ]?(\d{2,3})\b/i)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null
}

/** Mapa estilizado (sem geometria): mesma curva do desenho aprovado, sem praças. */
export const TRAJETO_ESTILIZADO = 'M34 82C58 36 102 30 130 64S190 110 224 68S272 24 304 42'
