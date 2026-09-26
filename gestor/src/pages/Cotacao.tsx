import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database, Json } from '@rbr/shared/database.types'
import { formatMoney, formatDateTime, STATUS_COTACAO_LABEL, MOTIVO_PERDA_LABEL } from '@rbr/shared/format'
import { IconQuote, IconChevronRight, IconCheck } from '@rbr/shared/icons'
import { parseNFeXml, type EnderecoNFe } from '@rbr/shared/nfeParser'
import CatalogoCustos from '../components/CatalogoCustos'
import { EditorParcelas, PreviaRegra } from '../components/financeiro/PrazoEditor'
import { type CondicaoPrazo, type RegraPrazo, FORMA_LABEL as FORMA_PAGTO_LABEL, descreverRegra, regraDeCondicao, lerParametro, whatsappLink } from '../lib/financeiro'
import type { EmpresaCotacao, CotacaoPdfDados, ItemPrecoCotacao } from '../lib/cotacaoPdf'

type Cotacao = Database['public']['Tables']['cotacoes']['Row']
type CotacaoUpdate = Database['public']['Tables']['cotacoes']['Update']
type StatusCotacao = Database['public']['Enums']['status_cotacao']
type Cliente = Database['public']['Tables']['clientes']['Row']
type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Projeto = Database['public']['Tables']['projetos']['Row']
type PisoCoeficiente = Database['public']['Tables']['piso_antt_coeficientes']['Row']
type TipoCusto = Database['public']['Tables']['tipos_custo_adicional']['Row']
type CustoAdicionalRow = Database['public']['Tables']['cotacao_custos_adicionais']['Row']
type Fornecedor = Database['public']['Tables']['fornecedores']['Row']
type PracaPedagio = Database['public']['Tables']['pracas_pedagio']['Row']

type CotacaoEnriquecida = Cotacao & { clienteNome?: string | null }

// Uma praça lançada na cotação (categoria escolhida + valor daquela tarifa). Guardado em
// cotacoes.pedagio_pracas (jsonb) pra auditoria — não precisa reconsultar o catálogo depois.
interface PracaSelecionada {
  praca_id: string | null
  nome: string
  rodovia: string
  km: number | null
  categoria: string
  valor: number
}

type CotacaoDestinoRow = Database['public']['Tables']['cotacao_destinos']['Row']

// Uma linha de destino numa cotação com vários destinos a partir da mesma origem (ex.: CD
// que despacha pra várias cidades). Cada linha tem sua própria composição de custo completa
// (igual à de rota única): endereço de entrega, veículo (tabela ANTT + tipo de carga + eixos,
// porque destinos diferentes podem usar veículos diferentes), distância, piso ANTT de
// referência, frete do motorista, pedágio e margem — o valor final e o lucro líquido são
// calculados a partir disso (ver calcularCustoDestino). TAG seguro e imposto ficam no nível
// da cotação (dependem do valor da mercadoria, que é um só pra cotação inteira).
interface DestinoLinha {
  key: string
  id?: string
  endereco: string
  tabela: string
  tipo_carga: string
  eixos: string
  distancia_km: string
  frete_motorista: string
  pedagio: string
  margem_pct: string
  // legado — cotações antigas gravadas antes do endereço completo existir
  cidade?: string
  uf?: string
}

function destinoDeLinha(r: CotacaoDestinoRow): DestinoLinha {
  return {
    key: r.id,
    id: r.id,
    endereco: r.endereco_entrega ?? [r.cidade_destino, r.uf_destino].filter(Boolean).join('/'),
    tabela: r.tabela_antt ?? '',
    tipo_carga: r.tipo_carga ?? '',
    eixos: r.eixos != null ? String(r.eixos) : '',
    distancia_km: r.distancia_km != null ? String(r.distancia_km) : '',
    frete_motorista: r.frete_motorista != null ? String(r.frete_motorista) : '',
    pedagio: r.pedagio != null ? String(r.pedagio) : '',
    margem_pct: r.margem_pct != null ? String(round2(r.margem_pct * 100)) : '',
    cidade: r.cidade_destino ?? '',
    uf: r.uf_destino ?? '',
  }
}

// Mesma fórmula de calcularComposicao (custo -> valor final -> imposto -> lucro), só que sem
// TAG seguro nem custos adicionais (esses ficam no nível da cotação, não por destino) e com
// margem própria de cada destino em vez do lucro % da cotação inteira.
function calcularCustoDestino(
  d: DestinoLinha,
  aliquota: number,
): { custo: number; valorFinal: number | null; imposto: number | null; lucro: number | null; erro: string | null } {
  const frete = numOrNull(d.frete_motorista) ?? 0
  const pedagio = numOrNull(d.pedagio) ?? 0
  const custo = round2(frete + pedagio)
  const margemFrac = (numOrNull(d.margem_pct) ?? 0) / 100
  const fator = 1 + margemFrac
  const divisor = 1 - aliquota * fator
  if (divisor <= 0) {
    return { custo, valorFinal: null, imposto: null, lucro: null, erro: 'Margem alta demais pra essa alíquota de imposto — revise o %.' }
  }
  const valorFinal = round2((custo * fator) / divisor)
  const imposto = round2(valorFinal * aliquota)
  const lucro = round2(valorFinal - custo - imposto)
  return { custo, valorFinal, imposto, lucro, erro: null }
}

type FormaCalculo = 'fixo' | 'por_km' | 'por_dia' | 'por_unidade' | 'pct_valor_nf'
type Recebedor = 'motorista' | 'fornecedor' | 'governo' | 'rbr'

// Item de custo adicional em edição. Valores como texto (inputs); pct_valor_nf usa "%" (0.1 = 0,1%).
interface ItemCusto {
  key: string
  tipo_id: string
  descricao: string
  forma_calculo: FormaCalculo
  quantidade: string
  valor_unitario: string
  recebedor: Recebedor
  fornecedor_id: string
}

const FORMA_LABEL: Record<FormaCalculo, { unidade: string; qtd: string }> = {
  fixo: { unidade: 'Valor (R$)', qtd: 'Qtd.' },
  por_km: { unidade: 'R$ por km', qtd: 'Km' },
  por_dia: { unidade: 'R$ por dia', qtd: 'Dias' },
  por_unidade: { unidade: 'R$ por unidade', qtd: 'Qtd.' },
  pct_valor_nf: { unidade: '% da NF', qtd: '' },
}

const RECEBEDOR_LABEL: Record<Recebedor, string> = {
  motorista: 'Motorista',
  fornecedor: 'Fornecedor',
  governo: 'Governo',
  rbr: 'RBR (interno)',
}

const SINAL_LABEL: Record<string, string> = {
  perigosa: 'carga perigosa',
  superdimensionada: 'carga superdimensionada/indivisível',
  seguro_excedido: 'valor acima do teto do seguro',
}

let chaveSeq = 0
function novaChave() {
  chaveSeq += 1
  return `item-${Date.now()}-${chaveSeq}`
}

function itemDeTipo(t: TipoCusto): ItemCusto {
  const forma = t.forma_calculo as FormaCalculo
  return {
    key: novaChave(),
    tipo_id: t.id,
    descricao: '',
    forma_calculo: forma,
    quantidade: '1',
    valor_unitario:
      t.valor_padrao == null ? '' : forma === 'pct_valor_nf' ? String(Number((t.valor_padrao * 100).toFixed(4))) : String(t.valor_padrao),
    recebedor: t.recebedor as Recebedor,
    fornecedor_id: '',
  }
}

function itemDeLinha(r: CustoAdicionalRow): ItemCusto {
  const forma = r.forma_calculo as FormaCalculo
  return {
    key: r.id,
    tipo_id: r.tipo_id,
    descricao: r.descricao ?? '',
    forma_calculo: forma,
    quantidade: String(r.quantidade),
    valor_unitario: forma === 'pct_valor_nf' ? String(Number((r.valor_unitario * 100).toFixed(4))) : String(r.valor_unitario),
    recebedor: r.recebedor as Recebedor,
    fornecedor_id: r.fornecedor_id ?? '',
  }
}

// Mesma regra do gatilho trg_fn_custo_adicional_calcula.
function valorItem(i: ItemCusto, valorNf: number): number {
  const unit = numOrNull(i.valor_unitario) ?? 0
  if (i.forma_calculo === 'pct_valor_nf') return round2(valorNf * (unit / 100))
  return round2(unit * (numOrNull(i.quantidade) ?? 0))
}

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
  { value: 'perdida', label: 'Perdida' },
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
  nf_numero: '',
  nf_serie: '',
  nf_data_emissao: '',
  nf_produto_predominante: '',
  nf_quantidade_volumes: '',
  nf_remetente_ie: '',
  nf_destinatario_ie: '',
  nf_remetente_endereco: null as EnderecoNFe | null,
  nf_destinatario_endereco: null as EnderecoNFe | null,
  tomador_papel: '' as '' | 'remetente' | 'destinatario' | 'terceiro',
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
  // Composição do preço — todos os valores em R$, percentuais em "%" (ex.: "40" = 40%).
  valor_frete_motorista: '',
  pedagio: '',
  faixa_risco_seguro: '',
  taxa_seguro_tag_pct: '',
  aliquota_imposto_pct: '',
  lucro_pct: '',
  preco_modo: 'lucro_pct' as PrecoModo,
  valor_final_manual: '',
  xml_danfe_url: '',
  // Recebimento do cliente: regra cadastrada ou prazo combinado só nesta negociação.
  prazo_modo: 'regra' as 'regra' | 'personalizado',
  condicao_prazo_id: '',
  prazo_personalizado: null as RegraPrazo | null,
  forma_recebimento: 'boleto',
  // Prazo de validade da proposta (dias corridos a partir da emissão) — editável por cotação,
  // vai pro PDF em "COTAÇÃO Nº/DATA/VALIDADE" e em "Condições gerais".
  validade_dias: '5',
}

type PrecoModo = 'lucro_pct' | 'valor_final'
type CotacaoFormState = typeof FORM_INICIAL

interface PisoInfo {
  coeficiente: PisoCoeficiente
  calculado: number
}

interface FaixaSeguro {
  faixa: string
  label: string
  pct: number // fração (0.0015 = 0,15%)
}

// Taxas de 0,10% a 0,90% (fallback só usado se parametros_sistema.tag_seguro_faixas
// não existir — o valor vivo no banco é a fonte de verdade, editável sem deploy).
const FAIXAS_SEGURO_PADRAO: FaixaSeguro[] = [
  { faixa: '010', label: '0,10%', pct: 0.001 },
  { faixa: '020', label: '0,20%', pct: 0.002 },
  { faixa: '030', label: '0,30%', pct: 0.003 },
  { faixa: '040', label: '0,40%', pct: 0.004 },
  { faixa: '050', label: '0,50%', pct: 0.005 },
  { faixa: '060', label: '0,60%', pct: 0.006 },
  { faixa: '070', label: '0,70%', pct: 0.007 },
  { faixa: '080', label: '0,80%', pct: 0.008 },
  { faixa: '090', label: '0,90%', pct: 0.009 },
]

