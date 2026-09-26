import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { linkWhatsApp } from '@rbr/shared/documento'
import MapaOperacional, { COR_SINAL, type CargaMapa, type MotoristaMapa } from '../components/mapa/MapaOperacional'

type Aba = 'andamento' | 'sem_motorista' | 'disponiveis'

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}
const SINAL_TEXTO: Record<string, string> = {
  ok: 'Sinal em dia',
  atencao: 'Sinal atrasado',
  alerta: 'Sem sinal há muito tempo',
  sem: 'Nenhuma posição recebida',
}
const VELOCIDADE_MEDIA_KMH = 60
const ATUALIZAR_A_CADA_MS = 60_000

function haQuanto(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  return h < 48 ? `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `há ${Math.floor(h / 24)} dias`
}
function distancia(a: [number, number], b: [number, number]): number {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function progresso(c: CargaMapa): number | null {
  if (!c.distancia_total_km || c.restante_km == null) return null
  return Math.max(0, Math.min(100, Math.round((1 - Number(c.restante_km) / Number(c.distancia_total_km)) * 100)))
}

function BadgeSinal({ c }: { c: CargaMapa }) {
  if (!c.sinal) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: COR_SINAL[c.sinal] }}>
      <span className="w-2 h-2 rounded-full" style={{ background: COR_SINAL[c.sinal] }} />
      {c.ultima ? haQuanto(c.ultima.em) : 'sem posição'}
    </span>
  )
}

export default function Mapa() {
  const [params, setParams] = useSearchParams()
  const [cargas, setCargas] = useState<CargaMapa[]>([])
  const [motoristas, setMotoristas] = useState<MotoristaMapa[]>([])
  const [carregado, setCarregado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>((params.get('aba') as Aba) ?? 'andamento')
  const [selId, setSelId] = useState<string | null>(params.get('op'))
  const ocupado = useRef(false)

  const carregar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    const { data, error } = await supabase.rpc('mapa_operacional')
    ocupado.current = false
    setCarregado(true)
    if (error) return setErro(error.message)
    setErro(null)
    const d = data as unknown as { gerado_em: string; cargas: CargaMapa[]; motoristas: MotoristaMapa[] }
    setCargas(d.cargas ?? [])
    setMotoristas(d.motoristas ?? [])
    setAtualizadoEm(d.gerado_em)
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), ATUALIZAR_A_CADA_MS)
    const vis = () => document.visibilityState === 'visible' && carregar()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [carregar])

  function mudarAba(a: Aba) {
    setAba(a)
    setSelId(null)
    const p = new URLSearchParams(params)
    p.set('aba', a)
    p.delete('op')
    setParams(p, { replace: true })
  }
  function selecionar(id: string | null) {
    setSelId(id)
    const c = cargas.find((x) => x.id === id)
    if (c) setAba(c.status === 'alocando_motorista' ? 'sem_motorista' : 'andamento')
    const p = new URLSearchParams(params)
    if (id) p.set('op', id)
    else p.delete('op')
    setParams(p, { replace: true })
  }

  const andamento = cargas.filter((c) => c.status !== 'alocando_motorista')
  const semMotorista = cargas.filter((c) => c.status === 'alocando_motorista')
  const selecionada = cargas.find((c) => c.id === selId) ?? null
  const problemas = andamento.filter((c) => c.sinal === 'alerta' || c.sinal === 'sem').length

  // Para carga sem motorista: disponíveis mais perto do local de coleta primeiro.
  const origemSel = selecionada?.status === 'alocando_motorista' && selecionada.origem_coord ? (selecionada.origem_coord.map(Number) as [number, number]) : null
  const perto = useMemo(() => {
    if (!origemSel) return motoristas.map((m) => ({ m, km: null as number | null }))
    return motoristas
      .map((m) => ({ m, km: Math.round(distancia(origemSel, [Number(m.lat), Number(m.lng)]) * 1.25) }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
  }, [motoristas, origemSel])

  const cargasNoMapa = aba === 'disponiveis' ? [] : aba === 'sem_motorista' ? [] : andamento
  const motoristasNoMapa = aba === 'andamento' ? [] : aba === 'sem_motorista' && origemSel ? perto.map((p) => p.m) : motoristas

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Mapa</h1>
          <div className="text-xs text-[color:var(--rbr-muted)] mt-0.5">
            Última posição conhecida — o celular envia a cada ~4h com o app aberto; carga perigosa usa rastreador contínuo.
            {atualizadoEm ? ` Atualizado ${haQuanto(atualizadoEm)}.` : ''}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[color:var(--rbr-muted)] flex-wrap">
          {(['ok', 'atencao', 'alerta', 'sem'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COR_SINAL[s] }} /> {SINAL_TEXTO[s]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3B82C4' }} /> Motorista disponível
          </span>
        </div>
      </div>

      {erro && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {erro}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(
          [
            ['andamento', `Em andamento (${andamento.length})`],
            ['sem_motorista', `Sem motorista (${semMotorista.length})`],
            ['disponiveis', `Motoristas disponíveis (${motoristas.length})`],
          ] as [Aba, string][]
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => mudarAba(v)}
            className="text-sm font-bold px-4 py-2 rounded-xl border"
            style={{
              borderColor: 'var(--rbr-navy)',
              background: aba === v ? 'var(--rbr-navy)' : 'transparent',
              color: aba === v ? '#fff' : 'var(--rbr-navy)',
            }}
          >
            {l}
            {v === 'andamento' && problemas > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--rbr-danger)', color: '#fff' }}>
                {problemas}
              </span>
            )}
          </button>
        ))}
      </div>

      {!carregado ? (
        <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>
      ) : (
        <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
          {/* Lista */}
          <div className="flex flex-col gap-2.5 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1 order-2 lg:order-1">
            {aba === 'andamento' &&
              (andamento.length === 0 ? (
                <Vazio>Nenhuma carga em andamento.</Vazio>
              ) : (
                andamento.map((c) => (
                  <ItemCarga key={c.id} c={c} ativo={selId === c.id} onClick={() => selecionar(selId === c.id ? null : c.id)} />
                ))
              ))}

            {aba === 'sem_motorista' &&
              (semMotorista.length === 0 ? (
                <Vazio>Todas as cargas têm motorista.</Vazio>
              ) : (
                semMotorista.map((c) => (
                  <ItemCarga key={c.id} c={c} ativo={selId === c.id} onClick={() => selecionar(selId === c.id ? null : c.id)} />
                ))
              ))}

            {aba === 'disponiveis' &&
              (motoristas.length === 0 ? (
                <Vazio>Nenhum motorista online com posição nas últimas 24h. Só aparece quem está com o app em "online" (é quem autorizou ser localizado).</Vazio>
              ) : (
                motoristas.map((m) => <ItemMotorista key={m.id} m={m} km={null} carga={null} />)
              ))}
          </div>

          {/* Mapa + detalhe */}
          <div className="flex flex-col gap-3 order-1 lg:order-2">
            <MapaOperacional
              cargas={cargasNoMapa}
              motoristas={motoristasNoMapa}
              selecionada={selecionada}
              onSelecionar={(id) => selecionar(id)}
              origemDestaque={origemSel}
              height={selecionada ? 420 : 600}
            />
            {selecionada && selecionada.status !== 'alocando_motorista' && <DetalheCarga c={selecionada} onFechar={() => selecionar(null)} />}
            {selecionada && selecionada.status === 'alocando_motorista' && (
              <section className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Quem está perto da coleta</div>
                    <div className="text-sm font-bold mt-0.5">
                      {selecionada.origem} → {selecionada.destino}
                    </div>
                  </div>
                  <Link to={`/operacoes?op=${selecionada.id}`} className="text-xs font-bold text-[color:var(--rbr-navy)] whitespace-nowrap">
                    Alocar na operação →
                  </Link>
                </div>
                {!origemSel && <div className="text-xs text-[color:var(--rbr-muted)]">Não achei a cidade de coleta no cadastro de municípios para calcular a distância.</div>}
                {perto.length === 0 ? (
                  <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum motorista disponível online agora.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {perto.slice(0, 10).map(({ m, km }) => (
                      <ItemMotorista key={m.id} m={m} km={km} carga={selecionada} />
                    ))}
                  </div>
                )}
                <div className="text-[11px] text-[color:var(--rbr-muted)]">
                  Distância estimada pela estrada (linha reta × 1,25). Mostra só motoristas aprovados, online e sem carga.
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={cardStyle}>
      {children}
    </div>
  )
}

function ItemCarga({ c, ativo, onClick }: { c: CargaMapa; ativo: boolean; onClick: () => void }) {
  const pct = progresso(c)
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border rounded-[16px] px-4 py-3 flex flex-col gap-1.5"
      style={{ ...cardStyle, borderColor: ativo ? 'var(--rbr-navy)' : c.sinal === 'alerta' || c.sinal === 'sem' ? '#F4C9C9' : 'var(--rbr-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
          {STATUS_OPERACAO_LABEL[c.status] ?? c.status}
          {c.perigosa ? ' · perigosa' : ''}
        </span>
        <BadgeSinal c={c} />
      </div>
      <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
        {c.origem} → {c.destino}
      </div>
      <div className="text-xs text-[color:var(--rbr-muted)] truncate">
        {c.motorista ?? 'Sem motorista'}
        {c.placa ? ` · ${c.placa}` : ''}
        {c.cliente ? ` · ${c.cliente}` : ''}
      </div>
      {pct != null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF0F5' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--rbr-navy)' }} />
          </div>
          <span className="text-[11px] text-[color:var(--rbr-muted)] tabular-nums">{pct}%</span>
        </div>
      )}
    </button>
  )
}

function DetalheCarga({ c, onFechar }: { c: CargaMapa; onFechar: () => void }) {
  const pct = progresso(c)
  const horas = c.restante_km != null ? Number(c.restante_km) / VELOCIDADE_MEDIA_KMH : null
  const Linha = ({ r, v }: { r: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-[color:var(--rbr-muted)]">{r}</span>
      <span className="font-semibold text-right">{v}</span>
    </div>
  )
  return (
    <section className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
            {STATUS_OPERACAO_LABEL[c.status] ?? c.status}
            {c.perigosa ? ' · carga perigosa' : ''}
          </div>
          <div className="text-base font-bold mt-0.5">
            {c.origem} → {c.destino}
          </div>
          {c.cliente && <div className="text-xs text-[color:var(--rbr-muted)]">{c.cliente}</div>}
        </div>
        <button onClick={onFechar} className="text-xs font-bold text-[color:var(--rbr-muted)]">
          Fechar
        </button>
      </div>
      {c.sinal && (
        <div className="text-xs rounded-xl px-3 py-2 font-semibold" style={{ background: `${COR_SINAL[c.sinal]}1A`, color: COR_SINAL[c.sinal] }}>
          {SINAL_TEXTO[c.sinal]}
          {c.ultima ? ` · última posição ${haQuanto(c.ultima.em)} (${c.ultima.fonte === 'wialon' ? 'rastreador' : 'celular'})` : ''}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5">
        <Linha r="Motorista" v={c.motorista ?? '—'} />
        <Linha r="Veículo" v={[c.tipo_veiculo, c.placa].filter(Boolean).join(' · ') || '—'} />
        <Linha r="Rastreamento" v={c.rastreador === 'wialon' ? 'Rastreador certificado' : c.rastreador === 'nenhum' ? 'Nenhum' : 'GPS do celular'} />
        <Linha r="Distância da viagem" v={c.distancia_total_km != null ? `~${Number(c.distancia_total_km).toLocaleString('pt-BR')} km` : '—'} />
        <Linha r="Falta" v={c.restante_km != null ? `~${Number(c.restante_km).toLocaleString('pt-BR')} km` : '—'} />
        <Linha r="Chegada estimada" v={horas != null ? (horas < 1 ? 'menos de 1 h' : `~${Math.round(horas)} h de estrada`) : '—'} />
      </div>
      {pct != null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#EEF0F5' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--rbr-navy)' }} />
          </div>
          <span className="text-xs font-bold tabular-nums">{pct}% do caminho</span>
        </div>
      )}
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        Distâncias estimadas pela estrada (linha reta × 1,25) e chegada a {VELOCIDADE_MEDIA_KMH} km/h de média, sem paradas.
      </div>
      <div className="flex gap-2 flex-wrap">
        <Link to={`/operacoes?op=${c.id}`} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
          Abrir operação
        </Link>
        {c.celular && (
          <a
            href={linkWhatsApp(
              c.celular,
              c.sinal === 'ok'
                ? `Olá, ${(c.motorista ?? '').split(' ')[0]}! Aqui é da RBR Cargo. Tudo certo com a viagem ${c.origem} → ${c.destino}?`
                : `Olá, ${(c.motorista ?? '').split(' ')[0]}! Aqui é da RBR Cargo. Não estamos recebendo sua localização. Pode abrir o app da RBR um instante, por favor?`,
            )}
            target="_blank"
            rel="noopener"
            className="text-xs font-bold px-3 py-1.5 rounded-lg border"
            style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
          >
            {c.sinal === 'ok' ? 'Falar no WhatsApp' : 'Pedir para abrir o app'}
          </a>
        )}
      </div>
    </section>
  )
}

function ItemMotorista({ m, km, carga }: { m: MotoristaMapa; km: number | null; carga: CargaMapa | null }) {
  const veic = (m.veiculos ?? []).map((v) => `${v.tipo ?? 'Veículo'} ${v.placa}`).join(' · ')
  const texto = carga
    ? `Olá, ${m.nome.split(' ')[0]}! Aqui é da RBR Cargo. Tenho uma carga de ${carga.origem} para ${carga.destino}. Tem interesse?`
    : `Olá, ${m.nome.split(' ')[0]}! Aqui é da RBR Cargo. Você está disponível para carga?`
  return (
    <div className="bg-white border rounded-[14px] px-3.5 py-2.5 flex items-center justify-between gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="min-w-0">
        <div className="text-sm font-bold truncate">
          {m.nome}
          {km != null && <span className="font-semibold text-[color:var(--rbr-navy)]"> · ~{km.toLocaleString('pt-BR')} km</span>}
        </div>
        <div className="text-xs text-[color:var(--rbr-muted)] truncate">
          {veic || 'Sem veículo aprovado'}
          {m.cnh_categoria ? ` · CNH ${m.cnh_categoria}` : ''} · posição {haQuanto(m.em)}
        </div>
      </div>
      {m.celular && (
        <a
          href={linkWhatsApp(m.celular, texto)}
          target="_blank"
          rel="noopener"
          className="text-xs font-bold px-2.5 py-1 rounded-lg border flex-shrink-0"
          style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
        >
          WhatsApp
        </a>
      )}
    </div>
  )
}
