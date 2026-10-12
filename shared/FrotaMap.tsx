// Mapa de frota — Leaflet + tiles do OpenStreetMap (grátis, sem chave de API).
// Decisão registrada em claude/monitoramento-localizacao-frota.md: captura via
// GPS do celular do motorista (grátis) enquanto ele estiver com o app aberto;
// não é rastreio contínuo (tela bloqueada = sem atualização) — por isso o mapa
// mostra "última localização conhecida, há X min", não um ponto se movendo ao vivo.
// tema="escuro" usa os mesmos tiles com filtro CSS (.rbr-mapa-escuro) — usado no Início do gestor.
import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface FrotaMapPonto {
  id: string
  lat: number
  lng: number
  nome: string
  subtitulo?: string
  capturadoEm: string
  fonte: 'app_celular' | 'wialon'
  /** Cor do pino; sem ela, a cor sai da fonte (rastreador ou celular). */
  cor?: string
  /** Pino menor e apagado (ex.: motorista parado). */
  discreto?: boolean
}

export interface FrotaMapLinha {
  id: string
  pontos: [number, number][]
  tracejada?: boolean
}

const BRASIL: [number, number] = [-15.8, -50.5]

function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

function haQuanto(iso: string): string {
  const m = minutosDesde(iso)
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  return h < 48 ? `há ${h} h` : `há ${Math.floor(h / 24)} dias`
}

function iconePara(p: FrotaMapPonto, escuro: boolean, selecionado: boolean) {
  const cor = p.cor ?? (p.fonte === 'wialon' ? '#B8863B' : escuro ? '#8FA2FF' : '#1E2761')
  const tam = selecionado ? 22 : p.discreto ? 10 : 16
  const borda = escuro ? (p.discreto ? 'rgba(255,255,255,.35)' : '#fff') : '#fff'
  const halo = selecionado ? `0 0 0 6px ${cor}55,` : escuro && !p.discreto ? `0 0 0 4px ${cor}33,` : ''
  return L.divIcon({
    className: '',
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:50%;background:${cor};opacity:${p.discreto ? 0.7 : 1};border:${p.discreto ? 1.5 : 2.5}px solid ${borda};box-shadow:${halo}0 1px 4px rgba(0,0,0,0.45)"></div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    popupAnchor: [0, -tam / 2],
  })
}

// Reenquadra quando o conjunto de pontos (ou o foco) muda.
function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap()
  const chave = pontos.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (pontos.length === 0) map.setView(BRASIL, 4)
    else if (pontos.length === 1) map.setView(pontos[0], 10)
    else map.fitBounds(L.latLngBounds(pontos), { padding: [48, 48], maxZoom: 11 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return null
}

export default function FrotaMap({
  pontos,
  height = 320,
  tema = 'claro',
  selecionadoId = null,
  onSelecionar,
  linhas = [],
  foco,
  mostrarVazio = false,
  rolagem = false,
}: {
  pontos: FrotaMapPonto[]
  height?: number | string
  tema?: 'claro' | 'escuro'
  selecionadoId?: string | null
  onSelecionar?: (id: string) => void
  linhas?: FrotaMapLinha[]
  /** Pontos para enquadrar no lugar de todos (ex.: a viagem selecionada). */
  foco?: [number, number][]
  /** Desenha o mapa mesmo sem pontos (o Início põe a mensagem por cima). */
  mostrarVazio?: boolean
  rolagem?: boolean
}) {
  const escuro = tema === 'escuro'
  const centro = useMemo<[number, number]>(() => {
    if (pontos.length === 0) return [-23.55, -46.63] // fallback: São Paulo
    const lat = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length
    const lng = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length
    return [lat, lng]
  }, [pontos])
  const enquadrar = useMemo<[number, number][]>(() => (foco && foco.length ? foco : pontos.map((p) => [p.lat, p.lng])), [foco, pontos])

  if (pontos.length === 0 && !mostrarVazio) {
    return (
      <div
        className="flex items-center justify-center rounded-[20px] border text-sm"
        style={{ height, borderColor: 'var(--rbr-border)', color: 'var(--rbr-muted)', background: '#F7F8FB' }}
      >
        Nenhuma localização recente para mostrar.
      </div>
    )
  }

  const corLinha = escuro ? '#C9D3FF' : '#1E2761'

  return (
    <div
      className={escuro ? 'h-full overflow-hidden rbr-mapa-escuro' : 'rounded-[20px] overflow-hidden border'}
      style={escuro ? { height, background: '#0E1230' } : { borderColor: 'var(--rbr-border)', height }}
    >
      <MapContainer
        center={pontos.length ? centro : BRASIL}
        zoom={pontos.length === 0 ? 4 : pontos.length === 1 ? 12 : 6}
        style={{ width: '100%', height: '100%', background: escuro ? '#0E1230' : undefined }}
        scrollWheelZoom={rolagem}
        zoomControl={!escuro}
        attributionControl
      >
        {/* No tema escuro o mesmo tile do OSM é escurecido por CSS (.rbr-mapa-escuro, no index.css do gestor). */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {(escuro || foco) && <Enquadrar pontos={enquadrar} />}
        {linhas.map((l) => (
          <Polyline
            key={l.id}
            positions={l.pontos}
            pathOptions={l.tracejada ? { color: corLinha, weight: 2, dashArray: '6 8', opacity: 0.6 } : { color: corLinha, weight: 3.5, opacity: 0.9 }}
          />
        ))}
        {pontos.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={iconePara(p, escuro, selecionadoId === p.id)}
            eventHandlers={onSelecionar ? { click: () => onSelecionar(p.id) } : undefined}
          >
            {onSelecionar && (
              <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                <span style={{ fontWeight: 700 }}>{p.nome}</span>
                {p.subtitulo ? <span style={{ color: '#6B7280' }}> · {p.subtitulo}</span> : null}
              </Tooltip>
            )}
            {!onSelecionar && (
              <Popup>
                <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>{p.nome}</div>
                  {p.subtitulo && <div style={{ color: '#6B7280', fontSize: 12 }}>{p.subtitulo}</div>}
                  <div style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                    {p.fonte === 'wialon' ? 'Rastreador certificado' : 'GPS do celular'} · {haQuanto(p.capturadoEm)}
                  </div>
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
