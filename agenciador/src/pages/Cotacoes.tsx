import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate } from '@rbr/shared/format'
import { parseNFeXml, type DadosNFe } from '@rbr/shared/nfeParser'
import { IconPlus, IconX, IconAlertTriangle } from '../icons-local'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Cotacao = Database['public']['Tables']['cotacoes']['Row']
type Cliente = Database['public']['Tables']['clientes']['Row']
type StatusCotacao = Database['public']['Enums']['status_cotacao']

type CotacaoComCliente = Cotacao & { clienteNome?: string }

const STATUS_LABEL: Record<StatusCotacao, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  convertida: 'Convertida',
}

const STATUS_STYLE: Record<StatusCotacao, { bg: string; color: string }> = {
  rascunho: { bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' },
  enviada: { bg: 'var(--rbr-navy)', color: '#FFFFFF' },
  convertida: { bg: 'var(--rbr-positive)', color: '#FFFFFF' },
}

interface FormState {
  id: string | null
  cliente_id: string
  status: StatusCotacao
  valor_total: string
  margem_ajustada: string
  piso_antt_calculado: string
  pedagio: string
  valor_seguro_tag: string
  lucro_rbr: string
  xml_danfe_url: string | null
  nf_chave_acesso: string | null
  nf_remetente_razao_social: string | null
  nf_remetente_cnpj: string | null
  nf_destinatario_razao_social: string | null
  nf_destinatario_cnpj: string | null
  cidade_origem: string | null
  uf_origem: string | null
  cidade_destino: string | null
  uf_destino: string | null
  peso_bruto_kg: number | null
  valor_nf: number | null
  natureza_operacao: string | null
  ncms_produtos: string[] | null
  checkbox_carga_perigosa_manual: boolean
  checkbox_carga_indivisivel_manual: boolean
  flag_peso_acima_limiar: boolean
  flag_valor_acima_teto_seguro: boolean
  tipo_carga: string | null
  eixos: string
}

const EMPTY_FORM: FormState = {
  id: null,
  cliente_id: '',
  status: 'rascunho',
  valor_total: '',
  margem_ajustada: '',
  piso_antt_calculado: '',
  pedagio: '',
  valor_seguro_tag: '',
  lucro_rbr: '',
  xml_danfe_url: null,
  nf_chave_acesso: null,
  nf_remetente_razao_social: null,
  nf_remetente_cnpj: null,
  nf_destinatario_razao_social: null,
  nf_destinatario_cnpj: null,
  cidade_origem: null,
  uf_origem: null,
  cidade_destino: null,
  uf_destino: null,
  peso_bruto_kg: null,
  valor_nf: null,
  natureza_operacao: null,
  ncms_produtos: null,
  checkbox_carga_perigosa_manual: false,
  checkbox_carga_indivisivel_manual: false,
  flag_peso_acima_limiar: false,
  flag_valor_acima_teto_seguro: false,
  tipo_carga: null,
  eixos: '',
}

function dadosNfeParaForm(dados: DadosNFe): Partial<FormState> {
  return {
    nf_chave_acesso: dados.chaveAcesso,
    nf_remetente_razao_social: dados.remetente.razaoSocial,
    nf_remetente_cnpj: dados.remetente.cnpj,
    nf_destinatario_razao_social: dados.destinatario.razaoSocial,
    nf_destinatario_cnpj: dados.destinatario.cnpjOuCpf,
    cidade_origem: dados.remetente.cidade,
    uf_origem: dados.remetente.uf,
    cidade_destino: dados.destinatario.cidade,
    uf_destino: dados.destinatario.uf,
    peso_bruto_kg: dados.pesoBrutoKg,
    valor_nf: dados.valorNota,
    natureza_operacao: dados.naturezaOperacao,
    ncms_produtos: dados.ncmsProdutos.length > 0 ? dados.ncmsProdutos : null,
  }
}

function toNumberOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function Cotacoes({ pessoa }: { pessoa: Pessoa }) {
  const [cotacoes, setCotacoes] = useState<CotacaoComCliente[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [xmlUploading, setXmlUploading] = useState(false)
  const [xmlError, setXmlError] = useState<string | null>(null)
  const [xmlNomeArquivo, setXmlNomeArquivo] = useState<string | null>(null)
  const [produtosXml, setProdutosXml] = useState<{ descricao: string; ncm: string | null }[]>([])
  const [iaAnalisando, setIaAnalisando] = useState(false)
  const [iaErro, setIaErro] = useState<string | null>(null)
  const [iaResultado, setIaResultado] = useState<{
    possivel_perigoso: boolean
    motivo_perigoso: string | null
    possivel_superdimensionada: boolean
    motivo_superdimensionada: string | null
  } | null>(null)

  // Cálculo de rota/piso ANTT — tipo_carga e eixos usados no cálculo vêm
  // direto do form (persistidos na cotação, não são mais locais).
  const [calculoLoading, setCalculoLoading] = useState(false)
  const [calculoErro, setCalculoErro] = useState<string | null>(null)
  const [calculoResultado, setCalculoResultado] = useState<{
    distancia_km: number
    duracao_horas: number
    piso_antt_minimo?: number
    piso_antt_erro?: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [{ data: cots, error: cotErr }, { data: cli, error: cliErr }] = await Promise.all([
      supabase
        .from('cotacoes')
        .select('*, clientes(razao_social, nome_fantasia)')
        .eq('agenciador_id', pessoa.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('clientes')
        .select('*')
        .eq('agenciador_id', pessoa.id)
        .eq('status', 'ativo')
        .order('razao_social', { ascending: true }),
    ])

    if (cotErr || cliErr) setError((cotErr ?? cliErr)?.message ?? 'Erro ao carregar')

    setCotacoes(
      (cots ?? []).map((c: any) => ({
        ...c,
        clienteNome: (c as any).clientes?.nome_fantasia ?? (c as any).clientes?.razao_social,
      })),
    )
    setClientes(cli ?? [])
    setLoading(false)
  }, [pessoa.id])

  useEffect(() => {
    load()
  }, [load])

  function openNew() {
    setForm(EMPTY_FORM)
    setXmlNomeArquivo(null)
    setXmlError(null)
    setProdutosXml([])
    setIaResultado(null)
    setIaErro(null)
    setCalculoResultado(null)
    setCalculoErro(null)
    setFormOpen(true)
  }

  function openEdit(c: Cotacao) {
    const anyC = c as any
    setForm({
      id: c.id,
      cliente_id: c.cliente_id ?? '',
      status: c.status,
      valor_total: c.valor_total?.toString() ?? '',
      margem_ajustada: c.margem_ajustada?.toString() ?? '',
      piso_antt_calculado: c.piso_antt_calculado?.toString() ?? '',
      pedagio: c.pedagio?.toString() ?? '',
      valor_seguro_tag: c.valor_seguro_tag?.toString() ?? '',
      lucro_rbr: c.lucro_rbr?.toString() ?? '',
      xml_danfe_url: anyC.xml_danfe_url ?? null,
      nf_chave_acesso: anyC.nf_chave_acesso ?? null,
      nf_remetente_razao_social: anyC.nf_remetente_razao_social ?? null,
      nf_remetente_cnpj: anyC.nf_remetente_cnpj ?? null,
      nf_destinatario_razao_social: anyC.nf_destinatario_razao_social ?? null,
      nf_destinatario_cnpj: anyC.nf_destinatario_cnpj ?? null,
      cidade_origem: anyC.cidade_origem ?? null,
      uf_origem: anyC.uf_origem ?? null,
      cidade_destino: anyC.cidade_destino ?? null,
      uf_destino: anyC.uf_destino ?? null,
      peso_bruto_kg: anyC.peso_bruto_kg ?? null,
      valor_nf: anyC.valor_nf ?? null,
      natureza_operacao: anyC.natureza_operacao ?? null,
      ncms_produtos: anyC.ncms_produtos ?? null,
      checkbox_carga_perigosa_manual: anyC.checkbox_carga_perigosa_manual ?? false,
      checkbox_carga_indivisivel_manual: anyC.checkbox_carga_indivisivel_manual ?? false,
      flag_peso_acima_limiar: anyC.flag_peso_acima_limiar ?? false,
      flag_valor_acima_teto_seguro: anyC.flag_valor_acima_teto_seguro ?? false,
      tipo_carga: anyC.tipo_carga ?? null,
      eixos: anyC.eixos != null ? anyC.eixos.toString() : '',
    })
    setXmlNomeArquivo(anyC.xml_danfe_url ? anyC.xml_danfe_url.split('/').pop() : null)
    setXmlError(null)
    setProdutosXml([])
    setIaResultado(null)
    setIaErro(null)
    setCalculoResultado(null)
    setCalculoErro(null)
    setFormOpen(true)
  }

  async function handleXmlUpload(file: File) {
    setXmlUploading(true)
    setXmlError(null)
    try {
      const texto = await file.text()
      const dados = parseNFeXml(texto)
      if (!dados) {
        setXmlError('Não consegui ler esse arquivo como XML de NF-e. Confira se é o arquivo certo.')
        setXmlUploading(false)
        return
      }

      const path = `agenciador/${pessoa.id}/nfe-${Date.now()}.xml`
      const { error: uploadError } = await supabase.storage.from('cotacao-xml').upload(path, file, {
        contentType: 'application/xml',
      })
      if (uploadError) {
        setXmlError(uploadError.message)
        setXmlUploading(false)
        return
      }

      // Checagem automática dos Eixos 2 (peso) e 3 (valor x teto de seguro) — via
      // função no banco, que só devolve true/false sem expor o parâmetro/apólice
      // (isso é informação só de gestor). O limite real de peso depende da
      // configuração de eixos do veículo (ver limites_peso_pbtc_eixos) — se os
      // eixos ainda não foram escolhidos nesta cotação, a função cai num
      // limiar plano de pré-filtro (recalculamos certo assim que os eixos
      // forem informados, no onChange do campo Eixos abaixo).
      const eixosAtuais = form.eixos ? Number(form.eixos) : null
      const [pesoResp, valorResp] = await Promise.all([
        dados.pesoBrutoKg !== null
          ? supabase.rpc('peso_acima_limiar_eixo2', { p_peso_kg: dados.pesoBrutoKg, p_eixos: eixosAtuais })
          : Promise.resolve({ data: false, error: null }),
        dados.valorNota !== null
          ? supabase.rpc('valor_acima_teto_seguro', { p_valor: dados.valorNota })
          : Promise.resolve({ data: false, error: null }),
      ])

      setForm((f) => ({
        ...f,
        xml_danfe_url: path,
        ...dadosNfeParaForm(dados),
        flag_peso_acima_limiar: pesoResp.data ?? false,
        flag_valor_acima_teto_seguro: valorResp.data ?? false,
        // Sugere o valor da nota como ponto de partida do valor total da cotação,
        // só se o campo ainda estiver vazio — nunca sobrescreve o que já foi digitado.
        valor_total: f.valor_total === '' && dados.valorNota !== null ? dados.valorNota.toString() : f.valor_total,
      }))
      setXmlNomeArquivo(file.name)
      setProdutosXml(dados.produtos)
      setIaResultado(null)
      setIaErro(null)
    } catch (e) {
      setXmlError(e instanceof Error ? e.message : 'Erro ao ler o arquivo.')
    } finally {
      setXmlUploading(false)
    }
  }

  async function recalcularFlagPeso(eixosStr: string) {
    if (form.peso_bruto_kg === null) return
    const eixosNum = eixosStr ? Number(eixosStr) : null
    const { data } = await supabase.rpc('peso_acima_limiar_eixo2', { p_peso_kg: form.peso_bruto_kg, p_eixos: eixosNum })
    setForm((f) => ({ ...f, flag_peso_acima_limiar: data ?? f.flag_peso_acima_limiar }))
  }

  async function handleAnalisarRiscoComIA() {
    if (produtosXml.length === 0) return
    setIaAnalisando(true)
    setIaErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('avaliar-risco-carga', {
        body: { produtos: produtosXml, pesoBrutoKg: form.peso_bruto_kg, valorNota: form.valor_nf },
      })
      if (error || !data?.sucesso) {
        setIaErro(data?.erro ?? error?.message ?? 'Não consegui analisar agora.')
        return
      }
      const avaliacao = data.avaliacao as {
        possivel_perigoso: boolean
        motivo_perigoso: string | null
        possivel_superdimensionada: boolean
        motivo_superdimensionada: string | null
      }
      setIaResultado(avaliacao)
      // A IA só SUGERE — pré-marca o checkbox como ponto de partida, mas a pessoa
      // continua livre pra desmarcar antes de salvar. Nunca marca sozinha sem mostrar
      // o motivo, e nunca desmarca um checkbox que a pessoa já tinha marcado na mão.
      setForm((f) => ({
        ...f,
        checkbox_carga_perigosa_manual: f.checkbox_carga_perigosa_manual || avaliacao.possivel_perigoso,
        checkbox_carga_indivisivel_manual: f.checkbox_carga_indivisivel_manual || avaliacao.possivel_superdimensionada,
      }))
    } catch (e) {
      setIaErro(e instanceof Error ? e.message : 'Erro ao chamar a IA.')
    } finally {
      setIaAnalisando(false)
    }
  }

  async function handleCalcularRota() {
    if (!form.cidade_origem || !form.uf_origem || !form.cidade_destino || !form.uf_destino) {
      setCalculoErro('Preencha cidade/UF de origem e destino antes de calcular.')
      return
    }
    setCalculoLoading(true)
    setCalculoErro(null)
    setCalculoResultado(null)
    try {
      const { data, error } = await supabase.functions.invoke('calcular-rota-frete', {
        body: {
          cidade_origem: form.cidade_origem,
          uf_origem: form.uf_origem,
          cidade_destino: form.cidade_destino,
          uf_destino: form.uf_destino,
          tipo_carga: form.tipo_carga || undefined,
          eixos: form.eixos ? Number(form.eixos) : undefined,
        },
      })
      if (error || !data?.sucesso) {
        setCalculoErro(data?.erro ?? error?.message ?? 'Não consegui calcular a rota agora.')
        return
      }
      setCalculoResultado(data)
    } catch (e) {
      setCalculoErro(e instanceof Error ? e.message : 'Erro ao chamar o cálculo de rota.')
    } finally {
      setCalculoLoading(false)
    }
  }

  function usarPisoCalculado() {
    if (calculoResultado?.piso_antt_minimo != null) {
      setForm((f) => ({ ...f, piso_antt_calculado: calculoResultado.piso_antt_minimo!.toString() }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cliente_id) {
      setError('Selecione um cliente.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      cliente_id: form.cliente_id,
      status: form.status,
      valor_total: toNumberOrNull(form.valor_total),
      margem_ajustada: toNumberOrNull(form.margem_ajustada),
      piso_antt_calculado: toNumberOrNull(form.piso_antt_calculado),
      pedagio: toNumberOrNull(form.pedagio),
      valor_seguro_tag: toNumberOrNull(form.valor_seguro_tag),
      lucro_rbr: toNumberOrNull(form.lucro_rbr),
      xml_danfe_url: form.xml_danfe_url,
      nf_chave_acesso: form.nf_chave_acesso,
      nf_remetente_razao_social: form.nf_remetente_razao_social,
      nf_remetente_cnpj: form.nf_remetente_cnpj,
      nf_destinatario_razao_social: form.nf_destinatario_razao_social,
      nf_destinatario_cnpj: form.nf_destinatario_cnpj,
      cidade_origem: form.cidade_origem,
      uf_origem: form.uf_origem,
      cidade_destino: form.cidade_destino,
      uf_destino: form.uf_destino,
      peso_bruto_kg: form.peso_bruto_kg,
      valor_nf: form.valor_nf,
      natureza_operacao: form.natureza_operacao,
      ncms_produtos: form.ncms_produtos,
      checkbox_carga_perigosa_manual: form.checkbox_carga_perigosa_manual,
      checkbox_carga_indivisivel_manual: form.checkbox_carga_indivisivel_manual,
      flag_peso_acima_limiar: form.flag_peso_acima_limiar,
      flag_valor_acima_teto_seguro: form.flag_valor_acima_teto_seguro,
      tipo_carga: form.tipo_carga,
      eixos: form.eixos ? Number(form.eixos) : null,
    }

    const result = form.id
      ? await supabase.from('cotacoes').update(payload).eq('id', form.id)
      : await supabase.from('cotacoes').insert({ ...payload, agenciador_id: pessoa.id, origem: 'agenciador' })

    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setFormOpen(false)
    load()
  }

  const margemNum = toNumberOrNull(form.margem_ajustada)
  const margemForaFaixa = margemNum !== null && (margemNum < 26 || margemNum > 40)

  const eixo2Acionado = form.flag_peso_acima_limiar || form.checkbox_carga_indivisivel_manual
  const eixo1Acionado = form.checkbox_carga_perigosa_manual
  const eixo3Acionado = form.flag_valor_acima_teto_seguro
  const cargaComplexa = eixo1Acionado || eixo2Acionado || eixo3Acionado

  return (
    <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-3.5 md:gap-6">
      <div className="flex items-center justify-between">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Cotações</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-bold"
          style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
        >
          <IconPlus width={16} height={16} />
          Nova
        </button>
      </div>

      {clientes.length === 0 && !loading && (
        <div
          className="bg-white border rounded-[16px] p-4 text-sm text-[color:var(--rbr-navy-dark)]"
          style={{ borderColor: 'var(--rbr-border)' }}
        >
          Você ainda não tem clientes cadastrados.{' '}
          <Link to="/clientes" className="font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
            Cadastre um cliente
          </Link>{' '}
          antes de criar uma cotação.
        </div>
      )}

      {error && (
        <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-[14px] p-3" style={{ borderColor: 'var(--rbr-border)' }}>
          {error}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3"
          style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">
              {form.id ? 'Editar cotação' : 'Nova cotação'}
            </div>
            <button type="button" onClick={() => setFormOpen(false)} aria-label="Fechar">
              <IconX width={18} height={18} style={{ color: 'var(--rbr-muted)' }} />
            </button>
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
            Cliente
            <select
              className="border rounded-xl px-3 py-2.5 text-sm text-[color:var(--rbr-navy-dark)]"
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.cliente_id}
              onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}
              required
            >
              <option value="">Selecione…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome_fantasia ?? c.razao_social}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <label
              className="flex items-center justify-center gap-2 border border-dashed rounded-xl px-3 py-3 text-sm font-semibold cursor-pointer"
              style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }}
            >
              {xmlUploading ? 'Lendo XML…' : xmlNomeArquivo ? `XML importado: ${xmlNomeArquivo}` : 'Importar XML da NF (opcional)'}
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                disabled={xmlUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleXmlUpload(file)
                  e.target.value = ''
                }}
              />
            </label>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              Sobe o XML da nota fiscal do cliente e o sistema já reconhece remetente, destinatário, cidades, peso e
              valor da nota — sem precisar digitar. A leitura é local, não usa nenhuma API externa.
            </div>

            {xmlError && (
              <div className="text-xs text-[color:var(--rbr-danger)] bg-white border rounded-xl p-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
                {xmlError}
              </div>
            )}

            {form.nf_chave_acesso && (
              <div
                className="text-xs rounded-xl p-3 flex flex-col gap-1"
                style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}
              >
                <div className="font-bold text-[11px] uppercase tracking-wide" style={{ color: 'var(--rbr-muted)' }}>
                  Lido do XML
                </div>
                <div>
                  <strong>De:</strong> {form.nf_remetente_razao_social ?? '—'}
                  {form.cidade_origem ? ` (${form.cidade_origem}/${form.uf_origem ?? '—'})` : ''}
                </div>
                <div>
                  <strong>Para:</strong> {form.nf_destinatario_razao_social ?? '—'}
                  {form.cidade_destino ? ` (${form.cidade_destino}/${form.uf_destino ?? '—'})` : ''}
                </div>
                <div>
                  <strong>Peso bruto:</strong> {form.peso_bruto_kg !== null ? `${form.peso_bruto_kg} kg` : '—'}
                  {' · '}
                  <strong>Valor da NF:</strong> {form.valor_nf !== null ? formatMoney(form.valor_nf) : '—'}
                </div>
                {form.natureza_operacao && (
                  <div>
                    <strong>Natureza:</strong> {form.natureza_operacao}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 bg-white border rounded-xl p-3" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--rbr-muted)' }}>
              Rota e piso mínimo ANTT
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
                Cidade origem
                <input
                  className="border rounded-xl px-3 py-2.5 text-sm"
                  style={{ borderColor: 'var(--rbr-border)' }}
                  value={form.cidade_origem ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, cidade_origem: e.target.value || null }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
                UF origem
                <input
                  className="border rounded-xl px-3 py-2.5 text-sm"
                  style={{ borderColor: 'var(--rbr-border)' }}
                  maxLength={2}
                  value={form.uf_origem ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, uf_origem: e.target.value.toUpperCase() || null }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
                Cidade destino
                <input
                  className="border rounded-xl px-3 py-2.5 text-sm"
                  style={{ borderColor: 'var(--rbr-border)' }}
                  value={form.cidade_destino ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, cidade_destino: e.target.value || null }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
                UF destino
                <input
                  className="border rounded-xl px-3 py-2.5 text-sm"
                  style={{ borderColor: 'var(--rbr-border)' }}
                  maxLength={2}
                  value={form.uf_destino ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, uf_destino: e.target.value.toUpperCase() || null }))}
                />
              </label>
            </div>
            <div className="text-[11px] text-[color:var(--rbr-muted)]">
              Preenchido automaticamente ao importar o XML da NF acima, mas dá pra editar/preencher na mão também.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
                Tipo de carga (opcional)
                <select
                  className="border rounded-xl px-3 py-2.5 text-sm text-[color:var(--rbr-navy-dark)]"
                  style={{ borderColor: 'var(--rbr-border)' }}
                  value={form.tipo_carga ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_carga: e.target.value || null }))}
                >
                  <option value="">Só calcular distância</option>
                  <option value="Carga Geral">Carga Geral</option>
                  <option value="Granel solido">Granel sólido</option>
                  <option value="Granel liquido">Granel líquido</option>
                  <option value="Frigorificada ou Aquecida">Frigorificada ou Aquecida</option>
                  <option value="Conteinerizada">Conteinerizada</option>
                  <option value="Neogranel">Neogranel</option>
                  <option value="Carga Granel Pressurizada">Carga Granel Pressurizada</option>
                  <option value="Perigosa (carga geral)">Perigosa (carga geral)</option>
                  <option value="Perigosa (granel solido)">Perigosa (granel sólido)</option>
                  <option value="Perigosa (granel liquido)">Perigosa (granel líquido)</option>
                  <option value="Perigosa (frigorificada ou aquecida)">Perigosa (frigorificada/aquecida)</option>
                  <option value="Perigosa (conteinerizada)">Perigosa (conteinerizada)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
                Eixos (opcional)
                <input
                  className="border rounded-xl px-3 py-2.5 text-sm"
                  style={{ borderColor: 'var(--rbr-border)' }}
                  inputMode="numeric"
                  placeholder="ex: 5"
                  value={form.eixos}
                  onChange={(e) => {
                    const novoEixos = e.target.value.replace(/\D/g, '')
                    setForm((f) => ({ ...f, eixos: novoEixos }))
                    void recalcularFlagPeso(novoEixos)
                  }}
                />
                <span className="text-[10px] font-normal normal-case" style={{ color: 'var(--rbr-muted)' }}>
                  Ajuda a checar o limite de peso certo pra esse veículo (Eixo 2) — o limite legal muda conforme a
                  quantidade de eixos.
                </span>
              </label>
            </div>
            <button
              type="button"
              onClick={handleCalcularRota}
              disabled={calculoLoading}
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60"
              style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
            >
              {calculoLoading ? 'Calculando…' : '📍 Calcular distância e piso ANTT'}
            </button>

            {calculoErro && <div className="text-xs text-[color:var(--rbr-danger)]">{calculoErro}</div>}

            {calculoResultado && (
              <div className="text-xs rounded-xl p-2.5 flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}>
                <div>
                  <strong>Distância:</strong> {calculoResultado.distancia_km} km{' '}
                  <strong>· Tempo estimado:</strong> {calculoResultado.duracao_horas} h
                </div>
                {calculoResultado.piso_antt_minimo != null && (
                  <div className="flex items-center gap-2">
                    <span>
                      <strong>Piso ANTT mínimo:</strong> {formatMoney(calculoResultado.piso_antt_minimo)}
                    </span>
                    <button
                      type="button"
                      onClick={usarPisoCalculado}
                      className="text-[11px] font-bold underline"
                      style={{ color: 'var(--rbr-navy)' }}
                    >
                      Usar esse valor
                    </button>
                  </div>
                )}
                {calculoResultado.piso_antt_erro && (
                  <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
                    {calculoResultado.piso_antt_erro}
                  </div>
                )}
                <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
                  Distância estimada por rota rodoviária (OpenStreetMap) — pode divergir um pouco da rota real do
                  motorista. Confira antes de fechar preço muito no limite.
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 bg-white border rounded-xl p-3" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--rbr-muted)' }}>
              Carga complexa — checagem
            </div>

            {form.flag_peso_acima_limiar && (
              <div className="text-xs" style={{ color: 'var(--rbr-navy-dark)' }}>
                ⚠️ Peso bruto está acima do limite legal{form.eixos ? ` pra um veículo de ${form.eixos} eixos` : ' (pré-filtro — informe os eixos ao lado pra checar o limite certo pra esse veículo)'} — pode
                indicar carga superdimensionada, exigindo AET (Eixo 2).
              </div>
            )}
            {form.flag_valor_acima_teto_seguro && (
              <div className="text-xs" style={{ color: 'var(--rbr-navy-dark)' }}>
                ⚠️ Valor da nota está acima do teto de cobertura da apólice vigente (Eixo 3).
              </div>
            )}

            {produtosXml.length > 0 && (
              <button
                type="button"
                onClick={handleAnalisarRiscoComIA}
                disabled={iaAnalisando}
                className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-60"
                style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
              >
                {iaAnalisando ? 'Analisando com IA…' : '✨ Analisar produtos com IA (Eixo 1 e 2)'}
              </button>
            )}

            {iaErro && (
              <div className="text-xs text-[color:var(--rbr-danger)]">{iaErro}</div>
            )}

            {iaResultado && (
              <div className="text-xs rounded-xl p-2.5 flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}>
                <div className="font-bold text-[11px] uppercase tracking-wide" style={{ color: 'var(--rbr-muted)' }}>
                  Sugestão da IA — confira antes de confirmar
                </div>
                <div>
                  {iaResultado.possivel_perigoso ? '⚠️ Parece produto perigoso: ' + (iaResultado.motivo_perigoso ?? '') : '✓ Não pareceu produto perigoso pela descrição.'}
                </div>
                <div>
                  {iaResultado.possivel_superdimensionada
                    ? '⚠️ Parece carga fora do padrão: ' + (iaResultado.motivo_superdimensionada ?? '')
                    : '✓ Não pareceu carga fora do padrão pela descrição/peso.'}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
                  Isso é só uma sugestão pra ajudar — não substitui o número ONU oficial nem qualquer obrigação
                  regulatória. Os checkboxes abaixo continuam livres pra você confirmar ou desmarcar.
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--rbr-navy-dark)]">
              <input
                type="checkbox"
                checked={form.checkbox_carga_perigosa_manual}
                onChange={(e) => setForm((f) => ({ ...f, checkbox_carga_perigosa_manual: e.target.checked }))}
              />
              É produto químico/perigoso (Eixo 1)?
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--rbr-navy-dark)]">
              <input
                type="checkbox"
                checked={form.checkbox_carga_indivisivel_manual}
                onChange={(e) => setForm((f) => ({ ...f, checkbox_carga_indivisivel_manual: e.target.checked }))}
              />
              Carga indivisível/fora do padrão, precisa de AET (Eixo 2)?
            </label>

            {cargaComplexa && (
              <div className="flex items-start gap-2 text-xs rounded-xl p-2.5" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
                <IconAlertTriangle width={15} height={15} style={{ flexShrink: 0, marginTop: 1 }} />
                Essa carga foi sinalizada como complexa. Ao converter em operação, ela já nasce com trava pra
                aprovação manual de um gestor — não bloqueia o salvamento da cotação.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              Valor total (R$)
              <input
                className="border rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--rbr-border)' }}
                inputMode="decimal"
                value={form.valor_total}
                onChange={(e) => setForm((f) => ({ ...f, valor_total: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              Margem ajustada (%)
              <input
                className="border rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--rbr-border)' }}
                inputMode="decimal"
                value={form.margem_ajustada}
                onChange={(e) => setForm((f) => ({ ...f, margem_ajustada: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              Piso ANTT calculado (R$)
              <input
                className="border rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--rbr-border)' }}
                inputMode="decimal"
                value={form.piso_antt_calculado}
                onChange={(e) => setForm((f) => ({ ...f, piso_antt_calculado: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              Pedágio (R$)
              <input
                className="border rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--rbr-border)' }}
                inputMode="decimal"
                value={form.pedagio}
                onChange={(e) => setForm((f) => ({ ...f, pedagio: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              Seguro/TAG (R$)
              <input
                className="border rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--rbr-border)' }}
                inputMode="decimal"
                value={form.valor_seguro_tag}
                onChange={(e) => setForm((f) => ({ ...f, valor_seguro_tag: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
              Lucro RBR (R$)
              <input
                className="border rounded-xl px-3 py-2.5 text-sm"
                style={{ borderColor: 'var(--rbr-border)' }}
                inputMode="decimal"
                value={form.lucro_rbr}
                onChange={(e) => setForm((f) => ({ ...f, lucro_rbr: e.target.value }))}
              />
            </label>
          </div>

          {margemForaFaixa && (
            <div className="flex items-start gap-2 text-xs rounded-xl p-2.5" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
              <IconAlertTriangle width={15} height={15} style={{ flexShrink: 0, marginTop: 1 }} />
              Margem fora da faixa recomendada (26%–40%). Não bloqueia o salvamento, apenas fica registrada para auditoria.
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]">
            Status
            <select
              className="border rounded-xl px-3 py-2.5 text-sm text-[color:var(--rbr-navy-dark)]"
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as StatusCotacao }))}
            >
              <option value="rascunho">Rascunho</option>
              <option value="enviada">Enviada</option>
              <option value="convertida">Convertida</option>
            </select>
          </label>

          {form.status === 'convertida' && (
            <div className="text-xs rounded-xl p-2.5" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
              Ao salvar como <strong>convertida</strong>, a operação logística é criada automaticamente pelo sistema — não
              é preciso nenhum passo adicional.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl py-3 font-bold text-sm disabled:opacity-60"
            style={{ background: 'var(--rbr-navy)', color: '#FFFFFF' }}
          >
            {saving ? 'Salvando…' : 'Salvar cotação'}
          </button>
        </form>
      )}

      {loading && <div className="text-sm text-[color:var(--rbr-muted)] py-6 text-center">Carregando…</div>}

      {!loading && cotacoes.length === 0 && !formOpen && (
        <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[20px] p-[18px]" style={{ borderColor: 'var(--rbr-border)' }}>
          Nenhuma cotação criada ainda.
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cotacoes.map((c) => {
          const style = STATUS_STYLE[c.status]
          return (
            <button
              key={c.id}
              onClick={() => openEdit(c)}
              className="text-left bg-white border rounded-[14px] p-4"
              style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{ background: style.bg, color: style.color }}
                >
                  {STATUS_LABEL[c.status]}
                </span>
                <span className="text-[13px] font-bold">{formatMoney(c.valor_total)}</span>
              </div>
              <div className="text-sm font-semibold">{c.clienteNome ?? 'Cliente a confirmar'}</div>
              <div className="text-xs text-[color:var(--rbr-muted)] mt-1">Criada em {formatDate(c.created_at)}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
