import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import FrotaMap, { type FrotaMapPonto } from '@rbr/shared/FrotaMap'
import { formatDateTime } from '@rbr/shared/format'

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

export default function Mapa() {
  const [pontos, setPontos] = useState<FrotaMapPonto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('posicoes_gps')
      .select('id, pessoa_id, latitude, longitude, capturado_em, fonte, pessoas(nome), veiculos(placa)')
      .order('capturado_em', { ascending: false })
      .limit(1000)

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const maisRecentePorPessoa = new Map<string, (typeof data)[number]>()
    for (const row of data ?? []) {
      if (!maisRecentePorPessoa.has(row.pessoa_id)) {
        maisRecentePorPessoa.set(row.pessoa_id, row)
      }
    }

    const mapeados: FrotaMapPonto[] = Array.from(maisRecentePorPessoa.values()).map((row: any) => ({
      id: row.pessoa_id,
      lat: row.latitude,
      lng: row.longitude,
      nome: row.pessoas?.nome ?? 'Motorista',
      subtitulo: row.veiculos?.placa,
      capturadoEm: row.capturado_em,
      fonte: row.fonte,
    }))

    setPontos(mapeados)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Mapa da frota</h1>
        <div className="flex items-center gap-4 text-xs text-[color:var(--rbr-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--rbr-navy)' }} /> GPS do celular
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--rbr-gold)' }} /> Rastreador Wialon
          </span>
        </div>
      </div>

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && (
        <>
          <FrotaMap pontos={pontos} height={520} />

          <section className="bg-white border rounded-[20px] overflow-hidden" style={cardStyle}>
            <div className="px-[18px] py-3.5 border-b text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]" style={{ borderColor: 'var(--rbr-border)' }}>
              {pontos.length} motorista(s) com localização recente
            </div>
            {pontos.length === 0 ? (
              <div className="text-sm text-[color:var(--rbr-muted)] p-[18px]">Nenhuma localização recente.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--rbr-border)' }}>
                {pontos
                  .slice()
                  .sort((a, b) => new Date(b.capturadoEm).getTime() - new Date(a.capturadoEm).getTime())
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-[18px] py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.nome}</div>
                        <div className="text-xs text-[color:var(--rbr-muted)]">
                          {p.subtitulo ?? '—'} · {formatDateTime(p.capturadoEm)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: p.fonte === 'wialon' ? 'var(--rbr-gold)' : 'var(--rbr-navy)' }}
                        />
                        <span className="text-xs text-[color:var(--rbr-muted)]">há {minutosDesde(p.capturadoEm)} min</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
