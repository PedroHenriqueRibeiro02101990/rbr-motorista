import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import type { Database } from '@rbr/shared/database.types'
import { IconAlertTriangle } from '../icons-local'

type StatusOperacao = Database['public']['Enums']['status_operacao']

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

interface Dados {
  porStatus: Record<string, number>
  aguardandoFiscal: number
  bloqueioFiscal: number
  motoristasOnline: number
  faturasPendentesValor: number
  faturasPendentesQtd: number
  faturasVencidasValor: number
  faturasVencidasQtd: number
  pagamentosPendentesValor: number
  pagamentosPendentesQtd: number
  comissoesACreditarValor: number
  comissoesACreditarQtd: number
}

export default function Inicio() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [
      { data: operacoes, error: opErr },
      { count: motoristasOnline, error: onlineErr },
      { data: faturas, error: faturasErr },
      { data: pagamentos, error: pagErr },
      { data: comissoes, error: comErr },
    ] = await Promise.all([
      supabase.from('operacoes').select('status, bloqueio_fiscal').neq('status', 'cancelada'),
      supabase
        .from('pessoas')
        .select('id', { count: 'exact', head: true })
        .in('papel', ['titular_motorista', 'condutor'])
        .eq('status_online', true),
      supabase.from('faturas').select('status, valor_total'),
      supabase.from('pagamentos_motorista').select('status, valor'),
      supabase.from('comissoes_agenciador').select('status, valor_calculado'),
    ])

    const firstError = opErr ?? onlineErr ?? faturasErr ?? pagErr ?? comErr
    if (firstError) setError(firstError.message)

    const porStatus: Record<string, number> = {}
    let bloqueioFiscal = 0
    for (const op of operacoes ?? []) {
      porStatus[op.status] = (porStatus[op.status] ?? 0) + 1
      if (op.bloqueio_fiscal) bloqueioFiscal += 1
    }

    let faturasPendentesValor = 0
    let faturasPendentesQtd = 0
    let faturasVencidasValor = 0
    let faturasVencidasQtd = 0
    for (const f of faturas ?? []) {
      if (f.status === 'pendente' || f.status === 'aguardando_pagamento') {
        faturasPendentesValor += f.valor_total
        faturasPendentesQtd += 1
      } else if (f.status === 'vencido' || f.status === 'inadimplente') {
        faturasVencidasValor += f.valor_total
        faturasVencidasQtd += 1
      }
    }

    let pagamentosPendentesValor = 0
    let pagamentosPendentesQtd = 0
    for (const p of pagamentos ?? []) {
      if (p.status !== 'pago' && p.status !== 'cancelado') {
        pagamentosPendentesValor += p.valor
        pagamentosPendentesQtd += 1
      }
    }

    let comissoesACreditarValor = 0
    let comissoesACreditarQtd = 0
    for (const c of comissoes ?? []) {
      if (c.status === 'pendente') {
        comissoesACreditarValor += c.valor_calculado
        comissoesACreditarQtd += 1
      }
    }

    setDados({
      porStatus,
      aguardandoFiscal: porStatus['aguardando_liberacao_fiscal'] ?? 0,
      bloqueioFiscal,
      motoristasOnline: motoristasOnline ?? 0,
      faturasPendentesValor,
      faturasPendentesQtd,
      faturasVencidasValor,
      faturasVencidasQtd,
      pagamentosPendentesValor,
      pagamentosPendentesQtd,
      comissoesACreditarValor,
      comissoesACreditarQtd,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const statusOrdem: StatusOperacao[] = [
    'alocando_motorista',
    'aguardando_liberacao_fiscal',
    'liberada_coleta',
    'carregando',
    'em_transito',
    'entregue',
    'fechada',
  ]

  return (
    <div className="flex flex-col gap-5">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Início</h1>

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && dados && (
        <>
          {(dados.aguardandoFiscal > 0 || dados.bloqueioFiscal > 0) && (
            <div
              className="flex items-start gap-3 rounded-[20px] px-[18px] py-4 border"
              style={{ background: '#FBE9E9', borderColor: '#F4C9C9' }}
            >
              <IconAlertTriangle width={20} height={20} style={{ color: 'var(--rbr-danger)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--rbr-danger)' }}>
                  Requer ação do time fiscal
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--rbr-danger)' }}>
                  {dados.aguardandoFiscal} operação(ões) aguardando liberação fiscal · {dados.bloqueioFiscal} com bloqueio fiscal ativo
                </div>
              </div>
            </div>
          )}

          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Motoristas online agora" value={String(dados.motoristasOnline)} />
            <KpiTile label="Aguardando liberação fiscal" value={String(dados.aguardandoFiscal)} destaque={dados.aguardandoFiscal > 0} />
            <KpiTile label="Com bloqueio fiscal" value={String(dados.bloqueioFiscal)} destaque={dados.bloqueioFiscal > 0} />
            <KpiTile label="Comissões a creditar" value={String(dados.comissoesACreditarQtd)} sub={formatMoney(dados.comissoesACreditarValor)} />
            <KpiTile label="Faturas pendentes" value={String(dados.faturasPendentesQtd)} sub={formatMoney(dados.faturasPendentesValor)} />
            <KpiTile label="Faturas vencidas" value={String(dados.faturasVencidasQtd)} sub={formatMoney(dados.faturasVencidasValor)} destaque={dados.faturasVencidasQtd > 0} />
            <KpiTile label="Pagamentos a motoristas pendentes" value={String(dados.pagamentosPendentesQtd)} sub={formatMoney(dados.pagamentosPendentesValor)} />
            <KpiTile label="Operações ativas" value={String(statusOrdem.reduce((s, k) => s + (dados.porStatus[k] ?? 0), 0))} />
          </section>

          <section className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-3">
              Operações por status
            </div>
            <div className="flex flex-col gap-2">
              {statusOrdem.map((s) => {
                const qtd = dados.porStatus[s] ?? 0
                const max = Math.max(1, ...statusOrdem.map((k) => dados.porStatus[k] ?? 0))
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="text-xs w-44 flex-shrink-0 text-[color:var(--rbr-muted)]">
                      {STATUS_OPERACAO_LABEL[s]}
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0F1F6' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(qtd / max) * 100}%`, background: 'var(--rbr-navy)' }}
                      />
                    </div>
                    <div className="text-xs font-bold w-6 text-right">{qtd}</div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function KpiTile({ label, value, sub, destaque }: { label: string; value: string; sub?: string; destaque?: boolean }) {
  return (
    <div
      className="bg-white border rounded-[16px] p-4"
      style={{
        borderColor: destaque ? 'var(--rbr-danger)' : 'var(--rbr-border)',
        boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
      }}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">{label}</div>
      <div className="text-2xl font-bold" style={{ color: destaque ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[color:var(--rbr-muted)] mt-0.5">{sub}</div>}
    </div>
  )
}
