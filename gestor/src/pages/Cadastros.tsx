import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatDate } from '@rbr/shared/format'
import { IconChevronRight } from '@rbr/shared/icons'

type Cliente = Database['public']['Tables']['clientes']['Row']
type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']
type TipoPessoaDoc = Database['public']['Enums']['tipo_pessoa_doc']

const cardStyle = {
  borderColor: 'var(--rbr-border)',
  boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
}

const inputClass = 'border rounded-lg px-3 py-2 text-sm outline-none'
const inputStyle = { borderColor: 'var(--rbr-border)' }
const miniInputClass = 'border rounded-lg px-2.5 py-1.5 text-xs outline-none bg-white'

const TABS = [
  { value: 'clientes', label: 'Clientes' },
  { value: 'motoristas', label: 'Motoristas' },
  { value: 'agenciadores', label: 'Agenciadores' },
] as const
type TabValue = (typeof TABS)[number]['value']

const CNH_CATEGORIAS = ['A', 'B', 'C', 'D', 'E']
const RNTRC_STATUS_OPCOES = ['ativo', 'inativo', 'suspenso']

const CLIENTE_INICIAL = {
  cnpj: '',
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
  condicoes_pagamento_prazo: '',
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

const VEICULO_INICIAL = {
  placa: '',
  renavam: '',
  marca_modelo: '',
  ano: '',
  tipo_veiculo: '',
  capacidade_carga: '',
  quantidade_eixos: '',
  rntrc_numero: '',
  rntrc_status: '',
  rntrc_validade: '',
}

function cnhVencidaOuAusente(validade: string | null | undefined): boolean {
  if (!validade) return true
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const data = new Date(validade + 'T00:00:00')
  return data.getTime() < hoje.getTime()
}

export default function Cadastros() {
  const [tab, setTab] = useState<TabValue>('clientes')

  // --- Clientes ---
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoCliente, setNovoCliente] = useState(CLIENTE_INICIAL)
  const [salvandoCliente, setSalvandoCliente] = useState(false)
  const [erroCliente, setErroCliente] = useState<string | null>(null)

  // --- Motoristas ---
  const [motoristas, setMotoristas] = useState<Pessoa[] | null>(null)
  const [loadingMotoristas, setLoadingMotoristas] = useState(true)
  const [showNovoMotorista, setShowNovoMotorista] = useState(false)
  const [novoMotorista, setNovoMotorista] = useState(MOTORISTA_INICIAL)
  const [salvandoMotorista, setSalvandoMotorista] = useState(false)
  const [erroMotorista, setErroMotorista] = useState<string | null>(null)

  const [expandedMotoristaId, setExpandedMotoristaId] = useState<string | null>(null)
  const [veiculosPorMotorista, setVeiculosPorMotorista] = useState<Record<string, Veiculo[]>>({})
  const [showNovoVeiculoId, setShowNovoVeiculoId] = useState<string | null>(null)
  const [novoVeiculo, setNovoVeiculo] = useState(VEICULO_INICIAL)
  const [salvandoVeiculo, setSalvandoVeiculo] = useState(false)
  const [erroVeiculo, setErroVeiculo] = useState<string | null>(null)

  // --- Agenciadores ---
  const [agenciadores, setAgenciadores] = useState<Pessoa[] | null>(null)
  const [loadingAgenciadores, setLoadingAgenciadores] = useState(true)
  const [showNovoAgenciador, setShowNovoAgenciador] = useState(false)
  const [novoAgenciador, setNovoAgenciador] = useState(AGENCIADOR_INICIAL)
  const [salvandoAgenciador, setSalvandoAgenciador] = useState(false)
  const [erroAgenciador, setErroAgenciador] = useState<string | null>(null)

  const loadClientes = useCallback(async () => {
    setLoadingClientes(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
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

  useEffect(() => {
    loadClientes()
    loadMotoristas()
    loadAgenciadores()
  }, [loadClientes, loadMotoristas, loadAgenciadores])

  async function carregarVeiculosDoMotorista(motoristaId: string) {
    const { data } = await supabase
      .from('veiculos')
      .select('*')
      .eq('titular_id', motoristaId)
      .order('created_at', { ascending: false })
    setVeiculosPorMotorista((prev) => ({ ...prev, [motoristaId]: data ?? [] }))
  }

  function toggleExpandMotorista(motoristaId: string) {
    setErroVeiculo(null)
    setShowNovoVeiculoId(null)
    if (expandedMotoristaId === motoristaId) {
      setExpandedMotoristaId(null)
      return
    }
    setExpandedMotoristaId(motoristaId)
    if (!(motoristaId in veiculosPorMotorista)) {
      carregarVeiculosDoMotorista(motoristaId)
    }
  }

  async function criarCliente() {
    setErroCliente(null)
    if (!novoCliente.razao_social.trim()) {
      setErroCliente('Informe a razão social.')
      return
    }
    setSalvandoCliente(true)
    try {
      const { error } = await supabase
        .from('clientes')
        .insert({
          razao_social: novoCliente.razao_social.trim(),
          cnpj: novoCliente.cnpj.trim() || null,
          nome_fantasia: novoCliente.nome_fantasia.trim() || null,
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
          condicoes_pagamento_prazo: novoCliente.condicoes_pagamento_prazo.trim() || null,
        })
        .select()
        .single()
      if (error) throw error
      setNovoCliente(CLIENTE_INICIAL)
      setShowNovoCliente(false)
      await loadClientes()
    } catch (e) {
      setErroCliente(e instanceof Error ? e.message : 'Erro ao criar cliente.')
    } finally {
      setSalvandoCliente(false)
    }
  }

  async function criarMotorista() {
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
      const { error } = await supabase
        .from('pessoas')
        .insert({
          papel: 'titular_motorista',
          tipo_pessoa_doc: 'PF',
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
        })
        .select()
        .single()
      if (error) throw error
      setNovoMotorista(MOTORISTA_INICIAL)
      setShowNovoMotorista(false)
      await loadMotoristas()
    } catch (e) {
      setErroMotorista(e instanceof Error ? e.message : 'Erro ao criar motorista.')
    } finally {
      setSalvandoMotorista(false)
    }
  }

  async function criarVeiculo(motoristaId: string) {
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
      const { error } = await supabase
        .from('veiculos')
        .insert({
          titular_id: motoristaId,
          placa: novoVeiculo.placa.trim().toUpperCase(),
          renavam: novoVeiculo.renavam.trim(),
          marca_modelo: novoVeiculo.marca_modelo.trim() || null,
          ano: novoVeiculo.ano ? Number(novoVeiculo.ano) : null,
          tipo_veiculo: novoVeiculo.tipo_veiculo.trim() || null,
          capacidade_carga: novoVeiculo.capacidade_carga ? Number(novoVeiculo.capacidade_carga) : null,
          quantidade_eixos: novoVeiculo.quantidade_eixos ? Number(novoVeiculo.quantidade_eixos) : null,
          rntrc_numero: novoVeiculo.rntrc_numero.trim() || null,
          rntrc_status: novoVeiculo.rntrc_status || null,
          rntrc_validade: novoVeiculo.rntrc_validade || null,
        })
        .select()
        .single()
      if (error) throw error
      setNovoVeiculo(VEICULO_INICIAL)
      setShowNovoVeiculoId(null)
      await carregarVeiculosDoMotorista(motoristaId)
    } catch (e) {
      setErroVeiculo(e instanceof Error ? e.message : 'Erro ao criar veículo.')
    } finally {
      setSalvandoVeiculo(false)
    }
  }

  async function criarAgenciador() {
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
      const { error } = await supabase
        .from('pessoas')
        .insert({
          papel: 'agenciador',
          tipo_pessoa_doc: novoAgenciador.tipo_pessoa_doc,
          nome: novoAgenciador.nome.trim(),
          cpf: novoAgenciador.tipo_pessoa_doc === 'PF' ? novoAgenciador.cpf.trim() : null,
          cnpj: novoAgenciador.tipo_pessoa_doc === 'PJ' ? novoAgenciador.cnpj.trim() : null,
          email: novoAgenciador.email.trim() || null,
          celular: novoAgenciador.celular.trim() || null,
          cep: novoAgenciador.cep.trim() || null,
          logradouro: novoAgenciador.logradouro.trim() || null,
          numero_endereco: novoAgenciador.numero_endereco.trim() || null,
          complemento: novoAgenciador.complemento.trim() || null,
          bairro: novoAgenciador.bairro.trim() || null,
          cidade: novoAgenciador.cidade.trim() || null,
          uf: novoAgenciador.uf.trim().toUpperCase() || null,
        })
        .select()
        .single()
      if (error) throw error
      setNovoAgenciador(AGENCIADOR_INICIAL)
      setShowNovoAgenciador(false)
      await loadAgenciadores()
    } catch (e) {
      setErroAgenciador(e instanceof Error ? e.message : 'Erro ao criar agenciador.')
    } finally {
      setSalvandoAgenciador(false)
    }
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
          </button>
        ))}
      </div>

      {tab === 'clientes' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Clientes</div>
            <button
              onClick={() => {
                setErroCliente(null)
                setShowNovoCliente((v) => !v)
              }}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoCliente ? 'Cancelar' : '+ Novo'}
            </button>
          </div>

          {showNovoCliente && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Novo cliente</div>
              {erroCliente && (
                <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  {erroCliente}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="Razão social *"
                  value={novoCliente.razao_social}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, razao_social: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Nome fantasia"
                  value={novoCliente.nome_fantasia}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, nome_fantasia: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input
                  placeholder="CNPJ"
                  value={novoCliente.cnpj}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, cnpj: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="Nome do contato comercial"
                  value={novoCliente.nome_contato_comercial}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, nome_contato_comercial: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  placeholder="Condições de pagamento / prazo"
                  value={novoCliente.condicoes_pagamento_prazo}
                  onChange={(e) => setNovoCliente((f) => ({ ...f, condicoes_pagamento_prazo: e.target.value }))}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <button
                onClick={criarCliente}
                disabled={salvandoCliente}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoCliente ? 'Criando…' : 'Criar cliente'}
              </button>
            </div>
          )}

          {loadingClientes && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingClientes && (clientes ?? []).length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum cliente cadastrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingClientes &&
              (clientes ?? []).map((c) => (
                <div key={c.id} className="bg-white border rounded-[16px] px-4 py-3.5" style={cardStyle}>
                  <div className="text-sm font-bold">{c.razao_social ?? c.nome_fantasia ?? 'Sem razão social'}</div>
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>{c.cnpj ?? 'CNPJ não informado'}</span>
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
              onClick={() => {
                setErroMotorista(null)
                setShowNovoMotorista((v) => !v)
              }}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoMotorista ? 'Cancelar' : '+ Novo'}
            </button>
          </div>

          {showNovoMotorista && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Novo motorista</div>
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

              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">CNH</div>
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

              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">RNTRC</div>
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

              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Extração automática de CNH/CRLV por IA ainda não está disponível aqui — preencha manualmente.
              </div>

              <button
                onClick={criarMotorista}
                disabled={salvandoMotorista}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoMotorista ? 'Criando…' : 'Criar motorista'}
              </button>
            </div>
          )}

          {loadingMotoristas && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingMotoristas && (motoristas ?? []).length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum motorista cadastrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingMotoristas &&
              (motoristas ?? []).map((m) => {
                const isExpanded = expandedMotoristaId === m.id
                const veic = veiculosPorMotorista[m.id]
                const vencida = cnhVencidaOuAusente(m.cnh_validade)
                return (
                  <div key={m.id} className="bg-white border rounded-[16px] overflow-hidden" style={cardStyle}>
                    <button className="w-full text-left px-4 py-3.5" onClick={() => toggleExpandMotorista(m.id)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold">{m.nome}</div>
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
                        <span>CPF: {m.cpf ?? '—'}</span>
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
                      <div className="border-t px-4 pb-4 pt-3 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
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
                            {veic.map((v) => (
                              <div key={v.id} className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)' }}>
                                <span className="font-semibold">{v.placa}</span>
                                {v.marca_modelo ? ` · ${v.marca_modelo}` : ''}
                              </div>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setErroVeiculo(null)
                            setNovoVeiculo(VEICULO_INICIAL)
                            setShowNovoVeiculoId((id) => (id === m.id ? null : m.id))
                          }}
                          className="self-start text-xs font-bold px-3.5 py-2 rounded-lg"
                          style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                        >
                          {showNovoVeiculoId === m.id ? 'Cancelar' : '+ Adicionar veículo'}
                        </button>

                        {showNovoVeiculoId === m.id && (
                          <div className="rounded-xl px-3.5 py-3 flex flex-col gap-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
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
                                placeholder="Tipo de veículo"
                                value={novoVeiculo.tipo_veiculo}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, tipo_veiculo: e.target.value }))}
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
                                placeholder="Qtd. eixos"
                                type="number"
                                value={novoVeiculo.quantidade_eixos}
                                onChange={(e) => setNovoVeiculo((f) => ({ ...f, quantidade_eixos: e.target.value }))}
                                className={miniInputClass}
                                style={inputStyle}
                              />
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
                            <button
                              onClick={() => criarVeiculo(m.id)}
                              disabled={salvandoVeiculo}
                              className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                            >
                              {salvandoVeiculo ? 'Salvando…' : 'Salvar veículo'}
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
              onClick={() => {
                setErroAgenciador(null)
                setShowNovoAgenciador((v) => !v)
              }}
              className="text-sm font-bold px-4 py-2 rounded-xl"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              {showNovoAgenciador ? 'Cancelar' : '+ Novo'}
            </button>
          </div>

          {showNovoAgenciador && (
            <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Novo agenciador</div>
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
                  onChange={(e) =>
                    setNovoAgenciador((f) => ({ ...f, tipo_pessoa_doc: e.target.value as TipoPessoaDoc }))
                  }
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
                onClick={criarAgenciador}
                disabled={salvandoAgenciador}
                className="self-start text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-navy)', color: '#fff' }}
              >
                {salvandoAgenciador ? 'Criando…' : 'Criar agenciador'}
              </button>
            </div>
          )}

          {loadingAgenciadores && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

          {!loadingAgenciadores && (agenciadores ?? []).length === 0 && (
            <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={cardStyle}>
              Nenhum agenciador cadastrado.
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {!loadingAgenciadores &&
              (agenciadores ?? []).map((a) => (
                <div key={a.id} className="bg-white border rounded-[16px] px-4 py-3.5" style={cardStyle}>
                  <div className="text-sm font-bold">{a.nome}</div>
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>{a.cpf ?? a.cnpj ?? 'Documento não informado'}</span>
                    <span>
                      {a.cidade ?? '—'}
                      {a.uf ? `/${a.uf}` : ''}
                    </span>
                    <span>{a.email ?? '—'}</span>
                    <span>{a.celular ?? '—'}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
