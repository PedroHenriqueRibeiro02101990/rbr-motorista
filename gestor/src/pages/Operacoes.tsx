import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate, formatDateTime, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { IconChevronRight } from '@rbr/shared/icons'
import { IconAlertTriangle, IconCopy, IconClock } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Operacao = Database['public']['Tables']['operacoes']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']
type Averbacao = Database['public']['Tables']['averbacoes_negociacao']['Row']
type AutorizacaoAet = Database['public']['Tables']['autorizacoes_aet']['Row']
type StatusOperacao = Database['public']['Enums']['status_operacao']
type StatusAverbacao = Database['public']['Enums']['status_averbacao']
type StatusAet = Database['public']['Enums']['status_aet']

type CotacaoDetalheAet = {
  cidade_origem?: string | null
  uf_origem?: string | null
  cidade_destino?: string | null
  uf_destino?: string | null
  ncms_produtos?: string[] | null
  natureza_operacao?: string | null
  nf_remetente_razao_social?: string | null
  nf_remetente_cnpj?: string | null
  nf_destinatario_razao_social?: string | null
  nf_destinatario_cnpj?: string | null
}

type OperacaoEnriquecida = Operacao & {
  clienteNome?: string
  valorContrato?: number | null
  cotacaoDetalhe?: CotacaoDetalheAet | null
}

const STATUS_AET_LABEL: Record<StatusAet, string> = {
  nao_solicitada: 'Não solicitada',
  protocolada: 'Protocolada no SIAET',
  emitida: 'Emitida',
  negada: 'Negada',
  vencida: 'Vencida',
}

function badgeAet(status: StatusAet): string {
  if (status === 'emitida') return 'var(--rbr-positive)'
  if (status === 'negada' || status === 'vencida') return 'var(--rbr-danger)'
  if (status === 'protocolada') return 'var(--rbr-gold)'
  return 'var(--rbr-muted)'
}

// SIAET pode levar até 45 dias corridos para emitir a AET (manual externo DNIT/SIAET).
const PRAZO_AET_DIAS_PADRAO = 45

function diasDesde(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null
  const inicio = new Date(dataIso + 'T00:00:00')
  const hoje = new Date()
  const diffMs = hoje.setHours(0, 0, 0, 0) - inicio.setHours(0, 0, 0, 0)
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

const FILTROS: { value: StatusOperacao | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'alocando_motorista', label: 'Alocando motorista' },
  { value: 'aguardando_liberacao_fiscal', label: 'Aguardando fiscal' },
  { value: 'liberada_coleta', label: 'Liberada p/ coleta' },
  { value: 'carregando', label: 'Carregando' },
  { value: 'em_transito', label: 'Em trânsito' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'fechada', label: 'Fechada' },
  { value: 'cancelada', label: 'Cancelada' },
]

const AVERBACAO_LABEL: Record<StatusAverbacao, string> = {
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
}

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

function badgeBackground(status: StatusOperacao): string {
  if (status === 'cancelada') return 'var(--rbr-danger)'
  if (status === 'entregue' || status === 'fechada') return 'var(--rbr-positive)'
  return 'var(--rbr-navy)'
}

