import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDate, formatMoney } from '@rbr/shared/format'
import { IconAlertTriangle } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type AssinaturaMotorista = Database['public']['Tables']['assinaturas_motorista']['Row']
type BloqueioAcessoVeiculo = Database['public']['Tables']['bloqueios_acesso_veiculo']['Row']
type FaturaAssinatura = Database['public']['Tables']['faturas_assinatura']['Row']
type StatusFatura = Database['public']['Enums']['status_fatura']
type StatusAssinatura = Database['public']['Enums']['status_assinatura']

type SituacaoRecebimento = 'pago' | 'agendado' | 'previsto' | 'cancelado'

type Recebimento = {
  id: string
  descricao: string
  valor: number
  valor_pago: number
  data_vencimento: string
  data_pagamento: string | null
  situacao: SituacaoRecebimento
  vencimento_estimado: boolean
  rota: string | null
  operacao_id: string | null
}

const SITUACAO_RECEBIMENTO_LABEL: Record<SituacaoRecebimento, string> = {
  pago: 'Pago',
  agendado: 'Agendado',
  previsto: 'Previsto',
  cancelado: 'Cancelado',
}

const STATUS_FATURA_LABEL: Record<StatusFatura, string> = {
  pendente: 'Pendente',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Paga',
  vencido: 'Vencida',
  inadimplente: 'Inadimplente',
  cancelada: 'Cancelada',
}

const STATUS_ASSINATURA_LABEL: Record<StatusAssinatura, string> = {
  ativa: 'Ativa',
  aguardando_confirmacao: 'Aguardando confirmação de pagamento',
  inadimplente: 'Inadimplente',
  bloqueada: 'Bloqueada',
  cancelada: 'Cancelada',
  encerrado_por_motorista: 'Encerrada por você',
  suspenso_por_rbr: 'Suspensa pela RBR',
}

function badgeRecebimento(situacao: SituacaoRecebimento): string {
  if (situacao === 'pago') return 'var(--rbr-positive)'
  if (situacao === 'previsto') return 'var(--rbr-gold)'
  if (situacao === 'cancelado') return 'var(--rbr-danger)'
  return 'var(--rbr-navy)'
}

function linhaDataRecebimento(r: Recebimento): string {
  if (r.situacao === 'pago') return `Pago em ${formatDate(r.data_pagamento ?? r.data_vencimento)}`
  if (r.situacao === 'previsto' || r.vencimento_estimado)
    return `Previsão: ${formatDate(r.data_vencimento)} (depende da entrega/liberação)`
  return `Programado para ${formatDate(r.data_vencimento)}`
}

function badgeFatura(status: StatusFatura): string {
  if (status === 'pago') return 'var(--rbr-positive)'
  if (status === 'vencido' || status === 'inadimplente' || status === 'cancelada') return 'var(--rbr-danger)'
  return 'var(--rbr-navy)'
}

