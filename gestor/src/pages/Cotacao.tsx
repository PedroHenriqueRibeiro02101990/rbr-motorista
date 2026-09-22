import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDateTime, STATUS_COTACAO_LABEL } from '@rbr/shared/format'
import { IconQuote, IconChevronRight, IconCheck } from '@rbr/shared/icons'
import { parseNFeXml } from '@rbr/shared/nfeParser'

type Cotacao = Database['public']['Tables']['cotacoes']['Row']
type CotacaoUpdate = Database['public']['Tables']['cotacoes']['Update']
type StatusCotacao = Database['public']['Enums']['status_cotacao']
type Cliente = Database['public']['Tables']['clientes']['Row']
type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Projeto = Database['public']['Tables']['projetos']['Row']
type PisoCoeficiente = Database['public']['Tables']['piso_antt_coeficientes']['Row']

type CotacaoEnriquecida = Cotacao & { clienteNome?: string | null }

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none w-full'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5 block'

const FILTROS: { value: StatusCotacao | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'convertida', label: 'Convertida' },
]

// Tabelas de piso ANTT — usadas só localmente pra escolher a linha certa em
// piso_antt_coeficientes. `tabela` não é coluna de `cotacoes`, então nunca é salva.
const TABELAS: { value: string; label: string }[] = [
  { value: 'A', label: 'A — Composição veicular completa (veículo + implemento)' },
  { value: 'B', label: 'B — Somente unidade de tração' },
  { value: 'C', label: 'C — Alto desempenho - composição completa' },
  { value: 'D', label: 'D — Alto desempenho - somente unidade de tração' },
]

const TIPOS_CARGA = [
  'Carga Geral',
  'Carga Granel Pressurizada',
  'Conteinerizada',
  'Frigorificada ou Aquecida',
  'Granel liquido',
  'Granel solido',
  'Neogranel',
  'Perigosa (carga geral)',
  'Perigosa (conteinerizada)',
  'Perigosa (frigorificada ou aquecida)',
  'Perigosa (granel liquido)',
  'Perigosa (granel solido)',
]

const FORM_INICIAL = {
  cliente_id: '',
  origem: 'gestor',
  agenciador_id: '',
  projeto_id: '',
  nf_chave_acesso: '',
  nf_remetente_razao_social: '',
  nf_remetente_cnpj: '',
  nf_destinatario_razao_social: '',
  nf_destinatario_cnpj: '',
  cidade_origem: '',
  uf_origem: '',
  cidade_destino: '',
  uf_destino: '',
  peso_bruto_kg: '',
  valor_nf: '',
  natureza_operacao: '',
  ncms_produtos: '',
  tabela: '',
  tipo_carga: '',
  eixos: '',
  distancia_km: '',
  checkbox_carga_perigosa_manual: false,
  checkbox_carga_indivisivel_manual: false,
  flag_peso_acima_limiar: false,
  flag_valor_acima_teto_seguro: false,
  pedagio: '',
  valor_seguro_tag: '',
  valor_total: '',
  lucro_rbr: '',
  xml_danfe_url: '',
}

type CotacaoFormState = typeof FORM_INICIAL

interface PisoInfo {
  coeficiente: PisoCoeficiente
  calculado: number
}

