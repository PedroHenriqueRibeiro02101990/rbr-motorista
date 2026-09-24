import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, initials, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { IconStar } from '@rbr/shared/icons'
import { useLocationReporter } from '@rbr/shared/useLocationReporter'
import { StatusCadastro } from '@rbr/shared/cadastro'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Operacao = Database['public']['Tables']['operacoes']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']

const TOTAL_ETAPAS_CHECKLIST = 5

// condicoes_pagamento_operacao é 1 por operação — o Supabase devolve objeto (ou lista, em versões antigas).
function valorContratoDe(op: unknown): number | null {
  const c = (op as { condicoes_pagamento_operacao?: unknown }).condicoes_pagamento_operacao
  const linha = Array.isArray(c) ? c[0] : c
  return (linha as { valor_total_contrato?: number } | null | undefined)?.valor_total_contrato ?? null
}

export default function Inicio({ pessoa, onRecarregar }: { pessoa: Pessoa; onRecarregar?: () => Promise<void> | void }) {
  const [meusVeiculos, setMeusVeiculos] = useState<Veiculo[]>([])
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

  const titularId = pessoa.papel === 'condutor' ? pessoa.titular_id : pessoa.id

  const load = useCallback(async () => {
    setLoading(true)

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

    const [{ data: opAtual }, { data: saldo }] = await Promise.all([operacaoAtualPromise, saldoPromise])

    // O veículo mostrado (e o que grava a posição de GPS) é o da carga em
    // andamento, quando existe uma — nunca "o primeiro veículo ativo da
    // frota", que pode não ter nada a ver com o que está rodando agora
    // (frota com mais de um veículo, ou condutor dirigindo um veículo do
    // titular que não é o primeiro cadastrado).
    let meuVeiculo: Veiculo | null = null
    if (opAtual?.veiculo_id) {
      const { data: v } = await supabase.from('veiculos').select('*').eq('id', opAtual.veiculo_id).maybeSingle()
      meuVeiculo = v ?? null
    }
    if (!meuVeiculo && titularId) {
      const { data: veiculos } = await supabase
        .from('veiculos')
        .select('*')
        .eq('titular_id', titularId)
        .eq('ativo', true)
        .order('created_at', { ascending: false })
        .limit(1)
      meuVeiculo = veiculos?.[0] ?? null
    }
    setVeiculo(meuVeiculo)
    if (pessoa.papel === 'titular_motorista') {
      const { data: todos } = await supabase.from('veiculos').select('*').eq('titular_id', pessoa.id).eq('ativo', true)
      setMeusVeiculos(todos ?? [])
    }

    if (opAtual) {
      const etapasFeitas = await supabase
        .from('operacao_checklist_fotos')
        .select('etapa', { count: 'exact', head: true })
        .eq('operacao_id', opAtual.id)
      setOperacaoAtual({
        ...opAtual,
        clienteNome: (opAtual as any).clientes?.nome_fantasia ?? (opAtual as any).clientes?.razao_social,
        valorContrato: valorContratoDe(opAtual),
        etapasFeitas: etapasFeitas.count ?? 0,
      })
    } else {
      setOperacaoAtual(null)
    }

    // Quem aloca é o operador da RBR — aqui o motorista só vê a carga já reservada pra ele
    // enquanto a documentação é preparada (não existe mais "pegar carga" sozinho).
    const { data: ofertaData } = await supabase
      .from('operacoes')
      .select('*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato)')
      .eq('pessoa_alocada_id', pessoa.id)
      .in('status', ['alocando_motorista', 'aguardando_liberacao_fiscal'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setOferta(
      ofertaData
        ? {
            ...ofertaData,
            clienteNome: (ofertaData as any).clientes?.nome_fantasia ?? (ofertaData as any).clientes?.razao_social,
            valorContrato: valorContratoDe(ofertaData),
          }
        : null,
    )

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

  const primeiroNome = pessoa.nome.split(' ')[0]

  return (
    <div className="px-5 pt-8 flex flex-col gap-3.5">
      <StatusCadastro
        pessoa={pessoa}
        veiculos={meusVeiculos}
        onAtualizar={async () => {
          await onRecarregar?.()
          await load()
        }}
        compacto
      />
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
            Carga reservada pra você
          </div>
          <div className="text-[15px] font-bold mb-1">{oferta.clienteNome ?? 'Cliente a confirmar'}</div>
          <div className="text-[13px] text-[color:var(--rbr-muted)] mb-3.5">
            {oferta.valorContrato != null ? formatMoney(oferta.valorContrato) : 'Valor em definição'}
          </div>
          <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}>
            A RBR está preparando a documentação (CT-e, MDF-e, CIOT, vale-pedágio). A carga aparece em “Minhas cargas” como liberada assim que tudo estiver pronto.
          </div>
        </div>
      )}
    </div>
  )
}