function badgeAssinatura(status: StatusAssinatura): string {
  if (status === 'ativa') return 'var(--rbr-positive)'
  if (status === 'inadimplente' || status === 'bloqueada' || status === 'suspenso_por_rbr')
    return 'var(--rbr-danger)'
  return 'var(--rbr-navy)'
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

export default function Caixa({ pessoa }: { pessoa: Pessoa }) {
  const [loading, setLoading] = useState(true)
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([])
  const [assinaturas, setAssinaturas] = useState<AssinaturaMotorista[]>([])
  const [bloqueios, setBloqueios] = useState<BloqueioAcessoVeiculo[]>([])
  const [faturas, setFaturas] = useState<FaturaAssinatura[]>([])

  const podeVerFinanceiro = pessoa.papel === 'titular_motorista'

  const load = useCallback(async () => {
    if (!podeVerFinanceiro) {
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: veiculos } = await supabase.from('veiculos').select('id').eq('titular_id', pessoa.id)
    const veiculoIds = (veiculos ?? []).map((v: { id: string }) => v.id)

    const recebimentosPromise = supabase.rpc('meus_recebimentos')

    const assinaturasPromise = supabase
      .from('assinaturas_motorista')
      .select('*')
      .eq('motorista_titular_id', pessoa.id)

    const bloqueiosPromise =
      veiculoIds.length > 0
        ? supabase
            .from('bloqueios_acesso_veiculo')
            .select('*')
            .in('veiculo_id', veiculoIds)
            .eq('ativo', true)
        : Promise.resolve({ data: [] as BloqueioAcessoVeiculo[] })

    const faturasPromise = supabase
      .from('faturas_assinatura')
      .select('*')
      .eq('motorista_titular_id', pessoa.id)
      .order('competencia', { ascending: false })

    const [{ data: recebimentosData }, { data: assinaturasData }, { data: bloqueiosData }, { data: faturasData }] =
      await Promise.all([recebimentosPromise, assinaturasPromise, bloqueiosPromise, faturasPromise])

    setRecebimentos((recebimentosData ?? []) as unknown as Recebimento[])
    setAssinaturas(assinaturasData ?? [])
    setBloqueios(bloqueiosData ?? [])
    setFaturas(faturasData ?? [])
    setLoading(false)
  }, [pessoa.id, podeVerFinanceiro])

  useEffect(() => {
    load()
  }, [load])

  const aReceber = recebimentos
    .filter((r) => r.situacao !== 'pago' && r.situacao !== 'cancelado')
    .reduce((acc, r) => acc + Math.max(0, Number(r.valor ?? 0) - Number(r.valor_pago ?? 0)), 0)
  const limite30d = new Date()
  limite30d.setDate(limite30d.getDate() - 30)
  const limite30dStr = limite30d.toLocaleDateString('sv-SE')
  const recebido30d = recebimentos
    .filter((r) => r.situacao === 'pago' && r.data_pagamento && r.data_pagamento.slice(0, 10) >= limite30dStr)
    .reduce((acc, r) => acc + Number(r.valor ?? 0), 0)

  if (!podeVerFinanceiro) {
    return (
      <div className="px-5 pt-8 flex flex-col gap-3.5">
        <div className="rbr-display font-bold text-2xl leading-tight text-[color:var(--rbr-navy-dark)]">Caixa</div>
        <div
          className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]"
          style={cardStyle}
        >
          Financeiro disponível apenas para o titular da frota.
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pt-8 flex flex-col gap-3.5">
      <div className="rbr-display font-bold text-2xl leading-tight text-[color:var(--rbr-navy-dark)]">Caixa</div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && bloqueios.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-3.5 py-3" style={{ background: '#FBE9E9' }}>
          <IconAlertTriangle width={16} height={16} style={{ color: 'var(--rbr-danger)', flexShrink: 0, marginTop: 1 }} />
          <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
            <span className="font-bold">Acesso do veículo bloqueado. </span>
            {bloqueios[0].motivo}
          </div>
        </div>
      )}

      {!loading && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">
            Pagamentos
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border rounded-[20px] p-[14px]" style={cardStyle}>
              <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)] mb-1">A receber da RBR</div>
              <div className="text-base font-bold text-[color:var(--rbr-navy)]">{formatMoney(aReceber)}</div>
            </div>
            <div className="bg-white border rounded-[20px] p-[14px]" style={cardStyle}>
              <div className="text-[11px] font-semibold text-[color:var(--rbr-muted)] mb-1">
                Recebido nos últimos 30 dias
              </div>
              <div className="text-base font-bold" style={{ color: 'var(--rbr-positive)' }}>
                {formatMoney(recebido30d)}
              </div>
            </div>
          </div>
          {recebimentos.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum pagamento registrado ainda.
            </div>
          )}
          {recebimentos.map((r) => {
            const valorPago = Number(r.valor_pago ?? 0)
            return (
              <div key={r.id} className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                    style={{ background: badgeRecebimento(r.situacao) }}
                  >
                    {SITUACAO_RECEBIMENTO_LABEL[r.situacao] ?? r.situacao}
                  </span>
                  <span className="text-sm font-bold">{formatMoney(r.valor)}</span>
                </div>
                <div className="text-[13px] font-semibold mb-1">{r.descricao}</div>
                {r.rota && <div className="text-xs text-[color:var(--rbr-muted)] mb-1">{r.rota}</div>}
                <div className="text-xs text-[color:var(--rbr-muted)]">{linhaDataRecebimento(r)}</div>
                {valorPago > 0 && r.situacao !== 'pago' && (
                  <div className="text-xs font-semibold mt-1" style={{ color: 'var(--rbr-positive)' }}>
                    Já pago: {formatMoney(valorPago)}
                  </div>
                )}
              </div>
            )
          })}

          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-2">
            Assinatura
          </div>
          {assinaturas.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhuma assinatura ativa.
            </div>
          )}
          {assinaturas.map((a) => (
            <div key={a.id} className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                  style={{ background: badgeAssinatura(a.status) }}
                >
                  {STATUS_ASSINATURA_LABEL[a.status]}
                </span>
                <span className="text-sm font-bold">{formatMoney(a.valor_atual)}/mês</span>
              </div>
              <div className="text-xs text-[color:var(--rbr-muted)]">
                {a.dia_vencimento ? `Vencimento todo dia ${a.dia_vencimento}` : 'Vencimento não definido'}
              </div>
            </div>
          ))}

          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-2">
            Faturas
          </div>
          {faturas.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhuma fatura emitida ainda.
            </div>
          )}
          {faturas.map((f) => (
            <div key={f.id} className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                  style={{ background: badgeFatura(f.status) }}
                >
                  {STATUS_FATURA_LABEL[f.status]}
                </span>
                <span className="text-sm font-bold">{formatMoney(f.valor_total)}</span>
              </div>
              <div className="text-[13px] font-semibold mb-1">Competência {f.competencia}</div>
              <div className="text-xs text-[color:var(--rbr-muted)]">
                {f.data_pagamento ? `Pago em ${formatDate(f.data_pagamento)}` : `Vence em ${formatDate(f.data_vencimento)}`}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
