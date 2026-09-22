import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate } from '@rbr/shared/format'

type Fatura = Database['public']['Tables']['faturas']['Row']
type PagamentoMotorista = Database['public']['Tables']['pagamentos_motorista']['Row']
type Comissao = Database['public']['Tables']['comissoes_agenciador']['Row']
type SaldoProjetado = Database['public']['Tables']['saldos_projetados_caixa']['Row']
type Assinatura = Database['public']['Tables']['assinaturas_motorista']['Row']
type StatusFatura = Database['public']['Enums']['status_fatura']
type StatusPagamentoMotorista = Database['public']['Enums']['status_pagamento_motorista']

type ComissaoComAgenciador = Comissao & { agenciadorNome?: string }
type AssinaturaComDetalhe = Assinatura & { motoristaNome?: string; veiculoPlaca?: string }

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

const STATUS_FATURA_LABEL: Record<StatusFatura, string> = {
  pendente: 'Pendente',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  vencido: 'Vencido',
  inadimplente: 'Inadimplente',
  cancelada: 'Cancelada',
}

const STATUS_PAGAMENTO_LABEL: Record<StatusPagamentoMotorista, string> = {
  pendente: 'Pendente',
  aguardando_confirmacao_entrega: 'Aguard. confirmação entrega',
  aguardando_pix_agenciador: 'Aguard. Pix agenciador',
  pix_confirmado: 'Pix confirmado',
  documentacao_emitida: 'Documentação emitida',
  liberado: 'Liberado',
  pago: 'Pago',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
}