interface RotaCalculada {
  distancia_km: number
  duracao_horas: number
  piso_antt_minimo?: number
  piso_antt_erro?: string
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function numOrNull(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Fração → texto em % pra input (0.4 → "40", 0.0015 → "0.15").
function fracToPctStr(v: number | null | undefined): string {
  if (v == null) return ''
  return String(Number((v * 100).toFixed(4)))
}

function formatPct(v: number | null | undefined, casas = 2): string {
  if (v == null) return '—'
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`
}

interface Composicao {
  frete: number | null
  pedagio: number
  seguroTag: number
  taxaSeguro: number | null
  adicionais: number
  adicionaisMotorista: number
  totalMotorista: number | null
  custo: number | null
  aliquota: number
  imposto: number | null
  custoComImposto: number | null
  lucro: number | null
  lucroPct: number | null // lucro ÷ (custo + imposto) — o "% de lucro" que o gestor digita
  margem: number | null // lucro ÷ valor final — base da faixa 26–40%
  valorFinal: number | null
  erro: string | null
}

// Mesma conta do gatilho trg_fn_cotacao_calcula_preco no banco — o banco recalcula ao gravar,
// então o que a tela mostra e o que fica salvo são sempre o mesmo número.
//   custo = frete motorista + pedágio + TAG seguro (valor da mercadoria × taxa) + custos adicionais
//   imposto = alíquota × valor final
//   lucro = lucro% × (custo + imposto)          ← soma o lucro depois do custo total com imposto
//   valor final = custo × (1 + L) / (1 − t × (1 + L))
function calcularComposicao(f: CotacaoFormState, lucroPadrao: number, itens: ItemCusto[]): Composicao {
  const frete = numOrNull(f.valor_frete_motorista)
  const pedagio = numOrNull(f.pedagio) ?? 0
  const valorNf = numOrNull(f.valor_nf) ?? 0
  const taxaPct = numOrNull(f.taxa_seguro_tag_pct)
  const taxaSeguro = taxaPct != null ? taxaPct / 100 : null
  const seguroTag = taxaSeguro != null ? round2(valorNf * taxaSeguro) : 0
  const aliquota = (numOrNull(f.aliquota_imposto_pct) ?? 0) / 100
  const adicionais = round2(itens.reduce((s, i) => s + valorItem(i, valorNf), 0))
  const adicionaisMotorista = round2(
    itens.filter((i) => i.recebedor === 'motorista').reduce((s, i) => s + valorItem(i, valorNf), 0),
  )
  const vazio: Composicao = {
    frete,
    pedagio,
    seguroTag,
    taxaSeguro,
    adicionais,
    adicionaisMotorista,
    totalMotorista: frete != null ? round2(frete + adicionaisMotorista) : null,
    custo: null,
    aliquota,
    imposto: null,
    custoComImposto: null,
    lucro: null,
    lucroPct: null,
    margem: null,
    valorFinal: null,
    erro: null,
  }
  if (frete == null) return vazio
  const custo = round2(frete + pedagio + seguroTag + adicionais)
  let valorFinal: number
  const manual = numOrNull(f.valor_final_manual)
  if (f.preco_modo === 'valor_final' && manual != null) {
    if (manual <= 0) return { ...vazio, custo, erro: 'Valor final precisa ser maior que zero.' }
    valorFinal = round2(manual)
  } else {
    const lucroFrac = (numOrNull(f.lucro_pct) ?? lucroPadrao * 100) / 100
    const fator = 1 + lucroFrac
    const divisor = 1 - aliquota * fator
    if (divisor <= 0) {
      return { ...vazio, custo, erro: 'Com esse lucro % e essa alíquota não dá pra fechar o valor final — revise os percentuais.' }
    }
    valorFinal = round2((custo * fator) / divisor)
  }
  const imposto = round2(valorFinal * aliquota)
  const custoComImposto = round2(custo + imposto)
  const lucro = round2(valorFinal - custo - imposto)
  return {
    ...vazio,
    custo,
    imposto,
    custoComImposto,
    lucro,
    lucroPct: custoComImposto > 0 ? lucro / custoComImposto : null,
    margem: valorFinal > 0 ? lucro / valorFinal : null,
    valorFinal,
  }
}

function statusBadgeBg(status: StatusCotacao): string {
  if (status === 'convertida') return 'var(--rbr-positive)'
  if (status === 'perdida') return 'var(--rbr-danger)'
  if (status === 'enviada') return 'var(--rbr-gold)'
  return 'var(--rbr-muted)'
}

function margemBadge(margem: number | null, min: number, max: number): { bg: string; color: string; label: string } {
  if (margem == null) return { bg: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)', label: '—' }
  const label = `${(margem * 100).toFixed(1)}%`
  // Mesma tolerância do gatilho trg_fn_cotacao_valida_margem (arredondamento em centavos).
  const tol = 0.0005
  if (margem < min - tol) return { bg: '#FBE9E9', color: 'var(--rbr-danger)', label }
  if (margem > max + tol) return { bg: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)', label }
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

  // Praças de pedágio lançadas na cotação (soma automaticamente pro campo Pedágio).
  const [pracasCatalogo, setPracasCatalogo] = useState<PracaPedagio[]>([])
  const [pracasPedagio, setPracasPedagio] = useState<PracaSelecionada[]>([])

  // Destinos múltiplos (cotação com vários destinos a partir da mesma origem). Quando há
  // linhas aqui, o valor_total da cotação vira a soma delas — não a composição de preço de
  // rota única acima.
  const [destinos, setDestinos] = useState<DestinoLinha[]>([])
  const [carregandoDestinos, setCarregandoDestinos] = useState(false)
  const [calculandoDestino, setCalculandoDestino] = useState<string | null>(null)
  const [erroDestino, setErroDestino] = useState<{ key: string; msg: string } | null>(null)
  // Tabela inteira de piso_antt_coeficientes (carregada uma vez), só com a versão vigente
  // (data_vigencia mais recente ≤ hoje) por tabela+tipo de carga+eixos — usada pra calcular o
  // piso ANTT de cada destino da lista de vários destinos, já que cada linha pode ter um
  // veículo diferente (ver eixosOpcoesPara / coefPara abaixo).
  const [pisoCoefsTodos, setPisoCoefsTodos] = useState<PisoCoeficiente[]>([])
  const [pracaBusca, setPracaBusca] = useState('')
  const [pracaEscolhidaId, setPracaEscolhidaId] = useState('')
  const [pracaCategoria, setPracaCategoria] = useState('')

  const [margemMin, setMargemMin] = useState(0.26)
  const [margemMax, setMargemMax] = useState(0.4)
  const [pesoLimiarKg, setPesoLimiarKg] = useState<number | null>(null)
  // Teto de cobertura por embarque da apólice vigente (Operações → Dados de emissão).
  const [tetoSeguro, setTetoSeguro] = useState<number | null>(null)
  const [lucroPadrao, setLucroPadrao] = useState(0.4)
  const [aliquotaPadrao, setAliquotaPadrao] = useState<number | null>(null)
  const [faixasSeguro, setFaixasSeguro] = useState<FaixaSeguro[]>(FAIXAS_SEGURO_PADRAO)

  // Custos adicionais
  const [tiposCusto, setTiposCusto] = useState<TipoCusto[]>([])
  const [condicoesPrazo, setCondicoesPrazo] = useState<CondicaoPrazo[]>([])
  const [feriados, setFeriados] = useState<Set<string>>(new Set())
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [itens, setItens] = useState<ItemCusto[]>([])
  const [carregandoItens, setCarregandoItens] = useState(false)
  const [tipoParaAdicionar, setTipoParaAdicionar] = useState('')

  const [showCatalogo, setShowCatalogo] = useState(false)

  // Busca na lista
  const [busca, setBusca] = useState('')

  // Marcar como perdida
  const [showPerda, setShowPerda] = useState(false)
  const [motivoPerda, setMotivoPerda] = useState('')
  const [detalhePerda, setDetalhePerda] = useState('')

  // Piso já gravado na cotação — usado quando a tela não recalcula (ex.: sem distância).
  const [pisoSalvo, setPisoSalvo] = useState<number | null>(null)
  // Cotação antiga (antes da composição de preço): tem valor total salvo mas não tem frete do motorista.
  const [precoLegado, setPrecoLegado] = useState<{ valorTotal: number | null; lucro: number | null } | null>(null)

  const [rotaCalculando, setRotaCalculando] = useState(false)
  const [rotaErro, setRotaErro] = useState<string | null>(null)
  const [rotaResultado, setRotaResultado] = useState<RotaCalculada | null>(null)

  const [form, setForm] = useState<CotacaoFormState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<StatusCotacao>('rascunho')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [emitindoPdf, setEmitindoPdf] = useState(false)
  // Clique em "Enviar WhatsApp" direto na lista: abre a cotação (pra reaproveitar o mesmo
  // cálculo de composição/itens do formulário) e, assim que custos adicionais e destinos
  // terminarem de carregar, dispara o PDF + WhatsApp sozinho — ver efeito mais abaixo.
  const [pendingWhatsAppId, setPendingWhatsAppId] = useState<string | null>(null)

  const [eixosOpcoes, setEixosOpcoes] = useState<number[]>([])
  const [pisoInfo, setPisoInfo] = useState<PisoInfo | null>(null)
  const [carregandoPiso, setCarregandoPiso] = useState(false)

  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoClienteTipo, setNovoClienteTipo] = useState<'PJ' | 'PF'>('PJ')
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

  // Carrega todos (inclusive inativos) pra conseguir mostrar o nome em cotação antiga;
  // o seletor só oferece os ativos (ver clientesFiltrados/agenciadoresAtivos).
  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from('clientes').select('*').order('razao_social', { ascending: true }).limit(1000)
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

  const loadCatalogoCustos = useCallback(async () => {
    const [{ data: tipos }, { data: forns }] = await Promise.all([
      supabase.from('tipos_custo_adicional').select('*').order('ordem', { ascending: true }),
      supabase.from('fornecedores').select('*').eq('status', 'ativo').order('nome', { ascending: true }).limit(500),
    ])
    setTiposCusto(tipos ?? [])
    setFornecedores(forns ?? [])
  }, [])

  const loadCondicoes = useCallback(async () => {
    const [{ data }, { data: fer }] = await Promise.all([
      supabase.from('condicoes_prazo').select('*').eq('ativa', true).in('aplica_a', ['receber', 'ambos']).order('nome'),
      supabase.from('feriados').select('data'),
    ])
    setCondicoesPrazo(data ?? [])
    setFeriados(new Set((fer ?? []).map((x) => x.data)))
  }, [])

  const loadProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('nome', { ascending: true }).limit(300)
    setProjetos(data ?? [])
  }, [])

  const loadPracasPedagio = useCallback(async () => {
    const { data } = await supabase.from('pracas_pedagio').select('*').order('nome', { ascending: true }).limit(1000)
    setPracasCatalogo(data ?? [])
  }, [])

  // Tabela inteira de piso_antt_coeficientes, carregada uma vez (é pequena — ~140 linhas) e
  // reduzida à versão vigente (maior data_vigencia ≤ hoje) por tabela+tipo_carga+eixos. Usada
  // por eixosOpcoesPara/coefPara pra calcular o piso ANTT de cada destino da lista de vários
  // destinos sem precisar de uma consulta por linha.
  const loadPisoCoeficientesTodos = useCallback(async () => {
    const hojeIso = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('piso_antt_coeficientes').select('*').lte('data_vigencia', hojeIso)
    const maisRecentePorChave = new Map<string, PisoCoeficiente>()
    for (const row of data ?? []) {
      const chave = `${row.tabela}|${row.tipo_carga}|${row.eixos}`
      const atual = maisRecentePorChave.get(chave)
      if (!atual || row.data_vigencia > atual.data_vigencia) maisRecentePorChave.set(chave, row)
    }
    setPisoCoefsTodos(Array.from(maisRecentePorChave.values()))
  }, [])

  const loadParametros = useCallback(async () => {
    const { data } = await supabase
      .from('parametros_sistema')
      .select('chave, valor')
      .in('chave', [
        'margem_cotacao_min',
        'margem_cotacao_max',
        'peso_bruto_limiar_eixo2_kg',
        'lucro_cotacao_padrao',
        'aliquota_imposto_cotacao_padrao',
        'tag_seguro_faixas',
      ])
    for (const row of data ?? []) {
      if (row.chave === 'tag_seguro_faixas') {
        if (Array.isArray(row.valor)) {
          const faixas = (row.valor as unknown as FaixaSeguro[]).filter(
            (x) => x && typeof x.pct === 'number' && typeof x.label === 'string',
          )
          if (faixas.length > 0) setFaixasSeguro(faixas)
        }
        continue
      }
      if (row.valor === null) continue
      const valor = typeof row.valor === 'number' ? row.valor : Number(row.valor)
      if (!Number.isFinite(valor)) continue
      if (row.chave === 'margem_cotacao_min') setMargemMin(valor)
      else if (row.chave === 'margem_cotacao_max') setMargemMax(valor)
      else if (row.chave === 'peso_bruto_limiar_eixo2_kg') setPesoLimiarKg(valor)
      else if (row.chave === 'lucro_cotacao_padrao') setLucroPadrao(valor)
      else if (row.chave === 'aliquota_imposto_cotacao_padrao') setAliquotaPadrao(valor)
    }
  }, [])

  useEffect(() => {
    load()
    loadClientes()
    loadAgenciadores()
    loadProjetos()
    loadParametros()
    loadCatalogoCustos()
    loadCondicoes()
    loadPracasPedagio()
    loadPisoCoeficientesTodos()
  }, [
    load,
    loadClientes,
    loadAgenciadores,
    loadProjetos,
    loadParametros,
    loadCatalogoCustos,
    loadCondicoes,
    loadPracasPedagio,
    loadPisoCoeficientesTodos,
  ])

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
      .select('eixos, cc_fixo, ccd_por_km')
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

  // Enquanto houver praças lançadas, o campo Pedágio é a soma delas (edição manual do campo
  // só volta a valer se a lista for esvaziada).
  useEffect(() => {
    if (pracasPedagio.length === 0) return
    const soma = round2(pracasPedagio.reduce((acc, p) => acc + p.valor, 0))
    setForm((f) => (f && numOrNull(f.pedagio) !== soma ? { ...f, pedagio: String(soma) } : f))
  }, [pracasPedagio])

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

  // Valor da carga acima do teto da apólice (eixo 3) — automático quando existe apólice vigente.
  useEffect(() => {
    const hojeIso = new Date().toISOString().slice(0, 10)
    supabase
      .from('apolices_seguro')
      .select('teto_cobertura_por_embarque, vigencia_inicio, vigencia_fim')
      .eq('tipo', 'RCTR-C')
      .order('vigencia_inicio', { ascending: false })
      .then(({ data }) => {
        const vigente = (data ?? []).find(
          (a) => (!a.vigencia_inicio || a.vigencia_inicio <= hojeIso) && (!a.vigencia_fim || a.vigencia_fim >= hojeIso),
        )
        setTetoSeguro(vigente?.teto_cobertura_por_embarque ?? null)
      })
  }, [])

  useEffect(() => {
    if (!form || tetoSeguro == null) return
    const auto = (numOrNull(form.valor_nf) ?? 0) > tetoSeguro
    if (auto !== form.flag_valor_acima_teto_seguro) {
      setForm((f) => (f ? { ...f, flag_valor_acima_teto_seguro: auto } : f))
    }
  }, [form?.valor_nf, tetoSeguro]) // eslint-disable-line react-hooks/exhaustive-deps

  const composicao = useMemo(() => (form ? calcularComposicao(form, lucroPadrao, itens) : null), [form, lucroPadrao, itens])
  const margemAjustada = composicao?.margem ?? null
  const margem = margemBadge(margemAjustada, margemMin, margemMax)
  const pisoReferencia = pisoInfo?.calculado ?? pisoSalvo
  const freteAbaixoDoPiso =
    composicao?.frete != null && pisoReferencia != null && composicao.frete < round2(pisoReferencia)

  // Opções de eixos disponíveis pra uma combinação tabela+tipo de carga, a partir da tabela
  // inteira já carregada em memória (pisoCoefsTodos) — cada destino escolhe seu próprio
  // veículo, então isso é chamado por linha, não uma vez só pra cotação inteira.
  function eixosOpcoesPara(tabela: string, tipoCarga: string): number[] {
    if (!tabela || !tipoCarga) return []
    const uniq = new Set(
      pisoCoefsTodos.filter((c) => c.tabela === tabela && c.tipo_carga === tipoCarga).map((c) => c.eixos),
    )
    return Array.from(uniq).sort((a, b) => a - b)
  }

  // Coeficiente vigente (cc_fixo/ccd_por_km) pra uma combinação tabela+tipo de carga+eixos.
  function coefPara(tabela: string, tipoCarga: string, eixos: number): PisoCoeficiente | null {
    return pisoCoefsTodos.find((c) => c.tabela === tabela && c.tipo_carga === tipoCarga && c.eixos === eixos) ?? null
  }

  // Piso ANTT de referência por linha de destino (advisório — não bloqueia salvar, só avisa
  // na tela). Cada destino tem seu próprio veículo (tabela/tipo de carga/eixos).
  function pisoRefDestino(d: DestinoLinha): number | null {
    const eixosNum = numOrNull(d.eixos)
    const distNum = numOrNull(d.distancia_km)
    if (eixosNum == null || distNum == null || !d.tabela || !d.tipo_carga) return null
    const coef = coefPara(d.tabela, d.tipo_carga, eixosNum)
    if (!coef) return null
    return round2(coef.cc_fixo + coef.ccd_por_km * distNum)
  }

  // Alíquota efetiva da cotação (mesma usada na composição de rota única — é um dado da
  // cotação, não do destino) — usada pra fechar o valor final de cada linha de destino.
  const aliquotaDestinos = composicao?.aliquota ?? aliquotaPadrao ?? 0.06

  const somaDestinos = useMemo(
    () =>
      destinos.length > 0
        ? round2(destinos.reduce((acc, d) => acc + (calcularCustoDestino(d, aliquotaDestinos).valorFinal ?? 0), 0))
        : null,
    [destinos, aliquotaDestinos],
  )

  // Só clientes ativos podem ser escolhidos — exceto o que já está na cotação (pra não sumir ao reabrir).
  const clientesFiltrados = useMemo(() => {
    const termo = normalizar(clienteFiltro.trim())
    const selecionado = form?.cliente_id ?? ''
    return clientes.filter((c) => {
      if (c.status !== 'ativo' && c.id !== selecionado) return false
      if (!termo) return true
      const digitos = termo.replace(/\D/g, '')
      return (
        normalizar(c.razao_social ?? '').includes(termo) ||
        normalizar(c.nome_fantasia ?? '').includes(termo) ||
        (digitos !== '' && (c.cnpj ?? '').replace(/\D/g, '').includes(digitos)) ||
        (digitos !== '' && (c.cpf ?? '').replace(/\D/g, '').includes(digitos))
      )
    })
  }, [clientes, clienteFiltro, form?.cliente_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sugestão do tomador: compara o documento do cliente com o do remetente/destinatário da NF.
  const tomadorSugerido = useMemo<'' | 'remetente' | 'destinatario' | 'terceiro'>(() => {
    if (!form?.cliente_id) return ''
    const cli = clientes.find((c) => c.id === form.cliente_id)
    const doc = ((cli?.cnpj ?? cli?.cpf) ?? '').replace(/\D/g, '')
    if (!doc) return ''
    if (doc === form.nf_remetente_cnpj.replace(/\D/g, '')) return 'remetente'
    if (doc === form.nf_destinatario_cnpj.replace(/\D/g, '')) return 'destinatario'
    return 'terceiro'
  }, [form?.cliente_id, form?.nf_remetente_cnpj, form?.nf_destinatario_cnpj, clientes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cliente selecionado e seu endereço completo (origem da rota é sempre o endereço
  // cadastrado do cliente — não tem mais campo manual de cidade/UF de origem).
  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === form?.cliente_id) ?? null,
    [clientes, form?.cliente_id],
  )
  const enderecoOrigemCliente = useMemo(() => {
    const c = clienteSelecionado
    if (!c) return ''
    const partes = [
      [c.logradouro, c.numero_endereco].filter(Boolean).join(', '),
      c.bairro,
      [c.cidade, c.uf].filter(Boolean).join('/'),
    ].filter((p) => p && p.trim() !== '')
    return partes.join(' — ')
  }, [clienteSelecionado])

  const agenciadoresAtivos = useMemo(
    () => agenciadores.filter((a) => a.status === 'ativo' || a.id === form?.agenciador_id),
    [agenciadores, form?.agenciador_id], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Sinais de carga complexa já marcados na cotação → quais custos o sistema sugere.
  const sinaisAtivos = useMemo(() => {
    if (!form) return [] as string[]
    const s: string[] = []
    if (form.checkbox_carga_perigosa_manual) s.push('perigosa')
    if (form.flag_peso_acima_limiar || form.checkbox_carga_indivisivel_manual) s.push('superdimensionada')
    if (form.flag_valor_acima_teto_seguro) s.push('seguro_excedido')
    return s
  }, [form])

  const tiposAtivos = useMemo(() => tiposCusto.filter((t) => t.ativo), [tiposCusto])

  const sugestoes = useMemo(() => {
    const usados = new Set(itens.map((i) => i.tipo_id))
    return tiposAtivos
      .filter((t) => !usados.has(t.id) && t.sugerir_quando.some((q) => sinaisAtivos.includes(q)))
      .map((t) => ({ tipo: t, motivos: t.sugerir_quando.filter((q) => sinaisAtivos.includes(q)) }))
  }, [tiposAtivos, itens, sinaisAtivos])

  const obrigatoriosFaltando = useMemo(() => {
    const usados = new Set(itens.map((i) => i.tipo_id))
    return tiposAtivos.filter((t) => t.obrigatorio && !usados.has(t.id))
  }, [tiposAtivos, itens])

  const tipoPorId = useMemo(() => new Map(tiposCusto.map((t) => [t.id, t])), [tiposCusto])

  // Custos obrigatórios (ex.: pesquisa GR) entram automaticamente e valem o valor padrão —
  // não precisam do card editável cheio, só aparecem como linha fixa no resumo.
  const itensObrigatorios = useMemo(() => itens.filter((i) => tipoPorId.get(i.tipo_id)?.obrigatorio), [itens, tipoPorId])
  const itensOpcionais = useMemo(() => itens.filter((i) => !tipoPorId.get(i.tipo_id)?.obrigatorio), [itens, tipoPorId])

  const projetosFiltrados = useMemo(() => {
    if (!form || !form.cliente_id) return projetos
    return projetos.filter((p) => !p.cliente_id || p.cliente_id === form.cliente_id)
  }, [projetos, form?.cliente_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pracasFiltradas = useMemo(() => {
    const termo = pracaBusca.trim().toLowerCase()
    if (!termo) return pracasCatalogo.slice(0, 30)
    return pracasCatalogo.filter((p) => `${p.nome} ${p.rodovia} ${p.uf} ${p.concessionaria ?? ''}`.toLowerCase().includes(termo)).slice(0, 30)
  }, [pracasCatalogo, pracaBusca])

  const pracaEscolhida = useMemo(() => pracasCatalogo.find((p) => p.id === pracaEscolhidaId) ?? null, [pracasCatalogo, pracaEscolhidaId])

  const categoriasDaPracaEscolhida = useMemo(() => {
    if (!pracaEscolhida) return []
    const tarifas = (pracaEscolhida.tarifas ?? {}) as Record<string, number>
    return Object.keys(tarifas)
      .sort((a, b) => Number(a) - Number(b))
      .map((cat) => ({ categoria: cat, valor: Number(tarifas[cat]) }))
  }, [pracaEscolhida])

  function adicionarPraca() {
    if (!pracaEscolhida || !pracaCategoria) return
    const tarifas = (pracaEscolhida.tarifas ?? {}) as Record<string, number>
    const valor = Number(tarifas[pracaCategoria])
    if (!Number.isFinite(valor)) return
    setPracasPedagio((lista) => [
      ...lista,
      { praca_id: pracaEscolhida.id, nome: pracaEscolhida.nome, rodovia: pracaEscolhida.rodovia, km: pracaEscolhida.km, categoria: pracaCategoria, valor },
    ])
    setPracaBusca('')
    setPracaEscolhidaId('')
    setPracaCategoria('')
  }

  function removerPraca(index: number) {
    setPracasPedagio((lista) => lista.filter((_, i) => i !== index))
  }

  function limparAuxiliares() {
    setFormError(null)
    setSuccessMsg(null)
    setXmlError(null)
    setShowNovoCliente(false)
    setClienteFiltro('')
    setRotaErro(null)
    setRotaResultado(null)
    setShowPerda(false)
    setMotivoPerda('')
    setDetalhePerda('')
    setTipoParaAdicionar('')
    setPracasPedagio([])
    setPracaBusca('')
    setPracaEscolhidaId('')
    setPracaCategoria('')
    setDestinos([])
  }

  function abrirNovaCotacao() {
    setForm({
      ...FORM_INICIAL,
      lucro_pct: fracToPctStr(lucroPadrao),
      aliquota_imposto_pct: fracToPctStr(aliquotaPadrao),
      condicao_prazo_id: condicoesPrazo.find((c) => c.padrao_receber)?.id ?? '',
    })
    setEditingId(null)
    setEditingStatus('rascunho')
    setPisoSalvo(null)
    setPrecoLegado(null)
    // Custos obrigatórios (ex.: pesquisa GR) já entram em toda cotação nova.
    setItens(tiposCusto.filter((t) => t.ativo && t.obrigatorio).map(itemDeTipo))
    limparAuxiliares()
  }

  async function carregarItens(cotacaoId: string) {
    setCarregandoItens(true)
    const { data, error } = await supabase
      .from('cotacao_custos_adicionais')
      .select('*')
      .eq('cotacao_id', cotacaoId)
      .order('created_at', { ascending: true })
    setCarregandoItens(false)
    if (error) {
      setFormError(`Não consegui carregar os custos adicionais: ${error.message}`)
      return
    }
    setItens((data ?? []).map(itemDeLinha))
  }

  async function carregarDestinos(cotacaoId: string) {
    setCarregandoDestinos(true)
    const { data, error } = await supabase
      .from('cotacao_destinos')
      .select('*')
      .eq('cotacao_id', cotacaoId)
      .order('ordem', { ascending: true })
    setCarregandoDestinos(false)
    if (error) {
      setFormError(`Não consegui carregar os destinos: ${error.message}`)
      return
    }
    setDestinos((data ?? []).map(destinoDeLinha))
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
      nf_numero: c.nf_numero ?? '',
      nf_serie: c.nf_serie ?? '',
      nf_data_emissao: c.nf_data_emissao ?? '',
      nf_produto_predominante: c.nf_produto_predominante ?? '',
      nf_quantidade_volumes: c.nf_quantidade_volumes != null ? String(c.nf_quantidade_volumes) : '',
      nf_remetente_ie: c.nf_remetente_ie ?? '',
      nf_destinatario_ie: c.nf_destinatario_ie ?? '',
      nf_remetente_endereco: (c.nf_remetente_endereco as EnderecoNFe | null) ?? null,
      nf_destinatario_endereco: (c.nf_destinatario_endereco as EnderecoNFe | null) ?? null,
      tomador_papel: (c.tomador_papel as CotacaoFormState['tomador_papel']) ?? '',
      cidade_origem: c.cidade_origem ?? '',
      uf_origem: c.uf_origem ?? '',
      cidade_destino: c.cidade_destino ?? '',
      uf_destino: c.uf_destino ?? '',
      peso_bruto_kg: c.peso_bruto_kg != null ? String(c.peso_bruto_kg) : '',
      valor_nf: c.valor_nf != null ? String(c.valor_nf) : '',
      natureza_operacao: c.natureza_operacao ?? '',
      ncms_produtos: c.ncms_produtos && c.ncms_produtos.length > 0 ? c.ncms_produtos.join(', ') : '',
      tabela: c.tabela_antt ?? '',
      tipo_carga: c.tipo_carga ?? '',
      eixos: c.eixos != null ? String(c.eixos) : '',
      distancia_km: c.distancia_km != null ? String(c.distancia_km) : '',
      checkbox_carga_perigosa_manual: c.checkbox_carga_perigosa_manual,
      checkbox_carga_indivisivel_manual: c.checkbox_carga_indivisivel_manual,
      flag_peso_acima_limiar: c.flag_peso_acima_limiar,
      flag_valor_acima_teto_seguro: c.flag_valor_acima_teto_seguro,
      valor_frete_motorista: c.valor_frete_motorista != null ? String(c.valor_frete_motorista) : '',
      pedagio: c.pedagio != null ? String(c.pedagio) : '',
      faixa_risco_seguro: c.faixa_risco_seguro ?? '',
      // Cotação antiga só tinha o valor em R$ da TAG — sem a taxa não dá pra reconstruir o %.
      taxa_seguro_tag_pct: fracToPctStr(c.taxa_seguro_tag_pct),
      aliquota_imposto_pct: fracToPctStr(c.aliquota_imposto_pct ?? (c.valor_frete_motorista == null ? aliquotaPadrao : null)),
      lucro_pct: fracToPctStr(c.lucro_pct ?? (c.valor_frete_motorista == null ? lucroPadrao : null)),
      preco_modo: c.preco_modo === 'valor_final' ? 'valor_final' : 'lucro_pct',
      valor_final_manual: c.preco_modo === 'valor_final' && c.valor_total != null ? String(c.valor_total) : '',
      xml_danfe_url: c.xml_danfe_url ?? '',
      prazo_modo: c.prazo_personalizado ? 'personalizado' : 'regra',
      condicao_prazo_id: c.condicao_prazo_id ?? '',
      prazo_personalizado: (c.prazo_personalizado as unknown as RegraPrazo | null) ?? null,
      forma_recebimento: c.forma_recebimento ?? 'boleto',
      validade_dias: c.validade_dias != null ? String(c.validade_dias) : '5',
    })
    setEditingId(c.id)
    setEditingStatus(c.status)
    setPisoInfo(null)
    setPisoSalvo(c.piso_antt_calculado)
    setPrecoLegado(
      c.valor_frete_motorista == null && (c.valor_total != null || c.lucro_rbr != null)
        ? { valorTotal: c.valor_total, lucro: c.lucro_rbr }
        : null,
    )
    limparAuxiliares()
    const pracasSalvas = Array.isArray(c.pedagio_pracas) ? (c.pedagio_pracas as unknown as PracaSelecionada[]) : []
    setPracasPedagio(pracasSalvas)
    setItens([])
    carregarItens(c.id)
    carregarDestinos(c.id)
  }

  // Cliente já negociou antes? Repete o último prazo combinado com ele.
  async function sugerirPrazoDoCliente(clienteId: string) {
    const { data } = await supabase
      .from('cotacoes')
      .select('condicao_prazo_id, prazo_personalizado, forma_recebimento')
      .eq('cliente_id', clienteId)
      .or('condicao_prazo_id.not.is.null,prazo_personalizado.not.is.null')
      .order('created_at', { ascending: false })
      .limit(1)
    const ult = data?.[0]
    if (!ult) return
    setForm((f) =>
      f
        ? {
            ...f,
            prazo_modo: ult.prazo_personalizado ? 'personalizado' : 'regra',
            condicao_prazo_id: ult.condicao_prazo_id ?? f.condicao_prazo_id,
            prazo_personalizado: (ult.prazo_personalizado as unknown as RegraPrazo | null) ?? null,
            forma_recebimento: ult.forma_recebimento ?? f.forma_recebimento,
          }
        : f,
    )
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
              nf_numero: dados.numero ?? f.nf_numero,
              nf_serie: dados.serie ?? f.nf_serie,
              nf_data_emissao: dados.dataEmissao ?? f.nf_data_emissao,
              nf_produto_predominante: dados.produtoPredominante ?? f.nf_produto_predominante,
              nf_quantidade_volumes: dados.quantidadeVolumes != null ? String(dados.quantidadeVolumes) : f.nf_quantidade_volumes,
              nf_remetente_ie: dados.remetente.ie ?? f.nf_remetente_ie,
              nf_destinatario_ie: dados.destinatario.ie ?? f.nf_destinatario_ie,
              nf_remetente_endereco: dados.remetente.endereco ?? f.nf_remetente_endereco,
              nf_destinatario_endereco: dados.destinatario.endereco ?? f.nf_destinatario_endereco,
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

  // Mesmas regras do cadastro completo de clientes (Cadastros): PJ exige razão social + CNPJ, PF exige nome + CPF.
  async function criarClienteInline() {
    setErroNovoCliente(null)
    const pf = novoClienteTipo === 'PF'
    if (!novoClienteRazao.trim()) {
      setErroNovoCliente(pf ? 'Informe o nome.' : 'Informe a razão social.')
      return
    }
    if (!novoClienteCnpj.trim()) {
      setErroNovoCliente(pf ? 'Informe o CPF (pessoa física).' : 'Informe o CNPJ (pessoa jurídica).')
      return
    }
    setCriandoCliente(true)
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({
          tipo_pessoa_doc: novoClienteTipo,
          razao_social: novoClienteRazao.trim(),
          cnpj: pf ? null : novoClienteCnpj.trim(),
          cpf: pf ? novoClienteCnpj.trim() : null,
          origem: 'gestor',
        })
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

  // Calculadora opcional: distância real pela rota (OpenStreetMap, grátis). O Qualp segue sendo a
  // fonte principal — a distância dele pode ser digitada direto no campo.
  async function calcularRota() {
    if (!form) return
    if (!form.cidade_origem.trim() || !form.uf_origem.trim() || !form.cidade_destino.trim() || !form.uf_destino.trim()) {
      setRotaErro('Preencha cidade/UF de origem e destino antes de calcular.')
      return
    }
    setRotaCalculando(true)
    setRotaErro(null)
    setRotaResultado(null)
    try {
      const { data, error } = await supabase.functions.invoke('calcular-rota-frete', {
        body: {
          cidade_origem: form.cidade_origem.trim(),
          uf_origem: form.uf_origem.trim().toUpperCase(),
          cidade_destino: form.cidade_destino.trim(),
          uf_destino: form.uf_destino.trim().toUpperCase(),
          tipo_carga: form.tipo_carga || undefined,
          eixos: form.eixos ? Number(form.eixos) : undefined,
          tabela: form.tabela || undefined,
        },
      })
      if (error || !data?.sucesso) {
        setRotaErro(data?.erro ?? error?.message ?? 'Não consegui calcular a rota agora.')
        return
      }
      setRotaResultado(data as RotaCalculada)
    } catch (e) {
      setRotaErro(e instanceof Error ? e.message : 'Erro ao chamar o cálculo de rota.')
    } finally {
      setRotaCalculando(false)
    }
  }

  function usarDistanciaCalculada() {
    if (!rotaResultado) return
    setForm((f) => (f ? { ...f, distancia_km: String(rotaResultado.distancia_km) } : f))
  }

  function usarPisoComoFrete() {
    if (pisoReferencia == null) return
    setForm((f) => (f ? { ...f, valor_frete_motorista: String(round2(pisoReferencia)) } : f))
  }

  function escolherFaixaSeguro(faixa: string) {
    const encontrada = faixasSeguro.find((x) => x.faixa === faixa)
    setForm((f) =>
      f
        ? {
            ...f,
            faixa_risco_seguro: faixa,
            taxa_seguro_tag_pct: encontrada ? fracToPctStr(encontrada.pct) : f.taxa_seguro_tag_pct,
          }
        : f,
    )
  }

  function editarTaxaSeguro(valor: string) {
    const n = numOrNull(valor)
    const casada = n != null ? faixasSeguro.find((x) => Math.abs(x.pct * 100 - n) < 1e-9) : undefined
    setForm((f) =>
      f ? { ...f, taxa_seguro_tag_pct: valor, faixa_risco_seguro: casada ? casada.faixa : valor.trim() ? 'personalizada' : '' } : f,
    )
  }

  function editarLucroPct(valor: string) {
    setForm((f) => (f ? { ...f, lucro_pct: valor, preco_modo: 'lucro_pct', valor_final_manual: '' } : f))
  }

  function editarValorFinal(valor: string) {
    setForm((f) =>
      f
        ? valor.trim() === ''
          ? { ...f, preco_modo: 'lucro_pct', valor_final_manual: '' }
          : { ...f, preco_modo: 'valor_final', valor_final_manual: valor }
        : f,
    )
  }

  function voltarParaLucroPct() {
    setForm((f) =>
      f
        ? {
            ...f,
            preco_modo: 'lucro_pct',
            valor_final_manual: '',
            lucro_pct: composicao?.lucroPct != null ? fracToPctStr(Number(composicao.lucroPct.toFixed(4))) : f.lucro_pct,
          }
        : f,
    )
  }

  function montarPatch(f: CotacaoFormState): CotacaoUpdate {
    const ncms = f.ncms_produtos
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const flagPeso = pesoLimiarKg != null ? (f.peso_bruto_kg.trim() !== '' && (numOrNull(f.peso_bruto_kg) ?? 0) >= pesoLimiarKg) : f.flag_peso_acima_limiar
    const comp = calcularComposicao(f, lucroPadrao, itens)
    const taxaPct = numOrNull(f.taxa_seguro_tag_pct)
    const aliqPct = numOrNull(f.aliquota_imposto_pct)
    const lucroPctDigitado = numOrNull(f.lucro_pct)
    const modoValorFinal = f.preco_modo === 'valor_final' && numOrNull(f.valor_final_manual) != null

    // Preço: só mexe nos campos de resultado quando o frete do motorista foi informado. Numa cotação
    // antiga (sem frete do motorista), mantém o valor que já estava salvo até alguém preencher o frete.
    const preco: CotacaoUpdate =
      comp.frete == null && precoLegado
        ? {}
        : {
            valor_total: comp.valorFinal,
            lucro_rbr: comp.lucro,
            valor_imposto: comp.imposto,
            margem_ajustada: comp.margem,
            lucro_pct: modoValorFinal
              ? comp.lucroPct
              : lucroPctDigitado != null
                ? lucroPctDigitado / 100
                : lucroPadrao,
            preco_modo: modoValorFinal ? 'valor_final' : 'lucro_pct',
          }

    // Cotação com múltiplos destinos: o valor final ao cliente é a soma das linhas de destino,
    // não a composição de preço de rota única acima (que fica de fora — não faz sentido com
    // vários destinos e preços diferentes cada um).
    const somaDestinosPatch =
      destinos.length > 0
        ? round2(destinos.reduce((acc, d) => acc + (calcularCustoDestino(d, aliquotaDestinos).valorFinal ?? 0), 0))
        : null

    return {
      ...preco,
      ...(somaDestinosPatch != null ? { valor_total: somaDestinosPatch } : {}),
      valor_frete_motorista: comp.frete,
      faixa_risco_seguro: f.faixa_risco_seguro || null,
      taxa_seguro_tag_pct: taxaPct != null ? taxaPct / 100 : null,
      valor_seguro_tag: taxaPct != null ? comp.seguroTag : precoLegado ? undefined : null,
      aliquota_imposto_pct: aliqPct != null ? aliqPct / 100 : null,
      tabela_antt: f.tabela || null,
      cliente_id: f.cliente_id || null,
      origem: f.origem.trim() || 'gestor',
      agenciador_id: f.origem === 'agenciador' ? f.agenciador_id || null : null,
      projeto_id: f.projeto_id || null,
      nf_chave_acesso: f.nf_chave_acesso.trim() || null,
      nf_remetente_razao_social: f.nf_remetente_razao_social.trim() || null,
      nf_remetente_cnpj: f.nf_remetente_cnpj.trim() || null,
      nf_destinatario_razao_social: f.nf_destinatario_razao_social.trim() || null,
      nf_destinatario_cnpj: f.nf_destinatario_cnpj.trim() || null,
      nf_numero: f.nf_numero.trim() || null,
      nf_serie: f.nf_serie.trim() || null,
      nf_data_emissao: f.nf_data_emissao || null,
      nf_produto_predominante: f.nf_produto_predominante.trim() || null,
      nf_quantidade_volumes: numOrNull(f.nf_quantidade_volumes),
      nf_remetente_ie: f.nf_remetente_ie.trim() || null,
      nf_destinatario_ie: f.nf_destinatario_ie.trim() || null,
      nf_remetente_endereco: f.nf_remetente_endereco as unknown as Json,
      nf_destinatario_endereco: f.nf_destinatario_endereco as unknown as Json,
      tomador_papel: f.tomador_papel || null,
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
      pedagio_pracas: pracasPedagio.length > 0 ? (pracasPedagio as unknown as Json) : null,
      piso_antt_calculado: pisoInfo != null ? round2(pisoInfo.calculado) : pisoSalvo,
      xml_danfe_url: f.xml_danfe_url.trim() || null,
      condicao_prazo_id: f.prazo_modo === 'regra' ? f.condicao_prazo_id || null : null,
      prazo_personalizado: f.prazo_modo === 'personalizado' && f.prazo_personalizado ? (f.prazo_personalizado as unknown as Json) : null,
      forma_recebimento: f.forma_recebimento || 'boleto',
      validade_dias: numOrNull(f.validade_dias) ?? 5,
    }
  }

  function itensParaBanco() {
    return itens.map((i) => {
      const unit = numOrNull(i.valor_unitario) ?? 0
      return {
        tipo_id: i.tipo_id,
        descricao: i.descricao.trim(),
        forma_calculo: i.forma_calculo,
        quantidade: i.forma_calculo === 'pct_valor_nf' ? 1 : numOrNull(i.quantidade) ?? 0,
        valor_unitario: i.forma_calculo === 'pct_valor_nf' ? unit / 100 : unit,
        recebedor: i.recebedor,
        fornecedor_id: i.recebedor === 'fornecedor' ? i.fornecedor_id : '',
      }
    })
  }

  function validarItens(): string | null {
    for (const i of itens) {
      if (numOrNull(i.valor_unitario) != null && (numOrNull(i.valor_unitario) ?? 0) < 0) return 'Custo adicional com valor negativo.'
      if (i.forma_calculo !== 'pct_valor_nf' && (numOrNull(i.quantidade) ?? 0) < 0) return 'Custo adicional com quantidade negativa.'
    }
    return null
  }

  function validarDestinos(): string | null {
    for (const d of destinos) {
      if (!d.endereco.trim()) return 'Preencha o endereço de entrega em todo destino lançado.'
      const r = calcularCustoDestino(d, aliquotaDestinos)
      if (r.erro) return r.erro
      if (r.valorFinal == null || r.valorFinal <= 0) return 'Todo destino precisa de frete do motorista preenchido, pra calcular o valor final.'
    }
    return null
  }

  // Grava cotação + lista de custos adicionais e devolve a linha final (já recalculada pelo banco).
  async function gravarTudo(extra: CotacaoUpdate = {}): Promise<Cotacao> {
    if (!form) throw new Error('Formulário vazio.')
    if (form.prazo_modo === 'personalizado') {
      const r = form.prazo_personalizado
      if (!r || !r.parcelas.length) throw new Error('Defina ao menos uma parcela no prazo de recebimento.')
      const soma = r.parcelas.reduce((s, p) => s + (Number(p.percentual) || 0), 0)
      if (r.parcelas.some((p) => !(Number(p.percentual) > 0) || !(Number(p.dias) >= 0))) throw new Error('Prazo de recebimento: cada parcela precisa de % maior que zero e dias 0 ou mais.')
      if (Math.abs(soma - 100) > 0.01) throw new Error(`Prazo de recebimento: as parcelas somam ${soma.toLocaleString('pt-BR')}% — precisam somar 100%.`)
      if (r.modo === 'fechamento_mensal' && !r.dia_fixo) throw new Error('Prazo de recebimento: informe o dia do vencimento do fechamento mensal.')
    }
    const patch = montarPatch(form)
    let id = editingId
    if (!id) {
      const { data, error } = await supabase.from('cotacoes').insert(patch).select().single()
      if (error || !data) throw error ?? new Error('Falha ao criar cotação.')
      id = data.id
      setEditingId(data.id)
    } else {
      const { error } = await supabase.from('cotacoes').update(patch).eq('id', id)
      if (error) throw error
    }
    const { error: errItens } = await supabase.rpc('salvar_custos_adicionais_cotacao', {
      p_cotacao_id: id,
      p_itens: itensParaBanco(),
    })
    if (errItens) throw errItens
    // Destinos: apaga tudo que estava salvo e regrava a lista atual da tela (mesmo padrão
    // simples de "substituir tudo" usado pros custos adicionais, sem RPC porque aqui não tem
    // recálculo de gatilho no banco).
    const { error: errDelDestinos } = await supabase.from('cotacao_destinos').delete().eq('cotacao_id', id)
    if (errDelDestinos) throw errDelDestinos
    if (destinos.length > 0) {
      const { error: errInsDestinos } = await supabase.from('cotacao_destinos').insert(
        destinos.map((d, i) => ({
          cotacao_id: id as string,
          ordem: i,
          cidade_destino: d.cidade?.trim() || null,
          uf_destino: d.uf?.trim().toUpperCase() || null,
          endereco_entrega: d.endereco.trim(),
          tabela_antt: d.tabela || null,
          tipo_carga: d.tipo_carga || null,
          eixos: numOrNull(d.eixos),
          distancia_km: numOrNull(d.distancia_km),
          piso_antt_referencia: pisoRefDestino(d),
          frete_motorista: numOrNull(d.frete_motorista),
          pedagio: numOrNull(d.pedagio),
          margem_pct: (numOrNull(d.margem_pct) ?? 0) / 100,
          valor: calcularCustoDestino(d, aliquotaDestinos).valorFinal ?? 0,
        })),
      )
      if (errInsDestinos) throw errInsDestinos
    }
    if (Object.keys(extra).length > 0) {
      const { error } = await supabase.from('cotacoes').update(extra).eq('id', id)
      if (error) throw error
    }
    const { data: final, error: errFinal } = await supabase.from('cotacoes').select('*').eq('id', id).single()
    if (errFinal || !final) throw errFinal ?? new Error('Falha ao reler a cotação.')
    return final
  }

  async function salvar() {
    if (!form) return
    setFormError(null)
    setSuccessMsg(null)
    if (!form.cliente_id) {
      setFormError('Selecione ou cadastre um cliente antes de salvar.')
      return
    }
    if (composicao?.erro) {
      setFormError(composicao.erro)
      return
    }
    const erroItens = validarItens()
    if (erroItens) {
      setFormError(erroItens)
      return
    }
    const erroDestinos = validarDestinos()
    if (erroDestinos) {
      setFormError(erroDestinos)
      return
    }
    setSaving(true)
    try {
      const eraNova = !editingId
      const final = await gravarTudo()
      setEditingStatus(final.status)
      sincronizarComBanco(final)
      setSuccessMsg(eraNova ? 'Cotação criada com sucesso.' : 'Cotação atualizada com sucesso.')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar cotação.')
    } finally {
      setSaving(false)
    }
  }

  // Depois de gravar, o banco é quem manda: confere que o valor final gravado bate com o da tela.
  function sincronizarComBanco(c: Cotacao) {
    setPisoSalvo(c.piso_antt_calculado)
    if (c.valor_frete_motorista != null) setPrecoLegado(null)
    const telaFinal = composicao?.valorFinal ?? null
    if (c.valor_total != null && telaFinal != null && Math.abs(c.valor_total - telaFinal) >= 0.01) {
      setFormError(
        `Atenção: o valor final gravado no banco (${formatMoney(c.valor_total)}) ficou diferente do mostrado na tela (${formatMoney(telaFinal)}). Reabra a cotação pra conferir.`,
      )
    }
  }

  // Enviar grava tudo que está na tela (inclusive custos adicionais) e marca como enviada.
  async function enviar() {
    if (!form || !editingId) return
    setFormError(null)
    setSuccessMsg(null)
    if (composicao?.erro) {
      setFormError(composicao.erro)
      return
    }
    const erroItens = validarItens()
    if (erroItens) {
      setFormError(erroItens)
      return
    }
    const erroDestinos = validarDestinos()
    if (erroDestinos) {
      setFormError(erroDestinos)
      return
    }
    setSaving(true)
    try {
      const final = await gravarTudo({ status: 'enviada' })
      sincronizarComBanco(final)
      setEditingStatus('enviada')
      setSuccessMsg('Cotação salva e marcada como enviada.')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao enviar cotação.')
    } finally {
      setSaving(false)
    }
  }


  async function converter() {
    if (!form || !editingId) return
    setFormError(null)
    setSuccessMsg(null)
    if (!form.cliente_id) {
      setFormError('Selecione um cliente antes de converter em operação.')
      return
    }
    if (destinos.length > 0) {
      setFormError('Cotação com múltiplos destinos ainda não converte em operação automaticamente — crie a operação de cada trecho manualmente em Operações.')
      return
    }
    if (composicao?.frete == null || composicao.valorFinal == null) {
      setFormError('Preencha o frete do motorista (e o restante da composição do preço) antes de converter em operação.')
      return
    }
    if (composicao.erro) {
      setFormError(composicao.erro)
      return
    }
    if (freteAbaixoDoPiso) {
      setFormError(
        `O frete do motorista (${formatMoney(composicao.frete)}) está abaixo do piso mínimo ANTT (${formatMoney(pisoReferencia)}). Pela lei o motorista não pode receber menos que o piso — o CIOT é rejeitado. Ajuste antes de converter.`,
      )
      return
    }
    if (obrigatoriosFaltando.length > 0) {
      setFormError(`Custo obrigatório faltando: ${obrigatoriosFaltando.map((t) => t.nome).join(', ')}.`)
      return
    }
    const erroItens = validarItens()
    if (erroItens) {
      setFormError(erroItens)
      return
    }
    setSaving(true)
    try {
      const final = await gravarTudo({ status: 'convertida' })
      sincronizarComBanco(final)
      setEditingStatus('convertida')
      setSuccessMsg('Cotação convertida — operação criada automaticamente.')
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao converter cotação em operação.')
    } finally {
      setSaving(false)
    }
  }

  async function marcarPerdida() {
    if (!editingId) return
    setFormError(null)
    setSuccessMsg(null)
    if (!motivoPerda) {
      setFormError('Escolha o motivo da perda.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('cotacoes')
      .update({ status: 'perdida', motivo_perda: motivoPerda, motivo_perda_detalhe: detalhePerda.trim() || null })
      .eq('id', editingId)
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setEditingStatus('perdida')
    setShowPerda(false)
    setSuccessMsg('Cotação marcada como perdida.')
    await load()
  }

  async function reabrir() {
    if (!editingId) return
    setFormError(null)
    setSuccessMsg(null)
    setSaving(true)
    const { error } = await supabase.from('cotacoes').update({ status: 'rascunho' }).eq('id', editingId)
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    setEditingStatus('rascunho')
    setMotivoPerda('')
    setDetalhePerda('')
    setSuccessMsg('Cotação reaberta como rascunho.')
    await load()
  }

  // Descrição legível do prazo combinado com o cliente, pro PDF (mesma lógica de leitura
  // usada na tela: regra cadastrada ou prazo personalizado desta negociação).
  function textoPrazoPagamento(): string {
    if (!form) return '-'
    let regra: RegraPrazo | null = null
    if (form.prazo_modo === 'personalizado') {
      regra = form.prazo_personalizado
    } else {
      const c = condicoesPrazo.find((x) => x.id === form.condicao_prazo_id)
      regra = c ? regraDeCondicao(c) : null
    }
    return descreverRegra(regra)
  }

  // Gera o PDF da cotação (dados_empresa + composição já calculada em tela) e dispara o
  // download — é o "emitir cotação" que substitui o papel timbrado manual em Word.
  // modo 'whatsapp': em vez de só baixar, tenta compartilhar o PDF já anexado (celular/Windows
  // com Web Share API pra arquivo); sem suporte, abre a conversa no WhatsApp Web e baixa o PDF
  // pra anexar na hora — mesmo padrão já usado no envio de fatura.
  async function emitirPdf(modo: 'baixar' | 'whatsapp' = 'baixar') {
    if (!form || !editingId) return
    setFormError(null)
    if (!form.cliente_id) {
      setFormError('Selecione um cliente antes de emitir a cotação.')
      return
    }
    const multiDestino = destinos.length > 0
    if (!multiDestino) {
      if (!composicao || composicao.valorFinal == null) {
        setFormError('Preencha o frete do motorista (e o restante da composição do preço) antes de emitir a cotação.')
        return
      }
      if (composicao.erro) {
        setFormError(composicao.erro)
        return
      }
    } else {
      const erroDestinos = validarDestinos()
      if (erroDestinos) {
        setFormError(erroDestinos)
        return
      }
    }
    setEmitindoPdf(true)
    try {
      const cliente = clientes.find((c) => c.id === form.cliente_id)
      const valorNf = numOrNull(form.valor_nf) ?? 0
      // Cotação com múltiplos destinos: uma linha por destino (cidade/UF + valor final daquele
      // trecho), sem detalhar a composição de custo — igual ao modelo antigo (Fretes Cotados).
      // Cotação de rota única: detalha frete/pedágio/seguro/custos como sempre.
      const itensPreco: ItemPrecoCotacao[] = multiDestino
        ? destinos.map((d) => ({
            descricao: d.endereco.trim() || [d.cidade, d.uf].filter(Boolean).join('/'),
            valor: calcularCustoDestino(d, aliquotaDestinos).valorFinal ?? 0,
          }))
        : []
      if (!multiDestino && composicao) {
        if (composicao.frete != null) itensPreco.push({ descricao: 'Frete rodoviário', valor: composicao.frete })
        if (composicao.pedagio > 0) {
          const detalhe =
            pracasPedagio.length > 0
              ? pracasPedagio.map((p) => `${p.nome} (${p.rodovia}${p.km != null ? ` km ${p.km}` : ''})`).join(' · ')
              : undefined
          itensPreco.push({ descricao: 'Pedágio', valor: composicao.pedagio, detalhe })
        }
        if (composicao.seguroTag > 0) itensPreco.push({ descricao: 'Seguro (TAG)', valor: composicao.seguroTag })
        for (const i of itens) {
          const valor = valorItem(i, valorNf)
          if (valor !== 0) itensPreco.push({ descricao: i.descricao.trim() || tipoPorId.get(i.tipo_id)?.nome || 'Custo adicional', valor })
        }
      }
      const valorTotalPdf = multiDestino ? (somaDestinos ?? 0) : (composicao?.valorFinal ?? 0)
      const dados: CotacaoPdfDados = {
        numero: editingId.slice(0, 8).toUpperCase(),
        dataEmissao: new Date().toISOString(),
        clienteNome: cliente?.nome_fantasia || cliente?.razao_social || '-',
        clienteDocumento: cliente?.cnpj ? `CNPJ ${cliente.cnpj}` : cliente?.cpf ? `CPF ${cliente.cpf}` : null,
        clienteContato: cliente?.nome_contato_comercial || null,
        cidadeOrigem: form.cidade_origem || null,
        ufOrigem: form.uf_origem || null,
        cidadeDestino: multiDestino ? null : form.cidade_destino || null,
        ufDestino: multiDestino ? null : form.uf_destino || null,
        distanciaKm: multiDestino ? null : numOrNull(form.distancia_km),
        tipoCarga: form.tipo_carga || null,
        pesoBrutoKg: numOrNull(form.peso_bruto_kg),
        valorNf: numOrNull(form.valor_nf),
        itensPreco,
        valorTotal: valorTotalPdf,
        prazoPagamento: textoPrazoPagamento(),
        formaPagamento: FORMA_PAGTO_LABEL[form.forma_recebimento] ?? form.forma_recebimento,
        validadeDias: numOrNull(form.validade_dias) ?? 5,
      }
      const [{ gerarCotacaoPdf }, empresa] = await Promise.all([import('../lib/cotacaoPdf'), lerParametro<EmpresaCotacao>('dados_empresa')])
      const blob = gerarCotacaoPdf(dados, empresa ?? {})
      const nomeArquivo = `cotacao-${dados.numero}-${(dados.clienteNome ?? '').replace(/[^\w]+/g, '-').slice(0, 30)}.pdf`

      if (modo === 'whatsapp') {
        if (!cliente?.celular_whatsapp) {
          setFormError('Esse cliente não tem WhatsApp cadastrado — adicione o número em Cadastros antes de enviar.')
          return
        }
        const primeiroNome = (cliente.nome_contato_comercial || dados.clienteNome || '').split(' ')[0]
        const trecho = dados.cidadeDestino ? `${dados.cidadeOrigem ?? '?'}/${dados.ufOrigem ?? '?'} → ${dados.cidadeDestino}/${dados.ufDestino ?? '?'}` : 'vários destinos'
        const texto = `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Aqui é da RBR Cargo. Segue a cotação nº ${dados.numero} (${trecho}), valor ${formatMoney(dados.valorTotal)}. Já anexo o PDF aqui.`
        const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' })
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> }
        if (nav.share && nav.canShare?.({ files: [arquivo] })) {
          try {
            await nav.share({ files: [arquivo], text: texto, title: `Cotação ${dados.numero}` })
          } catch (e) {
            if ((e as Error)?.name !== 'AbortError') setFormError(e instanceof Error ? e.message : 'Não consegui compartilhar o PDF.')
          }
          return
        }
        // Sem compartilhamento nativo de arquivo (a maioria dos navegadores em computador):
        // abre a conversa do cliente já logada no WhatsApp Web e baixa o PDF pra anexar na hora.
        window.open(whatsappLink(cliente.celular_whatsapp, texto), '_blank', 'noopener')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = nomeArquivo
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setSuccessMsg('PDF baixado — é só anexar na conversa do WhatsApp que abriu.')
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivo
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao gerar o PDF da cotação.')
    } finally {
      setEmitindoPdf(false)
    }
  }

  function adicionarItem(tipoId: string) {
    const t = tipoPorId.get(tipoId)
    if (!t) return
    setItens((lista) => [...lista, itemDeTipo(t)])
    setTipoParaAdicionar('')
  }

  function editarItem(key: string, campo: keyof ItemCusto, valor: string) {
    setItens((lista) => lista.map((i) => (i.key === key ? { ...i, [campo]: valor } : i)))
  }

  function removerItem(key: string) {
    setItens((lista) => lista.filter((i) => i.key !== key))
  }

  function adicionarDestino() {
    setDestinos((lista) => [
      ...lista,
      {
        key: novaChave(),
        endereco: '',
        tabela: '',
        tipo_carga: '',
        eixos: '',
        distancia_km: '',
        frete_motorista: '',
        pedagio: '',
        margem_pct: '',
      },
    ])
  }

  function editarDestino(key: string, campo: keyof DestinoLinha, valor: string) {
    setDestinos((lista) =>
      lista.map((d) => {
        if (d.key !== key) return d
        const atualizado = { ...d, [campo]: valor }
        // Trocar tabela ou tipo de carga pode invalidar o eixos escolhido — limpa se a
        // combinação nova não tiver mais essa opção (mesmo comportamento da rota única).
        if (campo === 'tabela' || campo === 'tipo_carga') {
          const opcoes = eixosOpcoesPara(atualizado.tabela, atualizado.tipo_carga)
          if (atualizado.eixos && !opcoes.includes(Number(atualizado.eixos))) atualizado.eixos = ''
        }
        return atualizado
      }),
    )
  }

  function removerDestino(key: string) {
    setDestinos((lista) => lista.filter((d) => d.key !== key))
    setErroDestino((e) => (e?.key === key ? null : e))
  }

  // Botão "Calcular Piso ANTT + Pedágio" de uma linha de destino: usa o endereço completo do
  // cliente (origem) e o endereço de entrega do destino (destino) pra traçar a rota e estimar
  // o piso ANTT — o mesmo edge function da rota única, só que com endereço em vez de cidade/UF.
  // Pedágio segue manual por enquanto: a calculadora ainda não estima praças na rota.
  async function calcularRotaDestino(key: string) {
    const d = destinos.find((x) => x.key === key)
    if (!d) return
    if (!enderecoOrigemCliente) {
      setErroDestino({ key, msg: 'Selecione um cliente com endereço cadastrado antes de calcular.' })
      return
    }
    if (!d.endereco.trim()) {
      setErroDestino({ key, msg: 'Preencha o endereço de entrega antes de calcular.' })
      return
    }
    setErroDestino(null)
    setCalculandoDestino(key)
    try {
      const { data, error } = await supabase.functions.invoke('calcular-rota-frete', {
        body: {
          endereco_origem: enderecoOrigemCliente,
          endereco_destino: d.endereco.trim(),
          tipo_carga: d.tipo_carga || undefined,
          eixos: d.eixos ? Number(d.eixos) : undefined,
          tabela: d.tabela || undefined,
        },
      })
      if (error || !data?.sucesso) {
        setErroDestino({ key, msg: data?.erro ?? error?.message ?? 'Não consegui calcular a rota agora.' })
        return
      }
      const resultado = data as RotaCalculada
      setDestinos((lista) =>
        lista.map((x) => (x.key === key ? { ...x, distancia_km: String(resultado.distancia_km) } : x)),
      )
    } catch (e) {
      setErroDestino({ key, msg: e instanceof Error ? e.message : 'Erro ao chamar o cálculo de rota.' })
    } finally {
      setCalculandoDestino(null)
    }
  }

  const clienteNomePorId = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nome_fantasia ?? c.razao_social ?? ''])),
    [clientes],
  )
  const clienteWhatsappPorId = useMemo(() => new Map(clientes.map((c) => [c.id, c.celular_whatsapp])), [clientes])

  // Clique em "Enviar WhatsApp" num card da lista: abre a cotação (reaproveita o mesmo cálculo
  // de composição do formulário) e marca como pendente — o efeito abaixo dispara assim que
  // custos adicionais e destinos terminarem de carregar.
  function enviarWhatsAppDaLista(c: CotacaoEnriquecida) {
    if (!clienteWhatsappPorId.get(c.cliente_id ?? '')) {
      setListError('Esse cliente não tem WhatsApp cadastrado — adicione o número em Cadastros antes de enviar.')
      return
    }
    setListError(null)
    abrirEdicao(c)
    setPendingWhatsAppId(c.id)
  }

  useEffect(() => {
    if (!pendingWhatsAppId || editingId !== pendingWhatsAppId) return
    if (carregandoItens || carregandoDestinos) return
    setPendingWhatsAppId(null)
    emitirPdf('whatsapp')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWhatsAppId, editingId, carregandoItens, carregandoDestinos])

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim())
    const digitos = termo.replace(/\D/g, '')
    return (cotacoes ?? []).filter((c) => {
      if (filtro !== 'todas' && c.status !== filtro) return false
      if (!termo) return true
      const campos = [
        c.clienteNome ?? clienteNomePorId.get(c.cliente_id ?? '') ?? '',
        c.cidade_origem ?? '',
        c.uf_origem ?? '',
        c.cidade_destino ?? '',
        c.uf_destino ?? '',
        c.nf_remetente_razao_social ?? '',
        c.nf_destinatario_razao_social ?? '',
      ]
      if (campos.some((x) => normalizar(x).includes(termo))) return true
      if (digitos.length >= 4) {
        const docs = [c.nf_chave_acesso, c.nf_remetente_cnpj, c.nf_destinatario_cnpj].map((x) => (x ?? '').replace(/\D/g, ''))
        if (docs.some((d) => d.includes(digitos))) return true
      }
      return false
    })
  }, [cotacoes, filtro, busca, clienteNomePorId])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)] flex items-center gap-2">
          <IconQuote width={26} height={26} style={{ color: 'var(--rbr-gold)' }} />
          Cotação &amp; Funil
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Buscar cliente, cidade, NF…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--rbr-border)', minWidth: 220 }}
          />
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
            onClick={() => setShowCatalogo((v) => !v)}
            className="text-sm font-bold px-4 py-2 rounded-xl border"
            style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
          >
            {showCatalogo ? 'Fechar tabela de custos' : 'Tabela de custos'}
          </button>
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

      {showCatalogo && (
        <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3" style={cardStyle}>
          <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Tabela de custos adicionais</div>
          {tiposCusto.length === 0 ? (
            <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
          ) : (
            <CatalogoCustos tipos={tiposCusto} onSalvo={loadCatalogoCustos} />
          )}
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

          {editingStatus === 'perdida' && (
            <div className="rounded-xl px-3.5 py-3 flex flex-col gap-1" style={{ background: '#FBE9E9' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
                Cotação perdida
              </div>
              <div className="text-xs text-[color:var(--rbr-navy-dark)]">
                Motivo: {MOTIVO_PERDA_LABEL[cotacoes?.find((c) => c.id === editingId)?.motivo_perda ?? ''] ?? '—'}
                {cotacoes?.find((c) => c.id === editingId)?.motivo_perda_detalhe
                  ? ` — ${cotacoes?.find((c) => c.id === editingId)?.motivo_perda_detalhe}`
                  : ''}
                . Use “Reabrir” pra voltar a trabalhar nela.
              </div>
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
                onChange={(e) => {
                  const id = e.target.value
                  const cli = clientes.find((c) => c.id === id)
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          cliente_id: id,
                          // Origem da rota vem do endereço cadastrado do cliente — mantém
                          // cidade/UF de origem preenchidas por trás pra não quebrar a
                          // calculadora de rota única, que ainda usa esses dois campos.
                          cidade_origem: cli?.cidade ?? f.cidade_origem,
                          uf_origem: cli?.uf ?? f.uf_origem,
                        }
                      : f,
                  )
                  if (id && !editingId) sugerirPrazoDoCliente(id)
                }}
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
                <div className="flex gap-2">
                  {(['PJ', 'PF'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNovoClienteTipo(t)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                      style={
                        novoClienteTipo === t
                          ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' }
                          : { background: '#fff', color: 'var(--rbr-navy)', borderColor: 'var(--rbr-border)' }
                      }
                    >
                      {t === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    placeholder={novoClienteTipo === 'PF' ? 'Nome completo *' : 'Razão social *'}
                    value={novoClienteRazao}
                    onChange={(e) => setNovoClienteRazao(e.target.value)}
                    className={inputClass}
                    style={{ ...inputStyle, background: '#fff' }}
                  />
                  <input
                    placeholder={novoClienteTipo === 'PF' ? 'CPF *' : 'CNPJ *'}
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
                <div className="text-[11px] text-[color:var(--rbr-muted)]">
                  Cadastro rápido — endereço e contatos podem ser completados depois em Cadastros → Clientes.
                </div>
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
                  {agenciadoresAtivos.map((a) => (
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

          {/* Dados fiscais da NF-e — opcional, só usado na emissão de CT-e/MDF-e depois.
              Colapsado por padrão pra não competir com os campos de rota (esses sim usados em
              toda cotação); abre sozinho se já tiver dado de NF-e salvo. */}
          <details
            className="rounded-xl p-3.5"
            style={{ background: 'var(--rbr-muted-bg)' }}
            open={Boolean(form.nf_chave_acesso || form.nf_remetente_razao_social || form.nf_destinatario_razao_social || form.xml_danfe_url)}
          >
            <summary className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] cursor-pointer">
              Dados fiscais da NF-e (opcional) — XML, CT-e/MDF-e
            </summary>
            <div className="flex flex-col gap-3 mt-3">
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Carregar XML da NF-e</label>
              <input type="file" accept=".xml,text/xml" onChange={handleXmlUpload} className="text-xs" />
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Leitura 100% local do arquivo — preenche os campos abaixo automaticamente, inclusive origem/destino da rota, mas todos continuam
                editáveis depois.
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

          {/* Dados complementares da NF (vão pra ficha da assessoria: CT-e/MDF-e) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Nº da NF</label>
              <input value={form.nf_numero} onChange={(e) => setForm((f) => (f ? { ...f, nf_numero: e.target.value } : f))} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass}>Série</label>
              <input value={form.nf_serie} onChange={(e) => setForm((f) => (f ? { ...f, nf_serie: e.target.value } : f))} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass}>Emissão da NF</label>
              <input type="date" value={form.nf_data_emissao} onChange={(e) => setForm((f) => (f ? { ...f, nf_data_emissao: e.target.value } : f))} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass}>Volumes</label>
              <input inputMode="decimal" value={form.nf_quantidade_volumes} onChange={(e) => setForm((f) => (f ? { ...f, nf_quantidade_volumes: e.target.value } : f))} className={inputClass} style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Produto predominante</label>
              <input value={form.nf_produto_predominante} onChange={(e) => setForm((f) => (f ? { ...f, nf_produto_predominante: e.target.value } : f))} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass}>IE remetente</label>
              <input value={form.nf_remetente_ie} onChange={(e) => setForm((f) => (f ? { ...f, nf_remetente_ie: e.target.value } : f))} className={inputClass} style={inputStyle} placeholder="ou ISENTO" />
            </div>
            <div>
              <label className={labelClass}>IE destinatário</label>
              <input value={form.nf_destinatario_ie} onChange={(e) => setForm((f) => (f ? { ...f, nf_destinatario_ie: e.target.value } : f))} className={inputClass} style={inputStyle} placeholder="ou ISENTO" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['remetente', 'destinatario'] as const).map((parte) => {
              const campo = parte === 'remetente' ? 'nf_remetente_endereco' : 'nf_destinatario_endereco'
              const end = form[campo] ?? {
                logradouro: null, numero: null, complemento: null, bairro: null, municipio: null, codigo_ibge: null, uf: null, cep: null,
              }
              const set = (k: keyof EnderecoNFe, v: string) =>
                setForm((f) => (f ? { ...f, [campo]: { ...(f[campo] ?? end), [k]: v.trim() === '' ? null : v } } : f))
              return (
                <div key={parte} className="rounded-lg border p-2.5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                    Endereço do {parte === 'remetente' ? 'remetente' : 'destinatário'}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <input placeholder="Logradouro" value={end.logradouro ?? ''} onChange={(e) => set('logradouro', e.target.value)} className={`${inputClass} col-span-3`} style={inputStyle} />
                    <input placeholder="Nº" value={end.numero ?? ''} onChange={(e) => set('numero', e.target.value)} className={inputClass} style={inputStyle} />
                    <input placeholder="Complemento" value={end.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} className={`${inputClass} col-span-2`} style={inputStyle} />
                    <input placeholder="Bairro" value={end.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} className={`${inputClass} col-span-2`} style={inputStyle} />
                    <input placeholder="Município" value={end.municipio ?? ''} onChange={(e) => set('municipio', e.target.value)} className={`${inputClass} col-span-2`} style={inputStyle} />
                    <input placeholder="UF" maxLength={2} value={end.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} className={inputClass} style={inputStyle} />
                    <input placeholder="CEP" value={end.cep ?? ''} onChange={(e) => set('cep', e.target.value)} className={inputClass} style={inputStyle} />
                  </div>
                </div>
              )
            })}
          </div>

          <div>
            <label className={labelClass}>Quem paga o frete (tomador do CT-e)</label>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={form.tomador_papel}
                onChange={(e) => setForm((f) => (f ? { ...f, tomador_papel: e.target.value as CotacaoFormState['tomador_papel'] } : f))}
                className={inputClass}
                style={{ ...inputStyle, maxWidth: 320 }}
              >
                <option value="">Selecione…</option>
                <option value="remetente">Remetente (quem envia)</option>
                <option value="destinatario">Destinatário (quem recebe)</option>
                <option value="terceiro">Terceiro — o cliente desta cotação</option>
              </select>
              {!form.tomador_papel && tomadorSugerido && (
                <button
                  type="button"
                  onClick={() => setForm((f) => (f ? { ...f, tomador_papel: tomadorSugerido } : f))}
                  className="text-[11px] underline font-semibold"
                >
                  usar sugestão: {tomadorSugerido === 'remetente' ? 'remetente' : tomadorSugerido === 'destinatario' ? 'destinatário' : 'terceiro (cliente)'}
                </button>
              )}
            </div>
            </div>
            </div>
          </details>

          {/* Rota */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Origem</label>
            {clienteSelecionado ? (
              <div className="text-xs font-semibold rounded-lg px-3 py-2" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }}>
                {enderecoOrigemCliente || 'Cliente selecionado não tem endereço cadastrado — complete o cadastro pra calcular a rota.'}
              </div>
            ) : (
              <div className="text-[11px] text-[color:var(--rbr-muted)]">Selecione um cliente acima — a origem vem do endereço cadastrado dele.</div>
            )}
          </div>
          {destinos.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          )}
          {destinos.length > 0 && (
            <div className="text-[11px] text-[color:var(--rbr-muted)] -mt-2">
              Cidade/UF destino ficam de fora — essa cotação tem vários destinos (lista abaixo, cada um com endereço próprio).
            </div>
          )}

          {/* Destinos múltiplos — cotação com vários destinos a partir da mesma origem (ex.: CD
              que despacha pra várias cidades), cada um com seu preço final ao cliente. */}
          <details className="rounded-xl border p-3.5" style={{ borderColor: 'var(--rbr-border)' }} open={destinos.length > 0}>
            <summary className="text-sm font-bold text-[color:var(--rbr-navy-dark)] cursor-pointer flex items-center justify-between gap-2 flex-wrap">
              <span>
                Vários destinos (opcional) {carregandoDestinos && '· carregando…'}
                {destinos.length > 0 && ` — ${destinos.length} destino${destinos.length > 1 ? 's' : ''}`}
              </span>
              {somaDestinos != null && <span className="text-sm font-bold tabular-nums">{formatMoney(somaDestinos)}</span>}
            </summary>
            <div className="flex flex-col gap-2.5 mt-3">
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Pra cotação com um CD ou origem única distribuindo pra várias cidades — cada linha é um destino com o valor final
                cobrado do cliente naquele trecho. Ao usar essa lista, o valor total da cotação vira a soma das linhas (a composição de
                preço de rota única abaixo fica de fora). "Converter em operação" fica desabilitado — crie a operação de cada trecho
                manualmente depois.
              </div>

              {destinos.map((d) => {
                const opcoesEixos = eixosOpcoesPara(d.tabela, d.tipo_carga)
                const ref = pisoRefDestino(d)
                const custoDestino = calcularCustoDestino(d, aliquotaDestinos)
                const freteNum = numOrNull(d.frete_motorista)
                const abaixo = ref != null && freteNum != null && freteNum < round2(ref)
                const calculando = calculandoDestino === d.key
                const erro = erroDestino?.key === d.key ? erroDestino.msg : null
                const badgeStyle: CSSProperties = {
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '.03em',
                  background: 'var(--rbr-positive)',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 999,
                }
                return (
                  <div key={d.key} className="rounded-lg border p-3 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
                    <div>
                      <label className={labelClass}>Endereço de entrega completo</label>
                      <input
                        placeholder="Rua, número, bairro, cidade/UF"
                        value={d.endereco}
                        onChange={(e) => editarDestino(d.key, 'endereco', e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        value={d.tabela}
                        onChange={(e) => editarDestino(d.key, 'tabela', e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        <option value="">Tabela ANTT</option>
                        {TABELAS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={d.tipo_carga}
                        onChange={(e) => editarDestino(d.key, 'tipo_carga', e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      >
                        <option value="">Tipo de carga</option>
                        {TIPOS_CARGA.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <select
                        value={d.eixos}
                        onChange={(e) => editarDestino(d.key, 'eixos', e.target.value)}
                        disabled={opcoesEixos.length === 0}
                        className={inputClass}
                        style={inputStyle}
                      >
                        <option value="">{opcoesEixos.length === 0 ? 'Escolha tabela e tipo' : 'Eixos'}</option>
                        {opcoesEixos.map((n) => (
                          <option key={n} value={n}>
                            {n} eixos
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => calcularRotaDestino(d.key)}
                        disabled={calculando}
                        className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-60"
                        style={{ background: 'var(--rbr-navy)', color: '#fff' }}
                      >
                        {calculando ? 'Calculando…' : 'Calcular Piso ANTT + Pedágio'}
                      </button>
                      <span className="text-[11px] text-[color:var(--rbr-muted)]">
                        Usa o endereço do cliente (origem) e o de entrega acima. Pedágio ainda é estimado manualmente — confira antes de emitir.
                      </span>
                    </div>
                    {erro && (
                      <div className="text-[11px] font-semibold rounded-lg px-2.5 py-1.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                        {erro}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded-lg p-2.5" style={{ background: 'var(--rbr-muted-bg)' }}>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={labelClass} style={{ marginBottom: 0 }}>
                            Distância (km)
                          </label>
                          {d.distancia_km && <span style={badgeStyle}>calculado</span>}
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={d.distancia_km}
                          onChange={(e) => editarDestino(d.key, 'distancia_km', e.target.value)}
                          className={inputClass}
                          style={{ ...inputStyle, background: '#fff' }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={labelClass} style={{ marginBottom: 0 }}>
                            Piso ANTT (R$)
                          </label>
                          {ref != null && <span style={badgeStyle}>calculado</span>}
                        </div>
                        <input readOnly value={ref != null ? formatMoney(ref) : '—'} className={inputClass} style={{ ...inputStyle, background: '#fbfbfd' }} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={labelClass} style={{ marginBottom: 0 }}>
                            Pedágio (R$)
                          </label>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={d.pedagio}
                          onChange={(e) => editarDestino(d.key, 'pedagio', e.target.value)}
                          className={inputClass}
                          style={{ ...inputStyle, background: '#fff' }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className={labelClass}>Frete motorista (R$)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={d.frete_motorista}
                          onChange={(e) => editarDestino(d.key, 'frete_motorista', e.target.value)}
                          className={inputClass}
                          style={{ ...inputStyle, borderColor: abaixo ? 'var(--rbr-danger)' : 'var(--rbr-border)', fontWeight: 700 }}
                        />
                        {abaixo && ref != null && (
                          <div className="text-[11px] font-semibold mt-1" style={{ color: 'var(--rbr-danger)' }}>
                            Abaixo do piso ANTT de referência ({formatMoney(ref)}).
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={labelClass}>Margem (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={d.margem_pct}
                          onChange={(e) => editarDestino(d.key, 'margem_pct', e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {custoDestino.erro && (
                      <div className="text-[11px] font-semibold rounded-lg px-2.5 py-1.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                        {custoDestino.erro}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t" style={{ borderColor: 'var(--rbr-border)' }}>
                      <div className="flex items-center gap-4 text-[11px] text-[color:var(--rbr-muted)]">
                        <span>
                          Custo: <strong className="text-[color:var(--rbr-navy-dark)]">{formatMoney(custoDestino.custo)}</strong>
                        </span>
                        {custoDestino.lucro != null && (
                          <span>
                            Lucro líquido: <strong className="text-[color:var(--rbr-navy-dark)]">{formatMoney(custoDestino.lucro)}</strong>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-extrabold tabular-nums text-[color:var(--rbr-navy-dark)]">
                          {custoDestino.valorFinal != null ? formatMoney(custoDestino.valorFinal) : '—'}
                        </span>
                        <button type="button" onClick={() => removerDestino(d.key)} className="text-[11px] font-semibold underline" style={{ color: 'var(--rbr-danger)' }}>
                          remover
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={adicionarDestino}
                className="self-start text-[11px] font-bold px-2.5 py-1.5 rounded-lg border"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
              >
                + Adicionar destino
              </button>
            </div>
          </details>

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
            {tetoSeguro != null ? (
              <div className="col-span-2 md:col-span-4 flex items-center gap-2 text-xs font-semibold">
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{
                    background: form.flag_valor_acima_teto_seguro ? '#FBE9E9' : 'var(--rbr-muted-bg)',
                    color: form.flag_valor_acima_teto_seguro ? 'var(--rbr-danger)' : 'var(--rbr-muted)',
                  }}
                >
                  {form.flag_valor_acima_teto_seguro ? 'Valor acima do teto do seguro' : 'Valor dentro do teto do seguro'}
                </span>
                <span className="text-[11px] font-normal text-[color:var(--rbr-muted)]">
                  Automático — teto da apólice vigente: {formatMoney(tetoSeguro)} por embarque.
                </span>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-xs font-semibold col-span-2 md:col-span-4">
                <input
                  type="checkbox"
                  checked={form.flag_valor_acima_teto_seguro}
                  onChange={(e) => setForm((f) => (f ? { ...f, flag_valor_acima_teto_seguro: e.target.checked } : f))}
                />
                Valor acima do teto de seguro (marcação manual — cadastre a apólice em Operações → Dados de emissão pra ficar automático)
              </label>
            )}
          </div>

          {/* Composição do preço */}
          <div className="rounded-xl border p-3.5 flex flex-col gap-4" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Composição do preço</div>
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Pedágio e distância: consultar no Qualp. O valor final atualiza conforme os campos são preenchidos.
              </div>
            </div>

            {destinos.length > 0 && (
              <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
                Essa cotação tem vários destinos (seção acima) — o valor total ao cliente é a soma dos destinos, não a composição
                abaixo. Preencha esses campos só se fizer sentido pra referência interna.
              </div>
            )}

            {precoLegado && composicao?.frete == null && (
              <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>
                Cotação criada antes da composição de preço (valor salvo: {formatMoney(precoLegado.valorTotal)}, lucro{' '}
                {formatMoney(precoLegado.lucro)}). Preencha o frete do motorista pra recalcular — enquanto isso, o valor antigo
                fica como está.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Frete do motorista (R$) *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.valor_frete_motorista}
                  onChange={(e) => setForm((f) => (f ? { ...f, valor_frete_motorista: e.target.value } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, borderColor: freteAbaixoDoPiso ? 'var(--rbr-danger)' : 'var(--rbr-border)' }}
                />
                {freteAbaixoDoPiso ? (
                  <div className="text-[11px] mt-1 font-semibold" style={{ color: 'var(--rbr-danger)' }}>
                    Abaixo do piso ANTT ({formatMoney(pisoReferencia)}) — o motorista não pode receber menos que o piso.
                  </div>
                ) : pisoReferencia != null ? (
                  <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)] flex items-center gap-2 flex-wrap">
                    Piso ANTT de referência: {formatMoney(pisoReferencia)}
                    <button type="button" onClick={usarPisoComoFrete} className="underline font-semibold">
                      usar o piso
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <label className={labelClass}>Pedágio (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.pedagio}
                  disabled={pracasPedagio.length > 0}
                  onChange={(e) => setForm((f) => (f ? { ...f, pedagio: e.target.value } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, opacity: pracasPedagio.length > 0 ? 0.6 : 1 }}
                />
                <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">
                  {pracasPedagio.length > 0 ? 'Soma automática das praças lançadas abaixo.' : 'Valor da rota no Qualp, ou lance as praças abaixo.'}
                </div>
              </div>

              <div className="col-span-1 md:col-span-2 rounded-lg border p-2.5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Praças de pedágio (opcional)</div>
                  {pracasPedagio.length > 0 && (
                    <div className="text-xs font-bold tabular-nums">{formatMoney(pracasPedagio.reduce((acc, p) => acc + p.valor, 0))}</div>
                  )}
                </div>

                {pracasPedagio.map((p, i) => (
                  <div key={`${p.praca_id}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[color:var(--rbr-navy-dark)]">
                      {p.nome} · {p.rodovia}
                      {p.km != null ? ` km ${p.km}` : ''} · cat. {p.categoria}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums font-semibold">{formatMoney(p.valor)}</span>
                      <button type="button" onClick={() => removerPraca(i)} className="underline font-semibold" style={{ color: 'var(--rbr-danger)' }}>
                        remover
                      </button>
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    placeholder="Filtrar por nome, rodovia ou UF"
                    value={pracaBusca}
                    onChange={(e) => setPracaBusca(e.target.value)}
                    className={`${inputClass} md:col-span-2`}
                    style={inputStyle}
                  />
                  <select
                    value={pracaEscolhidaId}
                    onChange={(e) => {
                      setPracaEscolhidaId(e.target.value)
                      setPracaCategoria('')
                    }}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">Selecione a praça…</option>
                    {pracasFiltradas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — {p.rodovia}
                        {p.km != null ? ` km ${p.km}` : ''} ({p.uf})
                      </option>
                    ))}
                  </select>
                  <select
                    value={pracaCategoria}
                    onChange={(e) => setPracaCategoria(e.target.value)}
                    disabled={!pracaEscolhida}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">Categoria…</option>
                    {categoriasDaPracaEscolhida.map((c) => (
                      <option key={c.categoria} value={c.categoria}>
                        Cat. {c.categoria} — {formatMoney(c.valor)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={adicionarPraca}
                  disabled={!pracaEscolhida || !pracaCategoria}
                  className="self-start text-[11px] font-bold px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
                  style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                >
                  + Adicionar praça
                </button>
              </div>

              <div>
                <label className={labelClass}>TAG seguro — faixa de risco</label>
                <div className="flex gap-2">
                  <select
                    value={form.faixa_risco_seguro}
                    onChange={(e) => escolherFaixaSeguro(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="">Selecione…</option>
                    {faixasSeguro.map((x) => (
                      <option key={x.faixa} value={x.faixa}>
                        {x.label} — {formatPct(x.pct)}
                      </option>
                    ))}
                    <option value="personalizada">Personalizada</option>
                  </select>
                  <div className="relative" style={{ maxWidth: 110 }}>
                    <input
                      inputMode="decimal"
                      placeholder="%"
                      value={form.taxa_seguro_tag_pct}
                      onChange={(e) => editarTaxaSeguro(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, paddingRight: 24 }}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[color:var(--rbr-muted)]">%</span>
                  </div>
                </div>
                <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">
                  {composicao?.taxaSeguro != null
                    ? numOrNull(form.valor_nf) != null
                      ? `${formatPct(composicao.taxaSeguro)} × valor da NF (${formatMoney(numOrNull(form.valor_nf))}) = ${formatMoney(composicao.seguroTag)}`
                      : 'Informe o valor da NF acima — a TAG é calculada sobre ele.'
                    : 'Percentual aplicado sobre o valor da NF.'}
                </div>
              </div>
              <div>
                <label className={labelClass}>Imposto — alíquota aproximada</label>
                <div className="relative" style={{ maxWidth: 160 }}>
                  <input
                    inputMode="decimal"
                    placeholder="ex.: 6"
                    value={form.aliquota_imposto_pct}
                    onChange={(e) => setForm((f) => (f ? { ...f, aliquota_imposto_pct: e.target.value } : f))}
                    className={inputClass}
                    style={{ ...inputStyle, paddingRight: 24 }}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[color:var(--rbr-muted)]">%</span>
                </div>
                <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">
                  Calculado sobre o valor final (já entra na conta, não precisa estimar em R$).
                  {!form.aliquota_imposto_pct.trim() && ' Sem alíquota, o imposto fica em R$ 0.'}
                </div>
              </div>
              <div>
                <label className={labelClass}>Lucro RBR (% sobre o custo com imposto)</label>
                <div className="relative" style={{ maxWidth: 160 }}>
                  <input
                    inputMode="decimal"
                    value={
                      form.preco_modo === 'valor_final' && numOrNull(form.valor_final_manual) != null
                        ? composicao?.lucroPct != null
                          ? fracToPctStr(Number(composicao.lucroPct.toFixed(4)))
                          : ''
                        : form.lucro_pct
                    }
                    onChange={(e) => editarLucroPct(e.target.value)}
                    className={inputClass}
                    style={{ ...inputStyle, paddingRight: 24 }}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[color:var(--rbr-muted)]">%</span>
                </div>
                <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)]">
                  Padrão {formatPct(lucroPadrao, 0)} — somado depois de frete + pedágio + TAG + imposto.
                </div>
              </div>
              <div>
                <label className={labelClass}>Valor final ao cliente (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={
                    form.preco_modo === 'valor_final' && form.valor_final_manual.trim() !== ''
                      ? form.valor_final_manual
                      : composicao?.valorFinal != null
                        ? String(composicao.valorFinal)
                        : ''
                  }
                  onChange={(e) => editarValorFinal(e.target.value)}
                  placeholder="calculado automaticamente"
                  className={inputClass}
                  style={{ ...inputStyle, fontWeight: 700 }}
                />
                <div className="text-[11px] mt-1 text-[color:var(--rbr-muted)] flex items-center gap-2 flex-wrap">
                  {form.preco_modo === 'valor_final' && numOrNull(form.valor_final_manual) != null ? (
                    <>
                      Valor final fixado à mão — o lucro % é recalculado a partir dele.
                      <button type="button" onClick={voltarParaLucroPct} className="underline font-semibold">
                        voltar a calcular pelo % de lucro
                      </button>
                    </>
                  ) : (
                    'Pode digitar um valor pra negociar (arredondar, por ex.) — o lucro % se ajusta.'
                  )}
                </div>
              </div>
            </div>

            {/* Custos adicionais */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
                  Custos adicionais {carregandoItens && '· carregando…'}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={tipoParaAdicionar}
                    onChange={(e) => adicionarItem(e.target.value)}
                    className="border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    style={{ borderColor: 'var(--rbr-border)' }}
                  >
                    <option value="">+ Adicionar custo…</option>
                    {tiposAtivos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {sugestoes.length > 0 && (
                <div className="rounded-lg px-3 py-2.5 flex flex-col gap-2" style={{ background: 'var(--rbr-warning-bg)' }}>
                  <div className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">
                    Sugerido por causa de {Array.from(new Set(sugestoes.flatMap((x) => x.motivos))).map((m) => SINAL_LABEL[m] ?? m).join(', ')}:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sugestoes.map(({ tipo }) => (
                      <button
                        key={tipo.id}
                        type="button"
                        onClick={() => adicionarItem(tipo.id)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-white"
                        style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
                      >
                        + {tipo.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {obrigatoriosFaltando.length > 0 && (
                <div className="text-xs rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                  Obrigatório em toda carga: {obrigatoriosFaltando.map((t) => t.nome).join(', ')}.
                  {obrigatoriosFaltando.map((t) => (
                    <button key={t.id} type="button" onClick={() => adicionarItem(t.id)} className="underline font-semibold">
                      adicionar {t.nome}
                    </button>
                  ))}
                </div>
              )}

              {itensObrigatorios.length > 0 && (
                <div className="flex flex-col gap-1 text-[11px]">
                  {itensObrigatorios.map((i) => {
                    const tipo = tipoPorId.get(i.tipo_id)
                    const valor = valorItem(i, numOrNull(form.valor_nf) ?? 0)
                    return (
                      <div key={i.key} className="flex items-center justify-between gap-2 text-[color:var(--rbr-muted)]">
                        <span>
                          {tipo?.nome ?? 'Custo'} <span className="font-semibold">(obrigatório em toda carga)</span>
                        </span>
                        <span className="tabular-nums font-semibold">{formatMoney(valor)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {itensOpcionais.length === 0 && !carregandoItens && (
                <div className="text-[11px] text-[color:var(--rbr-muted)]">Nenhum custo adicional opcional nesta cotação.</div>
              )}

              {itensOpcionais.map((i) => {
                const tipo = tipoPorId.get(i.tipo_id)
                const rotulo = FORMA_LABEL[i.forma_calculo]
                const valor = valorItem(i, numOrNull(form.valor_nf) ?? 0)
                const semValor = numOrNull(i.valor_unitario) == null
                return (
                  <div key={i.key} className="rounded-lg border p-2.5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)] flex items-center gap-2">
                        {tipo?.nome ?? 'Custo'}
                        {tipo?.obrigatorio && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--rbr-muted-bg)' }}>
                            obrigatório
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-[color:var(--rbr-muted)]">→ {RECEBEDOR_LABEL[i.recebedor]}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums">{formatMoney(valor)}</span>
                        <button
                          type="button"
                          onClick={() => removerItem(i.key)}
                          disabled={tipo?.obrigatorio === true && itens.filter((x) => x.tipo_id === i.tipo_id).length === 1}
                          className="text-[11px] font-semibold underline disabled:opacity-40 disabled:no-underline"
                          style={{ color: 'var(--rbr-danger)' }}
                          title={tipo?.obrigatorio ? 'Custo obrigatório em toda carga' : undefined}
                        >
                          remover
                        </button>
                      </div>
                    </div>
                    {tipo?.descricao && <div className="text-[11px] text-[color:var(--rbr-muted)]">{tipo.descricao}</div>}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className={labelClass}>Cálculo</label>
                        <select
                          value={i.forma_calculo}
                          onChange={(e) => editarItem(i.key, 'forma_calculo', e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          <option value="fixo">Valor fixo</option>
                          <option value="por_km">Por km</option>
                          <option value="por_dia">Por dia</option>
                          <option value="por_unidade">Por unidade</option>
                          <option value="pct_valor_nf">% do valor da NF</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>{rotulo.unidade}</label>
                        <input
                          inputMode="decimal"
                          value={i.valor_unitario}
                          onChange={(e) => editarItem(i.key, 'valor_unitario', e.target.value)}
                          className={inputClass}
                          style={{ ...inputStyle, borderColor: semValor ? 'var(--rbr-gold)' : 'var(--rbr-border)' }}
                          placeholder={semValor ? 'informar' : undefined}
                        />
                      </div>
                      {i.forma_calculo !== 'pct_valor_nf' ? (
                        <div>
                          <label className={labelClass}>{rotulo.qtd}</label>
                          <input
                            inputMode="decimal"
                            value={i.quantidade}
                            onChange={(e) => editarItem(i.key, 'quantidade', e.target.value)}
                            className={inputClass}
                            style={inputStyle}
                          />
                          {i.forma_calculo === 'por_km' && numOrNull(form.distancia_km) != null && numOrNull(i.quantidade) !== numOrNull(form.distancia_km) && (
                            <button
                              type="button"
                              onClick={() => editarItem(i.key, 'quantidade', form.distancia_km)}
                              className="text-[11px] underline font-semibold mt-1"
                            >
                              usar distância da rota ({form.distancia_km} km)
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-end text-[11px] text-[color:var(--rbr-muted)] pb-2">
                          sobre {formatMoney(numOrNull(form.valor_nf))}
                        </div>
                      )}
                      <div>
                        <label className={labelClass}>Quem recebe</label>
                        <select
                          value={i.recebedor}
                          onChange={(e) => editarItem(i.key, 'recebedor', e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          {(Object.keys(RECEBEDOR_LABEL) as Recebedor[]).map((r) => (
                            <option key={r} value={r}>
                              {RECEBEDOR_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {i.recebedor === 'fornecedor' && (
                        <select
                          value={i.fornecedor_id}
                          onChange={(e) => editarItem(i.key, 'fornecedor_id', e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        >
                          <option value="">Fornecedor (opcional — pode definir depois)</option>
                          {fornecedores.map((fo) => (
                            <option key={fo.id} value={fo.id}>
                              {fo.nome ?? fo.razao_social ?? fo.id}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        placeholder="Observação (opcional)"
                        value={i.descricao}
                        onChange={(e) => editarItem(i.key, 'descricao', e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {composicao?.erro && (
              <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
                {composicao.erro}
              </div>
            )}

            {/* Resumo */}
            <div className="rounded-lg p-3.5 flex flex-col gap-1.5" style={{ background: 'var(--rbr-muted-bg)' }}>
              {[
                { label: 'Frete do motorista', valor: composicao?.frete ?? null },
                { label: 'Pedágio', valor: composicao?.frete != null ? composicao.pedagio : null },
                {
                  label: `TAG seguro${composicao?.taxaSeguro != null ? ` (${formatPct(composicao.taxaSeguro)} da NF)` : ''}`,
                  valor: composicao?.frete != null ? composicao.seguroTag : null,
                },
                ...(itens.length > 0
                  ? [{ label: `Custos adicionais (${itens.length})`, valor: composicao?.frete != null ? composicao.adicionais : null }]
                  : []),
              ].map((linha) => (
                <div key={linha.label} className="flex justify-between text-xs">
                  <span className="text-[color:var(--rbr-navy-dark)]">{linha.label}</span>
                  <span className="tabular-nums">{formatMoney(linha.valor)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs">
                <span>Imposto ({formatPct(composicao?.aliquota ?? 0)} do valor final)</span>
                <span className="tabular-nums">{formatMoney(composicao?.imposto ?? null)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-t pt-1.5" style={{ borderColor: 'var(--rbr-border)' }}>
                <span>Custo total com imposto</span>
                <span className="tabular-nums">{formatMoney(composicao?.custoComImposto ?? null)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>+ Lucro RBR ({formatPct(composicao?.lucroPct ?? null, 1)} sobre o custo com imposto)</span>
                <span className="tabular-nums" style={{ color: (composicao?.lucro ?? 0) < 0 ? 'var(--rbr-danger)' : undefined }}>
                  {formatMoney(composicao?.lucro ?? null)}
                </span>
              </div>
              <div
                className="flex justify-between items-center text-sm font-bold border-t pt-2 mt-0.5 text-[color:var(--rbr-navy-dark)]"
                style={{ borderColor: 'var(--rbr-border)' }}
              >
                <span>Valor final ao cliente</span>
                <span className="tabular-nums text-base">{formatMoney(composicao?.valorFinal ?? null)}</span>
              </div>
              {composicao?.totalMotorista != null && (
                <div className="flex justify-between text-[11px] text-[color:var(--rbr-muted)] pt-1">
                  <span>
                    Total a pagar ao motorista (frete{composicao.adicionaisMotorista > 0 ? ' + adicionais dele' : ''})
                  </span>
                  <span className="tabular-nums font-semibold">{formatMoney(composicao.totalMotorista)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-[11px] font-semibold text-[color:var(--rbr-navy-dark)]">Margem sobre o valor final:</span>
                <span
                  className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{ background: margem.bg, color: margem.color }}
                >
                  {margem.label}
                </span>
                <span className="text-[11px] text-[color:var(--rbr-muted)]">
                  faixa recomendada {(margemMin * 100).toFixed(0)}% – {(margemMax * 100).toFixed(0)}% (fora dela a gravação continua
                  permitida, mas fica registrada no log de auditoria)
                </span>
              </div>
            </div>
          </div>

          {/* Recebimento do cliente */}
          <div className="rounded-xl p-3.5 flex flex-col gap-3 border" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Recebimento do cliente</div>
              <div className="flex gap-1.5">
                {(
                  [
                    ['regra', 'Regra cadastrada'],
                    ['personalizado', 'Prazo desta negociação'],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              prazo_modo: k,
                              prazo_personalizado:
                                k === 'personalizado' && !f.prazo_personalizado
                                  ? (() => {
                                      const c = condicoesPrazo.find((x) => x.id === f.condicao_prazo_id)
                                      return c ? regraDeCondicao(c) : { base: 'entrega', modo: 'dias' as const, parcelas: [{ dias: 30, percentual: 100 }], ajustar_dia_util: true }
                                    })()
                                  : f.prazo_personalizado,
                            }
                          : f,
                      )
                    }
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                    style={{
                      borderColor: form.prazo_modo === k ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                      background: form.prazo_modo === k ? 'var(--rbr-navy)' : '#fff',
                      color: form.prazo_modo === k ? '#fff' : 'var(--rbr-navy-dark)',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {form.prazo_modo === 'regra' && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Condição de pagamento</label>
                  <select
                    value={form.condicao_prazo_id}
                    onChange={(e) => setForm((f) => (f ? { ...f, condicao_prazo_id: e.target.value } : f))}
                    className={inputClass}
                    style={{ ...inputStyle, background: '#fff' }}
                  >
                    <option value="">Padrão ({condicoesPrazo.find((c) => c.padrao_receber)?.nome ?? '30 dias após a entrega'})</option>
                    {condicoesPrazo.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={form.prazo_modo === 'regra' ? '' : 'md:col-span-3 md:max-w-xs'}>
                <label className={labelClass}>Forma de recebimento</label>
                <select
                  value={form.forma_recebimento}
                  onChange={(e) => setForm((f) => (f ? { ...f, forma_recebimento: e.target.value } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                >
                  {['boleto', 'pix', 'transferencia', 'dinheiro', 'cartao', 'outro'].map((k) => (
                    <option key={k} value={k}>
                      {FORMA_PAGTO_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:max-w-[160px]">
                <label className={labelClass}>Validade da proposta (dias)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.validade_dias}
                  onChange={(e) => setForm((f) => (f ? { ...f, validade_dias: e.target.value.replace(/[^\d]/g, '') } : f))}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                  placeholder="5"
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <span className="text-[11px] text-[color:var(--rbr-muted)] pb-2">
                  Depois desse prazo a proposta é considerada expirada. Vale a partir da data de emissão do PDF.
                </span>
              </div>
            </div>
            {form.prazo_modo === 'personalizado' && form.prazo_personalizado && (
              <EditorParcelas regra={form.prazo_personalizado} onChange={(r) => setForm((f) => (f ? { ...f, prazo_personalizado: r } : f))} />
            )}
            {(() => {
              const regra =
                form.prazo_modo === 'personalizado'
                  ? form.prazo_personalizado
                  : (() => {
                      const c = condicoesPrazo.find((x) => x.id === form.condicao_prazo_id) ?? condicoesPrazo.find((x) => x.padrao_receber)
                      return c ? regraDeCondicao(c) : null
                    })()
              if (!regra) return null
              const total = composicao?.valorFinal ?? null
              return (
                <>
                  <div className="text-[11px] text-[color:var(--rbr-navy-dark)]">{descreverRegra(regra)}</div>
                  {total != null && total > 0 && (
                    <PreviaRegra
                      regra={regra}
                      feriados={feriados}
                      total={total}
                      texto="Previsão se for aprovada hoje (coleta em 2 dias, entrega em 4) — o sistema recalcula com as datas reais da operação:"
                    />
                  )}
                </>
              )
            })()}
          </div>

          {/* Piso ANTT — referência opcional */}
          <details className="rounded-xl p-3.5" style={{ background: 'var(--rbr-muted-bg)' }} open={Boolean(form.tabela || form.distancia_km)}>
            <summary className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] cursor-pointer">
              Piso mínimo ANTT — referência opcional {pisoReferencia != null && `· ${formatMoney(pisoReferencia)}`}
            </summary>
            <div className="flex flex-col gap-3 mt-3">
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                Serve pra conferir se o frete do motorista respeita o mínimo legal. A distância pode vir do Qualp (digite no campo) ou da
                calculadora de rota gratuita abaixo.
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
                    min={0}
                    value={form.distancia_km}
                    onChange={(e) => setForm((f) => (f ? { ...f, distancia_km: e.target.value } : f))}
                    className={inputClass}
                    style={{ ...inputStyle, background: '#fff' }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={calcularRota}
                  disabled={rotaCalculando}
                  className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60"
                  style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', background: '#fff' }}
                >
                  {rotaCalculando ? 'Calculando rota…' : 'Calcular distância pela rota (grátis)'}
                </button>
                {rotaResultado && (
                  <div className="text-xs flex items-center gap-2 flex-wrap">
                    <span>
                      {rotaResultado.distancia_km.toLocaleString('pt-BR')} km · ~{rotaResultado.duracao_horas.toLocaleString('pt-BR')} h
                    </span>
                    <button type="button" onClick={usarDistanciaCalculada} className="underline font-semibold">
                      usar essa distância
                    </button>
                    <span className="text-[11px] text-[color:var(--rbr-muted)]">(estimativa OpenStreetMap — pode divergir do Qualp)</span>
                  </div>
                )}
                {rotaErro && (
                  <span className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
                    {rotaErro}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[color:var(--rbr-navy-dark)]">Piso ANTT:</span>
                <span className="text-sm font-bold">
                  {carregandoPiso
                    ? 'calculando…'
                    : pisoInfo
                      ? formatMoney(pisoInfo.calculado)
                      : pisoSalvo != null
                        ? `${formatMoney(pisoSalvo)} (salvo)`
                        : '—'}
                </span>
                {!carregandoPiso && !pisoInfo && (form.tabela || form.tipo_carga || form.eixos || form.distancia_km) && (
                  <span className="text-[11px] text-[color:var(--rbr-muted)]">Preencha tabela, tipo de carga, eixos e distância pra calcular.</span>
                )}
              </div>
            </div>
          </details>

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

            {editingId && (
              <button
                onClick={() => emitirPdf('baixar')}
                disabled={saving || emitindoPdf}
                className="text-sm font-bold px-4 py-2 rounded-xl border disabled:opacity-60"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
              >
                {emitindoPdf ? 'Gerando PDF…' : 'Emitir cotação (PDF)'}
              </button>
            )}

            {editingId && (
              <button
                onClick={() => emitirPdf('whatsapp')}
                disabled={saving || emitindoPdf}
                title={form.cliente_id && !clienteWhatsappPorId.get(form.cliente_id) ? 'Cliente sem WhatsApp cadastrado' : undefined}
                className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: '#1FA855', color: '#fff' }}
              >
                {emitindoPdf ? 'Gerando…' : 'Enviar por WhatsApp'}
              </button>
            )}

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
                disabled={saving || destinos.length > 0}
                title={destinos.length > 0 ? 'Cotação com múltiplos destinos — crie a operação de cada trecho manualmente em Operações' : undefined}
                className="text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60"
                style={{ background: 'var(--rbr-positive)', color: '#fff' }}
              >
                Converter em operação
              </button>
            )}

            {editingId && (editingStatus === 'rascunho' || editingStatus === 'enviada') && (
              <button
                onClick={() => setShowPerda((v) => !v)}
                disabled={saving}
                className="text-sm font-bold px-4 py-2 rounded-xl border disabled:opacity-60"
                style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }}
              >
                {showPerda ? 'Cancelar' : 'Marcar como perdida'}
              </button>
            )}

            {editingId && editingStatus === 'perdida' && (
              <button
                onClick={reabrir}
                disabled={saving}
                className="text-sm font-bold px-4 py-2 rounded-xl border disabled:opacity-60"
                style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
              >
                Reabrir cotação
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

          {showPerda && (editingStatus === 'rascunho' || editingStatus === 'enviada') && (
            <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: '#FBE9E9' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
                Por que a cotação foi perdida?
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  value={motivoPerda}
                  onChange={(e) => setMotivoPerda(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                >
                  <option value="">Motivo *</option>
                  {Object.entries(MOTIVO_PERDA_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Detalhe (opcional) — ex.: concorrente cobrou R$ 7.900"
                  value={detalhePerda}
                  onChange={(e) => setDetalhePerda(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, background: '#fff' }}
                />
              </div>
              <button
                onClick={marcarPerdida}
                disabled={saving}
                className="self-start text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: 'var(--rbr-danger)', color: '#fff' }}
              >
                Confirmar perda
              </button>
            </div>
          )}
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
            const temWhatsapp = Boolean(clienteWhatsappPorId.get(c.cliente_id ?? ''))
            const enviandoEsta = pendingWhatsAppId === c.id
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => abrirEdicao(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    abrirEdicao(c)
                  }
                }}
                className="w-full text-left bg-white border rounded-[20px] p-[18px] cursor-pointer"
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
                {c.valor_frete_motorista != null && (
                  <div className="text-xs text-[color:var(--rbr-muted)] mt-1 tabular-nums">
                    Motorista {formatMoney(c.valor_total_motorista ?? c.valor_frete_motorista)} · pedágio {formatMoney(c.pedagio ?? 0)}
                    {c.custos_adicionais_total > 0 && <> · adicionais {formatMoney(c.custos_adicionais_total)}</>} · lucro{' '}
                    {formatMoney(c.lucro_rbr)}
                  </div>
                )}
                {c.status === 'perdida' && c.motivo_perda && (
                  <div className="text-xs mt-1" style={{ color: 'var(--rbr-danger)' }}>
                    Perdida: {MOTIVO_PERDA_LABEL[c.motivo_perda] ?? c.motivo_perda}
                    {c.motivo_perda_detalhe ? ` — ${c.motivo_perda_detalhe}` : ''}
                  </div>
                )}
                <div className="mt-2.5 pt-2.5 border-t flex justify-end" style={{ borderColor: 'var(--rbr-border)' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      enviarWhatsAppDaLista(c)
                    }}
                    disabled={!temWhatsapp || enviandoEsta}
                    title={temWhatsapp ? undefined : 'Cliente sem WhatsApp cadastrado'}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                    style={{ background: '#1FA855', color: '#fff' }}
                  >
                    {enviandoEsta ? 'Preparando…' : 'Enviar WhatsApp'}
                  </button>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
