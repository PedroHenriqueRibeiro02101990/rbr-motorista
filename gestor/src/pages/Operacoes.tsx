import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate, STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { IconChevronRight } from '@rbr/shared/icons'
import { IconAlertTriangle, IconCopy, IconClock } from '../icons-local'
import { Aviso, Botao, Campo, Modal, inputClass, inputStyle } from '../components/financeiro/ui'
import CancelarOperacaoInteira from '../components/operacao/CancelarOperacaoInteira'
import { useConfirmacao } from '../components/Confirmacao'
import PainelPendencias from '../components/PainelPendencias'
import OperacaoFluxo from '../components/operacao/OperacaoFluxo'
import DadosEmissao from '../components/operacao/DadosEmissao'
import FinalizarViagem from '../components/operacao/FinalizarViagem'
import MotoristasSugeridos, { AvisoCargasAguardando, carregarCargasAguardando, type CargaAguardando } from '../components/operacao/MotoristasSugeridos'
import type { AssessoriaContato } from '../lib/operacaoDetalhe'
import FaixaTeste from '../components/FaixaTeste'
import { PainelSobreposto } from '../components/PainelSobreposto'
import { ordenarFila } from '@rbr/shared/regrasOperacao'
import NavegacaoServico from '../components/NavegacaoServico'
import { codigoCurto, resumoNfes, vizinhos } from '../lib/painelOperacao'
import { FILTROS_VAZIOS, SEM_MOTORISTA, passaFiltrosLista, temFiltro, type FiltrosLista } from '../lib/listaOperacoes'
import { ABAS, abaValida, type IdAba, type SinalAba } from '../lib/abasOperacao'
import { FILAS, casaBusca, contarFilas, passaFila, type DadosFila, type FilaId } from '../lib/filasOperacao'

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
  valorCliente?: number | null
  valorMotorista?: number | null
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
  { value: 'aguardando_liberacao_fiscal', label: 'Aguardando documentos' },
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

const selectFiltro = 'border rounded-xl px-2.5 py-1.5 text-xs outline-none bg-white'

function CampoFiltro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
      {rotulo}
      {children}
    </label>
  )
}

function ResumoItem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{rotulo}</div>
      <div className="font-semibold truncate">{valor}</div>
    </div>
  )
}

function badgeBackground(status: StatusOperacao): string {
  if (status === 'cancelada') return 'var(--rbr-danger)'
  if (status === 'entregue' || status === 'fechada') return 'var(--rbr-positive)'
  return 'var(--rbr-navy)'
}

