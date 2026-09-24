import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDate } from '@rbr/shared/format'
import { IconChevronRight } from '@rbr/shared/icons'
import { useSearchParams } from 'react-router-dom'
import { BadgeAprovacao } from '@rbr/shared/cadastro'
import { formatarDoc } from '@rbr/shared/documento'
import Pendencias from '../components/cadastros/Pendencias'
import PainelCadastro from '../components/cadastros/PainelCadastro'

type Cliente = Database['public']['Tables']['clientes']['Row']
type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']
type Fornecedor = Database['public']['Tables']['fornecedores']['Row']
type PrestadorParceiro = Database['public']['Tables']['prestadores_parceiros']['Row']
type CategoriaFinanceiraOpcao = Pick<Database['public']['Tables']['categorias_financeiras']['Row'], 'id' | 'nome' | 'grupo'>
type CondicaoPrazoOpcao = Pick<Database['public']['Tables']['condicoes_prazo']['Row'], 'id' | 'nome' | 'descricao'>
type PontuacaoSaldo = Database['public']['Views']['pontuacao_saldo']['Row']
type PontuacaoEvento = Database['public']['Tables']['pontuacao_eventos']['Row']
type PontuacaoContestacao = Database['public']['Tables']['pontuacao_contestacoes']['Row']
type TipoPessoaDoc = Database['public']['Enums']['tipo_pessoa_doc']
type StatusCicloVida = Database['public']['Enums']['status_ciclo_vida']

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const miniInputClass = 'border rounded-lg px-2.5 py-1.5 text-xs outline-none bg-white'
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1'

const TABS = [
  { value: 'pendencias', label: 'Pendências' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'motoristas', label: 'Motoristas' },
  { value: 'agenciadores', label: 'Agenciadores' },
  { value: 'fornecedores', label: 'Fornecedores' },
  { value: 'prestadores', label: 'Transportadoras parceiras' },
] as const
type TabValue = (typeof TABS)[number]['value']

const CNH_CATEGORIAS = ['A', 'B', 'C', 'D', 'E']
const RNTRC_STATUS_OPCOES = ['ativo', 'inativo', 'suspenso']
const RASTREADOR_TIPO_OPCOES: { value: string; label: string }[] = [
  { value: 'celular', label: 'GPS do celular (padrão)' },
  { value: 'wialon', label: 'Wialon (rastreador certificado)' },
  { value: 'nenhum', label: 'Nenhum' },
]

const STATUS_LABEL: Record<StatusCicloVida, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  anonimizado_retencao_fiscal: 'Anonimizado (retenção fiscal)',
  excluido: 'Excluído',
}

const STATUS_COLOR: Record<StatusCicloVida, { bg: string; fg: string }> = {
  ativo: { bg: '#E7F5EA', fg: '#1F7A3D' },
  inativo: { bg: '#F1F1F3', fg: 'var(--rbr-muted)' },
  anonimizado_retencao_fiscal: { bg: '#FCEFE0', fg: '#A15C00' },
  excluido: { bg: '#FBE9E9', fg: 'var(--rbr-danger)' },
}

function StatusBadge({ status }: { status: StatusCicloVida }) {
  const cor = STATUS_COLOR[status]
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: cor.bg, color: cor.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

const CLIENTE_INICIAL = {
  tipo_pessoa_doc: 'PJ' as TipoPessoaDoc,
  cnpj: '',
  cpf: '',
  razao_social: '',
  nome_fantasia: '',
  cep: '',
  logradouro: '',
  numero_endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  email: '',
  celular_whatsapp: '',
  nome_contato_comercial: '',
}

const MOTORISTA_INICIAL = {
  nome: '',
  cpf: '',
  email: '',
  celular: '',
  cep: '',
  logradouro: '',
  numero_endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cnh_numero_registro: '',
  cnh_categoria: '',
  cnh_validade: '',
  rntrc_numero: '',
  rntrc_status: '',
  rntrc_validade: '',
  pix: '',
  banco_codigo: '',
  banco_agencia: '',
  banco_conta: '',
  banco_tipo_conta: '',
}

const AGENCIADOR_INICIAL = {
  tipo_pessoa_doc: 'PF' as TipoPessoaDoc,
  nome: '',
  cpf: '',
  cnpj: '',
  email: '',
  celular: '',
  cep: '',
  logradouro: '',
  numero_endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
}

const FORNECEDOR_INICIAL = {
  tipo_pessoa_doc: 'PJ' as TipoPessoaDoc,
  nome: '',
  razao_social: '',
  cnpj: '',
  cpf: '',
  email: '',
  celular: '',
  pix: '',
  tipo_servico_fornecido: '',
  categoria_id: '',
  condicao_prazo_id: '',
  banco_codigo: '',
  banco_agencia: '',
  banco_conta: '',
  banco_tipo_conta: '',
}

const CONDUTOR_INICIAL = {
  nome: '',
  cpf: '',
  email: '',
  celular: '',
  cnh_numero_registro: '',
  cnh_categoria: '',
  cnh_validade: '',
}

const PRESTADOR_INICIAL = {
  tipo_pessoa_doc: 'PJ' as TipoPessoaDoc,
  nome: '',
  razao_social: '',
  cnpj: '',
  cpf: '',
  email: '',
  celular: '',
  condicoes_comerciais: '',
  rntrc_numero: '',
  rntrc_status: '',
  rntrc_validade: '',
  cnh_ou_cnpj_validado: false,
}

const VEICULO_INICIAL = {
  placa: '',
  renavam: '',
  chassi: '',
  marca_modelo: '',
  ano: '',
  cor: '',
  combustivel: '',
  tipo_veiculo: '',
  tipo_carroceria: '',
  capacidade_carga: '',
  tara_kg: '',
  potencia_cv: '',
  quantidade_eixos: '',
  quantidade_pneus: '',
  is_veiculo_proprio: true,
  e_reboque: false,
  uf_licenciamento: '',
  rntrc_numero: '',
  rntrc_status: '',
  rntrc_validade: '',
  rastreador_tipo: 'celular',
  rastreador_identificador: '',
  rastreador_instalado_em: '',
  rastreador_ativo: false,
  seguro_veiculo_seguradora: '',
  seguro_veiculo_apolice_numero: '',
  seguro_veiculo_vencimento: '',
}

function cnhVencidaOuAusente(validade: string | null | undefined): boolean {
  if (!validade) return true
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const data = new Date(validade + 'T00:00:00')
  return data.getTime() < hoje.getTime()
}

// Diferente da CNH: um vencimento opcional (ex. seguro) só acende alerta se estiver
// preenchido e no passado — ausência não é tratada como vencida.
function dataVencida(data: string | null | undefined): boolean {
  if (!data) return false
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return new Date(data + 'T00:00:00').getTime() < hoje.getTime()
}

function normalizaBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function SearchAndFilterRow({
  busca,
  onBusca,
  mostrarInativos,
  onMostrarInativos,
  placeholder,
}: {
  busca: string
  onBusca: (v: string) => void
  mostrarInativos: boolean
  onMostrarInativos: (v: boolean) => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        placeholder={placeholder}
        value={busca}
        onChange={(e) => onBusca(e.target.value)}
        className={`${inputClass} flex-1 min-w-[200px]`}
        style={inputStyle}
      />
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--rbr-muted)]">
        <input type="checkbox" checked={mostrarInativos} onChange={(e) => onMostrarInativos(e.target.checked)} />
        Mostrar inativos
      </label>
    </div>
  )
}

