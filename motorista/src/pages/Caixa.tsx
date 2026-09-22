import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDate, formatMoney } from '@rbr/shared/format'
import { IconAlertTriangle } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type PagamentoMotorista = Database['public']['Tables']['pagamentos_motorista']['Row']
type AssinaturaMotorista = Database['public']['Tables']['assinaturas_motorista']['Row']
type BloqueioAcessoVeiculo = Database['public']['Tables']['bloqueios_acesso_veiculo']['Row']
type FaturaAssinatura = Database['public']['Tables']['faturas_assinatura']['Row']
type StatusPagamentoMotorista = Database['public']['Enums']['status_pagamento_motorista']
type StatusFatura = Database['public']['Enums']['status_fatura']
type StatusAssinatura = Database['public']['Enums']['status_assinatura']

const TIPO_PAGAMENTO_LABEL: Record<string, string> = {
  adiantamento: 'Adiantamento',
  saldo: 'Saldo',
  a_vista: 'À vista',
}

const STATUS_PAGAMENTO_LABEL: Record<StatusPagamentoMotorista, string> = {
  pendente: 'Pendente',
  aguardando_confirmacao_entrega: 'Aguardando entrega',
  aguardando_pix_agenciador: 'Aguardando PIX',
  pix_confirmado: 'PIX confirmado',
  documentacao_emitida: 'Documentação emitida',
  liberado: 'Liberado',
  pago: 'Pago',
  atrasado: 'Atrasado',
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

function badgePagamento(status: StatusPagamentoMotorista): string {
  if (status === 'pago') return 'var(--rbr-positive)'
  if (status === 'atrasado' || status === 'cancelado') return 'var(--rbr-danger)'
  if (status === 'liberado' || status === 'documentacao_emitida' || status === 'pix_confirmado')
    return 'var(--rbr-gold)'
  return 'var(--rbr-navy)'
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
  const [pagamentos, setPagamentos] = useState<PagamentoMotorista[]>([])
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

    const pagamentosFiltro =
      veiculoIds.length > 0
        ? `motorista_id.eq.${pessoa.id},veiculo_id.in.(${veiculoIds.join(',')})`
        : `motorista_id.eq.${pessoa.id}`

    const pagamentosPromise = supabase
      .from('pagamentos_motorista')
      .select('*')
      .or(pagamentosFiltro)
      .order('created_at', { ascending: false })

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

    const [{ data: pagamentosData }, { data: assinaturasData }, { data: bloqueiosData }, { data: faturasData }] =
      await Promise.all([pagamentosPromise, assinaturasPromise, bloqueiosPromise, faturasPromise])

    setPagamentos(pagamentosData ?? [])
    setAssinaturas(assinaturasData ?? [])
    setBloqueios(bloqueiosData ?? [])
    setFaturas(faturasData ?? [])
    setLoading(false)
  }, [pessoa.id, podeVerFinanceiro])

  useEffect(() => {
    load()
  }, [load])

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
          {pagamentos.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum pagamento registrado ainda.
            </div>
          )}
          {pagamentos.map((p) => (
            <div key={p.id} className="bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                  style={{ background: badgePagamento(p.status) }}
                >
                  {STATUS_PAGAMENTO_LABEL[p.status]}
                </span>
                <span className="text-sm font-bold">{formatMoney(p.valor)}</span>
              </div>
              <div className="text-[13px] font-semibold mb-1">
                {TIPO_PAGAMENTO_LABEL[p.tipo] ?? p.tipo}
              </div>
              <div className="text-xs text-[color:var(--rbr-muted)]">
                {p.data_pagamento
                  ? `Pago em ${formatDate(p.data_pagamento)}`
                  : p.data_prevista
                    ? `Previsto para ${formatDate(p.data_prevista)}`
                    : 'Data ainda não definida'}
              </div>
            </div>
          ))}

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