export default function Operacoes({ gestor }: { gestor: Pessoa }) {
  const [operacoes, setOperacoes] = useState<OperacaoEnriquecida[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [params, setParams] = useSearchParams()
  // ?status=em_transito (vindo do Início) já abre a lista filtrada.
  const [filtro, setFiltro] = useState<StatusOperacao | 'todas'>(() => (params.get('status') as StatusOperacao | null) ?? 'todas')
  // Filas (?fila=sem_motorista): seções da tela. Dados vindos de operacao_nfes e documentacao_operacao.
  const [fila, setFila] = useState<FilaId | null>(() => {
    const f = params.get('fila')
    return FILAS.some((x) => x.id === f) ? (f as FilaId) : null
  })
  // Operações de teste ficam escondidas, a não ser que o gestor marque "Mostrar testes" (ou abra uma por link).
  const [mostrarTestes, setMostrarTestes] = useState(false)
  const ocultarTestes = !mostrarTestes
  const [filtrosLista, setFiltrosLista] = useState<FiltrosLista>(FILTROS_VAZIOS)
  const [nfesPorOp, setNfesPorOp] = useState<Record<string, string[]>>({})
  const [problemasPorOp, setProblemasPorOp] = useState<Record<string, number>>({})
  const opDaUrl = params.get('op')
  const preparadaRef = useRef<string | null>(null)
  const aba = abaValida(params.get('aba'))
  const [sinaisAbas, setSinaisAbas] = useState<Record<IdAba, SinalAba> | null>(null)

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
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  // Saída conjunta / carga N de M (colunas novas, lidas sem tipagem).
  const [extras, setExtras] = useState<Record<string, { sequencia: number | null; grupo: string | null; total: number | null }>>({})
  const [cancelFeito, setCancelFeito] = useState(false)
  const [cancelando, setCancelando] = useState<OperacaoEnriquecida | null>(null)
  const [cancelarTudoOp, setCancelarTudoOp] = useState<string | null>(null)
  const [bloqueioCancel, setBloqueioCancel] = useState<{ documentos: { tipo: string; status: string; numero: string | null }[]; ordem: string } | null>(null)
  const { confirmacao: confCancel, rodar: rodarCancel, ocupado: ocupadoCancel } = useConfirmacao()
  const { confirmacao: confIndicacao, rodar: rodarIndicacao, ocupado: ocupadoIndicacao } = useConfirmacao()
  const [painelKey, setPainelKey] = useState(0)
  const [recusando, setRecusando] = useState<{ id: string; titulo: string } | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')

  async function confirmarRecusa() {
    if (!recusando) return
    const motivo = motivoRecusa.trim()
    const ok = await rodarIndicacao('Indicação recusada; o agenciador vê o motivo', async () => {
      if (!motivo) throw new Error('Informe o motivo da recusa.')
      const { error } = await supabase.rpc('resolver_indicacao_motorista', { p_indicacao: recusando.id, p_aceitar: false, p_motivo: motivo })
      if (error) throw error
      return true
    })
    if (ok) {
      setRecusando(null)
      setPainelKey((k) => k + 1)
    }
  }
  const [busca, setBusca] = useState('')
  const [showDadosEmissao, setShowDadosEmissao] = useState(false)
  const [assessoria, setAssessoria] = useState<AssessoriaContato>({ nome: '', whatsapp: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cargasAguardando, setCargasAguardando] = useState<CargaAguardando[]>([])

  // Depois da primeira carga, recarrega em segundo plano — senão cada ação dentro do card
  // desmontava o painel aberto (perdendo a mensagem de sucesso e o que estava expandido).
  const primeiraCarga = useRef(true)
  const load = useCallback(async () => {
    if (primeiraCarga.current) setLoading(true)
    const { data, error } = await supabase
      .from('operacoes')
      .select(
        '*, clientes(razao_social, nome_fantasia), condicoes_pagamento_operacao(valor_total_contrato), cotacoes(valor_total, valor_total_motorista, valor_frete_motorista, cidade_origem, uf_origem, cidade_destino, uf_destino, ncms_produtos, natureza_operacao, nf_remetente_razao_social, nf_remetente_cnpj, nf_destinatario_razao_social, nf_destinatario_cnpj)',
      )
      .order('updated_at', { ascending: false })
      .limit(300)

    if (error) setErrorMsg(error.message)

    const mapeadas: OperacaoEnriquecida[] = (data ?? []).map((op) => ({
      ...op,
      clienteNome: (op as any).clientes?.nome_fantasia ?? (op as any).clientes?.razao_social,
      // Preço do cliente e contrato do motorista são coisas diferentes — antes esta tela misturava os dois.
      valorCliente: (op as any).cotacoes?.valor_total ?? null,
      valorMotorista:
        (op as any).condicoes_pagamento_operacao?.valor_total_contrato ??
        (op as any).condicoes_pagamento_operacao?.[0]?.valor_total_contrato ??
        (op as any).cotacoes?.valor_total_motorista ??
        (op as any).cotacoes?.valor_frete_motorista ??
        null,
      cotacaoDetalhe: (op as any).cotacoes ?? null,
    }))
    setOperacoes(mapeadas)
    const ids = mapeadas.map((o) => o.id)
    if (ids.length) {
      void supabase
        .from('operacao_nfes')
        .select('operacao_id, numero, chave_acesso')
        .in('operacao_id', ids)
        .then(({ data: nf }) => {
          const m: Record<string, string[]> = {}
          for (const r of nf ?? []) (m[r.operacao_id] ??= []).push(r.numero ?? '', r.chave_acesso)
          setNfesPorOp(m)
        })
      void supabase
        .from('documentacao_operacao')
        .select('operacao_id, status, conferencia_status')
        .in('operacao_id', ids)
        .then(({ data: dc }) => {
          const m: Record<string, number> = {}
          for (const r of dc ?? []) if (r.status === 'erro' || r.status === 'bloqueado' || r.conferencia_status === 'divergente' || r.conferencia_status === 'erro') m[r.operacao_id] = (m[r.operacao_id] ?? 0) + 1
          setProblemasPorOp(m)
        })
    }
    supabase.from('operacoes')
      .select('id, sequencia, grupo_saida_id, cotacoes(cargas_total)')
      .order('updated_at', { ascending: false })
      .limit(300)
      .then(({ data: ex }: { data: Record<string, any>[] | null }) => {
        const m: Record<string, { sequencia: number | null; grupo: string | null; total: number | null }> = {}
        for (const r of ex ?? []) m[r.id] = { sequencia: r.sequencia ?? null, grupo: r.grupo_saida_id ?? null, total: r.cotacoes?.cargas_total ?? null }
        setExtras(m)
      })
    setLoading(false)
    primeiraCarga.current = false
    carregarCargasAguardando().then(({ cargas }) => setCargasAguardando(cargas))
  }, [])

  const carregarVeiculos = useCallback(async () => {
    const { data } = await supabase.from('veiculos').select('*').eq('ativo', true).order('placa', { ascending: true })
    setVeiculos(data ?? [])
  }, [])

  useEffect(() => {
    supabase
      .from('parametros_sistema')
      .select('valor')
      .eq('chave', 'assessoria_contato')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.valor) setAssessoria({ nome: '', whatsapp: '', email: '', ...(data.valor as object) })
      })
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

  // O painel da operação é guiado pela URL (?op=<id>): abrir, fechar e o botão voltar do navegador passam por ela.
  function abrirOperacao(op: OperacaoEnriquecida) {
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.set('op', op.id)
      return n
    })
  }

  function trocarAba(a: IdAba) {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (a === 'resumo') n.delete('aba')
        else n.set('aba', a)
        return n
      },
      { replace: true },
    )
  }

  function fecharPainel() {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.delete('op')
        n.delete('aba')
        return n
      },
      { replace: true },
    )
  }

  async function prepararOperacao(op: OperacaoEnriquecida) {
    setErrorMsg(null)
    setMotivoLiberacao('')
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

  // Abre o painel da operação da URL assim que a lista carrega (link do Financeiro, Mapa, Início, etc.).
  useEffect(() => {
    if (!opDaUrl) {
      preparadaRef.current = null
      return
    }
    if (!operacoes || preparadaRef.current === opDaUrl) return
    const alvo = operacoes.find((o) => o.id === opDaUrl)
    if (!alvo) return
    if (preparadaRef.current === null) {
      setFiltro('todas')
      if (alvo.eh_teste) setMostrarTestes(true)
    }
    preparadaRef.current = opDaUrl
    void prepararOperacao(alvo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opDaUrl, operacoes])

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

  // Não apaga a linha do banco: cancelar_operacao devolve a carga ao saldo da cotação e recusa quando há
  // CT-e/MDF-e emitido (nesse caso mostra os documentos e a ordem certa de cancelamento).
  function abrirCancelamento(op: OperacaoEnriquecida) {
    setMotivoCancelamento('')
    setBloqueioCancel(null)
    setCancelFeito(false)
    setCancelando(op)
  }

  async function confirmarCancelamento() {
    if (!cancelando) return
    const motivo = motivoCancelamento.trim()
    if (!motivo) {
      setBloqueioCancel(null)
      await rodarCancel('', async () => {
        throw new Error('Informe o motivo do cancelamento.')
      })
      return
    }
    await rodarCancel('Operação cancelada; a carga voltou ao saldo da cotação', async () => {
      const { data, error } = await supabase.rpc('cancelar_operacao', { p_operacao: cancelando.id, p_motivo: motivo })
      if (error) throw error
      const r = data as { cancelada: boolean; documentos?: { tipo: string; status: string; numero: string | null }[]; ordem?: string }
      if (!r?.cancelada) {
        setBloqueioCancel({ documentos: r?.documentos ?? [], ordem: r?.ordem ?? 'Cancele primeiro o MDF-e e depois o CT-e na tela Fiscal.' })
        throw new Error('Não cancelei: há documento fiscal emitido nesta operação.')
      }
      setBloqueioCancel(null)
      setCancelFeito(true)
      await load()
    })
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

  const dadosFila = useMemo(() => {
    const m = new Map<string, DadosFila>()
    for (const op of operacoes ?? []) {
      m.set(op.id, {
        id: op.id,
        status: op.status,
        pessoaAlocada: !!op.pessoa_alocada_id,
        bloqueioFiscal: op.bloqueio_fiscal === true,
        ehTeste: op.eh_teste === true,
        nfes: (nfesPorOp[op.id] ?? []).filter(Boolean).length > 0 ? 1 : 0,
        docsComProblema: problemasPorOp[op.id] ?? 0,
      })
    }
    return m
  }, [operacoes, nfesPorOp, problemasPorOp])
  const contagem = useMemo(() => contarFilas([...dadosFila.values()], ocultarTestes), [dadosFila, ocultarTestes])

  const opAberta = opDaUrl ? (operacoes ?? []).find((o) => o.id === opDaUrl) ?? null : null

  const lista = useMemo(() => {
    const placaDe = new Map(veiculos.map((v) => [v.id, v.placa]))
    const filtradas = (operacoes ?? []).filter((op) => {
      if (filtro !== 'todas' && op.status !== filtro) return false
      const d = dadosFila.get(op.id)
      if (d && !passaFila(d, fila, ocultarTestes)) return false
      if (!passaFiltrosLista({ criadaEm: op.created_at, clienteId: op.cliente_id, motoristaId: op.pessoa_alocada_id }, filtrosLista)) return false
      if (!busca.trim()) return true
      const cot = op.cotacaoDetalhe
      const texto = [op.clienteNome ?? '', cot?.cidade_origem ?? '', cot?.cidade_destino ?? '', cot?.uf_origem ?? '', cot?.uf_destino ?? '', op.id.slice(0, 8)]
      const placa = op.veiculo_id ? placaDe.get(op.veiculo_id) : null
      return casaBusca(busca, { texto, placas: placa ? [placa] : [], nfes: nfesPorOp[op.id] ?? [] })
    })
    // D01: coleta mais próxima primeiro (operação sem data de coleta vai para o fim); a ordenação é estável.
    const ordemFila = new Map(ordenarFila(filtradas.map((op) => ({ id: op.id, coletaEm: op.coleta_prevista ? Date.parse(op.coleta_prevista) : null, esperandoDesde: Date.parse(op.updated_at) })), Date.now()).map((i, n) => [i.id, n]))
    filtradas.sort((a, b) => (ordemFila.get(a.id) ?? 0) - (ordemFila.get(b.id) ?? 0))
    // Operações da mesma saída conjunta ficam juntas (na posição da primeira).
    const grupos = new Map<string, OperacaoEnriquecida[]>()
    for (const op of filtradas) {
      const g = extras[op.id]?.grupo
      if (g) grupos.set(g, [...(grupos.get(g) ?? []), op])
    }
    const vistos = new Set<string>()
    const saida: OperacaoEnriquecida[] = []
    for (const op of filtradas) {
      const g = extras[op.id]?.grupo
      if (!g) saida.push(op)
      else if (!vistos.has(g)) {
        vistos.add(g)
        saida.push(...(grupos.get(g) ?? []).sort((x, y) => (extras[x.id]?.sequencia ?? 0) - (extras[y.id]?.sequencia ?? 0)))
      }
    }
    return saida
  }, [operacoes, filtro, busca, extras, veiculos, dadosFila, fila, ocultarTestes, nfesPorOp, filtrosLista])

  const opcoesCliente = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of operacoes ?? []) if (o.cliente_id) m.set(o.cliente_id, o.clienteNome ?? 'Cliente a confirmar')
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [operacoes])
  const opcoesMotorista = useMemo(() => {
    const ids = new Set((operacoes ?? []).map((o) => o.pessoa_alocada_id).filter(Boolean) as string[])
    return motoristas.filter((m) => ids.has(m.id)).map((m) => [m.id, m.nome] as const).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [operacoes, motoristas])

  // Campos do painel preenchidos e ainda não salvos (motivo de liberação, dados do veículo e da carga): a troca de tela avisa.
  const edicaoPendente = motivoLiberacao.trim() !== '' || Object.values(veiculoForm).some((v) => v !== '') || Object.values(cargaForm).some((v) => v !== '')

  // Anterior/próxima seguem a lista filtrada, na ordem da tela.
  const vizinhosAbertos = opAberta ? vizinhos(lista.map((o) => o.id), opAberta.id) : null

  function irPara(id: string | null) {
    if (!id) return
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('op', id)
        return n
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Operações</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Buscar cliente, cidade, placa, NF-e, código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--rbr-border)', minWidth: 200 }}
          />
          <button
            onClick={() => setShowDadosEmissao((v) => !v)}
            className="text-sm font-bold px-4 py-2 rounded-xl border"
            style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
          >
            {showDadosEmissao ? 'Fechar dados de emissão' : 'Dados de emissão'}
          </button>
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
            style={{ background: 'var(--rbr-navy)', color: '#fff' }}
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

      {!recusando && confIndicacao}
      <PainelPendencias
        modulo="operacoes"
        recarregarKey={painelKey}
        acao={(p) =>
          p.ref_tipo === 'indicacao' ? (
            <span className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={ocupadoIndicacao}
                className="text-xs font-bold text-[color:var(--rbr-navy)] disabled:opacity-50"
                onClick={async () => {
                  const ok = await rodarIndicacao('Indicação aceita: motorista alocado na operação', async () => {
                    const { error } = await supabase.rpc('resolver_indicacao_motorista', { p_indicacao: p.ref_id, p_aceitar: true })
                    if (error) throw error
                    return true
                  })
                  if (ok) { setPainelKey((k) => k + 1); void load() }
                }}
              >
                Aceitar
              </button>
              <button
                type="button"
                disabled={ocupadoIndicacao}
                className="text-xs font-bold text-[color:var(--rbr-danger)] disabled:opacity-50"
                onClick={() => {
                  setMotivoRecusa('')
                  setRecusando({ id: p.ref_id, titulo: p.titulo })
                }}
              >
                Recusar
              </button>
            </span>
          ) : undefined
        }
      />

      <AvisoCargasAguardando
        cargas={cargasAguardando}
        rotulo={(c) => operacoes?.find((o) => o.id === c.operacao_id)?.clienteNome}
        onAbrir={(id) => {
          const alvo = operacoes?.find((o) => o.id === id)
          if (!alvo) return
          setFiltro('todas')
          abrirOperacao(alvo)
        }}
      />

      {showDadosEmissao && (
        <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
          <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Dados de emissão</div>
          <DadosEmissao onSalvo={(a) => setAssessoria(a)} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filas">
        <button type="button" onClick={() => setFila(null)} className="text-xs font-bold px-3.5 py-2 rounded-full border" style={fila === null ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' } : { borderColor: 'var(--rbr-border)', background: '#fff' }}>
          Todas
        </button>
        {FILAS.map((f) => (
          <button key={f.id} type="button" title={f.ajuda} onClick={() => setFila(fila === f.id ? null : f.id)} className="text-xs font-bold px-3.5 py-2 rounded-full border" style={fila === f.id ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' } : { borderColor: 'var(--rbr-border)', background: '#fff' }}>
            {f.rotulo} <span className="tabular-nums opacity-80">({contagem[f.id]})</span>
          </button>
        ))}
        <label className="text-xs flex items-center gap-1.5 ml-auto text-[color:var(--rbr-muted)]">
          <input type="checkbox" checked={mostrarTestes} onChange={(e) => setMostrarTestes(e.target.checked)} /> Mostrar testes
        </label>
      </div>

      <div className="flex items-end gap-2 flex-wrap" role="group" aria-label="Filtros da lista">
        <CampoFiltro rotulo="Cliente">
          <select value={filtrosLista.clienteId} onChange={(e) => setFiltrosLista({ ...filtrosLista, clienteId: e.target.value })} className={selectFiltro} style={{ borderColor: 'var(--rbr-border)' }}>
            <option value="">Todos</option>
            {opcoesCliente.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Motorista">
          <select value={filtrosLista.motoristaId} onChange={(e) => setFiltrosLista({ ...filtrosLista, motoristaId: e.target.value })} className={selectFiltro} style={{ borderColor: 'var(--rbr-border)' }}>
            <option value="">Todos</option>
            <option value={SEM_MOTORISTA}>Sem motorista</option>
            {opcoesMotorista.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Criada de">
          <input type="date" value={filtrosLista.de} max={filtrosLista.ate || undefined} onChange={(e) => setFiltrosLista({ ...filtrosLista, de: e.target.value })} className={selectFiltro} style={{ borderColor: 'var(--rbr-border)' }} />
        </CampoFiltro>
        <CampoFiltro rotulo="até">
          <input type="date" value={filtrosLista.ate} min={filtrosLista.de || undefined} onChange={(e) => setFiltrosLista({ ...filtrosLista, ate: e.target.value })} className={selectFiltro} style={{ borderColor: 'var(--rbr-border)' }} />
        </CampoFiltro>
        {temFiltro(filtrosLista) && (
          <button type="button" onClick={() => setFiltrosLista(FILTROS_VAZIOS)} className="text-xs font-bold underline pb-2" style={{ color: 'var(--rbr-navy)' }}>
            Limpar filtros
          </button>
        )}
        {!loading && (
          <span className="text-xs text-[color:var(--rbr-muted)] ml-auto pb-2 tabular-nums">
            {lista.length} operaç{lista.length === 1 ? 'ão' : 'ões'}
          </span>
        )}
      </div>

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && lista.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          Nenhuma operação encontrada para esse filtro.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {!loading &&
          lista.map((op) => {
            const motorista = motoristas.find((m) => m.id === op.pessoa_alocada_id)
            const placa = veiculos.find((v) => v.id === op.veiculo_id)?.placa
            const nNfes = (nfesPorOp[op.id] ?? []).filter(Boolean).length
            const ex = extras[op.id]
            return (
              <button
                key={op.id}
                id={`op-${op.id}`}
                type="button"
                onClick={() => abrirOperacao(op)}
                className="w-full text-left bg-white border rounded-xl px-3.5 py-2.5 flex items-center gap-x-3 gap-y-1 flex-wrap md:flex-nowrap hover:bg-[color:var(--rbr-muted-bg)]"
                style={ex?.grupo ? { ...cardStyle, borderLeft: '4px solid var(--rbr-gold)' } : cardStyle}
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-wide text-white px-2 py-1 rounded-full whitespace-nowrap text-center md:w-[150px] flex-shrink-0"
                  style={{ background: badgeBackground(op.status) }}
                >
                  {STATUS_OPERACAO_LABEL[op.status]}
                </span>
                <span className="text-[11px] font-mono text-[color:var(--rbr-muted)] flex-shrink-0">{codigoCurto(op.id)}</span>
                <span className="text-sm font-bold truncate md:w-[190px] flex-shrink-0">{op.clienteNome ?? 'Cliente a confirmar'}</span>
                {op.coleta_prevista && !['cancelada', 'fechada', 'entregue'].includes(op.status) && Date.parse(op.coleta_prevista) - Date.now() < 24 * 3_600_000 && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }} title="Coleta em menos de 24 horas">Urgente</span>
                )}
                <span className="text-xs text-[color:var(--rbr-muted)] truncate flex-1 min-w-[140px]">
                  {op.cotacaoDetalhe?.cidade_origem ?? '?'}/{op.cotacaoDetalhe?.uf_origem ?? '?'} → {op.cotacaoDetalhe?.cidade_destino ?? '?'}/{op.cotacaoDetalhe?.uf_destino ?? '?'}
                </span>
                <span className="text-xs truncate md:w-[170px] flex-shrink-0">
                  {motorista ? motorista.nome : <span className="text-[color:var(--rbr-muted)]">sem motorista</span>}
                  {placa ? <span className="text-[color:var(--rbr-muted)]"> · {placa}</span> : null}
                </span>
                <span className="text-xs text-[color:var(--rbr-muted)] tabular-nums md:w-[64px] flex-shrink-0">{nNfes > 0 ? `${nNfes} NF-e` : 'sem NF-e'}</span>
                <span className="text-sm font-bold tabular-nums md:w-[100px] md:text-right flex-shrink-0">{op.valorCliente != null ? formatMoney(op.valorCliente) : '—'}</span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  {op.eh_teste && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
                      teste
                    </span>
                  )}
                  {ex?.grupo && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: '#FDF1DC', color: '#8A5A00' }} title="Saída conjunta">
                      {ex.sequencia != null && (ex.total ?? 1) > 1 ? `${ex.sequencia}/${ex.total}` : 'conjunta'}
                    </span>
                  )}
                  {op.bloqueio_fiscal && (
                    <span className="flex items-center" style={{ color: 'var(--rbr-danger)' }} title="Bloqueio fiscal">
                      <IconAlertTriangle width={14} height={14} />
                    </span>
                  )}
                  <IconChevronRight width={16} height={16} style={{ color: 'var(--rbr-muted)' }} />
                </span>
              </button>
            )
          })}
      </div>

      {opAberta && (() => {
        const op = opAberta
        const averbacao = averbacoes[op.id]
        return (
          <PainelSobreposto
            titulo={codigoCurto(op.id)}
            cabecalho={
              <span className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full" style={{ background: badgeBackground(op.status) }}>
                {STATUS_OPERACAO_LABEL[op.status]}
              </span>
            }
            fixo={
              <>
                <div className="text-[15px] font-bold leading-tight">{op.clienteNome ?? 'Cliente a confirmar'}</div>
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  {op.cotacaoDetalhe?.cidade_origem ?? '?'}/{op.cotacaoDetalhe?.uf_origem ?? '?'} → {op.cotacaoDetalhe?.cidade_destino ?? '?'}/{op.cotacaoDetalhe?.uf_destino ?? '?'}
                </div>
                <NavegacaoServico
                  atual="operacao"
                  cotacaoId={op.cotacao_id}
                  operacaoId={op.id}
                  confirmarSaida={() => !edicaoPendente || window.confirm('Há campos preenchidos e não salvos nesta operação. Sair mesmo assim?')}
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                  <ResumoItem rotulo="Motorista" valor={motoristas.find((m) => m.id === op.pessoa_alocada_id)?.nome ?? 'sem motorista'} />
                  <ResumoItem rotulo="Placa" valor={veiculos.find((v) => v.id === op.veiculo_id)?.placa ?? 'sem veículo'} />
                  <ResumoItem rotulo="Frete" valor={op.valorCliente != null ? formatMoney(op.valorCliente) : '—'} />
                  <ResumoItem rotulo="NF-es" valor={resumoNfes(nfesPorOp[op.id] ?? [])} />
                </div>
                {vizinhosAbertos && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={!vizinhosAbertos.anteriorId}
                      onClick={() => irPara(vizinhosAbertos.anteriorId)}
                      className="font-bold px-3 py-1.5 rounded-lg border disabled:opacity-40"
                      style={{ borderColor: 'var(--rbr-border)' }}
                    >
                      ‹ Anterior
                    </button>
                    <span className="text-[color:var(--rbr-muted)] tabular-nums">
                      {vizinhosAbertos.posicao} de {vizinhosAbertos.total}
                    </span>
                    <button
                      type="button"
                      disabled={!vizinhosAbertos.proximaId}
                      onClick={() => irPara(vizinhosAbertos.proximaId)}
                      className="font-bold px-3 py-1.5 rounded-lg border disabled:opacity-40"
                      style={{ borderColor: 'var(--rbr-border)' }}
                    >
                      Próxima ›
                    </button>
                  </div>
                )}
                <div role="tablist" aria-label="Seções da operação" className="flex gap-1 overflow-x-auto -mb-3 pt-1">
                  {ABAS.map((a) => {
                    const ativa = aba === a.id
                    const sinal = sinaisAbas?.[a.id]
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="tab"
                        aria-selected={ativa}
                        onClick={() => trocarAba(a.id)}
                        className="relative whitespace-nowrap text-xs font-bold px-3 py-2 rounded-t-lg border-b-2"
                        style={ativa ? { borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy-dark)' } : { borderColor: 'transparent', color: 'var(--rbr-muted)' }}
                      >
                        {a.rotulo}
                        {sinal && (
                          <span
                            className="inline-block w-2 h-2 rounded-full ml-1.5 align-middle"
                            style={{ background: sinal === 'problema' ? 'var(--rbr-danger)' : 'var(--rbr-gold)' }}
                            title={sinal === 'problema' ? 'Há um passo com problema' : 'Há algo a fazer'}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            }
            onFechar={fecharPainel}
            largura={880}
          >
            {op.eh_teste && <FaixaTeste />}
            <div className="flex flex-col gap-4">
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
                    style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                  >
                    {saving ? 'Salvando…' : 'Liberar bloqueio fiscal'}
                  </button>
                </div>
              )}
    
              <OperacaoFluxo
                key={op.id}
                operacaoId={op.id}
                aba={aba}
                onAba={trocarAba}
                onSinais={setSinaisAbas}
                gestor={gestor}
                assessoria={assessoria}
                onChanged={load}
                onCancelar={() => abrirCancelamento(op)}
                extras={{
                  averbacao_allianz: op.carga_complexa_eixo3_seguro_excedido ? (
                    <>
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
    
                    </>
                  ) : undefined,
                  aet: op.carga_complexa_eixo2_superdimensionada ? (
                    <>
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
                                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
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
                                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
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
    
                    </>
                  ) : undefined,
                  motorista:
                    op.status === 'alocando_motorista' && !op.pessoa_alocada_id ? (
                      <MotoristasSugeridos
                        operacaoId={op.id}
                        carga={cargasAguardando.find((c) => c.operacao_id === op.id)}
                        onAvisado={() => carregarCargasAguardando().then(({ cargas }) => setCargasAguardando(cargas))}
                      />
                    ) : undefined,
                  // "Finalizar viagem" (encerrar o MDF-e) continua aqui, dentro da etapa da viagem.
                  viagem: !['alocando_motorista', 'aguardando_liberacao_fiscal', 'cancelada'].includes(op.status) ? (
                    <FinalizarViagem operacaoId={op.id} statusOperacao={op.status} entregueEm={op.entregue_em} />
                  ) : undefined,
                  rodape: (
                    <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-muted)] cursor-pointer self-start">
                      <input
                        type="checkbox"
                        checked={!!op.pagamento_pos_entrega_confirmado}
                        disabled={saving}
                        onChange={() => togglePagamentoPosEntrega(op)}
                      />
                      Pagamento pós-entrega confirmado (liberação manual do gestor)
                    </label>
                  ),
                }}
              />
            </div>
          </PainelSobreposto>
        )
      })()}

      {cancelando && (
        <Modal titulo="Cancelar operação" onFechar={ocupadoCancel ? () => {} : () => setCancelando(null)} largura="max-w-md">
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[color:var(--rbr-muted)]">
              {cancelando.clienteNome ?? 'Cliente a confirmar'} · #{cancelando.id.slice(0, 8)}. A carga volta ao saldo da cotação.
            </div>
            <Campo label="Motivo (obrigatório)">
              <input
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Ex.: cliente adiou a carga"
              />
            </Campo>
            {bloqueioCancel && (
              <Aviso tipo="atencao">
                <div className="font-bold mb-1">Há documento fiscal emitido</div>
                {bloqueioCancel.documentos.map((d, i) => (
                  <div key={i}>
                    {d.tipo === 'mdfe' ? 'MDF-e' : d.tipo === 'cte' ? 'CT-e' : d.tipo.toUpperCase()} {d.numero ?? ''} · {d.status}
                  </div>
                ))}
                <div className="mt-1">{bloqueioCancel.ordem}</div>
                <Link to="/fiscal" className="underline font-bold">
                  Ir para Fiscal
                </Link>
                {cancelando && (
                  <button type="button" className="ml-3 underline font-bold" onClick={() => setCancelarTudoOp(cancelando.id)}>
                    Cancelar tudo na ordem
                  </button>
                )}
              </Aviso>
            )}
            {confCancel}
            {cancelarTudoOp && (
              <CancelarOperacaoInteira
                operacaoId={cancelarTudoOp}
                onFechar={() => setCancelarTudoOp(null)}
                onFeito={() => {
                  setCancelFeito(true)
                  void load()
                }}
              />
            )}
            <div className="flex justify-end gap-2">
              <Botao variante="secundario" onClick={() => setCancelando(null)} disabled={ocupadoCancel}>
                {cancelFeito ? 'Fechar' : 'Voltar'}
              </Botao>
              <Botao variante="perigo" disabled={ocupadoCancel || cancelFeito || !motivoCancelamento.trim()} onClick={() => void confirmarCancelamento()}>
                {ocupadoCancel ? 'Enviando…' : 'Cancelar operação'}
              </Botao>
            </div>
          </div>
        </Modal>
      )}

      {recusando && (
        <Modal titulo="Recusar indicação" onFechar={ocupadoIndicacao ? () => {} : () => setRecusando(null)} largura="max-w-md">
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[color:var(--rbr-muted)]">{recusando.titulo}</div>
            <Campo label="Motivo (obrigatório; o agenciador vê)">
              <input
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="Ex.: veículo sem rastreador por satélite"
              />
            </Campo>
            {confIndicacao}
            <div className="flex justify-end gap-2">
              <Botao variante="secundario" onClick={() => setRecusando(null)} disabled={ocupadoIndicacao}>
                Voltar
              </Botao>
              <Botao variante="perigo" disabled={ocupadoIndicacao || !motivoRecusa.trim()} onClick={() => void confirmarRecusa()}>
                {ocupadoIndicacao ? 'Enviando…' : 'Recusar indicação'}
              </Botao>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