function numOrNull(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function statusBadgeBg(status: StatusCotacao): string {
  if (status === 'convertida') return 'var(--rbr-positive)'
  if (status === 'enviada') return 'var(--rbr-gold)'
  return 'var(--rbr-muted)'
}

function margemBadge(margem: number | null, min: number, max: number): { bg: string; color: string; label: string } {
  if (margem == null) return { bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)', label: '—' }
  const label = `${(margem * 100).toFixed(1)}%`
  if (margem < min) return { bg: '#FBE9E9', color: 'var(--rbr-danger)', label }
  if (margem > max) return { bg: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)', label }
  return { bg: '#E7F5EC', color: 'var(--rbr-positive)', label }
}

export default function Cotacao() {
  const [cotacoes, setCotacoes] = useState<CotacaoEnriquecida[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<StatusCotacao | 'todas'>('todas')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [agenciadores, setAgenciadores] = useState<Pessoa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [clienteFiltro, setClienteFiltro] = useState('')

  const [margemMin, setMargemMin] = useState(0.26)
  const [margemMax, setMargemMax] = useState(0.4)
  const [pesoLimiarKg, setPesoLimiarKg] = useState<number | null>(null)

  const [form, setForm] = useState<CotacaoFormState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<StatusCotacao>('rascunho')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [eixosOpcoes, setEixosOpcoes] = useState<number[]>([])
  const [pisoInfo, setPisoInfo] = useState<PisoInfo | null>(null)
  const [carregandoPiso, setCarregandoPiso] = useState(false)

  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoClienteRazao, setNovoClienteRazao] = useState('')
  const [novoClienteCnpj, setNovoClienteCnpj] = useState('')
  const [criandoCliente, setCriandoCliente] = useState(false)
  const [erroNovoCliente, setErroNovoCliente] = useState<string | null>(null)

  const [xmlError, setXmlError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    const { data, error } = await supabase
      .from('cotacoes')
      .select('*, clientes(razao_social, nome_fantasia)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) setListError(error.message)
    const mapeadas: CotacaoEnriquecida[] = (data ?? []).map((c) => ({
      ...c,
      clienteNome: (c as any).clientes?.nome_fantasia ?? (c as any).clientes?.razao_social ?? null,
    }))
    setCotacoes(mapeadas)
    setLoading(false)
  }, [])

  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from('clientes').select('*').order('razao_social', { ascending: true }).limit(500)
    setClientes(data ?? [])
  }, [])

  const loadAgenciadores = useCallback(async () => {
    const { data } = await supabase
      .from('pessoas')
      .select('*')
      .eq('papel', 'agenciador')
      .order('nome', { ascending: true })
      .limit(300)
    setAgenciadores(data ?? [])
  }, [])

  const loadProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('nome', { ascending: true }).limit(300)
    setProjetos(data ?? [])
  }, [])

  const loadParametros = useCallback(async () => {
    const { data } = await supabase
      .from('parametros_sistema')
      .select('chave, valor')
      .in('chave', ['margem_cotacao_min', 'margem_cotacao_max', 'peso_bruto_limiar_eixo2_kg'])
    for (const row of data ?? []) {
      const valor = typeof row.valor === 'number' ? row.valor : Number(row.valor)
      if (!Number.isFinite(valor)) continue
      if (row.chave === 'margem_cotacao_min') setMargemMin(valor)
      else if (row.chave === 'margem_cotacao_max') setMargemMax(valor)
      else if (row.chave === 'peso_bruto_limiar_eixo2_kg') setPesoLimiarKg(valor)
    }
  }, [])

  useEffect(() => {
    load()
    loadClientes()
    loadAgenciadores()
    loadProjetos()
    loadParametros()
  }, [load, loadClientes, loadAgenciadores, loadProjetos, loadParametros])

  // Opções de eixos disponíveis pra combinação tabela+tipo de carga — consultado ao
  // vivo (em vez de fixar a matriz na tela) pra nunca ficar desatualizado se a tabela
  // piso_antt_coeficientes mudar.
  useEffect(() => {
    if (!form || !form.tabela || !form.tipo_carga) {
      setEixosOpcoes([])
      return
    }
    let cancelado = false
    supabase
      .from('piso_antt_coeficientes')
      .select('eixos')
      .eq('tabela', form.tabela)
      .eq('tipo_carga', form.tipo_carga)
      .then(({ data, error }) => {
        if (cancelado || error) return
        const uniq = Array.from(new Set((data ?? []).map((r) => r.eixos))).sort((a, b) => a - b)
        setEixosOpcoes(uniq)
      })
    return () => {
      cancelado = true
    }
  }, [form?.tabela, form?.tipo_carga])

  // Se a combinação mudou e o eixos escolhido não é mais válido, limpa a seleção.
  useEffect(() => {
    if (!form || !form.eixos) return
    if (eixosOpcoes.length > 0 && !eixosOpcoes.includes(Number(form.eixos))) {
      setForm((f) => (f ? { ...f, eixos: '' } : f))
    }
  }, [eixosOpcoes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Piso ANTT: cc_fixo + ccd_por_km * distancia_km, pela linha vigente mais recente.
  useEffect(() => {
    if (!form) {
      setPisoInfo(null)
      return
    }
    const { tabela, tipo_carga: tipoCarga } = form
    const eixosNum = numOrNull(form.eixos)
    const distNum = numOrNull(form.distancia_km)
    if (!tabela || !tipoCarga || eixosNum == null || distNum == null) {
      setPisoInfo(null)
      return
    }
    let cancelado = false
    setCarregandoPiso(true)
    supabase
      .from('piso_antt_coeficientes')
      .select('*')
      .eq('tabela', tabela)
      .eq('tipo_carga', tipoCarga)
      .eq('eixos', eixosNum)
      .lte('data_vigencia', new Date().toISOString().slice(0, 10))
      .order('data_vigencia', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelado) return
        setCarregandoPiso(false)
        if (error || !data || data.length === 0) {
          setPisoInfo(null)
          return
        }
        const coef = data[0]
        setPisoInfo({ coeficiente: coef, calculado: coef.cc_fixo + coef.ccd_por_km * distNum })
      })
    return () => {
      cancelado = true
    }
  }, [form?.tabela, form?.tipo_carga, form?.eixos, form?.distancia_km])

  // Peso acima do limiar (eixo 2) — calculado automaticamente a partir do parâmetro
  // vivo `peso_bruto_limiar_eixo2_kg`. Se o parâmetro não existir, o campo vira um
  // checkbox manual (ver renderização abaixo).
  useEffect(() => {
    if (!form || pesoLimiarKg == null) return
    const auto = form.peso_bruto_kg.trim() !== '' && (numOrNull(form.peso_bruto_kg) ?? 0) >= pesoLimiarKg
    if (auto !== form.flag_peso_acima_limiar) {
      setForm((f) => (f ? { ...f, flag_peso_acima_limiar: auto } : f))
    }
  }, [form?.peso_bruto_kg, pesoLimiarKg]) // eslint-disable-line react-hooks/exhaustive-deps

  const valorTotalNum = form ? numOrNull(form.valor_total) : null
  const lucroNum = form ? numOrNull(form.lucro_rbr) : null
  const margemAjustada = valorTotalNum != null && valorTotalNum !== 0 && lucroNum != null ? lucroNum / valorTotalNum : null
  const margem = margemBadge(margemAjustada, margemMin, margemMax)

  const clientesFiltrados = useMemo(() => {
    const termo = clienteFiltro.trim().toLowerCase()
    if (!termo) return clientes
    return clientes.filter(
      (c) =>
        (c.razao_social ?? '').toLowerCase().includes(termo) ||
        (c.nome_fantasia ?? '').toLowerCase().includes(termo) ||
        (c.cnpj ?? '').includes(termo),
    )
  }, [clientes, clienteFiltro])

  const projetosFiltrados = useMemo(() => {
    if (!form || !form.cliente_id) return projetos
    return projetos.filter((p) => !p.cliente_id || p.cliente_id === form.cliente_id)
  }, [projetos, form?.cliente_id]) // eslint-disable-line react-hooks/exhaustive-deps

  function abrirNovaCotacao() {
    setForm({ ...FORM_INICIAL })
    setEditingId(null)
    setEditingStatus('rascunho')
    setFormError(null)
    setSuccessMsg(null)
    setXmlError(null)
    setShowNovoCliente(false)
    setClienteFiltro('')
  }

  function abrirEdicao(c: Cotacao) {
    setForm({
      cliente_id: c.cliente_id ?? '',
      origem: c.origem || 'gestor',
      agenciador_id: c.agenciador_id ?? '',
      projeto_id: c.projeto_id ?? '',
      nf_chave_acesso: c.nf_chave_acesso ?? '',
      nf_remetente_razao_social: c.nf_remetente_razao_social ?? '',
      nf_remetente_cnpj: c.nf_remetente_cnpj ?? '',
      nf_destinatario_razao_social: c.nf_destinatario_razao_social ?? '',
      nf_destinatario_cnpj: c.nf_destinatario_cnpj ?? '',
      cidade_origem: c.cidade_origem ?? '',
      uf_origem: c.uf_origem ?? '',
      cidade_destino: c.cidade_destino ?? '',
      uf_destino: c.uf_destino ?? '',
      peso_bruto_kg: c.peso_bruto_kg != null ? String(c.peso_bruto_kg) : '',
      valor_nf: c.valor_nf != null ? String(c.valor_nf) : '',
      natureza_operacao: c.natureza_operacao ?? '',
      ncms_produtos: c.ncms_produtos && c.ncms_produtos.length > 0 ? c.ncms_produtos.join(', ') : '',
      // `tabela` não existe em `cotacoes` — não dá pra recuperar a escolhida
      // anteriormente, então a tela pede pra reselecionar ao reabrir pra editar
      // (necessário só pra recalcular o piso ANTT; o valor já salvo continua visível).
      tabela: '',
      tipo_carga: c.tipo_carga ?? '',
      eixos: c.eixos != null ? String(c.eixos) : '',
      distancia_km: c.distancia_km != null ? String(c.distancia_km) : '',
      checkbox_carga_perigosa_manual: c.checkbox_carga_perigosa_manual,
      checkbox_carga_indivisivel_manual: c.checkbox_carga_indivisivel_manual,
      flag_peso_acima_limiar: c.flag_peso_acima_limiar,
      flag_valor_acima_teto_seguro: c.flag_valor_acima_teto_seguro,
      pedagio: c.pedagio != null ? String(c.pedagio) : '',
      valor_seguro_tag: c.valor_seguro_tag != null ? String(c.valor_seguro_tag) : '',
      valor_total: c.valor_total != null ? String(c.valor_total) : '',
      lucro_rbr: c.lucro_rbr != null ? String(c.lucro_rbr) : '',
      xml_danfe_url: c.xml_danfe_url ?? '',
    })
    setEditingId(c.id)
    setEditingStatus(c.status)
    setFormError(null)
    setSuccessMsg(null)
    setXmlError(null)
    setShowNovoCliente(false)
    setClienteFiltro('')
    setPisoInfo(null)
  }

  function fecharForm() {
    setForm(null)
    setEditingId(null)
  }

  async function handleXmlUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !form) return
    setXmlError(null)
    try {
      const texto = await file.text()
      const dados = parseNFeXml(texto)
      if (!dados) {
        setXmlError('Não foi possível ler este arquivo como XML de NF-e. Verifique se é o arquivo correto.')
        return
      }
      setForm((f) =>
        f
          ? {
              ...f,
              nf_chave_acesso: dados.chaveAcesso ?? f.nf_chave_acesso,
              nf_remetente_razao_social: dados.remetente.razaoSocial ?? f.nf_remetente_razao_social,
              nf_remetente_cnpj: dados.remetente.cnpj ?? f.nf_remetente_cnpj,
              nf_destinatario_razao_social: dados.destinatario.razaoSocial ?? f.nf_destinatario_razao_social,
              nf_destinatario_cnpj: dados.destinatario.cnpjOuCpf ?? f.nf_destinatario_cnpj,
              cidade_origem: dados.remetente.cidade ?? f.cidade_origem,
              uf_origem: dados.remetente.uf ?? f.uf_origem,
              cidade_destino: dados.destinatario.cidade ?? f.cidade_destino,
              uf_destino: dados.destinatario.uf ?? f.uf_destino,
              peso_bruto_kg: dados.pesoBrutoKg != null ? String(dados.pesoBrutoKg) : f.peso_bruto_kg,
              valor_nf: dados.valorNota != null ? String(dados.valorNota) : f.valor_nf,
              natureza_operacao: dados.naturezaOperacao ?? f.natureza_operacao,
              ncms_produtos: dados.ncmsProdutos.length > 0 ? dados.ncmsProdutos.join(', ') : f.ncms_produtos,
            }
          : f,
      )
    } catch {
      setXmlError('Erro ao ler o arquivo selecionado.')
    }
  }

  async function criarClienteInline() {
    setErroNovoCliente(null)
    if (!novoClienteRazao.trim()) {
      setErroNovoCliente('Informe a razão social.')
      return
    }
    setCriandoCliente(true)
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({ razao_social: novoClienteRazao.trim(), cnpj: novoClienteCnpj.trim() || null, origem: 'gestor' })
        .select()
        .single()
      if (error || !data) throw error ?? new Error('Falha ao criar cliente.')
      await loadClientes()
      setForm((f) => (f ? { ...f, cliente_id: data.id } : f))
      setNovoClienteRazao('')
      setNovoClienteCnpj('')
      setShowNovoCliente(false)
    } catch (e) {
      setErroNovoCliente(e instanceof Error ? e.message : 'Erro ao criar cliente.')
    } finally {
      setCriandoCliente(false)
    }
  }

  function calcularPreco() {
    if (!form) return
    setFormError(null)
    const piso = pisoInfo?.calculado ?? null
    if (piso == null) {
      setFormError('Preencha tabela, tipo de carga, eixos e distância pra calcular o piso ANTT antes de usar o cálculo automático.')
      return
    }
    const pedagio = numOrNull(form.pedagio) ?? 0
    const seguro = numOrNull(form.valor_seguro_tag) ?? 0
    const temTotal = form.valor_total.trim() !== ''
    const temLucro = form.lucro_rbr.trim() !== ''
    if (temLucro && !temTotal) {
      const lucro = numOrNull(form.lucro_rbr) ?? 0
      const total = piso + pedagio + seguro + lucro
      setForm((f) => (f ? { ...f, valor_total: String(round2(total)) } : f))
    } else if (temTotal && !temLucro) {
      const total = numOrNull(form.valor_total) ?? 0
      const lucro = total - (piso + pedagio + seguro)
      setForm((f) => (f ? { ...f, lucro_rbr: String(round2(lucro)) } : f))
    } else {
      setFormError('Preencha apenas um dos dois campos (valor total OU lucro RBR) pra calcular o outro automaticamente.')
    }
  }

  function montarPatch(f: CotacaoFormState): CotacaoUpdate {
    const ncms = f.ncms_produtos
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const flagPeso = pesoLimiarKg != null ? (f.peso_bruto_kg.trim() !== '' && (numOrNull(f.peso_bruto_kg) ?? 0) >= pesoLimiarKg) : f.flag_peso_acima_limiar
    return {
      cliente_id: f.cliente_id || null,
      origem: f.origem.trim() || 'gestor',
      agenciador_id: f.origem === 'agenciador' ? f.agenciador_id || null : null,
      projeto_id: f.projeto_id || null,
      nf_chave_acesso: f.nf_chave_acesso.trim() || null,
      nf_remetente_razao_social: f.nf_remetente_razao_social.trim() || null,
      nf_remetente_cnpj: f.nf_remetente_cnpj.trim() || null,
      nf_destinatario_razao_social: f.nf_destinatario_razao_social.trim() || null,
      nf_destinatario_cnpj: f.nf_destinatario_cnpj.trim() || null,
      cidade_origem: f.cidade_origem.trim() || null,
      uf_origem: f.uf_origem.trim().toUpperCase() || null,
      cidade_destino: f.cidade_destino.trim() || null,
      uf_destino: f.uf_destino.trim().toUpperCase() || null,
      peso_bruto_kg: numOrNull(f.peso_bruto_kg),
      valor_nf: numOrNull(f.valor_nf),
      natureza_operacao: f.natureza_operacao.trim() || null,
      ncms_produtos: ncms.length > 0 ? ncms : null,
      tipo_carga: f.tipo_carga || null,
      eixos: numOrNull(f.eixos),
      distancia_km: numOrNull(f.distancia_km),
      checkbox_carga_perigosa_manual: f.checkbox_carga_perigosa_manual,
      checkbox_carga_indivisivel_manual: f.checkbox_carga_indivisivel_manual,
      flag_peso_acima_limiar: flagPeso,
      flag_valor_acima_teto_seguro: f.flag_valor_acima_teto_seguro,
      pedagio: numOrNull(f.pedagio),
      valor_seguro_tag: numOrNull(f.valor_seguro_tag),
      piso_antt_calculado: pisoInfo?.calculado ?? null,
      valor_total: numOrNull(f.valor_total),
      lucro_rbr: numOrNull(f.lucro_rbr),
      margem_ajustada: margemAjustada,
      xml_danfe_url: f.xml_danfe_url.trim() || null,
    }
  }

  async function salvar() {
    if (!form) return
    setFormError(null)
    setSuccessMsg(null)
    if (!form.cliente_id) {
      setFormError('Selecione ou cadastre um cliente antes de salvar.')
      return
    }
    setSaving(true)
    try {
      const patch = montarPatch(form)
      if (editingId) {
        const { error } = await supabase.from('cotacoes').update(patch).eq('id', editingId)
        if (error) throw error
        setSuccessMsg('Cotação atualizada com sucesso.')
      } else {
        const { data, error } = await supabase.from('cotacoes').insert(patch).select().single()
        if (error || !data) throw error ?? new Error('Falha ao criar cotação.')
        setEditingId(data.id)
        setEditingStatus(data.status)
        setSuccessMsg('Cotação criada com sucesso.')
      }
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar cotação.')
    } finally {
      setSaving(false)
    }
  }

  async function enviar() {
    if (!editingId) return
    setSaving(true)
    setFormError(null)
    setSuccessMsg(null)
    const { error } = await supabase.from('cotacoes').update({ status: 'enviada' }).eq('id', editingId)
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setEditingStatus('enviada')
    setSuccessMsg('Cotação marcada como enviada.')
    await load()
  }

  async function converter() {
    if (!form || !editingId) return
    setFormError(null)
    setSuccessMsg(null)
    if (!form.cliente_id) {
      setFormError('Selecione um cliente antes de converter em operação.')
      return
    }
    setSaving(true)
    try {
      const patch: CotacaoUpdate = { ...montarPatch(form), status: 'convertida' }
      const { error } = await supabase.from('cotacoes').update(patch).eq('id', editingId)
      if (error) throw error
      setEditingStatus('convertida')
      setSuccessMsg('Cotação convertida — operação criada automaticamente.')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao converter cotação em operação.')
    } finally {
      setSaving(false)
    }
  }

  const lista = (cotacoes ?? []).filter((c) => filtro === 'todas' || c.status === filtro)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)] flex items-center gap-2">
          <IconQuote width={26} height={26} style={{ color: 'var(--rbr-gold)' }} />
          Cotação &amp; Funil
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as StatusCotacao | 'todas')}
            className="border rounded-xl px-3 py-2 text-sm font-semibold outline-none"
            style={{ borderColor: 'var(--rbr-border)' }}
          >
            {FILTROS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => (form ? fecharForm() : abrirNovaCotacao())}
            className="text-sm font-bold px-4 py-2 rounded-xl"
            style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
          >
            {form ? 'Fechar formulário' : '+ Nova cotação'}
          </button>
        </div>
      </div>

      {listError && (
        <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {listError}
        </div>
      )}

      {form && (
        <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-4" style={cardStyle}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">
              {editingId ? 'Editar cotação' : 'Nova cotação'}
            </div>
            {editingId && (
              <span
                className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                style={{ background: statusBadgeBg(editingStatus) }}
              >
                {STATUS_COTACAO_LABEL[editingStatus]}
              </span>
            )}
          </div>

          {formError && (
            <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {formError}
            </div>
          )}
          {successMsg && (
            <div
              className="text-xs rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}
            >
              <IconCheck width={14} height={14} />
              {successMsg}
            </div>
          )}

          {editingStatus === 'convertida' && (
            <div className="rounded-xl px-3.5 py-3 flex flex-col gap-1" style={{ background: 'var(--rbr-warning-bg)' }}>
              <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">Cotação já convertida</div>
              <div className="text-xs text-[color:var(--rbr-navy-dark)]">
                A operação correspondente já foi criada automaticamente. Alterações salvas aqui não são refletidas nela.{' '}
                <Link to="/operacoes" className="underline font-semibold">
                  Ver operações
                </Link>
              </div>
            </div>
          )}

          {/* Cliente */}
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Cliente *</label>
            <div className="flex gap-2 flex-wrap items-start">
              <input
                placeholder="Buscar por razão social, fantasia ou CNPJ…"
                value={clienteFiltro}
                onChange={(e) => setClienteFiltro(e.target.value)}
                className={inputClass}
                style={{ ...inputStyle, maxWidth: 280 }}
              />
              <select
                value={form.cliente_id}
                onChange={(e) => setForm((f) => (f ? { ...f, cliente_id: e.target.value } : f))}
                className={inputClass}
                style={{ ...inputStyle, maxWidth: 320 }}
              >
                <option value="">Selecione um cliente…</option>
                {clientesFiltrados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia ?? c.razao_social ?? c.id} {c.cnpj ? `· ${c.cnpj}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNovoCliente((v) => !v)}
                className="text-xs font-bold px-3 py-2 rounded-lg border"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
              >
                {showNovoCliente ? 'Cancelar' : '+ Novo cliente'}
              </button>
            </div>
            {showNovoCliente && (
              <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'var(--rbr-muted-bg)' }}>
                {erroNovoCliente && (
                  <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                    {erroNovoCliente}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    placeholder="Razão social *"
                    value={novoClienteRazao}
                    onChange={(e) => setNovoClienteRazao(e.target.value)}
                    className={inputClass}
                    style={{ ...inputStyle, background: '#fff' }}
                  />
                  <input
                    placeholder="CNPJ"
                    value={novoClienteCnpj}
                    onChange={(e) => setNovoClienteCnpj(e.target.value)}
                    className={inputClass}
                    style={{ ...inputStyle, background: '#fff' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={criarClienteInline}
                  disabled={criandoCliente}
                  className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                  style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                >
                  {criandoCliente ? 'Criando…' : 'Criar cliente'}
                </button>
              </div>
            )}
          </div>

          {/* Origem / agenciador / projeto */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Origem</label>
              <select
                value={form.origem}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, origem: e.target.value, agenciador_id: e.target.value === 'agenciador' ? f.agenciador_id : '' } : f))
                }
                className={inputClass}
                style={inputStyle}
              >
                <option value="gestor">Gestor (RBR direta)</option>
                <option value="agenciador">Agenciador</option>
              </select>
            </div>
            {form.origem === 'agenciador' && (
              <div>
                <label className={labelClass}>Agenciador</label>
                <select
                  value={form.agenciador_id}
                  onChange={(e) => setForm((f) => (f ? { ...f, agenciador_id: e.target.value } : f))}
                  className={inputClass}
                  style={inputStyle}
                >
                  <option value="">Selecione…</option>
                  {agenciadores.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Projeto (opcional)</label>
              <select
                value={form.projeto_id}
                onChange={(e) => setForm((f) => (f ? { ...f, projeto_id: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Nenhum</option>
                {projetosFiltrados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* NF-e upload */}
          <div className="rounded-xl p-3.5 flex flex-col gap-2" style={{ background: 'var(--rbr-muted-bg)' }}>
            <label className={labelClass}>Carregar XML da NF-e (opcional)</label>
            <input type="file" accept=".xml,text/xml" onChange={handleXmlUpload} className="text-xs" />
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              Leitura 100% local do arquivo — preenche os campos abaixo automaticamente, mas todos continuam editáveis depois.
            </div>
            {xmlError && (
              <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                {xmlError}
              </div>
            )}
          </div>

          {/* Dados da NF-e */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Chave de acesso da NF-e</label>
              <input
                value={form.nf_chave_acesso}
                onChange={(e) => setForm((f) => (f ? { ...f, nf_chave_acesso: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Natureza da operação</label>
              <input
                value={form.natureza_operacao}
                onChange={(e) => setForm((f) => (f ? { ...f, natureza_operacao: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Remetente — razão social</label>
              <input
                value={form.nf_remetente_razao_social}
                onChange={(e) => setForm((f) => (f ? { ...f, nf_remetente_razao_social: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Remetente — CNPJ</label>
              <input
                value={form.nf_remetente_cnpj}
                onChange={(e) => setForm((f) => (f ? { ...f, nf_remetente_cnpj: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Destinatário — razão social</label>
              <input
                value={form.nf_destinatario_razao_social}
                onChange={(e) => setForm((f) => (f ? { ...f, nf_destinatario_razao_social: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Destinatário — CNPJ/CPF</label>
              <input
                value={form.nf_destinatario_cnpj}
                onChange={(e) => setForm((f) => (f ? { ...f, nf_destinatario_cnpj: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Rota */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Cidade origem</label>
              <input
                value={form.cidade_origem}
                onChange={(e) => setForm((f) => (f ? { ...f, cidade_origem: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>UF origem</label>
              <input
                maxLength={2}
                value={form.uf_origem}
                onChange={(e) => setForm((f) => (f ? { ...f, uf_origem: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Cidade destino</label>
              <input
                value={form.cidade_destino}
                onChange={(e) => setForm((f) => (f ? { ...f, cidade_destino: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>UF destino</label>
              <input
                maxLength={2}
                value={form.uf_destino}
                onChange={(e) => setForm((f) => (f ? { ...f, uf_destino: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Carga */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Peso bruto (kg)</label>
              <input
                type="number"
                value={form.peso_bruto_kg}
                onChange={(e) => setForm((f) => (f ? { ...f, peso_bruto_kg: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Valor da NF (R$)</label>
              <input
                type="number"
                value={form.valor_nf}
                onChange={(e) => setForm((f) => (f ? { ...f, valor_nf: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>NCMs dos produtos</label>
              <input
                placeholder="separados por vírgula"
                value={form.ncms_produtos}
                onChange={(e) => setForm((f) => (f ? { ...f, ncms_produtos: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={form.checkbox_carga_perigosa_manual}
                onChange={(e) => setForm((f) => (f ? { ...f, checkbox_carga_perigosa_manual: e.target.checked } : f))}
              />
              Carga perigosa
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={form.checkbox_carga_indivisivel_manual}
                onChange={(e) => setForm((f) => (f ? { ...f, checkbox_carga_indivisivel_manual: e.target.checked } : f))}
              />
              Carga indivisível
            </label>
            {pesoLimiarKg != null ? (
              <div className="col-span-2 flex flex-col justify-center">
                <div className="text-xs font-semibold flex items-center gap-2">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{
                      background: form.flag_peso_acima_limiar ? '#FBE9E9' : 'var(--rbr-muted-bg)',
                      color: form.flag_peso_acima_limiar ? 'var(--rbr-danger)' : 'var(--rbr-muted)',
                    }}
                  >
                    {form.flag_peso_acima_limiar ? 'Peso acima do limiar' : 'Peso dentro do limiar'}
                  </span>
                </div>
                <div className="text-[11px] text-[color:var(--rbr-muted)] mt-1">
                  Calculado automaticamente (limiar atual: {pesoLimiarKg.toLocaleString('pt-BR')} kg).
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-xs font-semibold col-span-2">
                <input
                  type="checkbox"
                  checked={form.flag_peso_acima_limiar}
                  onChange={(e) => setForm((f) => (f ? { ...f, flag_peso_acima_limiar: e.target.checked } : f))}
                />
                Peso acima do limiar de risco (sem parâmetro cadastrado — marcação manual)
              </label>
            )}
            <label className="flex items-center gap-2 text-xs font-semibold col-span-2 md:col-span-4">
              <input
                type="checkbox"
                checked={form.flag_valor_acima_teto_seguro}
                onChange={(e) => setForm((f) => (f ? { ...f, flag_valor_acima_teto_seguro: e.target.checked } : f))}
              />
              Valor acima do teto de seguro (marcação manual — não há parâmetro de teto cadastrado hoje em parametros_sistema)
            </label>
          </div>

          {/* Piso ANTT */}
          <div className="rounded-xl p-3.5 flex flex-col gap-3" style={{ background: 'var(--rbr-muted-bg)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
              Piso ANTT (mínimo legal)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className={labelClass}>Tabela ANTT</label>
                <select
                  value={form.tabela}
                  onChange={(e) => setForm((f) => (f ? { ...f, tabela: e.target.value, eixos: '' } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                >
                  <option value="">Selecione…</option>
                  {TABELAS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Tipo de carga</label>
                <select
                  value={form.tipo_carga}
                  onChange={(e) => setForm((f) => (f ? { ...f, tipo_carga: e.target.value, eixos: '' } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                >
                  <option value="">Selecione…</option>
                  {TIPOS_CARGA.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Eixos</label>
                <select
                  value={form.eixos}
                  onChange={(e) => setForm((f) => (f ? { ...f, eixos: e.target.value } : f))}
                  disabled={eixosOpcoes.length === 0}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                >
                  <option value="">{eixosOpcoes.length === 0 ? 'Escolha tabela e tipo' : 'Selecione…'}</option>
                  {eixosOpcoes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Distância (km)</label>
                <input
                  type="number"
                  value={form.distancia_km}
                  onChange={(e) => setForm((f) => (f ? { ...f, distancia_km: e.target.value } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">Piso ANTT calculado:</span>
              <span className="text-sm font-bold">
                {carregandoPiso ? 'calculando…' : pisoInfo ? formatMoney(pisoInfo.calculado) : '—'}
              </span>
              {!carregandoPiso && !pisoInfo && (form.tabela || form.tipo_carga || form.eixos || form.distancia_km) && (
                <span className="text-[11px] text-[color:var(--rbr-muted)]">
                  Preencha tabela, tipo de carga, eixos e distância pra calcular.
                </span>
              )}
            </div>
          </div>

          {/* Custos e preço */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Pedágio (R$)</label>
              <input
                type="number"
                value={form.pedagio}
                onChange={(e) => setForm((f) => (f ? { ...f, pedagio: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass}>Seguro TAG (R$)</label>
              <input
                type="number"
                value={form.valor_seguro_tag}
                onChange={(e) => setForm((f) => (f ? { ...f, valor_seguro_tag: e.target.value } : f))}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="rounded-xl p-3.5 flex flex-col gap-3" style={{ background: 'var(--rbr-muted-bg)' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Valor total (R$)</label>
                <input
                  type="number"
                  value={form.valor_total}
                  onChange={(e) => setForm((f) => (f ? { ...f, valor_total: e.target.value } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                />
              </div>
              <div>
                <label className={labelClass}>Lucro RBR (R$)</label>
                <input
                  type="number"
                  value={form.lucro_rbr}
                  onChange={(e) => setForm((f) => (f ? { ...f, lucro_rbr: e.target.value } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={calcularPreco}
                className="text-xs font-bold px-3.5 py-2 rounded-lg border"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
              >
                Calcular (preencha só um dos dois campos acima)
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">Margem ajustada:</span>
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{ background: margem.bg, color: margem.color }}
                >
                  {margem.label}
                </span>
                <span className="text-[11px] text-[color:var(--rbr-muted)]">
                  faixa recomendada: {(margemMin * 100).toFixed(0)}% – {(margemMax * 100).toFixed(0)}% (fora da faixa a gravação
                  continua permitida, mas fica registrada em log de auditoria)
                </span>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={salvar}
              disabled={saving}
              className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar cotação'}
            </button>

            {editingId && editingStatus === 'rascunho' && (
              <button
                onClick={enviar}
                disabled={saving}
                className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
              >
                Enviar cotação
              </button>
            )}

            {editingId && (editingStatus === 'rascunho' || editingStatus === 'enviada') && (
              <button
                onClick={converter}
                disabled={saving}
                className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-positive)', color: '#fff' }}
              >
                Converter em operação
              </button>
            )}

            {editingStatus === 'convertida' && (
              <Link
                to="/operacoes"
                className="text-sm font-bold px-4 py-2 rounded-xl border"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
              >
                Ver operações
              </Link>
            )}
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && lista.length === 0 && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
          Nenhuma cotação encontrada para esse filtro.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {!loading &&
          lista.map((c) => {
            const margemC = margemBadge(c.margem_ajustada, margemMin, margemMax)
            return (
              <button
                key={c.id}
                onClick={() => abrirEdicao(c)}
                className="w-full text-left bg-white border rounded-[20px] p-[18px]"
                style={cardStyle}
              >
                <div className="flex items-center justify-between mb-2.5 gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
                      style={{ background: statusBadgeBg(c.status) }}
                    >
                      {STATUS_COTACAO_LABEL[c.status]}
                    </span>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                      style={{ background: margemC.bg, color: margemC.color }}
                    >
                      margem {margemC.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold">{formatMoney(c.valor_total)}</span>
                    <IconChevronRight width={16} height={16} style={{ color: 'var(--rbr-muted)' }} />
                  </div>
                </div>
                <div className="text-[15px] font-bold mb-1">{c.clienteNome ?? 'Cliente a confirmar'}</div>
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  {c.cidade_origem ?? '?'}/{c.uf_origem ?? '?'} → {c.cidade_destino ?? '?'}/{c.uf_destino ?? '?'} · criada em{' '}
                  {formatDateTime(c.created_at)}
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}
