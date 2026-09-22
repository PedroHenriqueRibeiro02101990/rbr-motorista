// Mapa de frota — Leaflet + tiles do OpenStreetMap (grátis, sem chave de API).
// Decisão registrada em claude/monitoramento-localizacao-frota.md: captura via
// GPS do celular do motorista (grátis) enquanto ele estiver com o app aberto;
// não é rastreio contínuo (tela bloqueada = sem atualização) — por isso o mapa
// mostra "última localização conhecida, há X min", não um ponto se movendo ao vivo.
import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
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
}

function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

function iconePara(fonte: FrotaMapPonto['fonte']) {
  const cor = fonte === 'wialon' ? '#B8863B' : '#1E2761'
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${cor};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })
}

export default function FrotaMap({ pontos, height = 320 }: { pontos: FrotaMapPonto[]; height?: number }) {
  const centro = useMemo<[number, number]>(() => {
    if (pontos.length === 0) return [-23.55, -46.63] // fallback: São Paulo
    const lat = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length
    const lng = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length
    return [lat, lng]
  }, [pontos])

  if (pontos.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-[20px] border text-sm"
        style={{ height, borderColor: 'var(--rbr-border)', color: 'var(--rbr-muted)', background: '#F7F8FB' }}
      >
        Nenhuma localização recente para mostrar.
      </div>
    )
  }

  return (
    <div className="rounded-[20px] overflow-hidden border" style={{ borderColor: 'var(--rbr-border)', height }}>
      <MapContainer center={centro} zoom={pontos.length === 1 ? 12 : 6} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pontos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={iconePara(p.fonte)}>
            <Popup>
              <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{p.nome}</div>
                {p.subtitulo && <div style={{ color: '#6B7280', fontSize: 12 }}>{p.subtitulo}</div>}
                <div style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                  {p.fonte === 'wialon' ? 'Rastreador certificado' : 'GPS do celular'} · há{' '}
                  {minutosDesde(p.capturadoEm)} min
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
