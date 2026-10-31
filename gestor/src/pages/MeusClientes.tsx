import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'

// Meus clientes (visual aprovado "Meus-Clientes"): a carteira de quem vende. O banco (RLS) já mostra só os clientes da pessoa;
// o gestor vê todos. Cliente sem cotação há mais de 30 dias aparece para reativar.
type Cli = { id: string; razao_social: string | null; nome_fantasia: string | null; cidade: string | null; uf: string | null; celular_whatsapp: string | null; condicoes_pagamento_prazo: string | null; created_at: string }
type Cot = { cliente_id: string | null; valor_total: number | null; created_at: string }
type Filtro = 'todos' | 'ativos' | 'reativar' | 'novos'

const DIA = 86_400_000
const soDigitos = (s: string | null) => (s ?? '').replace(/\D/g, '')

export default function MeusClientes() {
  const nav = useNavigate()
  const [clis, setClis] = useState<Cli[] | null>(null)
  const [cots, setCots] = useState<Cot[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [c, k] = await Promise.all([
        supabase.from('clientes').select('id, razao_social, nome_fantasia, cidade, uf, celular_whatsapp, condicoes_pagamento_prazo, created_at').is('deleted_at', null).order('razao_social').limit(500),
        supabase.from('cotacoes').select('cliente_id, valor_total, created_at').eq('eh_teste', false).is('cancelada_em', null).order('created_at', { ascending: false }).limit(2000),
      ])
      if (!vivo) return
      if (c.error) setErro('Não consegui ler os clientes agora.')
      setClis((c.data ?? []) as unknown as Cli[])
      setCots((k.data ?? []) as unknown as Cot[])
    })()
    return () => {
      vivo = false
    }
  }, [])

  const linhas = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7)
    return (clis ?? []).map((c) => {
      const minhas = cots.filter((k) => k.cliente_id === c.id)
      const ultima = minhas[0]?.created_at ?? null
      const dias = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / DIA) : null
      const noMes = minhas.filter((k) => k.created_at.startsWith(mes)).reduce((a, k) => a + Number(k.valor_total ?? 0), 0)
      const novo = Date.now() - new Date(c.created_at).getTime() < 30 * DIA
      const reativar = dias != null ? dias > 30 : !novo
      return { c, ultima, dias, noMes, novo, reativar }
    })
  }, [clis, cots])

  const cont = (f: Filtro) => linhas.filter((l) => (f === 'todos' ? true : f === 'ativos' ? !l.reativar : f === 'reativar' ? l.reativar : l.novo)).length
  const q = busca.trim().toLowerCase()
  const lista = linhas.filter((l) => (filtro === 'todos' ? true : filtro === 'ativos' ? !l.reativar : filtro === 'reativar' ? l.reativar : l.novo) && (!q || `${l.c.razao_social ?? ''} ${l.c.nome_fantasia ?? ''}`.toLowerCase().includes(q)))

  const chip = (id: Filtro, rotulo: string) => (
    <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id} className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border" style={filtro === id ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#1c2559', borderColor: 'var(--rbr-border)' }}>
      {rotulo} · {cont(id)}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Meus clientes</h1>
          <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>
            {clis === null ? 'Carregando…' : (
              <>
                <b style={{ color: 'var(--rbr-navy-dark)' }}>{linhas.length} clientes na sua carteira.</b> {cont('reativar')} {cont('reativar') === 1 ? 'está sem cotação' : 'estão sem cotação'} há mais de 30 dias.
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" aria-label="Buscar clientes" className="text-[13px] bg-white border rounded-xl px-3 py-2.5 w-[180px]" style={{ borderColor: 'var(--rbr-border)' }} />
          <Link to="/cadastros?aba=clientes" className="text-[13px] font-extrabold px-4 py-2.5 rounded-xl text-white" style={{ background: '#b8863b' }}>
            + Novo cliente
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {chip('todos', 'Todos')}
        {chip('ativos', 'Ativos')}
        {chip('reativar', 'Para reativar')}
        {chip('novos', 'Novos')}
      </div>
      {erro && <div className="text-xs text-[color:var(--rbr-danger)]">{erro}</div>}
      <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="hidden md:flex items-center gap-3 px-4 py-2.5 text-[10px] font-extrabold tracking-[0.08em] uppercase" style={{ background: '#f7f8fc', color: 'var(--rbr-muted)' }}>
          <span className="flex-1">Cliente</span>
          <span className="w-[120px] flex-shrink-0">Última cotação</span>
          <span className="w-[110px] flex-shrink-0">No mês</span>
          <span className="w-[150px] flex-shrink-0">Prazo de pagamento</span>
          <span className="w-[150px] flex-shrink-0" />
        </div>
        {clis === null ? (
          <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Nenhum cliente nesta lista.</div>
        ) : (
          lista.map((l, i) => {
            const zap = soDigitos(l.c.celular_whatsapp)
            return (
              <div key={l.c.id} className="px-4 py-3 flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3" style={{ borderTop: i ? '1px solid #eef0f5' : undefined, background: l.reativar ? '#fffbef' : undefined }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold truncate">{l.c.nome_fantasia ?? l.c.razao_social ?? 'Cliente'}</div>
                  <div className="text-[12px] truncate" style={{ color: l.reativar ? '#7a5200' : 'var(--rbr-muted)', fontWeight: l.reativar ? 700 : 400 }}>
                    {l.reativar ? (l.dias != null ? `sem cotação há ${l.dias} dias` : 'nunca cotou') : [l.c.cidade, l.c.uf].filter(Boolean).join('/')}
                  </div>
                </div>
                <div className="md:w-[120px] flex-shrink-0 text-[13px]">{l.ultima ? (l.dias === 0 ? 'hoje' : l.dias! < 30 ? `há ${l.dias} ${l.dias === 1 ? 'dia' : 'dias'}` : new Date(l.ultima).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })) : '—'}</div>
                <div className="md:w-[110px] flex-shrink-0 text-[14px] font-extrabold tabular-nums" style={{ color: l.noMes ? undefined : '#8a91ad' }}>
                  {formatMoney(l.noMes)}
                </div>
                <div className="md:w-[150px] flex-shrink-0 text-[13px]">{l.c.condicoes_pagamento_prazo ?? '—'}</div>
                <div className="md:w-[150px] flex-shrink-0 md:text-right">
                  {l.reativar && zap ? (
                    <a href={`https://wa.me/${zap.startsWith('55') ? zap : `55${zap}`}`} target="_blank" rel="noreferrer" className="inline-block text-[12px] font-extrabold px-4 py-2 rounded-[10px] text-white" style={{ background: '#1c2559' }}>
                      Mandar mensagem
                    </a>
                  ) : l.reativar ? (
                    <button type="button" disabled title="Cliente sem WhatsApp cadastrado" className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] opacity-50 cursor-not-allowed" style={{ background: '#1c2559', color: '#fff' }}>
                      Mandar mensagem
                    </button>
                  ) : (
                    <button type="button" onClick={() => nav('/cotacao')} className="text-[12px] font-extrabold px-4 py-2 rounded-[10px] border" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
                      Nova cotação
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 text-[12px]" style={{ color: '#4a5275' }}>
        <div className="bg-white border rounded-2xl px-4 py-3" style={{ borderColor: 'var(--rbr-border)' }}>
          <b style={{ color: 'var(--rbr-navy-dark)' }}>Só os seus clientes aparecem aqui.</b> Os de outros vendedores ficam escondidos pelo sistema. Se alguém precisar cotar para um cliente seu, o gestor faz a transferência.
        </div>
        <div className="bg-white border rounded-2xl px-4 py-3" style={{ borderColor: 'var(--rbr-border)' }}>
          <b style={{ color: 'var(--rbr-navy-dark)' }}>Novo cliente.</b> O botão leva ao cadastro de clientes, onde você digita o CNPJ.
        </div>
      </div>
    </div>
  )
}
