import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, initials, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { IconStar } from '@rbr/shared/icons'
import { useLocationReporter } from '@rbr/shared/useLocationReporter'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Operacao = Database['public']['Tables']['operacoes']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']

const TOTAL_ETAPAS_CHECKLIST = 5

export default function Inicio({ pessoa }: { pessoa: Pessoa }) {
  const [online, setOnline] = useState(pessoa.status_online)
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [operacaoAtual, setOperacaoAtual] = useState<
    (Operacao & { clienteNome?: string; valorContrato?: number | null; etapasFeitas?: number }) | null
  >(null)
  const [oferta, setOferta] = useState<(Operacao & { clienteNome?: string; valorContrato?: number | null }) | null>(
    null,
  )
  const [saldoPontos, setSaldoPontos] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const titularId = pessoa.papel === 'condutor' ? pessoa.titular_id : pessoa.id

  const load = useCallback(async () => {
    setLoading(true)

    const veiculosPromise = titularId
      ? supabase.from('veiculos').select('*').eq('titular_id', titularId).eq('ativo', true).limit(1)
      : Promise.resolve({ data: [] as Veiculo[] })

    const operacaoAtualPromise = supabase
      .from('operacoes')
      .select('*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato)')
      .eq('pessoa_alocada_id', pessoa.id)
      .in('status', ['liberada_coleta', 'carregando', 'em_transito'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const saldoPromise = supabase
      .from('pontuacao_saldo')
      .select('saldo')
      .eq('pessoa_id', pessoa.id)
      .maybeSingle()

    const [{ data: veiculos }, { data: opAtual }, { data: saldo }] = await Promise.all([
      veiculosPromise,
      operacaoAtualPromise,
      saldoPromise,
    ])

    const meuVeiculo = veiculos?.[0] ?? null
    setVeiculo(meuVeiculo)

    if (opAtual) {
      const etapasFeitas = await supabase
        .from('operacao_checklist_fotos')
        .select('etapa', { count: 'exact', head: true })
        .eq('operacao_id', opAtual.id)
      setOperacaoAtual({
        ...opAtual,
        clienteNome: (opAtual as any).clientes?.nome_fantasia ?? (opAtual as any).clientes?.razao_social,
        valorContrato: (opAtual as any).condicoes_pagamento_operacao?.[0]?.valor_total_contrato,
        etapasFeitas: etapasFeitas.count ?? 0,
      })
    } else {
      setOperacaoAtual(null)
    }

    if (meuVeiculo) {
      const { data: ofertaData } = await supabase
        .from('operacoes')
        .select('*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato)')
        .eq('status', 'alocando_motorista')
        .is('pessoa_alocada_id', null)
        .eq('veiculo_id', meuVeiculo.id)
        .limit(1)
        .maybeSingle()
      setOferta(
        ofertaData
          ? {
              ...ofertaData,
              clienteNome: (ofertaData as any).clientes?.nome_fantasia ?? (ofertaData as any).clientes?.razao_social,
              valorContrato: (ofertaData as any).condicoes_pagamento_operacao?.[0]?.valor_total_contrato,
            }
          : null,
      )
    } else {
      setOferta(null)
    }

    setSaldoPontos(saldo?.saldo ?? 0)
    setLoading(false)
  }, [pessoa.id, titularId])

  useEffect(() => {
    load()
  }, [load])

  // GPS do celular (grátis) — só reporta enquanto online ou com carga em
  // andamento; nunca interrompe o rastreio de uma operação já aceita, mesmo
  // que o motorista fique offline (ver claude/monitoramento-localizacao-frota.md).
  useLocationReporter({
    pessoaId: pessoa.id,
    operacaoId: operacaoAtual?.id ?? null,
    veiculoId: veiculo?.id ?? null,
    ativo: online || Boolean(operacaoAtual),
  })

  async function toggleOnline() {
    const next = !online
    setOnline(next)
    const { error } = await supabase
      .from('pessoas')
      .update({ status_online: next, status_online_atualizado_em: new Date().toISOString() })
      .eq('id', pessoa.id)
    if (error) setOnline(!next)
  }

  async function aceitarOferta() {
    if (!oferta) return
    setBusy(true)
    const { error } = await supabase
      .from('operacoes')
      .update({ pessoa_alocada_id: pessoa.id })
      .eq('id', oferta.id)
    setBusy(false)
    if (!error) {
      setOferta(null)
      load()
    }
  }

  function recusarOferta() {
    // Recusa é só local (sem tabela de registro de recusa no schema v1) —
    // some da tela nesta sessão; volta a aparecer se a lista for recarregada.
    setOferta(null)
  }

  const primeiroNome = pessoa.nome.split(' ')[0]

  return (
    <div className="px-5 pt-8 flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="rbr-display font-bold text-2xl leading-tight text-[color:var(--rbr-navy-dark)]">
            Olá, {primeiroNome}
          </div>
          <div className="text-[13px] text-[color:var(--rbr-muted)] mt-0.5">
            {veiculo ? `${veiculo.tipo_veiculo ?? 'Veículo'} · ${veiculo.placa}` : 'Nenhum veículo ativo'}
          </div>
        </div>
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold flex-shrink-0"
          style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
        >
          {initials(pessoa.nome)}
        </div>
      </div>

      <div
        className="bg-white border rounded-[20px] px-[18px] py-4 flex items-center justify-between"
        style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
      >
        <div>
          <div className="text-sm font-bold">
            {online ? 'ONLINE — recebendo ofertas' : 'OFFLINE — pausado'}
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)] mt-0.5">
            Controla se você recebe novas ofertas
          </div>
        </div>
        <button
          onClick={toggleOnline}
          className="w-[52px] h-[30px] rounded-full relative flex-shrink-0"
          style={{ background: online ? 'var(--rbr-navy)' : '#E3E5EE' }}
        >
          <span
            className="absolute top-[3px] w-6 h-6 rounded-full bg-white shadow transition-all"
            style={{ left: online ? '25px' : '3px' }}
          />
        </button>
      </div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && operacaoAtual && (
        <div
          className="bg-white border rounded-[20px] p-[18px]"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span
              className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
              style={{ background: 'var(--rbr-navy)' }}
            >
              {STATUS_OPERACAO_LABEL[operacaoAtual.status]}
            </span>
            {operacaoAtual.valorContrato != null && (
              <span className="text-sm font-bold">{formatMoney(operacaoAtual.valorContrato)}</span>
            )}
          </div>
          <div className="text-[15px] font-bold mb-1">
            {operacaoAtual.clienteNome ?? 'Cliente a confirmar'}
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)] mb-3">
            {operacaoAtual.peso_bruto ? `${operacaoAtual.peso_bruto} kg` : 'Detalhes de carga em atualização'}
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0F1F6' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, ((operacaoAtual.etapasFeitas ?? 0) / TOTAL_ETAPAS_CHECKLIST) * 100)}%`,
                background: 'var(--rbr-gold)',
              }}
            />
          </div>
        </div>
      )}

      {!loading && !operacaoAtual && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={{ borderColor: 'var(--rbr-border)' }}>
          Nenhuma carga em andamento agora.
        </div>
      )}

      <div
        className="flex items-center gap-2 bg-white border rounded-[14px] px-3.5 py-2.5"
        style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
      >
        <IconStar width={16} height={16} fill="var(--rbr-gold)" stroke="none" />
        <span className="text-[13px] font-bold">{saldoPontos ?? 0} pontos</span>
      </div>

      {!loading && oferta && (
        <div
          className="bg-white border rounded-[20px] p-[18px]"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-2">
            Nova oferta
          </div>
          <div className="text-[15px] font-bold mb-1">{oferta.clienteNome ?? 'Cliente a confirmar'}</div>
          <div className="text-[13px] text-[color:var(--rbr-muted)] mb-3.5">
            {oferta.valorContrato != null ? formatMoney(oferta.valorContrato) : 'Valor em definição'}
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={recusarOferta}
              className="flex-1 py-3 rounded-xl text-sm font-bold border"
              style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
            >
              Recusar
            </button>
            <button
              onClick={aceitarOferta}
              disabled={busy}
              className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-60"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {busy ? 'Aceitando…' : 'Aceitar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
