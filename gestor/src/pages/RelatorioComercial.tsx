import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, MOTIVO_PERDA_LABEL } from '@rbr/shared/format'

// Relatório comercial (visual aprovado "Relatorio-Comercial"): funil do período, motivos de perda e fechado no mês, com dados reais das cotações.
// Pedidos recebidos, tempo até a 1ª cotação e a tabela por canal ainda não existem no sistema: aparecem desativados.
type Cot = { status: string; valor_total: number | null; motivo_perda: string | null; created_at: string; updated_at: string; eh_teste: boolean }
type Per = 'semana' | 'mes' | 'trimestre'
const DIAS: Record<Per, number> = { semana: 7, mes: 30, trimestre: 90 }

function Barra({ rotulo, n, max, cor }: { rotulo: string; n: number; max: number; cor: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-[13px]">
      <span className="font-semibold" style={{ color: '#4a5275' }}>{rotulo}</span>
      <span className="h-3 rounded-full" style={{ background: '#e4e8f0' }}>
        <span className="block h-3 rounded-full" style={{ width: `${max ? (n / max) * 100 : 0}%`, background: cor }} />
      </span>
      <b className="text-right tabular-nums">{n}</b>
    </div>
  )
}

export default function RelatorioComercial() {
  const [cots, setCots] = useState<Cot[] | null>(null)
  const [ops, setOps] = useState<number | null>(null)
  const [per, setPer] = useState<Per>('mes')

  useEffect(() => {
    let vivo = true
    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString()
    void (async () => {
      const [c, o] = await Promise.all([
        supabase.from('cotacoes').select('status, valor_total, motivo_perda, created_at, updated_at, eh_teste').gte('created_at', desde).is('cancelada_em', null).eq('eh_teste', false).limit(3000),
        supabase.from('operacoes').select('id', { count: 'exact', head: true }).gte('created_at', desde).eq('eh_teste', false),
      ])
      if (!vivo) return
      setCots((c.data ?? []) as unknown as Cot[])
      setOps(o.count ?? 0)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const dados = useMemo(() => {
    const lim = Date.now() - DIAS[per] * 86_400_000
    const doPer = (cots ?? []).filter((k) => new Date(k.created_at).getTime() >= lim)
    const enviadas = doPer.filter((k) => k.status !== 'rascunho')
    const aprovadas = doPer.filter((k) => k.status === 'convertida')
    const perdidas = doPer.filter((k) => k.status === 'perdida')
    const motivos = new Map<string, number>()
    for (const k of perdidas) motivos.set(k.motivo_perda ?? 'outro', (motivos.get(k.motivo_perda ?? 'outro') ?? 0) + 1)
    const decididas = aprovadas.length + perdidas.length
    return { total: doPer.length, enviadas: enviadas.length, aprovadas: aprovadas.length, perdidas: perdidas.length, motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]), taxa: decididas ? Math.round((aprovadas.length / decididas) * 100) : null, fechado: aprovadas.reduce((a, k) => a + Number(k.valor_total ?? 0), 0) }
  }, [cots, per])

  const kpi = (r: string, v: string, off?: boolean) => (
    <div className="bg-white border rounded-2xl px-4 py-3 flex-1 min-w-[150px]" style={{ borderColor: 'var(--rbr-border)', opacity: off ? 0.6 : 1 }} title={off ? 'Ainda não disponível' : undefined}>
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>{r}</div>
      <div className="text-[26px] font-extrabold leading-tight tabular-nums">{v}</div>
    </div>
  )
  const maxFunil = Math.max(dados.total, 1)
  const maxPerda = Math.max(...dados.motivos.map((m) => m[1]), 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Relatório comercial</h1>
          <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>Últimos {DIAS[per]} dias · toda a equipe (testes ficam de fora)</div>
        </div>
        <div className="flex p-1 rounded-xl" style={{ background: '#e9ecf4' }} role="group" aria-label="Período">
          {(['semana', 'mes', 'trimestre'] as Per[]).map((p) => (
            <button key={p} type="button" onClick={() => setPer(p)} aria-pressed={per === p} className="text-[13px] font-bold px-4 py-1.5 rounded-lg" style={per === p ? { background: '#1c2559', color: '#fff' } : { color: '#4a5275' }}>
              {p === 'semana' ? 'Semana' : p === 'mes' ? 'Mês' : 'Trimestre'}
            </button>
          ))}
        </div>
      </div>
      {cots === null ? (
        <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
      ) : (
        <>
          <div className="flex gap-3 flex-wrap">
            {kpi('Pedidos recebidos', '—', true)}
            {kpi('Cotações enviadas', String(dados.enviadas))}
            {kpi('Aprovação', dados.taxa == null ? '—' : `${dados.taxa}%`)}
            {kpi('Tempo até a 1ª cotação', '—', true)}
            {kpi('Fechado no período', formatMoney(dados.fechado))}
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2 items-start">
            <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>FUNIL DO PERÍODO</div>
              <Barra rotulo="Cotações criadas" n={dados.total} max={maxFunil} cor="#1c2559" />
              <Barra rotulo="Enviadas" n={dados.enviadas} max={maxFunil} cor="#1c2559" />
              <Barra rotulo="Aprovadas" n={dados.aprovadas} max={maxFunil} cor="#1c2559" />
              <Barra rotulo="Operações geradas" n={Math.min(ops ?? 0, dados.aprovadas)} max={maxFunil} cor="#1c2559" />
              <div className="text-[11px] font-extrabold tracking-[0.08em] pt-3" style={{ color: 'var(--rbr-muted)' }}>POR QUE PERDEMOS · {dados.perdidas} COTAÇÕES</div>
              {dados.motivos.length === 0 ? <div className="text-[13px]" style={{ color: 'var(--rbr-muted)' }}>Nenhuma cotação perdida no período.</div> : dados.motivos.map(([m, n]) => <Barra key={m} rotulo={(MOTIVO_PERDA_LABEL as Record<string, string>)[m] ?? m} n={n} max={maxPerda} cor="#7f86bd" />)}
              {dados.motivos[0] && <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{(MOTIVO_PERDA_LABEL as Record<string, string>)[dados.motivos[0][0]] ?? dados.motivos[0][0]} é o motivo número um.</div>}
            </div>
            <div className="bg-white border rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>CANAL: PEDIDOS E APROVAÇÃO</div>
              <div className="text-[13px]" style={{ color: 'var(--rbr-muted)' }}>Ainda não disponível: o canal de cada pedido (Google Ads, WhatsApp, telefone, site, indicação) não é guardado.</div>
              {['Google Ads', 'WhatsApp', 'Telefone', 'Site', 'Indicação'].map((c) => (
                <div key={c} className="grid grid-cols-[1fr_70px_70px_50px] gap-2 text-[13px] py-1.5 opacity-60" style={{ borderTop: '1px solid #eef0f5' }}>
                  <b>{c}</b><span className="text-right">—</span><span className="text-right">—</span><span className="text-right">—</span>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button type="button" disabled className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] border opacity-50 cursor-not-allowed" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Baixar PDF</button>
                <button type="button" disabled className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] border opacity-50 cursor-not-allowed" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Exportar planilha</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
