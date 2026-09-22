import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, initials, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { IconQuote } from '@rbr/shared/icons'
import FrotaMap, { type FrotaMapPonto } from '@rbr/shared/FrotaMap'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Operacao = Database['public']['Tables']['operacoes']['Row']
type Comissao = Database['public']['Tables']['comissoes_agenciador']['Row']

type OperacaoComRelacoes = Operacao & {
  clienteNome?: string
  valorContrato?: number | null
}

const STATUS_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  alocando_motorista: { bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' },
  aguardando_liberacao_fiscal: { bg: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' },
  liberada_coleta: { bg: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' },
  carregando: { bg: 'var(--rbr-navy)', color: '#FFFFFF' },
  em_transito: { bg: 'var(--rbr-navy)', color: '#FFFFFF' },
  entregue: { bg: 'var(--rbr-positive)', color: '#FFFFFF' },
  fechada: { bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' },
  cancelada: { bg: '#FCE8E8', color: 'var(--rbr-danger)' },
}

export default function Inicio({ pessoa }: { pessoa: Pessoa }) {
  const [baseAtiva, setBaseAtiva] = useState<number | null>(null)
  const [comissaoMes, setComissaoMes] = useState<Comissao | null>(null)
  const [cargas, setCargas] = useState<OperacaoComRelacoes[]>([])
  const [pontosMapa, setPontosMapa] = useState<FrotaMapPonto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const baseAtivaPromise = supabase
      .from('vinculos_agenciador_motorista')
      .select('id', { count: 'exact', head: true })
      .eq('agenciador_id', pessoa.id)
      .eq('status', 'confirmado')

    const comissaoPromise = supabase
      .from('comissoes_agenciador')
      .select('*')
      .eq('agenciador_id', pessoa.id)
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cargasPromise = supabase
      .from('operacoes')
      .select('*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato), cotacoes(valor_total)')
      .eq('agenciador_id', pessoa.id)
      .not('status', 'in', '(entregue,fechada,cancelada)')
      .order('updated_at', { ascending: false })

    const [{ count, error: baseErr }, { data: comissao, error: comissaoErr }, { data: ops, error: opsErr }] =
      await Promise.all([baseAtivaPromise, comissaoPromise, cargasPromise])

    if (baseErr || comissaoErr || opsErr) {
      setError((baseErr ?? comissaoErr ?? opsErr)?.message ?? 'Erro ao carregar dados')
    }

    setBaseAtiva(count ?? 0)
    setComissaoMes(comissao ?? null)
    setCargas(
      (ops ?? []).map((op: any) => ({
        ...op,
        clienteNome: (op as any).clientes?.nome_fantasia ?? (op as any).clientes?.razao_social,
        valorContrato:
          (op as any).condicoes_pagamento_operacao?.[0]?.valor_total_contrato ??
          (op as any).cotacoes?.valor_total ??
          null,
      })),
    )
    setLoading(false)

    // Mapa: última posição conhecida de cada motorista em carga em andamento
    // (RLS: agenciador só vê posições vinculadas às próprias operações).
    const opIds = (ops ?? []).map((op) => op.id)
    if (opIds.length > 0) {
      const { data: posicoes } = await supabase
        .from('posicoes_gps')
        .select('*, pessoas(nome), operacoes(clientes(razao_social, nome_fantasia))')
        .in('operacao_id', opIds)
        .order('capturado_em', { ascending: false })

      const maisRecentePorPessoa = new Map<string, FrotaMapPonto>()
      for (const pos of posicoes ?? []) {
        if (maisRecentePorPessoa.has(pos.pessoa_id)) continue
        maisRecentePorPessoa.set(pos.pessoa_id, {
          id: pos.pessoa_id,
          lat: Number(pos.latitude),
          lng: Number(pos.longitude),
          nome: (pos as any).pessoas?.nome ?? 'Motorista',
          subtitulo:
            (pos as any).operacoes?.clientes?.nome_fantasia ?? (pos as any).operacoes?.clientes?.razao_social,
          capturadoEm: pos.capturado_em,
          fonte: pos.fonte,
        })
      }
      setPontosMapa(Array.from(maisRecentePorPessoa.values()))
    } else {
      setPontosMapa([])
    }
  }, [pessoa.id])

  useEffect(() => {
    load()
  }, [load])

  const primeiroNome = pessoa.nome.split(' ')[0]

  return (
    <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-3.5 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="rbr-display font-bold text-2xl md:text-3xl leading-tight text-[color:var(--rbr-navy-dark)]">
            Olá, {primeiroNome}
          </div>
          <div className="text-[13px] text-[color:var(--rbr-muted)] mt-0.5">Agenciador parceiro RBR</div>
        </div>
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold flex-shrink-0"
          style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
        >
          {initials(pessoa.nome)}
        </div>
      </div>

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div
          className="bg-white border rounded-[16px] p-3.5"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">Base ativa</div>
          <div className="text-xl font-bold text-[color:var(--rbr-navy-dark)]">
            {loading ? '—' : baseAtiva} <span className="text-xs font-medium text-[color:var(--rbr-muted)]">motoristas</span>
          </div>
        </div>
        <div
          className="bg-white border rounded-[16px] p-3.5"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">Comissão do mês</div>
          <div className="text-xl font-bold text-[color:var(--rbr-navy-dark)]">
            {loading ? '—' : formatMoney(comissaoMes?.valor_calculado)}{' '}
            {comissaoMes && (
              <span className="text-xs font-medium" style={{ color: 'var(--rbr-positive)' }}>
                {comissaoMes.percentual_aplicado}%
              </span>
            )}
          </div>
        </div>
        <div
          className="hidden md:block bg-white border rounded-[16px] p-3.5"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">Cargas em andamento</div>
          <div className="text-xl font-bold text-[color:var(--rbr-navy-dark)]">
            {loading ? '—' : cargas.length}
          </div>
        </div>
      </div>

      <Link
        to="/cotacoes"
        className="rounded-[18px] p-[18px] flex items-center gap-3.5"
        style={{ background: 'var(--rbr-navy)' }}
      >
        <div
          className="w-[42px] h-[42px] rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--rbr-gold)' }}
        >
          <IconQuote width={22} height={22} stroke="var(--rbr-navy-dark)" />
        </div>
        <div>
          <div className="text-[15px] font-bold text-white">Nova cotação</div>
          <div className="text-xs" style={{ color: '#C7CBE0' }}>
            Envie o XML/DANFE — o sistema calcula tudo
          </div>
        </div>
      </Link>

      <div className="text-[11px] font-bold tracking-wide text-[color:var(--rbr-muted)] uppercase mt-1">
        Cargas em andamento
      </div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && cargas.length === 0 && (
        <div
          className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]"
          style={{ borderColor: 'var(--rbr-border)' }}
        >
          Nenhuma carga em andamento agora.
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cargas.map((op) => {
          const badge = STATUS_BADGE_STYLE[op.status] ?? STATUS_BADGE_STYLE.alocando_motorista
          return (
            <div
              key={op.id}
              className="bg-white border rounded-[14px] p-4"
              style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {STATUS_OPERACAO_LABEL[op.status]}
                </span>
                {op.valorContrato != null && <span className="text-[13px] font-bold">{formatMoney(op.valorContrato)}</span>}
              </div>
              <div className="text-sm font-semibold">{op.clienteNome ?? 'Cliente a confirmar'}</div>
            </div>
          )
        })}
      </div>

      <div className="text-[11px] font-bold tracking-wide text-[color:var(--rbr-muted)] uppercase mt-1">
        Onde está sua frota
      </div>
      {!loading && <FrotaMap pontos={pontosMapa} height={320} />}
      <div className="text-[11px] text-[color:var(--rbr-muted)] -mt-2">
        Última localização conhecida via GPS do celular do motorista — não é uma posição ao vivo, atualiza quando ele abre o app.
      </div>
    </div>
  )
}