export default function Cadastros() {
  const [params, setParams] = useSearchParams()
  const abaUrl = params.get('aba')
  const [tab, setTabState] = useState<TabValue>(TABS.some((t) => t.value === abaUrl) ? (abaUrl as TabValue) : 'pendencias')
  const [qtdPendencias, setQtdPendencias] = useState<number | null>(null)
  const [painelAgenciadorId, setPainelAgenciadorId] = useState<string | null>(null)
  function setTab(t: TabValue) {
    setTabState(t)
    const p = new URLSearchParams(params)
    p.set('aba', t)
    setParams(p, { replace: true })
  }
  useEffect(() => {
    // Contagem para o selo da aba, mesmo com outra aba aberta.
    Promise.all([
      supabase.from('pessoas').select('id', { count: 'exact', head: true }).eq('aprovacao_status', 'em_analise').eq('status', 'ativo'),
      supabase.from('veiculos').select('id', { count: 'exact', head: true }).eq('aprovacao_status', 'em_analise').eq('ativo', true),
      supabase.from('vinculos_agenciador_motorista').select('id', { count: 'exact', head: true }).eq('status', 'reivindicado'),
      supabase.from('solicitacoes_exclusao_dados').select('id', { count: 'exact', head: true }).eq('status', 'processando'),
    ]).then((rs) => setQtdPendencias(rs.reduce((acc, r) => acc + (r.count ?? 0), 0)))
  }, [])
  const [gestorPessoaId, setGestorPessoaId] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('current_pessoa_id').then(({ data }) => {
      if (data) setGestorPessoaId(data as string)
    })
  }, [])

  // --- Clientes ---
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoCliente, setNovoCliente] = useState(CLIENTE_INICIAL)
  const [salvandoCliente, setSalvandoCliente] = useState(false)
  const [erroCliente, setErroCliente] = useState<string | null>(null)
  const [editingClienteId, setEditingClienteId] = useState<string | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [mostrarInativosCliente, setMostrarInativosCliente] = useState(false)

  // --- Motoristas ---
  const [motoristas, setMotoristas] = useState<Pessoa[] | null>(null)
  const [loadingMotoristas, setLoadingMotoristas] = useState(true)
  const [showNovoMotorista, setShowNovoMotorista] = useState(false)
  const [novoMotorista, setNovoMotorista] = useState(MOTORISTA_INICIAL)
  const [salvandoMotorista, setSalvandoMotorista] = useState(false)
  const [erroMotorista, setErroMotorista] = useState<string | null>(null)
  const [editingMotoristaId, setEditingMotoristaId] = useState<string | null>(null)
  const [buscaMotorista, setBuscaMotorista] = useState('')
  const [mostrarInativosMotorista, setMostrarInativosMotorista] = useState(false)

  const [expandedMotoristaId, setExpandedMotoristaId] = useState<string | null>(null)
  const [veiculosPorMotorista, setVeiculosPorMotorista] = useState<Record<string, Veiculo[]>>({})
  const [showNovoVeiculoId, setShowNovoVeiculoId] = useState<string | null>(null)
  const [novoVeiculo, setNovoVeiculo] = useState(VEICULO_INICIAL)
  const [salvandoVeiculo, setSalvandoVeiculo] = useState(false)
  const [erroVeiculo, setErroVeiculo] = useState<string | null>(null)
  const [editingVeiculoId, setEditingVeiculoId] = useState<string | null>(null)

  const [condutoresPorMotorista, setCondutoresPorMotorista] = useState<Record<string, Pessoa[]>>({})
  const [showNovoCondutorId, setShowNovoCondutorId] = useState<string | null>(null)
  const [novoCondutor, setNovoCondutor] = useState(CONDUTOR_INICIAL)
  const [salvandoCondutor, setSalvandoCondutor] = useState(false)
  const [erroCondutor, setErroCondutor] = useState<string | null>(null)
  const [editingCondutorId, setEditingCondutorId] = useState<string | null>(null)

  type PontuacaoInfo = {
    saldo: PontuacaoSaldo | null
    eventos: PontuacaoEvento[]
    contestacoesPendentes: PontuacaoContestacao[]
  }
  const [pontuacaoPorMotorista, setPontuacaoPorMotorista] = useState<Record<string, PontuacaoInfo | undefined>>({})
  const [decidindoContestacaoId, setDecidindoContestacaoId] = useState<string | null>(null)
  const [erroContestacao, setErroContestacao] = useState<string | null>(null)
  const [valorReducaoPorContestacao, setValorReducaoPorContestacao] = useState<Record<string, string>>({})

  // --- Agenciadores ---
  const [agenciadores, setAgenciadores] = useState<Pessoa[] | null>(null)
  const [loadingAgenciadores, setLoadingAgenciadores] = useState(true)
  const [showNovoAgenciador, setShowNovoAgenciador] = useState(false)
  const [novoAgenciador, setNovoAgenciador] = useState(AGENCIADOR_INICIAL)
  const [salvandoAgenciador, setSalvandoAgenciador] = useState(false)
  const [erroAgenciador, setErroAgenciador] = useState<string | null>(null)
  const [editingAgenciadorId, setEditingAgenciadorId] = useState<string | null>(null)
  const [buscaAgenciador, setBuscaAgenciador] = useState('')
  const [mostrarInativosAgenciador, setMostrarInativosAgenciador] = useState(false)

  // --- Fornecedores ---
  const [fornecedores, setFornecedores] = useState<Fornecedor[] | null>(null)
  const [loadingFornecedores, setLoadingFornecedores] = useState(true)
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false)
  const [novoFornecedor, setNovoFornecedor] = useState(FORNECEDOR_INICIAL)
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)
  const [erroFornecedor, setErroFornecedor] = useState<string | null>(null)
  const [editingFornecedorId, setEditingFornecedorId] = useState<string | null>(null)
  const [buscaFornecedor, setBuscaFornecedor] = useState('')
  const [mostrarInativosFornecedor, setMostrarInativosFornecedor] = useState(false)
  const [categoriasDespesa, setCategoriasDespesa] = useState<CategoriaFinanceiraOpcao[]>([])
  const [condicoesPagar, setCondicoesPagar] = useState<CondicaoPrazoOpcao[]>([])

  // --- Prestadores parceiros ---
  const [prestadores, setPrestadores] = useState<PrestadorParceiro[] | null>(null)
  const [loadingPrestadores, setLoadingPrestadores] = useState(true)
  const [showNovoPrestador, setShowNovoPrestador] = useState(false)
  const [novoPrestador, setNovoPrestador] = useState(PRESTADOR_INICIAL)
  const [salvandoPrestador, setSalvandoPrestador] = useState(false)
  const [erroPrestador, setErroPrestador] = useState<string | null>(null)
  const [editingPrestadorId, setEditingPrestadorId] = useState<string | null>(null)
  const [buscaPrestador, setBuscaPrestador] = useState('')
  const [mostrarInativosPrestador, setMostrarInativosPrestador] = useState(false)

  const loadClientes = useCallback(async () => {
    setLoadingClientes(true)
    const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) setErroCliente(error.message)
    setClientes(data ?? [])
    setLoadingClientes(false)
  }, [])

  const loadMotoristas = useCallback(async () => {
    setLoadingMotoristas(true)
    const { data, error } = await supabase
      .from('pessoas')
      .select('*')
      .eq('papel', 'titular_motorista')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) setErroMotorista(error.message)
    setMotoristas(data ?? [])
    setLoadingMotoristas(false)
  }, [])

  const loadAgenciadores = useCallback(async () => {
    setLoadingAgenciadores(true)
    const { data, error } = await supabase
      .from('pessoas')
      .select('*')
      .eq('papel', 'agenciador')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) setErroAgenciador(error.message)
    setAgenciadores(data ?? [])
    setLoadingAgenciadores(false)
  }, [])

  const loadFornecedores = useCallback(async () => {
    setLoadingFornecedores(true)
    const [{ data, error }, { data: categoriasData }, { data: condicoesData }] = await Promise.all([
      supabase.from('fornecedores').select('*').order('created_at', { ascending: false }).limit(300),
      supabase
        .from('categorias_financeiras')
        .select('id, nome, grupo')
        .eq('tipo', 'despesa')
        .eq('ativa', true)
        .order('ordem'),
      supabase
        .from('condicoes_prazo')
        .select('id, nome, descricao')
        .eq('ativa', true)
        .in('aplica_a', ['pagar', 'ambos'])
        .order('nome'),
    ])
    if (error) setErroFornecedor(error.message)
    setFornecedores(data ?? [])
    setCategoriasDespesa(categoriasData ?? [])
    setCondicoesPagar(condicoesData ?? [])
    setLoadingFornecedores(false)
  }, [])

  const loadPrestadores = useCallback(async () => {
    setLoadingPrestadores(true)
    const { data, error } = await supabase.from('prestadores_parceiros').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) setErroPrestador(error.message)
    setPrestadores(data ?? [])
    setLoadingPrestadores(false)
  }, [])

  useEffect(() => {
    loadClientes()
    loadMotoristas()
    loadAgenciadores()
    loadFornecedores()
    loadPrestadores()
  }, [loadClientes, loadMotoristas, loadAgenciadores, loadFornecedores, loadPrestadores])

  const clientesFiltrados = useMemo(() => {
    const termo = normalizaBusca(buscaCliente)
    return (clientes ?? []).filter((c) => {
      if (!mostrarInativosCliente && c.status !== 'ativo') return false
      if (!termo) return true
      const alvo = normalizaBusca(`${c.razao_social ?? ''} ${c.nome_fantasia ?? ''} ${c.cnpj ?? ''} ${c.cpf ?? ''}`)
      return alvo.includes(termo)
    })
  }, [clientes, buscaCliente, mostrarInativosCliente])

  const motoristasFiltrados = useMemo(() => {
    const termo = normalizaBusca(buscaMotorista)
    return (motoristas ?? []).filter((m) => {
      if (!mostrarInativosMotorista && m.status !== 'ativo') return false
      if (!termo) return true
      const alvo = normalizaBusca(`${m.nome} ${m.cpf ?? ''} ${m.cidade ?? ''}`)
      return alvo.includes(termo)
    })
  }, [motoristas, buscaMotorista, mostrarInativosMotorista])

  const agenciadoresFiltrados = useMemo(() => {
    const termo = normalizaBusca(buscaAgenciador)
    return (agenciadores ?? []).filter((a) => {
      if (!mostrarInativosAgenciador && a.status !== 'ativo') return false
      if (!termo) return true
      const alvo = normalizaBusca(`${a.nome} ${a.cpf ?? ''} ${a.cnpj ?? ''}`)
      return alvo.includes(termo)
    })
  }, [agenciadores, buscaAgenciador, mostrarInativosAgenciador])

  const fornecedoresFiltrados = useMemo(() => {
    const termo = normalizaBusca(buscaFornecedor)
    return (fornecedores ?? []).filter((f) => {
      if (!mostrarInativosFornecedor && f.status !== 'ativo') return false
      if (!termo) return true
      const alvo = normalizaBusca(`${f.nome ?? ''} ${f.razao_social ?? ''} ${f.cnpj ?? ''} ${f.cpf ?? ''} ${f.tipo_servico_fornecido ?? ''}`)
      return alvo.includes(termo)
    })
  }, [fornecedores, buscaFornecedor, mostrarInativosFornecedor])

  const prestadoresFiltrados = useMemo(() => {
    const termo = normalizaBusca(buscaPrestador)
    return (prestadores ?? []).filter((p) => {
      if (!mostrarInativosPrestador && p.status !== 'ativo') return false
      if (!termo) return true
      const alvo = normalizaBusca(`${p.nome ?? ''} ${p.razao_social ?? ''} ${p.cnpj ?? ''} ${p.cpf ?? ''}`)
      return alvo.includes(termo)
    })
  }, [prestadores, buscaPrestador, mostrarInativosPrestador])

  async function carregarVeiculosDoMotorista(motoristaId: string) {
    const { data } = await supabase.from('veiculos').select('*').eq('titular_id', motoristaId).order('created_at', { ascending: false })
    setVeiculosPorMotorista((prev) => ({ ...prev, [motoristaId]: data ?? [] }))
  }

  async function carregarCondutoresDoMotorista(motoristaId: string) {
    const { data } = await supabase
      .from('pessoas')
      .select('*')
      .eq('titular_id', motoristaId)
      .eq('papel', 'condutor')
      .order('created_at', { ascending: false })
    const lista = data ?? []
    setCondutoresPorMotorista((prev) => ({ ...prev, [motoristaId]: lista }))
    lista.forEach((c) => {
      if (!(c.id in pontuacaoPorMotorista)) carregarPontuacao(c.id)
    })
  }

  async function carregarPontuacao(motoristaId: string) {
    const [{ data: saldo }, { data: eventos }, { data: contestacoes }] = await Promise.all([
      supabase.from('pontuacao_saldo').select('*').eq('pessoa_id', motoristaId).maybeSingle(),
      supabase
        .from('pontuacao_eventos')
        .select('*')
        .eq('pessoa_id', motoristaId)
        .order('aplicado_em', { ascending: false })
        .limit(20),
      supabase.from('pontuacao_contestacoes').select('*').eq('pessoa_id', motoristaId).eq('status', 'pendente'),
    ])
    setPontuacaoPorMotorista((prev) => ({
      ...prev,
      [motoristaId]: { saldo: saldo ?? null, eventos: eventos ?? [], contestacoesPendentes: contestacoes ?? [] },
    }))
  }

  function toggleExpandMotorista(motoristaId: string) {
    setErroVeiculo(null)
    setShowNovoVeiculoId(null)
    setEditingVeiculoId(null)
    setErroCondutor(null)
    setShowNovoCondutorId(null)
    setEditingCondutorId(null)
    if (expandedMotoristaId === motoristaId) {
      setExpandedMotoristaId(null)
      return
    }
    setExpandedMotoristaId(motoristaId)
    if (!(motoristaId in veiculosPorMotorista)) {
      carregarVeiculosDoMotorista(motoristaId)
    }
    if (!(motoristaId in pontuacaoPorMotorista)) {
      carregarPontuacao(motoristaId)
    }
    if (!(motoristaId in condutoresPorMotorista)) {
      carregarCondutoresDoMotorista(motoristaId)
    }
  }

  // ---------- Clientes ----------

  function montarPayloadCliente() {
    return {
      tipo_pessoa_doc: novoCliente.tipo_pessoa_doc,
      razao_social: novoCliente.razao_social.trim() || null,
      nome_fantasia: novoCliente.nome_fantasia.trim() || null,
      cnpj: novoCliente.tipo_pessoa_doc === 'PJ' ? novoCliente.cnpj.trim() || null : null,
      cpf: novoCliente.tipo_pessoa_doc === 'PF' ? novoCliente.cpf.trim() || null : null,
      cep: novoCliente.cep.trim() || null,
      logradouro: novoCliente.logradouro.trim() || null,
      numero_endereco: novoCliente.numero_endereco.trim() || null,
      complemento: novoCliente.complemento.trim() || null,
      bairro: novoCliente.bairro.trim() || null,
      cidade: novoCliente.cidade.trim() || null,
      uf: novoCliente.uf.trim().toUpperCase() || null,
      email: novoCliente.email.trim() || null,
      celular_whatsapp: novoCliente.celular_whatsapp.trim() || null,
      nome_contato_comercial: novoCliente.nome_contato_comercial.trim() || null,
    }
  }

  function validarCliente(): string | null {
    if (novoCliente.tipo_pessoa_doc === 'PJ' && !novoCliente.razao_social.trim()) return 'Informe a razão social.'
    if (novoCliente.tipo_pessoa_doc === 'PF' && !novoCliente.razao_social.trim()) return 'Informe o nome.'
    if (novoCliente.tipo_pessoa_doc === 'PF' && !novoCliente.cpf.trim()) return 'Informe o CPF (pessoa física).'
    if (novoCliente.tipo_pessoa_doc === 'PJ' && !novoCliente.cnpj.trim()) return 'Informe o CNPJ (pessoa jurídica).'
    return null
  }

  async function salvarCliente() {
    setErroCliente(null)
    const erro = validarCliente()
    if (erro) {
      setErroCliente(erro)
      return
    }
    setSalvandoCliente(true)
    try {
      const payload = montarPayloadCliente()
      const { error } = editingClienteId
        ? await supabase.from('clientes').update(payload).eq('id', editingClienteId)
        : await supabase.from('clientes').insert(payload)
      if (error) throw error
      fecharFormCliente()
      await loadClientes()
    } catch (e) {
      setErroCliente(e instanceof Error ? e.message : 'Erro ao salvar cliente.')
    } finally {
      setSalvandoCliente(false)
    }
  }

  function editarCliente(c: Cliente) {
    setErroCliente(null)
    setEditingClienteId(c.id)
    setNovoCliente({
      tipo_pessoa_doc: c.tipo_pessoa_doc,
      cnpj: c.cnpj ?? '',
      cpf: c.cpf ?? '',
      razao_social: c.razao_social ?? '',
      nome_fantasia: c.nome_fantasia ?? '',
      cep: c.cep ?? '',
      logradouro: c.logradouro ?? '',
      numero_endereco: c.numero_endereco ?? '',
      complemento: c.complemento ?? '',
      bairro: c.bairro ?? '',
      cidade: c.cidade ?? '',
      uf: c.uf ?? '',
      email: c.email ?? '',
      celular_whatsapp: c.celular_whatsapp ?? '',
      nome_contato_comercial: c.nome_contato_comercial ?? '',
    })
    setShowNovoCliente(true)
  }

  function fecharFormCliente() {
    setNovoCliente(CLIENTE_INICIAL)
    setShowNovoCliente(false)
    setEditingClienteId(null)
  }

  async function alternarStatusCliente(c: Cliente) {
    const novoStatus: StatusCicloVida = c.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('clientes').update({ status: novoStatus }).eq('id', c.id)
    if (!error) await loadClientes()
  }

  // ---------- Motoristas ----------

  function montarPayloadMotorista() {
    return {
      nome: novoMotorista.nome.trim(),
      cpf: novoMotorista.cpf.trim(),
      email: novoMotorista.email.trim() || null,
      celular: novoMotorista.celular.trim() || null,
      cep: novoMotorista.cep.trim() || null,
      logradouro: novoMotorista.logradouro.trim() || null,
      numero_endereco: novoMotorista.numero_endereco.trim() || null,
      complemento: novoMotorista.complemento.trim() || null,
      bairro: novoMotorista.bairro.trim() || null,
      cidade: novoMotorista.cidade.trim() || null,
      uf: novoMotorista.uf.trim().toUpperCase() || null,
      cnh_numero_registro: novoMotorista.cnh_numero_registro.trim() || null,
      cnh_categoria: novoMotorista.cnh_categoria || null,
      cnh_validade: novoMotorista.cnh_validade || null,
      rntrc_numero: novoMotorista.rntrc_numero.trim() || null,
      rntrc_status: novoMotorista.rntrc_status || null,
      rntrc_validade: novoMotorista.rntrc_validade || null,
      pix: novoMotorista.pix.trim() || null,
      banco_codigo: novoMotorista.banco_codigo.trim() || null,
      banco_agencia: novoMotorista.banco_agencia.trim() || null,
      banco_conta: novoMotorista.banco_conta.trim() || null,
      banco_tipo_conta: novoMotorista.banco_tipo_conta || null,
    }
  }

  async function salvarMotorista() {
    setErroMotorista(null)
    if (!novoMotorista.nome.trim()) {
      setErroMotorista('Informe o nome.')
      return
    }
    if (!novoMotorista.cpf.trim()) {
      setErroMotorista('Informe o CPF.')
      return
    }
    setSalvandoMotorista(true)
    try {
      const payload = montarPayloadMotorista()
      const { error } = editingMotoristaId
        ? await supabase.from('pessoas').update(payload).eq('id', editingMotoristaId)
        : await supabase.from('pessoas').insert({ ...payload, papel: 'titular_motorista', tipo_pessoa_doc: 'PF' })
      if (error) throw error
      fecharFormMotorista()
      await loadMotoristas()
    } catch (e) {
      setErroMotorista(e instanceof Error ? e.message : 'Erro ao salvar motorista.')
    } finally {
      setSalvandoMotorista(false)
    }
  }

  function editarMotorista(m: Pessoa) {
    setErroMotorista(null)
    setEditingMotoristaId(m.id)
    setNovoMotorista({
      nome: m.nome,
      cpf: m.cpf ?? '',
      email: m.email ?? '',
      celular: m.celular ?? '',
      cep: m.cep ?? '',
      logradouro: m.logradouro ?? '',
      numero_endereco: m.numero_endereco ?? '',
      complemento: m.complemento ?? '',
      bairro: m.bairro ?? '',
      cidade: m.cidade ?? '',
      uf: m.uf ?? '',
      cnh_numero_registro: m.cnh_numero_registro ?? '',
      cnh_categoria: m.cnh_categoria ?? '',
      cnh_validade: m.cnh_validade ?? '',
      rntrc_numero: m.rntrc_numero ?? '',
      rntrc_status: m.rntrc_status ?? '',
      rntrc_validade: m.rntrc_validade ?? '',
      pix: m.pix ?? '',
      banco_codigo: m.banco_codigo ?? '',
      banco_agencia: m.banco_agencia ?? '',
      banco_conta: m.banco_conta ?? '',
      banco_tipo_conta: m.banco_tipo_conta ?? '',
    })
    setShowNovoMotorista(true)
  }

  function fecharFormMotorista() {
    setNovoMotorista(MOTORISTA_INICIAL)
    setShowNovoMotorista(false)
    setEditingMotoristaId(null)
  }

  async function alternarStatusMotorista(m: Pessoa) {
    const novoStatus: StatusCicloVida = m.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('pessoas').update({ status: novoStatus }).eq('id', m.id)
    if (!error) await loadMotoristas()
  }

  // ---------- Veículos ----------

  function montarPayloadVeiculo() {
    return {
      placa: novoVeiculo.placa.trim().toUpperCase(),
      renavam: novoVeiculo.renavam.trim(),
      chassi: novoVeiculo.chassi.trim() || null,
      marca_modelo: novoVeiculo.marca_modelo.trim() || null,
      ano: novoVeiculo.ano ? Number(novoVeiculo.ano) : null,
      cor: novoVeiculo.cor.trim() || null,
      combustivel: novoVeiculo.combustivel.trim() || null,
      tipo_veiculo: novoVeiculo.tipo_veiculo.trim() || null,
      tipo_carroceria: novoVeiculo.tipo_carroceria.trim() || null,
      capacidade_carga: novoVeiculo.capacidade_carga ? Number(novoVeiculo.capacidade_carga) : null,
      tara_kg: novoVeiculo.tara_kg ? Number(novoVeiculo.tara_kg) : null,
      potencia_cv: novoVeiculo.potencia_cv ? Number(novoVeiculo.potencia_cv) : null,
      quantidade_eixos: novoVeiculo.quantidade_eixos ? Number(novoVeiculo.quantidade_eixos) : null,
      quantidade_pneus: novoVeiculo.quantidade_pneus ? Number(novoVeiculo.quantidade_pneus) : null,
      is_veiculo_proprio: novoVeiculo.is_veiculo_proprio,
      e_reboque: novoVeiculo.e_reboque,
      uf_licenciamento: novoVeiculo.uf_licenciamento.trim().toUpperCase() || null,
      rntrc_numero: novoVeiculo.rntrc_numero.trim() || null,
      rntrc_status: novoVeiculo.rntrc_status || null,
      rntrc_validade: novoVeiculo.rntrc_validade || null,
      rastreador_tipo: novoVeiculo.rastreador_tipo,
      rastreador_identificador: novoVeiculo.rastreador_tipo === 'wialon' ? novoVeiculo.rastreador_identificador.trim() || null : null,
      rastreador_instalado_em: novoVeiculo.rastreador_tipo === 'wialon' ? novoVeiculo.rastreador_instalado_em || null : null,
      rastreador_ativo: novoVeiculo.rastreador_tipo === 'wialon' ? novoVeiculo.rastreador_ativo : false,
      seguro_veiculo_seguradora: novoVeiculo.seguro_veiculo_seguradora.trim() || null,
      seguro_veiculo_apolice_numero: novoVeiculo.seguro_veiculo_apolice_numero.trim() || null,
      seguro_veiculo_vencimento: novoVeiculo.seguro_veiculo_vencimento || null,
    }
  }

  async function salvarVeiculo(motoristaId: string) {
    setErroVeiculo(null)
    if (!novoVeiculo.placa.trim()) {
      setErroVeiculo('Informe a placa.')
      return
    }
    if (!novoVeiculo.renavam.trim()) {
      setErroVeiculo('Informe o RENAVAM.')
      return
    }
    setSalvandoVeiculo(true)
    try {
      const payload = montarPayloadVeiculo()
      const { error } = editingVeiculoId
        ? await supabase.from('veiculos').update(payload).eq('id', editingVeiculoId)
        : await supabase.from('veiculos').insert({ ...payload, titular_id: motoristaId })
      if (error) throw error
      fecharFormVeiculo()
      await carregarVeiculosDoMotorista(motoristaId)
    } catch (e) {
      setErroVeiculo(e instanceof Error ? e.message : 'Erro ao salvar veículo.')
    } finally {
      setSalvandoVeiculo(false)
    }
  }

  function editarVeiculo(motoristaId: string, v: Veiculo) {
    setErroVeiculo(null)
    setEditingVeiculoId(v.id)
    setNovoVeiculo({
      placa: v.placa,
      renavam: v.renavam,
      chassi: v.chassi ?? '',
      marca_modelo: v.marca_modelo ?? '',
      ano: v.ano ? String(v.ano) : '',
      cor: v.cor ?? '',
      combustivel: v.combustivel ?? '',
      tipo_veiculo: v.tipo_veiculo ?? '',
      tipo_carroceria: v.tipo_carroceria ?? '',
      capacidade_carga: v.capacidade_carga ? String(v.capacidade_carga) : '',
      tara_kg: v.tara_kg ? String(v.tara_kg) : '',
      potencia_cv: v.potencia_cv ? String(v.potencia_cv) : '',
      quantidade_eixos: v.quantidade_eixos ? String(v.quantidade_eixos) : '',
      quantidade_pneus: v.quantidade_pneus ? String(v.quantidade_pneus) : '',
      is_veiculo_proprio: v.is_veiculo_proprio,
      e_reboque: v.e_reboque,
      uf_licenciamento: v.uf_licenciamento ?? '',
      rntrc_numero: v.rntrc_numero ?? '',
      rntrc_status: v.rntrc_status ?? '',
      rntrc_validade: v.rntrc_validade ?? '',
      rastreador_tipo: v.rastreador_tipo,
      rastreador_identificador: v.rastreador_identificador ?? '',
      rastreador_instalado_em: v.rastreador_instalado_em ?? '',
      rastreador_ativo: v.rastreador_ativo,
      seguro_veiculo_seguradora: v.seguro_veiculo_seguradora ?? '',
      seguro_veiculo_apolice_numero: v.seguro_veiculo_apolice_numero ?? '',
      seguro_veiculo_vencimento: v.seguro_veiculo_vencimento ?? '',
    })
    setShowNovoVeiculoId(motoristaId)
  }

  function fecharFormVeiculo() {
    setNovoVeiculo(VEICULO_INICIAL)
    setShowNovoVeiculoId(null)
    setEditingVeiculoId(null)
  }

  async function alternarAtivoVeiculo(motoristaId: string, v: Veiculo) {
    const { error } = await supabase.from('veiculos').update({ ativo: !v.ativo }).eq('id', v.id)
    if (!error) await carregarVeiculosDoMotorista(motoristaId)
  }

  // ---------- Condutores (funcionários que dirigem veículos do titular) ----------

  function montarPayloadCondutor() {
    return {
      nome: novoCondutor.nome.trim(),
      cpf: novoCondutor.cpf.trim(),
      email: novoCondutor.email.trim() || null,
      celular: novoCondutor.celular.trim() || null,
      cnh_numero_registro: novoCondutor.cnh_numero_registro.trim() || null,
      cnh_categoria: novoCondutor.cnh_categoria || null,
      cnh_validade: novoCondutor.cnh_validade || null,
    }
  }

  async function salvarCondutor(titularId: string) {
    setErroCondutor(null)
    if (!novoCondutor.nome.trim()) {
      setErroCondutor('Informe o nome.')
      return
    }
    if (!novoCondutor.cpf.trim()) {
      setErroCondutor('Informe o CPF.')
      return
    }
    setSalvandoCondutor(true)
    try {
      const payload = montarPayloadCondutor()
      const { error } = editingCondutorId
        ? await supabase.from('pessoas').update(payload).eq('id', editingCondutorId)
        : await supabase.from('pessoas').insert({ ...payload, papel: 'condutor', tipo_pessoa_doc: 'PF', titular_id: titularId })
      if (error) throw error
      fecharFormCondutor()
      await carregarCondutoresDoMotorista(titularId)
    } catch (e) {
      setErroCondutor(e instanceof Error ? e.message : 'Erro ao salvar condutor.')
    } finally {
      setSalvandoCondutor(false)
    }
  }

  function editarCondutor(titularId: string, c: Pessoa) {
    setErroCondutor(null)
    setEditingCondutorId(c.id)
    setNovoCondutor({
      nome: c.nome,
      cpf: c.cpf ?? '',
      email: c.email ?? '',
      celular: c.celular ?? '',
      cnh_numero_registro: c.cnh_numero_registro ?? '',
      cnh_categoria: c.cnh_categoria ?? '',
      cnh_validade: c.cnh_validade ?? '',
    })
    setShowNovoCondutorId(titularId)
  }

  function fecharFormCondutor() {
    setNovoCondutor(CONDUTOR_INICIAL)
    setShowNovoCondutorId(null)
    setEditingCondutorId(null)
  }

  async function alternarStatusCondutor(titularId: string, c: Pessoa) {
    const novoStatus: StatusCicloVida = c.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('pessoas').update({ status: novoStatus }).eq('id', c.id)
    if (!error) await carregarCondutoresDoMotorista(titularId)
  }

  // ---------- Pontuação / contestações ----------

  async function decidirContestacao(
    motoristaId: string,
    contestacao: PontuacaoContestacao,
    decisao: 'aceita' | 'negada' | 'reduzida',
  ) {
    setErroContestacao(null)
    let pontosReduzidos: number | null = null
    if (decisao === 'reduzida') {
      const bruto = (valorReducaoPorContestacao[contestacao.id] ?? '').trim()
      if (!bruto || Number.isNaN(Number(bruto))) {
        setErroContestacao('Informe o valor reduzido de pontos antes de confirmar.')
        return
      }
      pontosReduzidos = Number(bruto)
    }
    setDecidindoContestacaoId(contestacao.id)
    try {
      const { error: erroContestacaoUpdate } = await supabase
        .from('pontuacao_contestacoes')
        .update({
          status: decisao,
          decidido_por: gestorPessoaId,
          decidido_em: new Date().toISOString(),
          motivo_decisao:
            decisao === 'reduzida' ? `Pontuação reduzida para ${pontosReduzidos} via revisão do gestor.` : 'Revisado pelo gestor.',
        })
        .eq('id', contestacao.id)
      if (erroContestacaoUpdate) throw erroContestacaoUpdate

      if (decisao === 'aceita' || decisao === 'reduzida') {
        const { data: eventoOriginal, error: erroBusca } = await supabase
          .from('pontuacao_eventos')
          .select('*')
          .eq('id', contestacao.pontuacao_evento_id)
          .single()
        if (erroBusca) throw erroBusca

        const { error: erroReverte } = await supabase
          .from('pontuacao_eventos')
          .update({ revertido_por_contestacao_id: contestacao.id })
          .eq('id', contestacao.pontuacao_evento_id)
        if (erroReverte) throw erroReverte

        if (decisao === 'reduzida' && eventoOriginal && pontosReduzidos !== null) {
          const { error: erroNovo } = await supabase.from('pontuacao_eventos').insert({
            pessoa_id: eventoOriginal.pessoa_id,
            operacao_id: eventoOriginal.operacao_id,
            tipo_criterio: eventoOriginal.tipo_criterio,
            sinal: eventoOriginal.sinal,
            pontos: pontosReduzidos,
            motivo_texto: `Reaplicado após contestação (reduzido de ${eventoOriginal.pontos} para ${pontosReduzidos}).`,
            regra_aplicada: eventoOriginal.regra_aplicada,
            dado_origem: { contestacao_id: contestacao.id, evento_original_id: eventoOriginal.id },
          })
          if (erroNovo) throw erroNovo
        }
      }
      await carregarPontuacao(motoristaId)
    } catch (e) {
      setErroContestacao(e instanceof Error ? e.message : 'Erro ao decidir contestação.')
    } finally {
      setDecidindoContestacaoId(null)
    }
  }

  // ---------- Agenciadores ----------

  function montarPayloadAgenciador() {
    return {
      tipo_pessoa_doc: novoAgenciador.tipo_pessoa_doc,
      nome: novoAgenciador.nome.trim(),
      cpf: novoAgenciador.tipo_pessoa_doc === 'PF' ? novoAgenciador.cpf.trim() || null : null,
      cnpj: novoAgenciador.tipo_pessoa_doc === 'PJ' ? novoAgenciador.cnpj.trim() || null : null,
      email: novoAgenciador.email.trim() || null,
      celular: novoAgenciador.celular.trim() || null,
      cep: novoAgenciador.cep.trim() || null,
      logradouro: novoAgenciador.logradouro.trim() || null,
      numero_endereco: novoAgenciador.numero_endereco.trim() || null,
      complemento: novoAgenciador.complemento.trim() || null,
      bairro: novoAgenciador.bairro.trim() || null,
      cidade: novoAgenciador.cidade.trim() || null,
      uf: novoAgenciador.uf.trim().toUpperCase() || null,
    }
  }

  async function salvarAgenciador() {
    setErroAgenciador(null)
    if (!novoAgenciador.nome.trim()) {
      setErroAgenciador('Informe o nome.')
      return
    }
    if (novoAgenciador.tipo_pessoa_doc === 'PF' && !novoAgenciador.cpf.trim()) {
      setErroAgenciador('Informe o CPF (pessoa física).')
      return
    }
    if (novoAgenciador.tipo_pessoa_doc === 'PJ' && !novoAgenciador.cnpj.trim()) {
      setErroAgenciador('Informe o CNPJ (pessoa jurídica).')
      return
    }
    setSalvandoAgenciador(true)
    try {
      const payload = montarPayloadAgenciador()
      const { error } = editingAgenciadorId
        ? await supabase.from('pessoas').update(payload).eq('id', editingAgenciadorId)
        : await supabase.from('pessoas').insert({ ...payload, papel: 'agenciador' })
      if (error) throw error
      fecharFormAgenciador()
      await loadAgenciadores()
    } catch (e) {
      setErroAgenciador(e instanceof Error ? e.message : 'Erro ao salvar agenciador.')
    } finally {
      setSalvandoAgenciador(false)
    }
  }

  function editarAgenciador(a: Pessoa) {
    setErroAgenciador(null)
    setEditingAgenciadorId(a.id)
    setNovoAgenciador({
      tipo_pessoa_doc: a.tipo_pessoa_doc,
      nome: a.nome,
      cpf: a.cpf ?? '',
      cnpj: a.cnpj ?? '',
      email: a.email ?? '',
      celular: a.celular ?? '',
      cep: a.cep ?? '',
      logradouro: a.logradouro ?? '',
      numero_endereco: a.numero_endereco ?? '',
      complemento: a.complemento ?? '',
      bairro: a.bairro ?? '',
      cidade: a.cidade ?? '',
      uf: a.uf ?? '',
    })
    setShowNovoAgenciador(true)
  }

  function fecharFormAgenciador() {
    setNovoAgenciador(AGENCIADOR_INICIAL)
    setShowNovoAgenciador(false)
    setEditingAgenciadorId(null)
  }

  async function alternarStatusAgenciador(a: Pessoa) {
    const novoStatus: StatusCicloVida = a.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('pessoas').update({ status: novoStatus }).eq('id', a.id)
    if (!error) await loadAgenciadores()
  }

  // ---------- Fornecedores ----------

  function montarPayloadFornecedor() {
    return {
      tipo_pessoa_doc: novoFornecedor.tipo_pessoa_doc,
      nome: novoFornecedor.nome.trim() || null,
      razao_social: novoFornecedor.razao_social.trim() || null,
      cnpj: novoFornecedor.tipo_pessoa_doc === 'PJ' ? novoFornecedor.cnpj.trim() || null : null,
      cpf: novoFornecedor.tipo_pessoa_doc === 'PF' ? novoFornecedor.cpf.trim() || null : null,
      email: novoFornecedor.email.trim() || null,
      celular: novoFornecedor.celular.trim() || null,
      pix: novoFornecedor.pix.trim() || null,
      tipo_servico_fornecido: novoFornecedor.tipo_servico_fornecido.trim() || null,
      categoria_id: novoFornecedor.categoria_id || null,
      condicao_prazo_id: novoFornecedor.condicao_prazo_id || null,
      banco_codigo: novoFornecedor.banco_codigo.trim() || null,
      banco_agencia: novoFornecedor.banco_agencia.trim() || null,
      banco_conta: novoFornecedor.banco_conta.trim() || null,
      banco_tipo_conta: novoFornecedor.banco_tipo_conta || null,
    }
  }

  async function salvarFornecedor() {
    setErroFornecedor(null)
    const nomeOuRazao = novoFornecedor.tipo_pessoa_doc === 'PJ' ? novoFornecedor.razao_social : novoFornecedor.nome
    if (!nomeOuRazao.trim()) {
      setErroFornecedor(novoFornecedor.tipo_pessoa_doc === 'PJ' ? 'Informe a razão social.' : 'Informe o nome.')
      return
    }
    if (novoFornecedor.tipo_pessoa_doc === 'PF' && !novoFornecedor.cpf.trim()) {
      setErroFornecedor('Informe o CPF (pessoa física).')
      return
    }
    if (novoFornecedor.tipo_pessoa_doc === 'PJ' && !novoFornecedor.cnpj.trim()) {
      setErroFornecedor('Informe o CNPJ (pessoa jurídica).')
      return
    }
    setSalvandoFornecedor(true)
    try {
      const payload = montarPayloadFornecedor()
      const { error } = editingFornecedorId
        ? await supabase.from('fornecedores').update(payload).eq('id', editingFornecedorId)
        : await supabase.from('fornecedores').insert(payload)
      if (error) throw error
      fecharFormFornecedor()
      await loadFornecedores()
    } catch (e) {
      setErroFornecedor(e instanceof Error ? e.message : 'Erro ao salvar fornecedor.')
    } finally {
      setSalvandoFornecedor(false)
    }
  }

  function editarFornecedor(f: Fornecedor) {
    setErroFornecedor(null)
    setEditingFornecedorId(f.id)
    setNovoFornecedor({
      tipo_pessoa_doc: f.tipo_pessoa_doc,
      nome: f.nome ?? '',
      razao_social: f.razao_social ?? '',
      cnpj: f.cnpj ?? '',
      cpf: f.cpf ?? '',
      email: f.email ?? '',
      celular: f.celular ?? '',
      pix: f.pix ?? '',
      tipo_servico_fornecido: f.tipo_servico_fornecido ?? '',
      categoria_id: f.categoria_id ?? '',
      condicao_prazo_id: f.condicao_prazo_id ?? '',
      banco_codigo: f.banco_codigo ?? '',
      banco_agencia: f.banco_agencia ?? '',
      banco_conta: f.banco_conta ?? '',
      banco_tipo_conta: f.banco_tipo_conta ?? '',
    })
    setShowNovoFornecedor(true)
  }

  function fecharFormFornecedor() {
    setNovoFornecedor(FORNECEDOR_INICIAL)
    setShowNovoFornecedor(false)
    setEditingFornecedorId(null)
  }

  async function alternarStatusFornecedor(f: Fornecedor) {
    const novoStatus: StatusCicloVida = f.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('fornecedores').update({ status: novoStatus }).eq('id', f.id)
    if (!error) await loadFornecedores()
  }

  // ---------- Prestadores parceiros ----------

  function montarPayloadPrestador() {
    return {
      tipo_pessoa_doc: novoPrestador.tipo_pessoa_doc,
      nome: novoPrestador.tipo_pessoa_doc === 'PF' ? novoPrestador.nome.trim() || null : null,
      razao_social: novoPrestador.tipo_pessoa_doc === 'PJ' ? novoPrestador.razao_social.trim() || null : null,
      cnpj: novoPrestador.tipo_pessoa_doc === 'PJ' ? novoPrestador.cnpj.trim() || null : null,
      cpf: novoPrestador.tipo_pessoa_doc === 'PF' ? novoPrestador.cpf.trim() || null : null,
      email: novoPrestador.email.trim() || null,
      celular: novoPrestador.celular.trim() || null,
      condicoes_comerciais: novoPrestador.condicoes_comerciais.trim() || null,
      rntrc_numero: novoPrestador.rntrc_numero.trim() || null,
      rntrc_status: novoPrestador.rntrc_status || null,
      rntrc_validade: novoPrestador.rntrc_validade || null,
      cnh_ou_cnpj_validado: novoPrestador.cnh_ou_cnpj_validado,
    }
  }

  async function salvarPrestador() {
    setErroPrestador(null)
    const nomeOuRazao = novoPrestador.tipo_pessoa_doc === 'PJ' ? novoPrestador.razao_social : novoPrestador.nome
    if (!nomeOuRazao.trim()) {
      setErroPrestador(novoPrestador.tipo_pessoa_doc === 'PJ' ? 'Informe a razão social.' : 'Informe o nome.')
      return
    }
    if (novoPrestador.tipo_pessoa_doc === 'PF' && !novoPrestador.cpf.trim()) {
      setErroPrestador('Informe o CPF (pessoa física).')
      return
    }
    if (novoPrestador.tipo_pessoa_doc === 'PJ' && !novoPrestador.cnpj.trim()) {
      setErroPrestador('Informe o CNPJ (pessoa jurídica).')
      return
    }
    setSalvandoPrestador(true)
    try {
      const payload = montarPayloadPrestador()
      const { error } = editingPrestadorId
        ? await supabase.from('prestadores_parceiros').update(payload).eq('id', editingPrestadorId)
        : await supabase.from('prestadores_parceiros').insert(payload)
      if (error) throw error
      fecharFormPrestador()
      await loadPrestadores()
    } catch (e) {
      setErroPrestador(e instanceof Error ? e.message : 'Erro ao salvar prestador parceiro.')
    } finally {
      setSalvandoPrestador(false)
    }
  }

  function editarPrestador(p: PrestadorParceiro) {
    setErroPrestador(null)
    setEditingPrestadorId(p.id)
    setNovoPrestador({
      tipo_pessoa_doc: p.tipo_pessoa_doc,
      nome: p.nome ?? '',
      razao_social: p.razao_social ?? '',
      cnpj: p.cnpj ?? '',
      cpf: p.cpf ?? '',
      email: p.email ?? '',
      celular: p.celular ?? '',
      condicoes_comerciais: p.condicoes_comerciais ?? '',
      rntrc_numero: p.rntrc_numero ?? '',
      rntrc_status: p.rntrc_status ?? '',
      rntrc_validade: p.rntrc_validade ?? '',
      cnh_ou_cnpj_validado: p.cnh_ou_cnpj_validado,
    })
    setShowNovoPrestador(true)
  }

  function fecharFormPrestador() {
    setNovoPrestador(PRESTADOR_INICIAL)
    setShowNovoPrestador(false)
    setEditingPrestadorId(null)
  }

  async function alternarStatusPrestador(p: PrestadorParceiro) {
    const novoStatus: StatusCicloVida = p.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('prestadores_parceiros').update({ status: novoStatus }).eq('id', p.id)
    if (!error) await loadPrestadores()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Cadastros</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="text-sm font-bold px-4 py-2 rounded-xl border"
            style={{
              borderColor: 'var(--rbr-navy)',
              background: tab === t.value ? 'var(--rbr-navy)' : 'transparent',
              color: tab === t.value ? '#fff' : 'var(--rbr-navy)',
            }}
          >
            {t.label}
            {t.value === 'pendencias' && !!qtdPendencias && (
              <span
                className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: tab === t.value ? '#fff' : 'var(--rbr-danger)', color: tab === t.value ? 'var(--rbr-navy)' : '#fff' }}
              >
                {qtdPendencias}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'pendencias' && <Pendencias onContagem={setQtdPendencias} />}

      {tab === 'clientes' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Clientes</div>
            <button
              onClick={() => (showNovoCliente ? fecharFormCliente() : setShowNovoCliente(true))}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoCliente ? 'Cancelar' : '+ Novo'}
            </button>
          </div>

          <SearchAndFilterRow
            busca={buscaCliente}
            onBusca={setBuscaCliente}
            mostrarInativos={mostrarInativosCliente}
            onMostrarInativos={setMostrarInativosCliente}
            placeholder="Buscar por razão social, nome fantasia, CNPJ ou CPF…"
          />

          {showNovoCliente && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
                {editingClienteId ? 'Editar cliente' : 'Novo cliente'}
              </div>
              {erroCliente && (
                <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {erroCliente}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  placeholder={novoCliente.tipo_pessoa_doc === 'PJ' ? 'Razão social *' : 'Nome *'}
                  value={novoCliente.razao_social}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, razao_social: e.target.value }))}
                  className={`${inputClass} md:col-span-2`}
                  style={inputStyle}
                />
                <select
                  value={novoCliente.tipo_pessoa_doc}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, tipo_pessoa_doc: e.target.value as TipoPessoaDoc }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="PJ">Pessoa jurídica (PJ)</option>
                  <option value="PF">Pessoa física (PF)</option>
                </select>
              </div>
              {novoCliente.tipo_pessoa_doc === 'PJ' && (
                <input
                  placeholder="Nome fantasia"
                  value={novoCliente.nome_fantasia}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, nome_fantasia: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {novoCliente.tipo_pessoa_doc === 'PJ' ? (
                  <input
                    placeholder="CNPJ *"
                    value={novoCliente.cnpj}
                    onChange={(e) => setNovoCliente((f) => ({ ...f, cnpj: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                ) : (
                  <input
                    placeholder="CPF *"
                    value={novoCliente.cpf}
                    onChange={(e) => setNovoCliente((f) => ({ ...f, cpf: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                )}
                <input
                  placeholder="E-mail"
                  value={novoCliente.email}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Celular/WhatsApp"
                  value={novoCliente.celular_whatsapp}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, celular_whatsapp: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  placeholder="CEP"
                  value={novoCliente.cep}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, cep: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Logradouro"
                  value={novoCliente.logradouro}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, logradouro: e.target.value }))}
                  className={`${inputClass} col-span-2 md:col-span-2`}
                  style={inputStyle}
                />
                <input
                  placeholder="Número"
                  value={novoCliente.numero_endereco}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, numero_endereco: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  placeholder="Complemento"
                  value={novoCliente.complemento}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, complemento: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Bairro"
                  value={novoCliente.bairro}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, bairro: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Cidade"
                  value={novoCliente.cidade}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, cidade: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="UF"
                  maxLength={2}
                  value={novoCliente.uf}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, uf: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <input
                placeholder="Nome do contato comercial"
                value={novoCliente.nome_contato_comercial}
                onChange={(e) => setNovoCliente((f) => ({ ...f, nome_contato_comercial: e.target.value }))}
                className={inputClass}
                style={inputStyle}
              />
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Condição de pagamento/prazo não fica no cadastro do cliente — é definida por cotação/operação.
              </div>
              <button
                onClick={salvarCliente}
                disabled={salvandoCliente}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoCliente ? 'Salvando…' : editingClienteId ? 'Salvar alterações' : 'Criar cliente'}
              </button>
            </div>
          )}

          {loadingClientes && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingClientes && clientesFiltrados.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum cliente encontrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingClientes &&
              clientesFiltrados.map((c) => (
                <div key={c.id} className="bg-white border rounded-[16px] px-4 py-3.5" style={cardStyle}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold">{c.razao_social ?? c.nome_fantasia ?? 'Sem razão social'}</div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => editarCliente(c)} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
                        Editar
                      </button>
                      <button
                        onClick={() => alternarStatusCliente(c)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: 'var(--rbr-border)', color: c.status === 'ativo' ? 'var(--rbr-danger)' : '#1F7A3D' }}
                      >
                        {c.status === 'ativo' ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>{c.cnpj ?? c.cpf ?? 'Documento não informado'}</span>
                    <span>
                      {c.cidade ?? '—'}
                      {c.uf ? `/${c.uf}` : ''}
                    </span>
                    <span>{c.email ?? '—'}</span>
                    <span>{c.celular_whatsapp ?? '—'}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'motoristas' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Motoristas</div>
            <button
              onClick={() => (showNovoMotorista ? fecharFormMotorista() : setShowNovoMotorista(true))}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoMotorista ? 'Cancelar' : '+ Novo'}
            </button>
          </div>

          <SearchAndFilterRow
            busca={buscaMotorista}
            onBusca={setBuscaMotorista}
            mostrarInativos={mostrarInativosMotorista}
            onMostrarInativos={setMostrarInativosMotorista}
            placeholder="Buscar por nome, CPF ou cidade…"
          />

          {showNovoMotorista && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
                {editingMotoristaId ? 'Editar motorista' : 'Novo motorista'}
              </div>
              {erroMotorista && (
                <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {erroMotorista}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="Nome *"
                  value={novoMotorista.nome}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, nome: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="CPF *"
                  value={novoMotorista.cpf}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, cpf: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="E-mail"
                  value={novoMotorista.email}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Celular"
                  value={novoMotorista.celular}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, celular: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  placeholder="CEP"
                  value={novoMotorista.cep}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, cep: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Logradouro"
                  value={novoMotorista.logradouro}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, logradouro: e.target.value }))}
                  className={`${inputClass} col-span-2 md:col-span-2`}
                  style={inputStyle}
                />
                <input
                  placeholder="Número"
                  value={novoMotorista.numero_endereco}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, numero_endereco: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  placeholder="Complemento"
                  value={novoMotorista.complemento}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, complemento: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Bairro"
                  value={novoMotorista.bairro}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, bairro: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Cidade"
                  value={novoMotorista.cidade}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, cidade: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="UF"
                  maxLength={2}
                  value={novoMotorista.uf}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, uf: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className={labelClass}>CNH</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input
                  placeholder="Nº de registro da CNH"
                  value={novoMotorista.cnh_numero_registro}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, cnh_numero_registro: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <select
                  value={novoMotorista.cnh_categoria}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, cnh_categoria: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Categoria</option>
                  {CNH_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  placeholder="Validade da CNH"
                  value={novoMotorista.cnh_validade}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, cnh_validade: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className={labelClass}>RNTRC</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input
                  placeholder="Nº RNTRC"
                  value={novoMotorista.rntrc_numero}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, rntrc_numero: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <select
                  value={novoMotorista.rntrc_status}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, rntrc_status: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Status</option>
                  {RNTRC_STATUS_OPCOES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  placeholder="Validade RNTRC"
                  value={novoMotorista.rntrc_validade}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, rntrc_validade: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                Pagamento do frete (vai no CIOT/MDF-e — a conta tem que ser do próprio transportador)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <input
                  placeholder="Chave PIX"
                  value={novoMotorista.pix}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, pix: e.target.value }))}
                  className={`${inputClass} col-span-2 md:col-span-1`}
                  style={inputStyle}
                />
                <input
                  placeholder="Banco (código)"
                  value={novoMotorista.banco_codigo}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, banco_codigo: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Agência"
                  value={novoMotorista.banco_agencia}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, banco_agencia: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Conta com dígito"
                  value={novoMotorista.banco_conta}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, banco_conta: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <select
                  value={novoMotorista.banco_tipo_conta}
                  onChange={(e) => setNovoMotorista((f) => ({ ...f, banco_tipo_conta: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Tipo de conta</option>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="pagamento">Pagamento</option>
                </select>
              </div>

              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Extração automática de CNH/CRLV por IA ainda não está disponível aqui — preencha manualmente.
              </div>

              <button
                onClick={salvarMotorista}
                disabled={salvandoMotorista}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoMotorista ? 'Salvando…' : editingMotoristaId ? 'Salvar alterações' : 'Criar motorista'}
              </button>
            </div>
          )}

          {loadingMotoristas && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingMotoristas && motoristasFiltrados.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum motorista encontrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingMotoristas &&
              motoristasFiltrados.map((m) => {
                const isExpanded = expandedMotoristaId === m.id
                const veic = veiculosPorMotorista[m.id]
                const vencida = cnhVencidaOuAusente(m.cnh_validade)
                const pontuacao = pontuacaoPorMotorista[m.id]
                return (
                  <div key={m.id} className="bg-white border rounded-[16px] overflow-hidden" style={cardStyle}>
                    <button className="w-full text-left px-4 py-3.5" onClick={() => toggleExpandMotorista(m.id)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold">{m.nome}</div>
                          <StatusBadge status={m.status} />
                          <BadgeAprovacao status={m.aprovacao_status} />
                        </div>
                        <IconChevronRight
                          width={16}
                          height={16}
                          style={{
                            color: 'var(--rbr-muted)',
                            transform: isExpanded ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s',
                            flexShrink: 0,
                          }}
                        />
                      </div>
                      <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>{m.tipo_pessoa_doc === 'PJ' ? `CNPJ: ${formatarDoc(m.cnpj)}` : `CPF: ${formatarDoc(m.cpf) || '—'}`}</span>
                        <span>
                          {m.cidade ?? '—'}
                          {m.uf ? `/${m.uf}` : ''}
                        </span>
                        <span style={vencida ? { color: 'var(--rbr-danger)', fontWeight: 600 } : undefined}>
                          CNH válida até: {m.cnh_validade ? formatDate(m.cnh_validade) : 'não informado'}
                          {vencida ? ' ⚠' : ''}
                        </span>
                        <span>RNTRC: {m.rntrc_status ?? '—'}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t px-4 pb-4 pt-3 flex flex-col gap-4" style={{ borderColor: 'var(--rbr-border)' }}>
                        <PainelCadastro
                          pessoaId={m.id}
                          onMudou={async () => {
                            await loadMotoristas()
                            await carregarVeiculosDoMotorista(m.id)
                            await carregarCondutoresDoMotorista(m.id)
                          }}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => editarMotorista(m)} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
                            Editar cadastro
                          </button>
                          <button
                            onClick={() => alternarStatusMotorista(m)}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                            style={{ borderColor: 'var(--rbr-border)', color: m.status === 'ativo' ? 'var(--rbr-danger)' : '#1F7A3D' }}
                          >
                            {m.status === 'ativo' ? 'Desativar motorista' : 'Reativar motorista'}
                          </button>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Pontuação</div>
                          {!pontuacao && <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>}
                          {pontuacao && (
                            <>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div
                                  className="text-sm font-bold px-3 py-1.5 rounded-lg"
                                  style={{
                                    background: pontuacao.saldo && Number(pontuacao.saldo.saldo) < 0 ? '#FBE9E9' : '#E7F5EA',
                                    color: pontuacao.saldo && Number(pontuacao.saldo.saldo) < 0 ? 'var(--rbr-danger)' : '#1F7A3D',
                                  }}
                                >
                                  Saldo: {pontuacao.saldo ? Number(pontuacao.saldo.saldo).toFixed(1) : '0.0'} pts
                                </div>
                                <div className="text-xs text-[color:var(--rbr-muted)]">
                                  {pontuacao.saldo?.sem_historico
                                    ? 'Sem histórico ainda — não elegível para carga complexa por padrão.'
                                    : `${pontuacao.saldo?.total_eventos ?? 0} evento(s) registrado(s).`}
                                </div>
                              </div>

                              {pontuacao.eventos.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  {pontuacao.eventos.slice(0, 8).map((ev) => (
                                    <div
                                      key={ev.id}
                                      className="text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                                      style={{ background: 'var(--rbr-muted-bg)' }}
                                    >
                                      <span>
                                        {ev.motivo_texto ?? ev.tipo_criterio}
                                        {ev.revertido_por_contestacao_id ? ' (revertido por contestação)' : ''}
                                      </span>
                                      <span
                                        className="font-bold flex-shrink-0"
                                        style={{
                                          color: ev.revertido_por_contestacao_id
                                            ? 'var(--rbr-muted)'
                                            : ev.sinal === 'positivo'
                                              ? '#1F7A3D'
                                              : 'var(--rbr-danger)',
                                          textDecoration: ev.revertido_por_contestacao_id ? 'line-through' : undefined,
                                        }}
                                      >
                                        {ev.sinal === 'positivo' ? '+' : '-'}
                                        {ev.pontos}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {pontuacao.contestacoesPendentes.length > 0 && (
                                <div className="flex flex-col gap-2 mt-1">
                                  <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--rbr-danger)' }}>
                                    Contestações pendentes de revisão
                                  </div>
                                  {erroContestacao && (
                                    <div className="text-xs rounded-xl px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                                      {erroContestacao}
                                    </div>
                                  )}
                                  {pontuacao.contestacoesPendentes.map((ct) => (
                                    <div key={ct.id} className="rounded-xl px-3.5 py-3 flex flex-col gap-2" style={{ background: '#FCEFE0' }}>
                                      <div className="text-xs">{ct.texto_contestacao}</div>
                                      {ct.anexo_url && (
                                        <a href={ct.anexo_url} target="_blank" rel="noreferrer" className="text-xs font-bold underline">
                                          Ver anexo
                                        </a>
                                      )}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                          onClick={() => decidirContestacao(m.id, ct, 'aceita')}
                                          disabled={decidindoContestacaoId === ct.id}
                                          className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                                          style={{ background: '#1F7A3D', color: '#fff' }}
                                        >
                                          Aceitar (anular ponto)
                                        </button>
                                        <input
                                          placeholder="Pontos reduzidos"
                                          type="number"
                                          value={valorReducaoPorContestacao[ct.id] ?? ''}
                                          onChange={(e) =>
                                            setValorReducaoPorContestacao((prev) => ({ ...prev, [ct.id]: e.target.value }))
                                          }
                                          className={`${miniInputClass} w-32`}
                                          style={inputStyle}
                                        />
                                        <button
                                          onClick={() => decidirContestacao(m.id, ct, 'reduzida')}
                                          disabled={decidindoContestacaoId === ct.id}
                                          className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-60"
                                          style={{ borderColor: 'var(--rbr-border)' }}
                                        >
                                          Reduzir
                                        </button>
                                        <button
                                          onClick={() => decidirContestacao(m.id, ct, 'negada')}
                                          disabled={decidindoContestacaoId === ct.id}
                                          className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                                          style={{ background: 'var(--rbr-danger)', color: '#fff' }}
                                        >
                                          Negar
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {erroVeiculo && (
                          <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                            {erroVeiculo}
                          </div>
                        )}
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Veículos</div>
                        {veic === undefined && <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>}
                        {veic && veic.length === 0 && (
                          <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum veículo cadastrado.</div>
                        )}
                        {veic && veic.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {veic.map((v) => {
                              const seguroVencido = dataVencida(v.seguro_veiculo_vencimento)
                              return (
                                <div key={v.id} className="text-xs rounded-lg px-3 py-2 flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)' }}>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div>
                                      <span className="font-semibold">{v.placa}</span>
                                      {v.marca_modelo ? ` · ${v.marca_modelo}` : ''}
                                      {v.cor ? ` · ${v.cor}` : ''}
                                      {!v.ativo ? <span className="ml-2 font-bold" style={{ color: 'var(--rbr-muted)' }}>(inativo)</span> : null}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button onClick={() => editarVeiculo(m.id, v)} className="text-[11px] font-bold px-2.5 py-1 rounded-md border" style={{ borderColor: 'var(--rbr-border)' }}>
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => alternarAtivoVeiculo(m.id, v)}
                                        className="text-[11px] font-bold px-2.5 py-1 rounded-md border"
                                        style={{ borderColor: 'var(--rbr-border)', color: v.ativo ? 'var(--rbr-danger)' : '#1F7A3D' }}
                                      >
                                        {v.ativo ? 'Desativar' : 'Reativar'}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[color:var(--rbr-muted)]">
                                    <span>
                                      Rastreador: {RASTREADOR_TIPO_OPCOES.find((o) => o.value === v.rastreador_tipo)?.label ?? v.rastreador_tipo}
                                      {v.rastreador_tipo === 'wialon' ? (v.rastreador_ativo ? ' (ativo)' : ' (não ativo)') : ''}
                                    </span>
                                    <span style={seguroVencido ? { color: 'var(--rbr-danger)', fontWeight: 600 } : undefined}>
                                      Seguro: {v.seguro_veiculo_vencimento ? `vence ${formatDate(v.seguro_veiculo_vencimento)}` : 'não informado'}
                                      {seguroVencido ? ' ⚠' : ''}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setErroVeiculo(null)
                            if (showNovoVeiculoId === m.id) {
                              fecharFormVeiculo()
                            } else {
                              setEditingVeiculoId(null)
                              setNovoVeiculo(VEICULO_INICIAL)
                              setShowNovoVeiculoId(m.id)
                            }
                          }}
                          className="self-start text-xs font-bold px-3.5 py-2 rounded-lg"
                          style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                        >
                          {showNovoVeiculoId === m.id ? 'Cancelar' : '+ Adicionar veículo'}
                        </button>

                        {showNovoVeiculoId === m.id && (
                          <div className="rounded-xl px-3.5 py-3 flex flex-col gap-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
                            <div className="text-xs font-bold">{editingVeiculoId ? 'Editar veículo' : 'Novo veículo'}</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <input
                                placeholder="Placa *"
                                value={novoVeiculo.placa}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, placa: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="RENAVAM *"
                                value={novoVeiculo.renavam}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, renavam: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Chassi"
                                value={novoVeiculo.chassi}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, chassi: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Marca/modelo"
                                value={novoVeiculo.marca_modelo}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, marca_modelo: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Ano"
                                type="number"
                                value={novoVeiculo.ano}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, ano: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Cor"
                                value={novoVeiculo.cor}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, cor: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Combustível"
                                value={novoVeiculo.combustivel}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, combustivel: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Tipo de veículo"
                                value={novoVeiculo.tipo_veiculo}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, tipo_veiculo: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Tipo de carroceria"
                                value={novoVeiculo.tipo_carroceria}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, tipo_carroceria: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Capacidade de carga (kg)"
                                type="number"
                                value={novoVeiculo.capacidade_carga}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, capacidade_carga: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Tara (kg)"
                                type="number"
                                value={novoVeiculo.tara_kg}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, tara_kg: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Potência (cv)"
                                type="number"
                                value={novoVeiculo.potencia_cv}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, potencia_cv: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Qtd. eixos"
                                type="number"
                                value={novoVeiculo.quantidade_eixos}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, quantidade_eixos: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Qtd. pneus"
                                type="number"
                                value={novoVeiculo.quantidade_pneus}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, quantidade_pneus: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                            </div>
                            <label className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={novoVeiculo.is_veiculo_proprio}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, is_veiculo_proprio: e.target.checked }))}
                              />
                              Veículo próprio do titular
                            </label>
                            <div className="flex items-center gap-3 flex-wrap">
                              <label className="flex items-center gap-1.5 text-xs">
                                <input
                                  type="checkbox"
                                  checked={novoVeiculo.e_reboque}
                                  onChange={(e) => setNovoVeiculo((f) => ({ ...f, e_reboque: e.target.checked }))}
                                />
                                É carreta / semirreboque (sem motor)
                              </label>
                              <input
                                placeholder="UF da placa"
                                maxLength={2}
                                value={novoVeiculo.uf_licenciamento}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, uf_licenciamento: e.target.value.toUpperCase() }))}
                                className={miniInputClass}
                                style={{ ...inputStyle, maxWidth: 110 }}
                              />
                            </div>

                            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">RNTRC do veículo</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              <input
                                placeholder="RNTRC número"
                                value={novoVeiculo.rntrc_numero}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, rntrc_numero: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <select
                                value={novoVeiculo.rntrc_status}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, rntrc_status: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              >
                                <option value="">RNTRC status</option>
                                {RNTRC_STATUS_OPCOES.map((s) => (
                                  <option key={s} value={s}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                  </option>
                                ))}
                              </select>
                              <input
                                placeholder="Validade RNTRC"
                                type="date"
                                value={novoVeiculo.rntrc_validade}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, rntrc_validade: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                            </div>

                            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">Rastreador</div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <select
                                value={novoVeiculo.rastreador_tipo}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, rastreador_tipo: e.target.value }))}
                                className={`${miniInputClass} md:col-span-3`}
                                style={inputStyle}
                              >
                                {RASTREADOR_TIPO_OPCOES.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              {novoVeiculo.rastreador_tipo === 'wialon' && (
                                <>
                                  <input
                                    placeholder="Identificador (ID/IMEI)"
                                    value={novoVeiculo.rastreador_identificador}
                                    onChange={(e) => setNovoVeiculo((f) => ({ ...f, rastreador_identificador: e.target.value }))}
                                    className={miniInputClass}
                                    style={inputStyle}
                                  />
                                  <input
                                    placeholder="Instalado em"
                                    type="date"
                                    value={novoVeiculo.rastreador_instalado_em}
                                    onChange={(e) => setNovoVeiculo((f) => ({ ...f, rastreador_instalado_em: e.target.value }))}
                                    className={miniInputClass}
                                    style={inputStyle}
                                  />
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={novoVeiculo.rastreador_ativo}
                                      onChange={(e) => setNovoVeiculo((f) => ({ ...f, rastreador_ativo: e.target.checked }))}
                                    />
                                    Instalado e ativo
                                  </label>
                                </>
                              )}
                            </div>

                            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">
                              Seguro do veículo
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <input
                                placeholder="Seguradora"
                                value={novoVeiculo.seguro_veiculo_seguradora}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, seguro_veiculo_seguradora: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Nº da apólice"
                                value={novoVeiculo.seguro_veiculo_apolice_numero}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, seguro_veiculo_apolice_numero: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Vencimento"
                                type="date"
                                value={novoVeiculo.seguro_veiculo_vencimento}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, seguro_veiculo_vencimento: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                            </div>

                            <button
                              onClick={() => salvarVeiculo(m.id)}
                              disabled={salvandoVeiculo}
                              className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                            >
                              {salvandoVeiculo ? 'Salvando…' : editingVeiculoId ? 'Salvar alterações' : 'Salvar veículo'}
                            </button>
                          </div>
                        )}

                        {erroCondutor && (
                          <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                            {erroCondutor}
                          </div>
                        )}
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                          Condutores (funcionários que dirigem os veículos do titular)
                        </div>
                        {condutoresPorMotorista[m.id] === undefined && (
                          <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
                        )}
                        {condutoresPorMotorista[m.id]?.length === 0 && (
                          <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum condutor cadastrado.</div>
                        )}
                        {(condutoresPorMotorista[m.id] ?? []).length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {(condutoresPorMotorista[m.id] ?? []).map((c) => {
                              const cnhVencida = cnhVencidaOuAusente(c.cnh_validade)
                              const pontuacaoCondutor = pontuacaoPorMotorista[c.id]
                              return (
                                <div key={c.id} className="text-xs rounded-lg px-3 py-2 flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)' }}>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold">{c.nome}</span>
                                      <StatusBadge status={c.status} />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button onClick={() => editarCondutor(m.id, c)} className="text-[11px] font-bold px-2.5 py-1 rounded-md border" style={{ borderColor: 'var(--rbr-border)' }}>
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => alternarStatusCondutor(m.id, c)}
                                        className="text-[11px] font-bold px-2.5 py-1 rounded-md border"
                                        style={{ borderColor: 'var(--rbr-border)', color: c.status === 'ativo' ? 'var(--rbr-danger)' : '#1F7A3D' }}
                                      >
                                        {c.status === 'ativo' ? 'Desativar' : 'Reativar'}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[color:var(--rbr-muted)]">
                                    <span>CPF: {c.cpf ?? '—'}</span>
                                    <span style={cnhVencida ? { color: 'var(--rbr-danger)', fontWeight: 600 } : undefined}>
                                      CNH ({c.cnh_categoria ?? '—'}) válida até: {c.cnh_validade ? formatDate(c.cnh_validade) : 'não informado'}
                                      {cnhVencida ? ' ⚠' : ''}
                                    </span>
                                    <span>
                                      Pontuação:{' '}
                                      {pontuacaoCondutor?.saldo
                                        ? `${Number(pontuacaoCondutor.saldo.saldo).toFixed(1)} pts`
                                        : pontuacaoCondutor?.saldo === null
                                          ? '0.0 pts (sem histórico)'
                                          : 'carregando…'}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setErroCondutor(null)
                            if (showNovoCondutorId === m.id) {
                              fecharFormCondutor()
                            } else {
                              setEditingCondutorId(null)
                              setNovoCondutor(CONDUTOR_INICIAL)
                              setShowNovoCondutorId(m.id)
                            }
                          }}
                          className="self-start text-xs font-bold px-3.5 py-2 rounded-lg border"
                          style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                        >
                          {showNovoCondutorId === m.id ? 'Cancelar' : '+ Adicionar condutor'}
                        </button>

                        {showNovoCondutorId === m.id && (
                          <div className="rounded-xl px-3.5 py-3 flex flex-col gap-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
                            <div className="text-xs font-bold">{editingCondutorId ? 'Editar condutor' : 'Novo condutor'}</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <input
                                placeholder="Nome *"
                                value={novoCondutor.nome}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, nome: e.target.value }))}
                                className={`${miniInputClass} col-span-2`}
                                style={inputStyle}
                              />
                              <input
                                placeholder="CPF *"
                                value={novoCondutor.cpf}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, cpf: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Celular"
                                value={novoCondutor.celular}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, celular: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <input
                                placeholder="E-mail"
                                value={novoCondutor.email}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, email: e.target.value }))}
                                className={`${miniInputClass} col-span-2`}
                                style={inputStyle}
                              />
                              <input
                                placeholder="Nº de registro da CNH"
                                value={novoCondutor.cnh_numero_registro}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, cnh_numero_registro: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                              <select
                                value={novoCondutor.cnh_categoria}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, cnh_categoria: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              >
                                <option value="">Categoria CNH</option>
                                {CNH_CATEGORIAS.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                              <input
                                placeholder="Validade CNH"
                                type="date"
                                value={novoCondutor.cnh_validade}
                                onChange={(e) => setNovoCondutor((f) => ({ ...f, cnh_validade: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
                            </div>
                            <div className="text-[11px] text-[color:var(--rbr-muted)]">
                              Condutor não tem RNTRC próprio — quem responde é o titular ou o veículo. Categoria da CNH precisa ser
                              compatível com o veículo que ele vai dirigir (checado na hora de alocar a operação).
                            </div>
                            <button
                              onClick={() => salvarCondutor(m.id)}
                              disabled={salvandoCondutor}
                              className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                            >
                              {salvandoCondutor ? 'Salvando…' : editingCondutorId ? 'Salvar alterações' : 'Salvar condutor'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {tab === 'agenciadores' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Agenciadores</div>
            <button
              onClick={() => (showNovoAgenciador ? fecharFormAgenciador() : setShowNovoAgenciador(true))}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoAgenciador ? 'Cancelar' : '+ Novo'}
            </button>
          </div>

          <SearchAndFilterRow
            busca={buscaAgenciador}
            onBusca={setBuscaAgenciador}
            mostrarInativos={mostrarInativosAgenciador}
            onMostrarInativos={setMostrarInativosAgenciador}
            placeholder="Buscar por nome, CPF ou CNPJ…"
          />

          {showNovoAgenciador && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
                {editingAgenciadorId ? 'Editar agenciador' : 'Novo agenciador'}
              </div>
              {erroAgenciador && (
                <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {erroAgenciador}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  placeholder="Nome *"
                  value={novoAgenciador.nome}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, nome: e.target.value }))}
                  className={`${inputClass} md:col-span-2`}
                  style={inputStyle}
                />
                <select
                  value={novoAgenciador.tipo_pessoa_doc}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, tipo_pessoa_doc: e.target.value as TipoPessoaDoc }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="PF">Pessoa física (PF)</option>
                  <option value="PJ">Pessoa jurídica (PJ)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {novoAgenciador.tipo_pessoa_doc === 'PF' ? (
                  <input
                    placeholder="CPF *"
                    value={novoAgenciador.cpf}
                    onChange={(e) => setNovoAgenciador((f) => ({ ...f, cpf: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                ) : (
                  <input
                    placeholder="CNPJ *"
                    value={novoAgenciador.cnpj}
                    onChange={(e) => setNovoAgenciador((f) => ({ ...f, cnpj: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                )}
                <input
                  placeholder="E-mail"
                  value={novoAgenciador.email}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input
                  placeholder="Celular"
                  value={novoAgenciador.celular}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, celular: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="CEP"
                  value={novoAgenciador.cep}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, cep: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Logradouro"
                  value={novoAgenciador.logradouro}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, logradouro: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  placeholder="Número"
                  value={novoAgenciador.numero_endereco}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, numero_endereco: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Complemento"
                  value={novoAgenciador.complemento}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, complemento: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Bairro"
                  value={novoAgenciador.bairro}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, bairro: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Cidade"
                  value={novoAgenciador.cidade}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, cidade: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  placeholder="UF"
                  maxLength={2}
                  value={novoAgenciador.uf}
                  onChange={(e) => setNovoAgenciador((f) => ({ ...f, uf: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <button
                onClick={salvarAgenciador}
                disabled={salvandoAgenciador}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoAgenciador ? 'Salvando…' : editingAgenciadorId ? 'Salvar alterações' : 'Criar agenciador'}
              </button>
            </div>
          )}

          {loadingAgenciadores && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingAgenciadores && agenciadoresFiltrados.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum agenciador encontrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingAgenciadores &&
              agenciadoresFiltrados.map((a) => (
                <div key={a.id} className="bg-white border rounded-[16px] px-4 py-3.5" style={cardStyle}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold">{a.nome}</div>
                      <StatusBadge status={a.status} />
                      <BadgeAprovacao status={a.aprovacao_status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPainelAgenciadorId(painelAgenciadorId === a.id ? null : a.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: 'var(--rbr-border)' }}
                      >
                        {painelAgenciadorId === a.id ? 'Fechar verificação' : 'Verificação e acesso'}
                      </button>
                      <button onClick={() => editarAgenciador(a)} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
                        Editar
                      </button>
                      <button
                        onClick={() => alternarStatusAgenciador(a)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: 'var(--rbr-border)', color: a.status === 'ativo' ? 'var(--rbr-danger)' : '#1F7A3D' }}
                      >
                        {a.status === 'ativo' ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>{formatarDoc(a.cpf ?? a.cnpj) || 'Documento não informado'}</span>
                    <span>
                      {a.cidade ?? '—'}
                      {a.uf ? `/${a.uf}` : ''}
                    </span>
                    <span>{a.email ?? '—'}</span>
                    <span>{a.celular ?? '—'}</span>
                  </div>
                  {painelAgenciadorId === a.id && (
                    <div className="mt-3">
                      <PainelCadastro pessoaId={a.id} onMudou={loadAgenciadores} />
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'fornecedores' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Fornecedores</div>
            <button
              onClick={() => (showNovoFornecedor ? fecharFormFornecedor() : setShowNovoFornecedor(true))}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoFornecedor ? 'Cancelar' : '+ Novo'}
            </button>
          </div>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            Ex.: assessoria de emissão fiscal (RSA/Bsoft), VPO (Repom), seguradora, oficina, posto — qualquer prestador que a RBR
            paga e que hoje não tinha cadastro nenhum aqui.
          </div>

          <SearchAndFilterRow
            busca={buscaFornecedor}
            onBusca={setBuscaFornecedor}
            mostrarInativos={mostrarInativosFornecedor}
            onMostrarInativos={setMostrarInativosFornecedor}
            placeholder="Buscar por nome, razão social, documento ou tipo de serviço…"
          />

          {showNovoFornecedor && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
                {editingFornecedorId ? 'Editar fornecedor' : 'Novo fornecedor'}
              </div>
              {erroFornecedor && (
                <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {erroFornecedor}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  placeholder={novoFornecedor.tipo_pessoa_doc === 'PJ' ? 'Razão social *' : 'Nome *'}
                  value={novoFornecedor.tipo_pessoa_doc === 'PJ' ? novoFornecedor.razao_social : novoFornecedor.nome}
                  onChange={(e) =>
                    setNovoFornecedor((f) =>
                      f.tipo_pessoa_doc === 'PJ' ? { ...f, razao_social: e.target.value } : { ...f, nome: e.target.value },
                    )
                  }
                  className={`${inputClass} md:col-span-2`}
                  style={inputStyle}
                />
                <select
                  value={novoFornecedor.tipo_pessoa_doc}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, tipo_pessoa_doc: e.target.value as TipoPessoaDoc }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="PJ">Pessoa jurídica (PJ)</option>
                  <option value="PF">Pessoa física (PF)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {novoFornecedor.tipo_pessoa_doc === 'PJ' ? (
                  <input
                    placeholder="CNPJ *"
                    value={novoFornecedor.cnpj}
                    onChange={(e) => setNovoFornecedor((f) => ({ ...f, cnpj: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                ) : (
                  <input
                    placeholder="CPF *"
                    value={novoFornecedor.cpf}
                    onChange={(e) => setNovoFornecedor((f) => ({ ...f, cpf: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                )}
                <input
                  placeholder="Tipo de serviço fornecido"
                  value={novoFornecedor.tipo_servico_fornecido}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, tipo_servico_fornecido: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  placeholder="E-mail"
                  value={novoFornecedor.email}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Celular"
                  value={novoFornecedor.celular}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, celular: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="PIX (para pagamento)"
                  value={novoFornecedor.pix}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, pix: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className={labelClass}>Dados bancários</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  placeholder="Banco (código, ex.: 341)"
                  value={novoFornecedor.banco_codigo}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, banco_codigo: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Agência"
                  value={novoFornecedor.banco_agencia}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, banco_agencia: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Conta (com dígito)"
                  value={novoFornecedor.banco_conta}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, banco_conta: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <select
                  value={novoFornecedor.banco_tipo_conta}
                  onChange={(e) => setNovoFornecedor((f) => ({ ...f, banco_tipo_conta: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Tipo de conta</option>
                  <option value="corrente">Conta corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="pagamento">Conta de pagamento</option>
                </select>
              </div>
              <div className="text-[11px] text-[color:var(--rbr-muted)] -mt-1">
                Mudou o Pix ou a conta? O financeiro vai pedir confirmação antes do próximo pagamento (proteção contra golpe).
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <div className={labelClass}>Categoria padrão (financeiro)</div>
                  <select
                    value={novoFornecedor.categoria_id}
                    onChange={(e) => setNovoFornecedor((f) => ({ ...f, categoria_id: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">Sem categoria padrão</option>
                    {categoriasDespesa.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <div className={labelClass}>Prazo de pagamento padrão</div>
                  <select
                    value={novoFornecedor.condicao_prazo_id}
                    onChange={(e) => setNovoFornecedor((f) => ({ ...f, condicao_prazo_id: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">À vista na liberação (padrão)</option>
                    {condicoesPagar.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={salvarFornecedor}
                disabled={salvandoFornecedor}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoFornecedor ? 'Salvando…' : editingFornecedorId ? 'Salvar alterações' : 'Criar fornecedor'}
              </button>
            </div>
          )}

          {loadingFornecedores && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingFornecedores && fornecedoresFiltrados.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum fornecedor encontrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingFornecedores &&
              fornecedoresFiltrados.map((f) => (
                <div key={f.id} className="bg-white border rounded-[16px] px-4 py-3.5" style={cardStyle}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold">{f.razao_social ?? f.nome ?? 'Sem nome'}</div>
                      <StatusBadge status={f.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => editarFornecedor(f)} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
                        Editar
                      </button>
                      <button
                        onClick={() => alternarStatusFornecedor(f)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: 'var(--rbr-border)', color: f.status === 'ativo' ? 'var(--rbr-danger)' : '#1F7A3D' }}
                      >
                        {f.status === 'ativo' ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>{f.cnpj ?? f.cpf ?? 'Documento não informado'}</span>
                    <span>{f.tipo_servico_fornecido ?? '—'}</span>
                    <span>{f.email ?? '—'}</span>
                    <span>{f.celular ?? '—'}</span>
                    <span>{f.pix ? `PIX: ${f.pix}` : '—'}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'prestadores' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Prestadores parceiros</div>
            <button
              onClick={() => (showNovoPrestador ? fecharFormPrestador() : setShowNovoPrestador(true))}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoPrestador ? 'Cancelar' : '+ Novo'}
            </button>
          </div>
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            Transportador terceirizado acionado pontualmente (motorista autônomo PF ou transportadora PJ) — diferente de
            Motoristas, que é a frota própria/parceira fixa da RBR. Ainda não tem app/login próprio nem gestão de frota aqui;
            é um cadastro de contato + condições comerciais.
          </div>

          <SearchAndFilterRow
            busca={buscaPrestador}
            onBusca={setBuscaPrestador}
            mostrarInativos={mostrarInativosPrestador}
            onMostrarInativos={setMostrarInativosPrestador}
            placeholder="Buscar por nome, razão social, CNPJ ou CPF…"
          />

          {showNovoPrestador && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
                {editingPrestadorId ? 'Editar prestador parceiro' : 'Novo prestador parceiro'}
              </div>
              {erroPrestador && (
                <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {erroPrestador}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  placeholder={novoPrestador.tipo_pessoa_doc === 'PJ' ? 'Razão social *' : 'Nome *'}
                  value={novoPrestador.tipo_pessoa_doc === 'PJ' ? novoPrestador.razao_social : novoPrestador.nome}
                  onChange={(e) =>
                    setNovoPrestador((f) =>
                      f.tipo_pessoa_doc === 'PJ' ? { ...f, razao_social: e.target.value } : { ...f, nome: e.target.value },
                    )
                  }
                  className={`${inputClass} md:col-span-2`}
                  style={inputStyle}
                />
                <select
                  value={novoPrestador.tipo_pessoa_doc}
                  onChange={(e) => setNovoPrestador((f) => ({ ...f, tipo_pessoa_doc: e.target.value as TipoPessoaDoc }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="PJ">Pessoa jurídica (PJ)</option>
                  <option value="PF">Pessoa física (PF)</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {novoPrestador.tipo_pessoa_doc === 'PJ' ? (
                  <input
                    placeholder="CNPJ *"
                    value={novoPrestador.cnpj}
                    onChange={(e) => setNovoPrestador((f) => ({ ...f, cnpj: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                ) : (
                  <input
                    placeholder="CPF *"
                    value={novoPrestador.cpf}
                    onChange={(e) => setNovoPrestador((f) => ({ ...f, cpf: e.target.value }))}
                    className={inputClass}
                    style={inputStyle}
                  />
                )}
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={novoPrestador.cnh_ou_cnpj_validado}
                    onChange={(e) => setNovoPrestador((f) => ({ ...f, cnh_ou_cnpj_validado: e.target.checked }))}
                  />
                  Documento validado
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="E-mail"
                  value={novoPrestador.email}
                  onChange={(e) => setNovoPrestador((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Celular"
                  value={novoPrestador.celular}
                  onChange={(e) => setNovoPrestador((f) => ({ ...f, celular: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className={labelClass}>RNTRC</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input
                  placeholder="Nº RNTRC"
                  value={novoPrestador.rntrc_numero}
                  onChange={(e) => setNovoPrestador((f) => ({ ...f, rntrc_numero: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <select
                  value={novoPrestador.rntrc_status}
                  onChange={(e) => setNovoPrestador((f) => ({ ...f, rntrc_status: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Status</option>
                  {RNTRC_STATUS_OPCOES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  placeholder="Validade RNTRC"
                  value={novoPrestador.rntrc_validade}
                  onChange={(e) => setNovoPrestador((f) => ({ ...f, rntrc_validade: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <textarea
                placeholder="Condições comerciais"
                value={novoPrestador.condicoes_comerciais}
                onChange={(e) => setNovoPrestador((f) => ({ ...f, condicoes_comerciais: e.target.value }))}
                className={`${inputClass} min-h-[70px]`}
                style={inputStyle}
              />

              <button
                onClick={salvarPrestador}
                disabled={salvandoPrestador}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoPrestador ? 'Salvando…' : editingPrestadorId ? 'Salvar alterações' : 'Criar prestador parceiro'}
              </button>
            </div>
          )}

          {loadingPrestadores && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingPrestadores && prestadoresFiltrados.length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum prestador parceiro encontrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingPrestadores &&
              prestadoresFiltrados.map((p) => {
                const rntrcVencido = dataVencida(p.rntrc_validade)
                return (
                  <div key={p.id} className="bg-white border rounded-[16px] px-4 py-3.5" style={cardStyle}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-bold">{p.razao_social ?? p.nome ?? 'Sem nome'}</div>
                        <StatusBadge status={p.status} />
                        {!p.cnh_ou_cnpj_validado && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: '#FCEFE0', color: '#A15C00' }}>
                            Não validado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => editarPrestador(p)} className="text-xs font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
                          Editar
                        </button>
                        <button
                          onClick={() => alternarStatusPrestador(p)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                          style={{ borderColor: 'var(--rbr-border)', color: p.status === 'ativo' ? 'var(--rbr-danger)' : '#1F7A3D' }}
                        >
                          {p.status === 'ativo' ? 'Desativar' : 'Reativar'}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                      <span>{p.cnpj ?? p.cpf ?? 'Documento não informado'}</span>
                      <span>{p.email ?? '—'}</span>
                      <span>{p.celular ?? '—'}</span>
                      <span style={rntrcVencido ? { color: 'var(--rbr-danger)', fontWeight: 600 } : undefined}>
                        RNTRC: {p.rntrc_status ?? '—'}
                        {p.rntrc_validade ? ` (até ${formatDate(p.rntrc_validade)})` : ''}
                        {rntrcVencido ? ' ⚠' : ''}
                      </span>
                    </div>
                    {p.condicoes_comerciais && (
                      <div className="text-xs text-[color:var(--rbr-muted)] mt-1.5 italic">{p.condicoes_comerciais}</div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