export default function Operacoes({ gestor }: { gestor: Pessoa }) {
  const [operacoes, setOperacoes] = useState<OperacaoEnriquecida[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<StatusOperacao | 'todas'>('todas')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [motoristas, setMotoristas] = useState<Pessoa[]>([])
  const [limitesPesoEixos, setLimitesPesoEixos] = useState<Record<number, number>>({})
  const [averbacoes, setAverbacoes] = useState<Record<string, Averbacao | null>>({})
  const [autorizacoesAet, setAutorizacoesAet] = useState<Record<string, AutorizacaoAet | null>>({})
  const [aetForm, setAetForm] = useState<{ numero_aet: string; protocolo_siaet: string; data_validade: string; observacoes: string }>(
    { numero_aet: '', protocolo_siaet: '', data_validade: '', observacoes: '' },
  )
  const [veiculoForm, setVeiculoForm] = useState<Record<string, string>>({})
  const [cargaForm, setCargaForm] = useState<Record<string, string>>({})
  const [copiadoId, setCopiadoId] = useState<string | null>(null)

  const [motivoLiberacao, setMotivoLiberacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('operacoes')
      .select(
        '*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato), cotacoes(valor_total, cidade_origem, uf_origem, cidade_destino, uf_destino, ncms_produtos, natureza_operacao, nf_remetente_razao_social, nf_remetente_cnpj, nf_destinatario_razao_social, nf_destinatario_cnpj)',
      )
      .order('updated_at', { ascending: false })
      .limit(300)

    if (error) setErrorMsg(error.message)

    const mapeadas: OperacaoEnriquecida[] = (data ?? []).map((op) => ({
      ...op,
      clienteNome: (op as any).clientes?.nome_fantasia ?? (op as any).clientes?.razao_social,
      valorContrato:
        (op as any).condicoes_pagamento_operacao?.[0]?.valor_total_contrato ?? (op as any).cotacoes?.valor_total,
      cotacaoDetalhe: (op as any).cotacoes ?? null,
    }))
    setOperacoes(mapeadas)
    setLoading(false)
  }, [])

  const carregarVeiculos = useCallback(async () => {
    const { data } = await supabase.from('veiculos').select('*').eq('ativo', true).order('placa', { ascending: true })
    setVeiculos(data ?? [])
  }, [])

  useEffect(() => {
    load()
    carregarVeiculos()
    supabase
      .from('pessoas')
      .select('*')
      .in('papel', ['titular_motorista', 'condutor'])
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
      .then(({ data }) => setMotoristas(data ?? []))
    supabase
      .from('limites_peso_pbtc_eixos')
      .select('eixos, limite_kg')
      .then(({ data }) => {
        const mapa: Record<number, number> = {}
        for (const row of data ?? []) mapa[row.eixos] = row.limite_kg
        setLimitesPesoEixos(mapa)
      })
  }, [load, carregarVeiculos])

  async function carregarAverbacao(operacaoId: string) {
    const { data } = await supabase
      .from('averbacoes_negociacao')
      .select('*')
      .eq('operacao_id', operacaoId)
      .maybeSingle()
    setAverbacoes((prev) => ({ ...prev, [operacaoId]: data ?? null }))
  }

  async function carregarAet(operacaoId: string) {
    const { data } = await supabase.from('autorizacoes_aet').select('*').eq('operacao_id', operacaoId).maybeSingle()
    setAutorizacoesAet((prev) => ({ ...prev, [operacaoId]: data ?? null }))
    setAetForm({
      numero_aet: data?.numero_aet ?? '',
      protocolo_siaet: data?.protocolo_siaet ?? '',
      data_validade: data?.data_validade ?? '',
      observacoes: data?.observacoes ?? '',
    })
  }

  async function toggleExpand(op: OperacaoEnriquecida) {
    setErrorMsg(null)
    setMotivoLiberacao('')
    if (expandedId === op.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(op.id)
    setVeiculoForm({})
    setCargaForm({})
    setCopiadoId(null)
    if (op.carga_complexa_eixo3_seguro_excedido && !(op.id in averbacoes)) {
      await carregarAverbacao(op.id)
    }
    if (op.carga_complexa_eixo2_superdimensionada) {
      await carregarAet(op.id)
    }
  }

  async function atualizarOperacao(id: string, patch: Database['public']['Tables']['operacoes']['Update']) {
    setSaving(true)
    setErrorMsg(null)
    const { error } = await supabase.from('operacoes').update(patch).eq('id', id)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return false
    }
    await load()
    return true
  }

  async function liberarBloqueio(op: OperacaoEnriquecida) {
    await atualizarOperacao(op.id, {
      bloqueio_fiscal: false,
      bloqueio_fiscal_motivo: motivoLiberacao.trim()
        ? `Liberado por ${gestor.nome}: ${motivoLiberacao.trim()}`
        : `Liberado por ${gestor.nome}`,
    })
    setMotivoLiberacao('')
  }

  async function reatribuirVeiculo(op: OperacaoEnriquecida, veiculoId: string) {
    await atualizarOperacao(op.id, { veiculo_id: veiculoId || null })
  }

  async function reatribuirMotorista(op: OperacaoEnriquecida, pessoaId: string) {
    await atualizarOperacao(op.id, { pessoa_alocada_id: pessoaId || null })
  }

  async function togglePagamentoPosEntrega(op: OperacaoEnriquecida) {
    const novoValor = !op.pagamento_pos_entrega_confirmado
    await atualizarOperacao(op.id, {
      pagamento_pos_entrega_confirmado: novoValor,
      pagamento_pos_entrega_confirmado_por: novoValor ? gestor.id : null,
      pagamento_pos_entrega_confirmado_em: novoValor ? new Date().toISOString() : null,
    })
  }

  async function atualizarAverbacao(op: OperacaoEnriquecida, status: StatusAverbacao) {
    setSaving(true)
    setErrorMsg(null)
    const existente = averbacoes[op.id]
    const payload = {
      operacao_id: op.id,
      status,
      negociado_por: gestor.id,
      resolvido_em: status === 'em_analise' ? null : new Date().toISOString(),
    }
    const { error } = existente
      ? await supabase.from('averbacoes_negociacao').update(payload).eq('id', existente.id)
      : await supabase.from('averbacoes_negociacao').insert(payload)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await carregarAverbacao(op.id)
  }

  async function salvarCamposVeiculo(veiculoId: string) {
    const patch: Database['public']['Tables']['veiculos']['Update'] = {}
    if (veiculoForm.chassi !== undefined) patch.chassi = veiculoForm.chassi.trim() || null
    if (veiculoForm.potencia_cv !== undefined) patch.potencia_cv = veiculoForm.potencia_cv ? Number(veiculoForm.potencia_cv) : null
    if (veiculoForm.tara_kg !== undefined) patch.tara_kg = veiculoForm.tara_kg ? Number(veiculoForm.tara_kg) : null
    if (veiculoForm.quantidade_eixos !== undefined)
      patch.quantidade_eixos = veiculoForm.quantidade_eixos ? Number(veiculoForm.quantidade_eixos) : null
    if (veiculoForm.quantidade_pneus !== undefined)
      patch.quantidade_pneus = veiculoForm.quantidade_pneus ? Number(veiculoForm.quantidade_pneus) : null

    setSaving(true)
    setErrorMsg(null)
    const { error } = await supabase.from('veiculos').update(patch).eq('id', veiculoId)
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setVeiculoForm({})
    await carregarVeiculos()
  }

  async function salvarDimensoesCarga(op: OperacaoEnriquecida) {
    const patch: Database['public']['Tables']['operacoes']['Update'] = {}
    if (cargaForm.comprimento_cm !== undefined) patch.comprimento_cm = cargaForm.comprimento_cm ? Number(cargaForm.comprimento_cm) : null
    if (cargaForm.largura_cm !== undefined) patch.largura_cm = cargaForm.largura_cm ? Number(cargaForm.largura_cm) : null
    if (cargaForm.altura_cm !== undefined) patch.altura_cm = cargaForm.altura_cm ? Number(cargaForm.altura_cm) : null
    const ok = await atualizarOperacao(op.id, patch)
    if (ok) setCargaForm({})
  }

  async function salvarAet(op: OperacaoEnriquecida, patch: Database['public']['Tables']['autorizacoes_aet']['Update']) {
    setSaving(true)
    setErrorMsg(null)
    const existente = autorizacoesAet[op.id]
    const payload = { ...patch, atualizado_por: gestor.id }
    const { error } = existente
      ? await supabase.from('autorizacoes_aet').update(payload).eq('id', existente.id)
      : await supabase
          .from('autorizacoes_aet')
          .insert({ operacao_id: op.id, created_by: gestor.id, atualizado_por: gestor.id, ...patch })
    setSaving(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    await carregarAet(op.id)
  }

  async function protocolarAet(op: OperacaoEnriquecida) {
    await salvarAet(op, { status: 'protocolada', data_solicitacao: new Date().toISOString().slice(0, 10) })
  }

  async function emitirAet(op: OperacaoEnriquecida) {
    await salvarAet(op, {
      status: 'emitida',
      numero_aet: aetForm.numero_aet.trim() || null,
      protocolo_siaet: aetForm.protocolo_siaet.trim() || null,
      data_validade: aetForm.data_validade || null,
      observacoes: aetForm.observacoes.trim() || null,
      data_emissao: new Date().toISOString().slice(0, 10),
    })
  }

  async function marcarStatusAet(op: OperacaoEnriquecida, status: StatusAet) {
    await salvarAet(op, { status })
  }

  function gerarTextoFichaAet(op: OperacaoEnriquecida): string {
    const veiculo = veiculos.find((v) => v.id === op.veiculo_id)
    const motorista = motoristas.find((m) => m.id === op.pessoa_alocada_id)
    const cot = op.cotacaoDetalhe
    const NI = 'NÃO INFORMADO — preencher antes de enviar ao SIAET'
    const linhas = [
      'FICHA DE DADOS PARA PEDIDO DE AET — SIAET/DNIT',
      `Operação: ${op.id}`,
      '',
      '--- CARGA ---',
      `Descrição/natureza: ${cot?.natureza_operacao ?? NI}`,
      `NCM(s): ${cot?.ncms_produtos?.length ? cot.ncms_produtos.join(', ') : NI}`,
      `Peso bruto: ${op.peso_bruto ? `${op.peso_bruto} kg` : NI}`,
      `Dimensões (C x L x A): ${op.comprimento_cm ?? '?'} cm x ${op.largura_cm ?? '?'} cm x ${op.altura_cm ?? '?'} cm${
        !op.comprimento_cm || !op.largura_cm || !op.altura_cm ? '  ⚠ ' + NI : ''
      }`,
      `Carga indivisível (declaração do transportador): ${op.checkbox_indivisivel_manual ? 'Sim' : 'Não informado'}`,
      `Valor declarado (NF-e): ${op.valor_declarado_nfe ? formatMoney(op.valor_declarado_nfe) : NI}`,
      '',
      '--- ITINERÁRIO ---',
      `Origem: ${cot?.cidade_origem ?? '?'}/${cot?.uf_origem ?? '?'}`,
      `Destino: ${cot?.cidade_destino ?? '?'}/${cot?.uf_destino ?? '?'}`,
      '',
      '--- VEÍCULO / CONJUNTO TRANSPORTADOR ---',
      `Placa: ${veiculo?.placa ?? NI}`,
      `Marca/modelo: ${veiculo?.marca_modelo ?? NI}`,
      `RENAVAM: ${veiculo?.renavam ?? NI}`,
      `Chassi: ${veiculo?.chassi ?? '⚠ ' + NI}`,
      `Tara: ${veiculo?.tara_kg ? `${veiculo.tara_kg} kg` : '⚠ ' + NI}`,
      `Potência do motor: ${veiculo?.potencia_cv ? `${veiculo.potencia_cv} CV` : '⚠ ' + NI}`,
      `Quantidade de eixos: ${veiculo?.quantidade_eixos ?? '⚠ ' + NI}`,
      `Quantidade de pneus: ${veiculo?.quantidade_pneus ?? '⚠ ' + NI}`,
      `Capacidade de carga: ${veiculo?.capacidade_carga ? `${veiculo.capacidade_carga} kg` : NI}`,
      '',
      '--- CONDUTOR ---',
      `Nome: ${motorista?.nome ?? NI}`,
      `CPF: ${motorista?.cpf ?? NI}`,
      `CNH nº: ${motorista?.cnh_numero_registro ?? NI}`,
      `CNH categoria: ${motorista?.cnh_categoria ?? NI}`,
      '',
      '--- TRANSPORTADOR (RESPONSÁVEL PELO PEDIDO) ---',
      'RBR Cargo — preencher CNPJ/RNTRC do titular da frota conforme cadastro.',
      '',
      'Observação: o SIAET (siaet.dnit.gov.br) não possui API — este pedido deve ser feito manualmente no',
      'site do DNIT usando os dados acima. Prazo de emissão pode levar até 45 dias corridos.',
    ]
    return linhas.join('\n')
  }

  async function copiarFicha(op: OperacaoEnriquecida) {
    const texto = gerarTextoFichaAet(op)
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoId(op.id)
      setTimeout(() => setCopiadoId((id) => (id === op.id ? null : id)), 2500)
    } catch {
      setErrorMsg('Não foi possível copiar automaticamente. Selecione o texto manualmente.')
    }
  }

  const lista = (operacoes ?? []).filter((op) => filtro === 'todas' || op.status === filtro)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Operações</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as StatusOperacao | 'todas')}
            className="border rounded-xl px-3 py-2 text-sm font-semibold outline-none"
            style={{ borderColor: 'var(--rbr-border)' }}
          >
            {FILTROS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <Link
            to="/cotacao"
            className="text-sm font-bold px-4 py-2 rounded-xl"
            style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
          >
            + Nova operação
          </Link>
        </div>
      </div>

      <div
        className="text-xs rounded-xl px-3 py-2.5 flex items-center gap-2"
        style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}
      >
        Toda operação nova nasce de uma cotação — feche a proposta em{' '}
        <Link to="/cotacao" className="font-semibold underline" style={{ color: 'var(--rbr-navy)' }}>
          Cotação &amp; Funil
        </Link>{' '}
        e marque como <em>convertida</em>; a operação aparece aqui automaticamente.
      </div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && lista.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          Nenhuma operação encontrada para esse filtro.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          lista.map((op) => {
            const isExpanded = expandedId === op.id
            const averbacao = averbacoes[op.id]
            return (
              <div key={op.id} className="bg-white border rounded-[20px] overflow-hidden" style={cardStyle}>
                <button className="w-full text-left p-[18px]" onClick={() => toggleExpand(op)}>
                  <div className="flex items-center justify-between mb-2.5 gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                        style={{ background: badgeBackground(op.status) }}
                      >
                        {STATUS_OPERACAO_LABEL[op.status]}
                      </span>
                      {op.bloqueio_fiscal && (
                        <span
                          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                          style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}
                        >
                          <IconAlertTriangle width={12} height={12} />
                          Bloqueio fiscal
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {op.valorContrato != null && (
                        <span className="text-sm font-bold">{formatMoney(op.valorContrato)}</span>
                      )}
                      <IconChevronRight
                        width={16}
                        height={16}
                        style={{
                          color: 'var(--rbr-muted)',
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-[15px] font-bold mb-1">{op.clienteNome ?? 'Cliente a confirmar'}</div>
                  <div className="text-xs text-[color:var(--rbr-muted)]">
                    {op.peso_bruto ? `${op.peso_bruto} kg` : 'Peso não informado'} · atualizado em {formatDateTime(op.updated_at)}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t px-[18px] pb-[18px] pt-4 flex flex-col gap-4" style={{ borderColor: 'var(--rbr-border)' }}>
                    {errorMsg && (
                      <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                        {errorMsg}
                      </div>
                    )}

                    {op.bloqueio_fiscal && (
                      <div className="rounded-xl px-3.5 py-3 flex flex-col gap-2" style={{ background: '#FBE9E9' }}>
                        <div className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
                          Bloqueio fiscal ativo
                        </div>
                        <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
                          {op.bloqueio_fiscal_motivo ?? 'Sem motivo registrado.'}
                        </div>
                        <input
                          value={motivoLiberacao}
                          onChange={(e) => setMotivoLiberacao(e.target.value)}
                          placeholder="Nota de liberação (opcional)"
                          className="border rounded-lg px-3 py-2 text-xs outline-none bg-white"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        />
                        <button
                          onClick={() => liberarBloqueio(op)}
                          disabled={saving}
                          className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                          style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                        >
                          {saving ? 'Salvando…' : 'Liberar bloqueio fiscal'}
                        </button>
                      </div>
                    )}

                    {op.carga_complexa_eixo3_seguro_excedido && (
                      <div className="rounded-xl px-3.5 py-3 flex flex-col gap-2" style={{ background: 'var(--rbr-warning-bg)' }}>
                        <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">
                          Averbação de seguro (valor excede limite)
                        </div>
                        <div className="text-xs text-[color:var(--rbr-muted)]">
                          Status atual: {averbacao ? AVERBACAO_LABEL[averbacao.status] : 'Nenhuma negociação registrada'}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {(['em_analise', 'aprovada', 'recusada'] as StatusAverbacao[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => atualizarAverbacao(op, s)}
                              disabled={saving}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-60"
                              style={{
                                borderColor: 'var(--rbr-navy)',
                                background: averbacao?.status === s ? 'var(--rbr-navy)' : 'transparent',
                                color: averbacao?.status === s ? '#fff' : 'var(--rbr-navy)',
                              }}
                            >
                              {AVERBACAO_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {op.carga_complexa_eixo2_superdimensionada &&
                      (() => {
                        const veiculo = veiculos.find((v) => v.id === op.veiculo_id)
                        const motorista = motoristas.find((m) => m.id === op.pessoa_alocada_id)
                        const aet = autorizacoesAet[op.id]
                        const status = aet?.status ?? 'nao_solicitada'
                        const dias = diasDesde(aet?.data_solicitacao)
                        const prazo = aet?.prazo_estimado_dias ?? PRAZO_AET_DIAS_PADRAO
                        const camposVeiculoFaltando =
                          !!veiculo &&
                          (!veiculo.chassi || !veiculo.tara_kg || !veiculo.potencia_cv || !veiculo.quantidade_eixos || !veiculo.quantidade_pneus)
                        const dimensoesFaltando = !op.comprimento_cm || !op.largura_cm || !op.altura_cm

                        return (
                          <div className="rounded-xl px-3.5 py-3 flex flex-col gap-3" style={{ background: 'var(--rbr-warning-bg)' }}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">
                                Carga superdimensionada — AET (DNIT/SIAET)
                              </div>
                              <span
                                className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                                style={{ background: badgeAet(status) }}
                              >
                                {STATUS_AET_LABEL[status]}
                              </span>
                            </div>

                            {status === 'protocolada' && dias !== null && (
                              <div
                                className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                                style={{
                                  background: dias >= prazo ? '#FBE9E9' : dias >= prazo - 10 ? '#FFF4D6' : '#EDEFF7',
                                  color: dias >= prazo ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)',
                                }}
                              >
                                <IconClock width={14} height={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>
                                  {dias >= prazo
                                    ? `Prazo estimado do SIAET (${prazo} dias) já passou — solicitado há ${dias} dias. Verifique o andamento no site do DNIT.`
                                    : dias >= prazo - 10
                                      ? `Atenção ao prazo: solicitado há ${dias} dias, o SIAET pode levar até ${prazo} dias para emitir.`
                                      : `Solicitado há ${dias} dias. Prazo estimado de emissão: até ${prazo} dias corridos.`}
                                </span>
                              </div>
                            )}

                            {veiculo?.quantidade_eixos && op.peso_bruto && (() => {
                              const limite = limitesPesoEixos[veiculo.quantidade_eixos!]
                              if (!limite) return null
                              const dentroDoLimite = op.peso_bruto! < limite
                              return (
                                <div
                                  className="text-[11px] rounded-lg px-3 py-2"
                                  style={{ background: dentroDoLimite ? '#EDEFF7' : '#FBE9E9', color: dentroDoLimite ? 'var(--rbr-navy-dark)' : 'var(--rbr-danger)' }}
                                >
                                  {dentroDoLimite
                                    ? `Peso (${op.peso_bruto} kg) está dentro do limite legal pra um veículo de ${veiculo.quantidade_eixos} eixos (limite: ${limite.toLocaleString('pt-BR')} kg). Confirme se a AET é mesmo necessária por peso, ou se foi sinalizada por outro motivo (carga indivisível/dimensão fora do padrão).`
                                    : `Peso (${op.peso_bruto} kg) excede o limite legal pra um veículo de ${veiculo.quantidade_eixos} eixos (limite: ${limite.toLocaleString('pt-BR')} kg) — AET necessária por excesso de peso.`}
                                </div>
                              )
                            })()}

                            {aet && (aet.data_solicitacao || aet.data_validade || aet.numero_aet) && (
                              <div className="text-[11px] text-[color:var(--rbr-navy-dark)] flex flex-wrap gap-x-4 gap-y-1">
                                {aet.data_solicitacao && <span>Solicitada em: {formatDate(aet.data_solicitacao)}</span>}
                                {aet.numero_aet && <span>Nº AET: {aet.numero_aet}</span>}
                                {aet.data_validade && <span>Válida até: {formatDate(aet.data_validade)}</span>}
                              </div>
                            )}

                            <div className="text-xs" style={{ color: 'var(--rbr-navy-dark)' }}>
                              O SIAET não tem integração automática — gere a ficha abaixo, copie e cole no site{' '}
                              <span className="font-semibold">siaet.dnit.gov.br</span> para protocolar o pedido.
                            </div>

                            <textarea
                              readOnly
                              value={gerarTextoFichaAet(op)}
                              rows={6}
                              className="w-full border rounded-lg px-3 py-2 text-[11px] font-mono outline-none bg-white resize-y"
                              style={{ borderColor: 'var(--rbr-border)' }}
                            />
                            <button
                              onClick={() => copiarFicha(op)}
                              className="self-start flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg"
                              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                            >
                              <IconCopy width={13} height={13} />
                              {copiadoId === op.id ? 'Ficha copiada!' : 'Copiar ficha completa'}
                            </button>

                            {(camposVeiculoFaltando || dimensoesFaltando) && (
                              <div className="rounded-lg px-3 py-2.5 flex flex-col gap-2.5 bg-white">
                                <div className="text-[11px] font-bold text-[color:var(--rbr-danger)]">
                                  Campos obrigatórios do SIAET ainda não cadastrados — preencha para completar a ficha:
                                </div>
                                {camposVeiculoFaltando && veiculo && (
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                    <input
                                      placeholder="Chassi"
                                      defaultValue={veiculo.chassi ?? ''}
                                      onChange={(e) => setVeiculoForm((f) => ({ ...f, chassi: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Tara (kg)"
                                      type="number"
                                      defaultValue={veiculo.tara_kg ?? ''}
                                      onChange={(e) => setVeiculoForm((f) => ({ ...f, tara_kg: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Potência (CV)"
                                      type="number"
                                      defaultValue={veiculo.potencia_cv ?? ''}
                                      onChange={(e) => setVeiculoForm((f) => ({ ...f, potencia_cv: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Qtd. eixos"
                                      type="number"
                                      defaultValue={veiculo.quantidade_eixos ?? ''}
                                      onChange={(e) => setVeiculoForm((f) => ({ ...f, quantidade_eixos: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Qtd. pneus"
                                      type="number"
                                      defaultValue={veiculo.quantidade_pneus ?? ''}
                                      onChange={(e) => setVeiculoForm((f) => ({ ...f, quantidade_pneus: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <button
                                      onClick={() => salvarCamposVeiculo(veiculo.id)}
                                      disabled={saving || Object.keys(veiculoForm).length === 0}
                                      className="col-span-2 md:col-span-1 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                                      style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                                    >
                                      Salvar veículo
                                    </button>
                                  </div>
                                )}
                                {dimensoesFaltando && (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <input
                                      placeholder="Comprimento (cm)"
                                      type="number"
                                      defaultValue={op.comprimento_cm ?? ''}
                                      onChange={(e) => setCargaForm((f) => ({ ...f, comprimento_cm: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Largura (cm)"
                                      type="number"
                                      defaultValue={op.largura_cm ?? ''}
                                      onChange={(e) => setCargaForm((f) => ({ ...f, largura_cm: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Altura (cm)"
                                      type="number"
                                      defaultValue={op.altura_cm ?? ''}
                                      onChange={(e) => setCargaForm((f) => ({ ...f, altura_cm: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <button
                                      onClick={() => salvarDimensoesCarga(op)}
                                      disabled={saving || Object.keys(cargaForm).length === 0}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                                      style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                                    >
                                      Salvar dimensões
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex flex-col gap-2">
                              {status === 'nao_solicitada' && (
                                <button
                                  onClick={() => protocolarAet(op)}
                                  disabled={saving}
                                  className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                                  style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                                >
                                  {saving ? 'Salvando…' : 'Marcar como protocolada no SIAET (hoje)'}
                                </button>
                              )}

                              {(status === 'protocolada' || status === 'emitida') && (
                                <div className="flex flex-col gap-2 bg-white rounded-lg p-2.5">
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      placeholder="Nº da AET"
                                      value={aetForm.numero_aet}
                                      onChange={(e) => setAetForm((f) => ({ ...f, numero_aet: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Protocolo SIAET"
                                      value={aetForm.protocolo_siaet}
                                      onChange={(e) => setAetForm((f) => ({ ...f, protocolo_siaet: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      type="date"
                                      placeholder="Validade"
                                      value={aetForm.data_validade}
                                      onChange={(e) => setAetForm((f) => ({ ...f, data_validade: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                    <input
                                      placeholder="Observações"
                                      value={aetForm.observacoes}
                                      onChange={(e) => setAetForm((f) => ({ ...f, observacoes: e.target.value }))}
                                      className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                                      style={{ borderColor: 'var(--rbr-border)' }}
                                    />
                                  </div>
                                  <div className="flex gap-2 flex-wrap">
                                    {status === 'protocolada' && (
                                      <button
                                        onClick={() => emitirAet(op)}
                                        disabled={saving}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                                        style={{ background: 'var(--rbr-positive)', color: '#fff' }}
                                      >
                                        Marcar como emitida
                                      </button>
                                    )}
                                    {status === 'protocolada' && (
                                      <button
                                        onClick={() => marcarStatusAet(op, 'negada')}
                                        disabled={saving}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-60"
                                        style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }}
                                      >
                                        Marcar como negada
                                      </button>
                                    )}
                                    {status === 'emitida' && (
                                      <button
                                        onClick={() => salvarAet(op, aetForm)}
                                        disabled={saving}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                                        style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                                      >
                                        Atualizar dados da AET
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {(status === 'negada' || status === 'vencida') && (
                                <button
                                  onClick={() => protocolarAet(op)}
                                  disabled={saving}
                                  className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                                  style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                                >
                                  Registrar novo protocolo (hoje)
                                </button>
                              )}
                            </div>

                            {!motorista && (
                              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                                Aloque um motorista para incluir os dados de CNH na ficha.
                              </div>
                            )}
                          </div>
                        )
                      })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">
                          Veículo alocado
                        </div>
                        <select
                          value={op.veiculo_id ?? ''}
                          onChange={(e) => reatribuirVeiculo(op, e.target.value)}
                          disabled={saving}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          <option value="">Nenhum</option>
                          {veiculos.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.placa} · {v.tipo_veiculo ?? v.marca_modelo ?? 'Veículo'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">
                          Motorista alocado
                        </div>
                        <select
                          value={op.pessoa_alocada_id ?? ''}
                          onChange={(e) => reatribuirMotorista(op, e.target.value)}
                          disabled={saving}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ borderColor: 'var(--rbr-border)' }}
                        >
                          <option value="">Nenhum</option>
                          {motoristas.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: 'var(--rbr-muted-bg)' }}>
                      <div>
                        <div className="text-[13px] font-semibold">Pagamento pós-entrega confirmado</div>
                        <div className="text-[11px] text-[color:var(--rbr-muted)] mt-0.5">
                          Liberação manual do gestor para condições pós-entrega
                        </div>
                      </div>
                      <button
                        onClick={() => togglePagamentoPosEntrega(op)}
                        disabled={saving}
                        className="w-[52px] h-[30px] rounded-full relative flex-shrink-0 disabled:opacity-60"
                        style={{ background: op.pagamento_pos_entrega_confirmado ? 'var(--rbr-positive)' : '#E3E5EE' }}
                      >
                        <span
                          className="absolute top-[3px] w-6 h-6 rounded-full bg-white shadow transition-all"
                          style={{ left: op.pagamento_pos_entrega_confirmado ? '25px' : '3px' }}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