function StatusBreakdown<T extends string>({
  title,
  totals,
  labels,
  order,
  highlight,
}: {
  title: string
  totals: Record<string, { qtd: number; valor: number }>
  labels: Record<T, string>
  order: T[]
  highlight?: T[]
}) {
  return (
    <section className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-3">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {order.map((s) => {
          const t = totals[s] ?? { qtd: 0, valor: 0 }
          const destaque = highlight?.includes(s) && t.qtd > 0
          return (
            <div
              key={s}
              className="rounded-[14px] p-3.5 border"
              style={{ borderColor: destaque ? 'var(--rbr-danger)' : 'var(--rbr-border)', background: '#FAFBFD' }}
            >
              <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)] mb-1">{labels[s]}</div>
              <div className="text-lg font-bold" style={{ color: destaque ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}>
                {t.qtd}
              </div>
              <div className="text-xs text-[color:var(--rbr-muted)]">{formatMoney(t.valor)}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Financeiro() {
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoMotorista[]>([])
  const [comissoes, setComissoes] = useState<ComissaoComAgenciador[]>([])
  const [saldos, setSaldos] = useState<SaldoProjetado[]>([])
  const [assinaturasPendentes, setAssinaturasPendentes] = useState<AssinaturaComDetalhe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [
      { data: fat, error: fatErr },
      { data: pag, error: pagErr },
      { data: com, error: comErr },
      { data: sal, error: salErr },
      { data: assPend, error: assErr },
    ] = await Promise.all([
      supabase.from('faturas').select('*').order('data_vencimento', { ascending: true }),
      supabase.from('pagamentos_motorista').select('*').order('created_at', { ascending: false }),
      supabase
        .from('comissoes_agenciador')
        .select('*, pessoas(nome)')
        .eq('status', 'pendente')
        .order('competencia', { ascending: false }),
      supabase
        .from('saldos_projetados_caixa')
        .select('*')
        .gte('data', new Date().toISOString().slice(0, 10))
        .order('data', { ascending: true })
        .limit(30),
      supabase
        .from('assinaturas_motorista')
        .select('*, pessoas!assinaturas_motorista_motorista_titular_id_fkey(nome), veiculos!assinaturas_motorista_veiculo_id_fkey(placa)')
        .eq('status', 'aguardando_confirmacao')
        .order('created_at', { ascending: true }),
    ])

    const firstError = fatErr ?? pagErr ?? comErr ?? salErr ?? assErr
    if (firstError) setError(firstError.message)

    setFaturas(fat ?? [])
    setPagamentos(pag ?? [])
    setComissoes((com ?? []).map((c: any) => ({ ...c, agenciadorNome: c.pessoas?.nome })))
    setSaldos(sal ?? [])
    setAssinaturasPendentes(
      (assPend ?? []).map((a: any) => ({ ...a, motoristaNome: a.pessoas?.nome, veiculoPlaca: a.veiculos?.placa })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function creditarComissao(id: string) {
    setSaving(id)
    const { error } = await supabase
      .from('comissoes_agenciador')
      .update({ status: 'creditado', creditado_em: new Date().toISOString() })
      .eq('id', id)
    setSaving(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  // Sem Efí/gateway configurado ainda, a confirmação de que o Pix da taxa de
  // R$19,90 caiu é manual — o gestor confere no extrato/app do banco e
  // confirma aqui. Isso libera o veículo (vira "Ativo" no app do motorista).
  async function confirmarPagamentoAssinatura(id: string) {
    setSaving(id)
    const { error } = await supabase
      .from('assinaturas_motorista')
      .update({ status: 'ativa', dia_vencimento: new Date().getDate() })
      .eq('id', id)
    setSaving(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  const faturasTotais: Record<string, { qtd: number; valor: number }> = {}
  for (const f of faturas) {
    if (!faturasTotais[f.status]) faturasTotais[f.status] = { qtd: 0, valor: 0 }
    faturasTotais[f.status].qtd += 1
    faturasTotais[f.status].valor += f.valor_total
  }

  const pagamentosTotais: Record<string, { qtd: number; valor: number }> = {}
  for (const p of pagamentos) {
    if (!pagamentosTotais[p.status]) pagamentosTotais[p.status] = { qtd: 0, valor: 0 }
    pagamentosTotais[p.status].qtd += 1
    pagamentosTotais[p.status].valor += p.valor
  }

  const comissoesTotal = comissoes.reduce((s, c) => s + c.valor_calculado, 0)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Financeiro</h1>

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && (
        <>
          <StatusBreakdown
            title="Faturas por status"
            totals={faturasTotais}
            labels={STATUS_FATURA_LABEL}
            order={['pendente', 'aguardando_pagamento', 'pago', 'vencido', 'inadimplente', 'cancelada']}
            highlight={['vencido', 'inadimplente']}
          />

          <StatusBreakdown
            title="Pagamentos a motoristas por status"
            totals={pagamentosTotais}
            labels={STATUS_PAGAMENTO_LABEL}
            order={[
              'pendente',
              'aguardando_confirmacao_entrega',
              'aguardando_pix_agenciador',
              'pix_confirmado',
              'documentacao_emitida',
              'liberado',
              'pago',
              'atrasado',
              'cancelado',
            ]}
            highlight={['atrasado']}
          />

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                Assinaturas aguardando confirmação de pagamento
              </div>
              <div className="text-xs font-semibold text-[color:var(--rbr-muted)]">
                {assinaturasPendentes.length} · {formatMoney(assinaturasPendentes.reduce((s, a) => s + a.valor_atual, 0))}
              </div>
            </div>
            {assinaturasPendentes.length === 0 ? (
              <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
                Nenhuma assinatura aguardando confirmação.
              </div>
            ) : (
              <div className="bg-white border rounded-[16px] overflow-hidden" style={cardStyle}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="px-4 py-3 font-semibold">Motorista</th>
                      <th className="px-4 py-3 font-semibold">Veículo</th>
                      <th className="px-4 py-3 font-semibold">Valor</th>
                      <th className="px-4 py-3 font-semibold">Cadastrado em</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {assinaturasPendentes.map((a) => (
                      <tr key={a.id} className="border-b last:border-0" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="px-4 py-3">{a.motoristaNome ?? 'Motorista'}</td>
                        <td className="px-4 py-3">{a.veiculoPlaca ?? '—'}</td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(a.valor_atual)}</td>
                        <td className="px-4 py-3">{formatDate(a.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => confirmarPagamentoAssinatura(a.id)}
                            disabled={saving === a.id}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                            style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                          >
                            {saving === a.id ? 'Salvando…' : 'Confirmar pagamento'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                Comissões a creditar
              </div>
              <div className="text-xs font-semibold text-[color:var(--rbr-muted)]">
                {comissoes.length} · {formatMoney(comissoesTotal)}
              </div>
            </div>
            {comissoes.length === 0 ? (
              <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
                Nenhuma comissão pendente de crédito.
              </div>
            ) : (
              <div className="bg-white border rounded-[16px] overflow-hidden" style={cardStyle}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="px-4 py-3 font-semibold">Agenciador</th>
                      <th className="px-4 py-3 font-semibold">Competência</th>
                      <th className="px-4 py-3 font-semibold">Base ativa</th>
                      <th className="px-4 py-3 font-semibold">Valor</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {comissoes.map((c) => (
                      <tr key={c.id} className="border-b last:border-0" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="px-4 py-3">{c.agenciadorNome ?? 'Agenciador'}</td>
                        <td className="px-4 py-3">{formatDate(c.competencia)}</td>
                        <td className="px-4 py-3">{c.base_ativa_qtd}</td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(c.valor_calculado)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => creditarComissao(c.id)}
                            disabled={saving === c.id}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                            style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                          >
                            {saving === c.id ? 'Salvando…' : 'Marcar creditado'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
              Caixa projetado (próximos dias)
            </div>
            {saldos.length === 0 ? (
              <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
                Nenhuma projeção de caixa cadastrada.
              </div>
            ) : (
              <div className="bg-white border rounded-[16px] overflow-hidden" style={cardStyle}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)' }}>
                      <th className="px-4 py-3 font-semibold">Data</th>
                      <th className="px-4 py-3 font-semibold">Entradas previstas</th>
                      <th className="px-4 py-3 font-semibold">Saídas previstas</th>
                      <th className="px-4 py-3 font-semibold">Saldo projetado</th>
                      <th className="px-4 py-3 font-semibold">Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldos.map((s) => (
                      <tr key={s.id} className="border-b last:border-0" style={{ borderColor: 'var(--rbr-border)' }}>
                        <td className="px-4 py-3">{formatDate(s.data)}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--rbr-positive)' }}>
                          {formatMoney(s.entradas_previstas)}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--rbr-danger)' }}>
                          {formatMoney(s.saidas_previstas)}
                        </td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(s.saldo_projetado)}</td>
                        <td className="px-4 py-3">
                          {s.alerta_disparado && (
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                              style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}
                            >
                              Alerta
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
