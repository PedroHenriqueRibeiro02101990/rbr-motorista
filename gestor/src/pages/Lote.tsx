import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { documentoCumprido } from '../lib/etapasOperacao'

// Lote de viagens (visual Operacao-Lote): uma cotação que virou várias operações. Só apresentação: lê as operações
// da cotação e mostra quem tem motorista e quanto da esteira de documentos já está cumprido.
type Viagem = {
  id: string
  sequencia: number | null
  status: string
  coleta_prevista: string | null
  motorista: string | null
  feitos: number
  total: number
}

const FIM = ['finalizada', 'fechada', 'entregue', 'cancelada']
const PRONTA = ['aguardando_liberacao_fiscal', 'em_emissao']

function quando(iso: string | null): string {
  if (!iso) return 'sem data de coleta'
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', ' ·')
}

export default function Lote() {
  const { cotacaoId } = useParams()
  const nav = useNavigate()
  const [titulo, setTitulo] = useState('Lote de viagens')
  const [viagens, setViagens] = useState<Viagem[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!cotacaoId) return
    let vivo = true
    void (async () => {
      const [ops, cot] = await Promise.all([
        supabase.from('operacoes').select('id, sequencia, status, coleta_prevista, pessoa_alocada_id').eq('cotacao_id', cotacaoId).is('deleted_at', null).order('sequencia', { ascending: true }),
        supabase.from('cotacoes').select('cidade_origem, cidade_destino, cliente_id').eq('id', cotacaoId).maybeSingle(),
      ])
      if (!vivo) return
      if (ops.error) return setErro('Não foi possível carregar o lote agora.')
      const lista = ops.data ?? []
      const ids = lista.map((o) => o.id)
      const pessoasIds = Array.from(new Set(lista.map((o) => o.pessoa_alocada_id).filter(Boolean))) as string[]
      const [docs, pes, cli] = await Promise.all([
        ids.length ? supabase.from('documentacao_operacao').select('operacao_id, tipo, status, exigido, conferencia_status, dispensa_motivo').in('operacao_id', ids) : Promise.resolve({ data: [] }),
        pessoasIds.length ? supabase.from('pessoas').select('id, nome').in('id', pessoasIds) : Promise.resolve({ data: [] }),
        cot.data?.cliente_id ? supabase.from('clientes').select('razao_social, nome_fantasia').eq('id', cot.data.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (!vivo) return
      const nomes = new Map(((pes.data ?? []) as { id: string; nome: string }[]).map((p) => [p.id, p.nome]))
      const docsPor = new Map<string, NonNullable<typeof docs.data>>()
      for (const d of (docs.data ?? []) as { operacao_id: string }[]) docsPor.set(d.operacao_id, [...(docsPor.get(d.operacao_id) ?? []), d] as never)
      const c = cli.data as { razao_social?: string; nome_fantasia?: string } | null
      setTitulo(`${c?.nome_fantasia || c?.razao_social || 'Lote'} · ${lista.length} viagens`)
      setViagens(
        lista.map((o) => {
          const dd = ((docsPor.get(o.id) ?? []) as unknown as Parameters<typeof documentoCumprido>[0][]).filter((x) => x && (x as { exigido?: boolean }).exigido !== false)
          return {
            id: o.id,
            sequencia: o.sequencia,
            status: o.status as string,
            coleta_prevista: o.coleta_prevista,
            motorista: o.pessoa_alocada_id ? (nomes.get(o.pessoa_alocada_id) ?? 'motorista') : null,
            feitos: dd.filter((x) => documentoCumprido(x)).length,
            total: dd.length,
          }
        }),
      )
    })()
    return () => {
      vivo = false
    }
  }, [cotacaoId])

  const lista = viagens ?? []
  const comMotorista = lista.filter((v) => v.motorista).length
  const prontas = lista.filter((v) => PRONTA.includes(v.status)).length
  const finalizadas = lista.filter((v) => FIM.includes(v.status)).length
  const rota = (v: Viagem) => v.sequencia != null ? `Viagem ${v.sequencia}` : 'Viagem'

  const kpi = (rotulo: string, valor: number, sub: string, perigo = false) => (
    <div className="bg-white border rounded-2xl px-5 py-4" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{rotulo}</div>
      <div className="text-[30px] font-extrabold leading-tight tabular-nums" style={{ color: perigo ? '#b42318' : 'var(--rbr-navy-dark)' }}>{valor}</div>
      <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{sub}</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/operacoes" className="text-[12px] font-bold" style={{ color: 'var(--rbr-muted)' }}>← Serviços</Link>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">{titulo}</h1>
          <div className="text-[13px]" style={{ color: '#4a5275' }}>Cada viagem é uma operação com o seu CT-e, CIOT e MDF-e.</div>
        </div>
        <button type="button" disabled title="Ainda não disponível" className="text-[13px] font-extrabold px-5 py-3 rounded-xl text-white opacity-50 cursor-not-allowed" style={{ background: '#1c2559' }}>
          Alocar vários motoristas
        </button>
      </div>

      {erro && <div className="text-xs rounded-xl px-3 py-2" style={{ background: '#fbe3e1', color: '#b42318' }}>{erro}</div>}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpi('Viagens', lista.length, 'neste lote')}
        {kpi('Com motorista', comMotorista, `${lista.length - comMotorista} sem motorista`, lista.length - comMotorista > 0)}
        {kpi('Prontas para o fiscal', prontas, `das ${lista.length}`)}
        {kpi('Finalizadas', finalizadas, `das ${lista.length}`)}
      </div>

      <div className="bg-white border rounded-2xl overflow-x-auto" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_110px] gap-3 px-4 py-2.5 text-[10px] font-extrabold tracking-[0.08em]" style={{ background: '#f7f8fc', color: 'var(--rbr-muted)' }}>
            <span>Nº</span><span>VIAGEM E COLETA</span><span>MOTORISTA</span><span>PROGRESSO</span><span />
          </div>
          {viagens === null && !erro && <div className="px-4 py-5 text-[13px]" style={{ color: 'var(--rbr-muted)' }}>Carregando…</div>}
          {viagens !== null && lista.length === 0 && <div className="px-4 py-5 text-[13px]" style={{ color: 'var(--rbr-muted)' }}>Nenhuma viagem encontrada para esta cotação.</div>}
          {lista.map((v, i) => {
            const sem = !v.motorista
            const frac = v.total > 0 ? v.feitos / v.total : 0
            const cor = sem ? '#b42318' : frac >= 1 ? '#1f9d55' : '#d9a21b'
            return (
              <div key={v.id} className="grid grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_110px] gap-3 px-4 py-3 items-center border-t text-[13px]" style={{ borderColor: '#eef0f5', background: sem ? '#fff6f5' : undefined }}>
                <span className="font-extrabold">{v.sequencia ?? i + 1}</span>
                <span className="min-w-0">
                  <b className="block text-[color:var(--rbr-navy-dark)]">{rota(v)}</b>
                  <span className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{quando(v.coleta_prevista)}</span>
                </span>
                <span className="font-bold" style={sem ? { color: '#b42318' } : undefined}>{v.motorista ?? 'sem motorista'}</span>
                <span className="flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#e4e8f0' }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.round(frac * 100)}%`, background: cor }} />
                  </span>
                  <span className="text-[11px] font-extrabold tabular-nums">{v.feitos} de {v.total}</span>
                </span>
                <button type="button" onClick={() => nav(`/operacoes?op=${v.id}`)} className="text-[12px] font-extrabold px-3.5 py-1.5 rounded-[10px] border bg-white justify-self-end" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
                  {sem ? 'Alocar' : 'Abrir'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 text-[12px]">
        <div className="bg-white border rounded-2xl px-4 py-3" style={{ borderColor: 'var(--rbr-border)' }}><b>Assumir o lote</b> assume todas as viagens de uma vez (ainda não disponível aqui: hoje cada viagem é assumida na sua operação).</div>
        <div className="bg-white border rounded-2xl px-4 py-3" style={{ borderColor: 'var(--rbr-border)' }}><b>Alocar vários</b> abre a escolha de motorista viagem por viagem, sem sair da lista (ainda não disponível).</div>
      </div>
    </div>
  )
}
