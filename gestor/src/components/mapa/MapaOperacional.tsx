import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type Sinal = 'ok' | 'atencao' | 'alerta' | 'sem' | null
export type CargaMapa = {
  id: string
  status: string
  origem: string
  destino: string
  cliente: string | null
  origem_coord: [number, number] | null
  destino_coord: [number, number] | null
  motorista: string | null
  motorista_id: string | null
  celular: string | null
  placa: string | null
  tipo_veiculo: string | null
  rastreador: string | null
  perigosa: boolean
  coleta_em: string | null
  ultima: { lat: number; lng: number; em: string; fonte: string } | null
  sinal: Sinal
  trilha: [number, number, string][]
  distancia_total_km: number | null
  restante_km: number | null
}
export type MotoristaMapa = {
  id: string
  nome: string
  celular: string | null
  papel: string
  cnh_categoria: string | null
  veiculos: { placa: string; tipo: string | null; capacidade: number | null }[] | null
  lat: number
  lng: number
  em: string
  fonte: string
}

export const COR_SINAL: Record<string, string> = {
  ok: '#1F9D55',
  atencao: '#D9A400',
  alerta: '#C53030',
  sem: '#8A93A6',
}

function pino(cor: string, selecionado: boolean, rotulo?: string) {
  const tam = selecionado ? 22 : 16
  return L.divIcon({
    className: '',
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:50%;background:${cor};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font:700 9px sans-serif">${rotulo ?? ''}</div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    popupAnchor: [0, -tam / 2],
  })
}
const iconeDestino = L.divIcon({
  className: '',
  html: '<div style="font-size:22px;line-height:22px;transform:translate(2px,-18px)">🏁</div>',
  iconSize: [22, 22],
  iconAnchor: [4, 4],
})

// Ajusta o zoom para caber o que interessa (seleção ou tudo).
function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap()
  const chave = pontos.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (pontos.length === 0) return
    if (pontos.length === 1) map.setView(pontos[0], 11)
    else map.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 12 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return null
}

function minutos(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h ${m % 60} min`
}

export default function MapaOperacional({
  cargas,
  motoristas,
  selecionada,
  onSelecionar,
  origemDestaque,
  height = 600,
}: {
  cargas: CargaMapa[]
  motoristas: MotoristaMapa[]
  selecionada: CargaMapa | null
  onSelecionar: (id: string) => void
  origemDestaque?: [number, number] | null
  height?: number
}) {
  const enquadrar = useMemo<[number, number][]>(() => {
    if (selecionada) {
      const pts: [number, number][] = []
      if (selecionada.ultima) pts.push([Number(selecionada.ultima.lat), Number(selecionada.ultima.lng)])
      if (selecionada.origem_coord) pts.push(selecionada.origem_coord.map(Number) as [number, number])
      if (selecionada.destino_coord) pts.push(selecionada.destino_coord.map(Number) as [number, number])
      if (origemDestaque) motoristas.slice(0, 5).forEach((m) => pts.push([Number(m.lat), Number(m.lng)]))
      return pts
    }
    const pts: [number, number][] = []
    cargas.forEach((c) => c.ultima && pts.push([Number(c.ultima.lat), Number(c.ultima.lng)]))
    motoristas.forEach((m) => pts.push([Number(m.lat), Number(m.lng)]))
    return pts
  }, [selecionada, cargas, motoristas, origemDestaque])

  return (
    <div className="rounded-[20px] overflow-hidden border" style={{ borderColor: 'var(--rbr-border)', height }}>
      <MapContainer center={[-23.55, -46.63]} zoom={5} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Enquadrar pontos={enquadrar} />

        {/* Rota da carga selecionada: caminho percorrido (linha cheia) e o que falta (tracejado) */}
        {selecionada && selecionada.trilha.length > 1 && (
          <Polyline positions={selecionada.trilha.map((t) => [Number(t[0]), Number(t[1])] as [number, number])} pathOptions={{ color: '#1E2761', weight: 4 }} />
        )}
        {selecionada && selecionada.destino_coord && (selecionada.ultima || selecionada.origem_coord) && (
          <Polyline
            positions={[
              selecionada.ultima ? [Number(selecionada.ultima.lat), Number(selecionada.ultima.lng)] : (selecionada.origem_coord!.map(Number) as [number, number]),
              selecionada.destino_coord.map(Number) as [number, number],
            ]}
            pathOptions={{ color: '#1E2761', weight: 2, dashArray: '6 8', opacity: 0.6 }}
          />
        )}
        {selecionada?.origem_coord && (
          <CircleMarker center={selecionada.origem_coord.map(Number) as [number, number]} radius={7} pathOptions={{ color: '#1E2761', fillColor: '#fff', fillOpacity: 1, weight: 3 }}>
            <Popup>Coleta: {selecionada.origem}</Popup>
          </CircleMarker>
        )}
        {selecionada?.destino_coord && (
          <Marker position={selecionada.destino_coord.map(Number) as [number, number]} icon={iconeDestino}>
            <Popup>Entrega: {selecionada.destino}</Popup>
          </Marker>
        )}
        {origemDestaque && (
          <CircleMarker center={origemDestaque} radius={9} pathOptions={{ color: '#B8863B', fillColor: '#B8863B', fillOpacity: 0.35, weight: 3 }}>
            <Popup>Local da coleta</Popup>
          </CircleMarker>
        )}

        {/* Cargas: cor pelo sinal de GPS */}
        {cargas
          .filter((c) => c.ultima)
          .map((c) => (
            <Marker
              key={c.id}
              position={[Number(c.ultima!.lat), Number(c.ultima!.lng)]}
              icon={pino(COR_SINAL[c.sinal ?? 'sem'] ?? COR_SINAL.sem, selecionada?.id === c.id)}
              eventHandlers={{ click: () => onSelecionar(c.id) }}
            >
              <Popup>
                <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>
                    {c.origem} → {c.destino}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: 12 }}>
                    {c.motorista ?? 'Sem motorista'} · {c.placa ?? '—'}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: 12 }}>
                    {c.ultima!.fonte === 'wialon' ? 'Rastreador' : 'Celular'} · {minutos(c.ultima!.em)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Motoristas disponíveis (online, sem carga) */}
        {motoristas.map((m) => (
          <Marker key={m.id} position={[Number(m.lat), Number(m.lng)]} icon={pino('#3B82C4', false, 'M')}>
            <Popup>
              <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{m.nome}</div>
                <div style={{ color: '#6B7280', fontSize: 12 }}>
                  {(m.veiculos ?? []).map((v) => `${v.tipo ?? 'Veículo'} ${v.placa}`).join(' · ') || 'Sem veículo aprovado'}
                </div>
                <div style={{ color: '#6B7280', fontSize: 12 }}>Disponível · posição {minutos(m.em)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
