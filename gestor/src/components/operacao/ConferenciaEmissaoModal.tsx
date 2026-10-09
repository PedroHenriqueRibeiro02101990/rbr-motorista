import { Obrig } from '@rbr/shared/camposObrigatorios'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'

// Card de conferência que abre ANTES de emitir CT-e ou MDF-e. Pede às próprias funções de emissão o
// "payload de prévia" (o que seria enviado à Focus + o que está faltando, sem gravar nada) e mostra,
// campo a campo, o valor e DE ONDE ELE VEM — assim dá pra ver o que é automático e o que depende de
// preenchimento manual (cotação, cadastro do cliente, veículo, motorista, apólice…).

export type TipoConferencia = 'cte' | 'mdfe' | 'nfse'

type Origem =
  | 'Cotação'
  | 'Cotação — aba NF-e'
  | 'Cadastro do cliente'
  | 'Cadastro fiscal da RBR'
  | 'Cadastro do veículo'
  | 'Cadastro do motorista'
  | 'Apólice de seguro'
  | 'CT-e já autorizado'
  | 'Calculado pelo sistema'
  | 'Fixo do sistema'
  | 'Formulário abaixo (Repom)'
  | 'Cadastro do cliente da operação'
  | 'Condição de pagamento da operação'

// Quem precisa preencher à mão (não é automático): se vier vazio, é você quem completa.
const ORIGEM_MANUAL: Origem[] = ['Cotação', 'Cotação — aba NF-e', 'Cadastro do cliente', 'Cadastro do veículo', 'Cadastro do motorista', 'Apólice de seguro', 'Formulário abaixo (Repom)', 'Condição de pagamento da operação', 'Cadastro do cliente da operação']

interface Campo {
  grupo: string
  label: string
  origem: Origem
  // Caminho no payload (ex.: 'quantidades.0.quantidade') ou função que monta o valor a partir do payload.
  caminho?: string
  valor?: (p: Payload) => unknown
  tipo?: 'dinheiro' | 'peso' | 'cnpj' | 'cpf' | 'texto'
  opcional?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>

function ler(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), obj)
}

const CAMPOS_CTE: Campo[] = [
  { grupo: 'Quem emite (a RBR)', label: 'Razão social', caminho: 'nome_emitente', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Quem emite (a RBR)', label: 'CNPJ', caminho: 'cnpj_emitente', origem: 'Cadastro fiscal da RBR', tipo: 'cnpj' },
  { grupo: 'Quem emite (a RBR)', label: 'Inscrição Estadual', caminho: 'inscricao_estadual_emitente', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Quem emite (a RBR)', label: 'RNTRC', caminho: 'modal_rodoviario.rntrc', origem: 'Cadastro fiscal da RBR' },
  {
    grupo: 'Quem emite (a RBR)',
    label: 'Endereço',
    origem: 'Cadastro fiscal da RBR',
    valor: (p) => [p.logradouro_emitente, p.numero_emitente, p.bairro_emitente, p.cep_emitente].filter(Boolean).join(', ') || null,
  },
  { grupo: 'Remetente (quem entrega a carga)', label: 'Razão social', caminho: 'nome_remetente', origem: 'Cotação — aba NF-e' },
  { grupo: 'Remetente (quem entrega a carga)', label: 'CNPJ', caminho: 'cnpj_remetente', origem: 'Cotação — aba NF-e', tipo: 'cnpj' },
  { grupo: 'Remetente (quem entrega a carga)', label: 'Telefone', caminho: 'telefone_remetente', origem: 'Cotação — aba NF-e' },
  {
    grupo: 'Remetente (quem entrega a carga)',
    label: 'Endereço',
    origem: 'Cotação — aba NF-e',
    valor: (p) =>
      [p.logradouro_remetente, p.numero_remetente, p.bairro_remetente, p.municipio_remetente, p.uf_remetente, p.cep_remetente]
        .filter(Boolean)
        .join(', ') || null,
  },
  { grupo: 'Destinatário (quem recebe)', label: 'Razão social', caminho: 'nome_destinatario', origem: 'Cotação — aba NF-e' },
  { grupo: 'Destinatário (quem recebe)', label: 'CNPJ', caminho: 'cnpj_destinatario', origem: 'Cotação — aba NF-e', tipo: 'cnpj' },
  {
    grupo: 'Destinatário (quem recebe)',
    label: 'Endereço',
    origem: 'Cotação — aba NF-e',
    valor: (p) =>
      [p.logradouro_destinatario, p.numero_destinatario, p.bairro_destinatario, p.municipio_destinatario, p.uf_destinatario, p.cep_destinatario]
        .filter(Boolean)
        .join(', ') || null,
  },
  { grupo: 'Destinatário (quem recebe)', label: 'Telefone', caminho: 'telefone_destinatario', origem: 'Cotação — aba NF-e' },
  { grupo: 'Percurso', label: 'Origem', origem: 'Cotação', valor: (p) => (p.municipio_inicio ? `${p.municipio_inicio}/${p.uf_inicio}` : null) },
  { grupo: 'Percurso', label: 'Destino', origem: 'Cotação', valor: (p) => (p.municipio_fim ? `${p.municipio_fim}/${p.uf_fim}` : null) },
  { grupo: 'Percurso', label: 'CFOP', caminho: 'cfop', origem: 'Calculado pelo sistema' },
  { grupo: 'Carga e documento', label: 'Chave da NF-e (44 dígitos)', caminho: 'nfes.0.chave_nfe', origem: 'Cotação — aba NF-e' },
  { grupo: 'Carga e documento', label: 'Valor da carga (valor da NF)', caminho: 'valor_total_carga', origem: 'Cotação — aba NF-e', tipo: 'dinheiro' },
  { grupo: 'Carga e documento', label: 'Peso bruto', caminho: 'quantidades.0.quantidade', origem: 'Cotação', tipo: 'peso' },
  { grupo: 'Carga e documento', label: 'Produto predominante', caminho: 'produto_predominante', origem: 'Cotação' },
  { grupo: 'Carga e documento', label: 'Natureza da operação', caminho: 'natureza_operacao', origem: 'Cotação' },
  { grupo: 'Serviço de frete', label: 'Valor do frete cobrado do cliente', caminho: 'valor_total', origem: 'Cotação', tipo: 'dinheiro' },
  { grupo: 'Serviço de frete', label: 'Tomador do serviço', origem: 'Cotação', valor: (p) => ({ '0': 'Remetente', '3': 'Destinatário', '4': `Cliente da cotação${p.cnpj_tomador ? ` (CNPJ ${p.cnpj_tomador})` : ''}` } as Record<string, string>)[p.tomador] ?? null },
  { grupo: 'Tributação', label: 'ICMS', origem: 'Fixo do sistema', valor: (p) => (p.icms_situacao_tributaria === '90_simples_nacional' ? 'Simples Nacional (sem destaque)' : p.icms_situacao_tributaria) },
  { grupo: 'Responsável técnico', label: 'Contato', caminho: 'contato_responsavel_tecnico', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Responsável técnico', label: 'E-mail', caminho: 'email_responsavel_tecnico', origem: 'Cadastro fiscal da RBR' },
]

const CAMPOS_MDFE: Campo[] = [
  { grupo: 'Quem emite (a RBR)', label: 'Razão social', caminho: 'nome_emitente', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Quem emite (a RBR)', label: 'CNPJ', caminho: 'cnpj_emitente', origem: 'Cadastro fiscal da RBR', tipo: 'cnpj' },
  { grupo: 'Quem emite (a RBR)', label: 'Inscrição Estadual', caminho: 'inscricao_estadual_emitente', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Quem emite (a RBR)', label: 'RNTRC da RBR', caminho: 'modal_rodoviario.registro_nacional_transporte', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Quem emite (a RBR)', label: 'Tipo de emitente / transportador', origem: 'Fixo do sistema', valor: () => 'Prestador de serviço — ETC' },
  {
    grupo: 'Quem emite (a RBR)',
    label: 'Endereço',
    origem: 'Cadastro fiscal da RBR',
    valor: (p) => [p.logradouro_emitente, p.numero_emitente, p.bairro_emitente, p.municipio_emitente, p.uf_emitente].filter(Boolean).join(', ') || null,
  },
  { grupo: 'Percurso', label: 'Carregamento', origem: 'Cotação', valor: (p) => (p.municipios_carregamento?.[0]?.nome ? `${p.municipios_carregamento[0].nome}/${p.uf_inicio}` : null) },
  { grupo: 'Percurso', label: 'Descarregamento', origem: 'Cotação', valor: (p) => (p.municipios_descarregamento?.[0]?.nome ? `${p.municipios_descarregamento[0].nome}/${p.uf_fim}` : null) },
  { grupo: 'CT-e vinculado', label: 'Chave do CT-e autorizado', caminho: 'conhecimentos_transporte.0.chave_cte', origem: 'CT-e já autorizado' },
  { grupo: 'Carga', label: 'Tipo de carga', caminho: 'tipo_carga', origem: 'Cotação' },
  { grupo: 'Carga', label: 'Produto predominante', caminho: 'descricao_produto', origem: 'Cotação — aba NF-e' },
  { grupo: 'Carga', label: 'NCM', caminho: 'codigo_ncm_produto', origem: 'Cotação — aba NF-e', opcional: true },
  { grupo: 'Carga', label: 'Valor total da carga', caminho: 'valor_total_carga', origem: 'Cotação — aba NF-e', tipo: 'dinheiro' },
  { grupo: 'Carga', label: 'Peso bruto total', caminho: 'peso_bruto', origem: 'Cotação', tipo: 'peso' },
  { grupo: 'Veículo', label: 'Placa', caminho: 'modal_rodoviario.placa_veiculo', origem: 'Cadastro do veículo' },
  { grupo: 'Veículo', label: 'RENAVAM', caminho: 'modal_rodoviario.renavam_veiculo', origem: 'Cadastro do veículo', opcional: true },
  { grupo: 'Veículo', label: 'Tara (kg)', caminho: 'modal_rodoviario.tara_veiculo', origem: 'Cadastro do veículo' },
  { grupo: 'Veículo', label: 'Tipo de rodado (código SEFAZ)', caminho: 'modal_rodoviario.tipo_rodado_veiculo', origem: 'Cadastro do veículo' },
  { grupo: 'Veículo', label: 'Tipo de carroceria (código SEFAZ)', caminho: 'modal_rodoviario.tipo_carroceria_veiculo', origem: 'Cadastro do veículo' },
  { grupo: 'Veículo', label: 'UF de licenciamento', caminho: 'modal_rodoviario.uf_licenciamento_veiculo', origem: 'Cadastro do veículo' },
  {
    grupo: 'Veículo',
    label: 'Reboque(s)',
    origem: 'Cadastro do veículo',
    opcional: true,
    valor: (p) =>
      (p.modal_rodoviario?.veiculos_reboque ?? [])
        .map((r: { placa?: string; tara?: number; capacidade_kg?: number }) => `${r.placa} (tara ${r.tara ?? '?'} kg, cap. ${r.capacidade_kg ?? '?'} kg)`)
        .join(' · ') || null,
  },
  {
    grupo: 'Proprietário do veículo (TAC)',
    label: 'CPF/CNPJ',
    origem: 'Cadastro do veículo',
    opcional: true,
    valor: (p) => p.modal_rodoviario?.cnpj_proprietario_veiculo ?? p.modal_rodoviario?.cpf_proprietario_veiculo ?? null,
  },
  { grupo: 'Proprietário do veículo (TAC)', label: 'Nome', caminho: 'modal_rodoviario.razao_social_proprietario_veiculo', origem: 'Cadastro do veículo', opcional: true },
  { grupo: 'Proprietário do veículo (TAC)', label: 'RNTRC', caminho: 'modal_rodoviario.rntrc_proprietario_veiculo', origem: 'Cadastro do veículo', opcional: true },
  { grupo: 'Condutor', label: 'Nome', caminho: 'modal_rodoviario.condutores.0.nome', origem: 'Cadastro do motorista' },
  { grupo: 'Condutor', label: 'CPF', caminho: 'modal_rodoviario.condutores.0.cpf', origem: 'Cadastro do motorista', tipo: 'cpf' },
  { grupo: 'Seguro da carga (RCTR-C)', label: 'Seguradora', caminho: 'seguros_carga.0.nome_seguradora', origem: 'Apólice de seguro' },
  { grupo: 'Seguro da carga (RCTR-C)', label: 'Nº da apólice', caminho: 'seguros_carga.0.numero_apolice', origem: 'Apólice de seguro' },
  { grupo: 'Seguro da carga (RCTR-C)', label: 'Responsável pelo seguro', origem: 'Apólice de seguro', valor: (p) => ({ '1': 'Emitente', '2': 'Contratante' } as Record<string, string>)[p.seguros_carga?.[0]?.responsavel_seguro] ?? null },
  { grupo: 'Contratante do transporte', label: 'Cliente', caminho: 'modal_rodoviario.contratantes.0.nome', origem: 'Cadastro do cliente' },
  { grupo: 'Contratante do transporte', label: 'CNPJ/CPF', origem: 'Cadastro do cliente', valor: (p) => p.modal_rodoviario?.contratantes?.[0]?.cnpj ?? p.modal_rodoviario?.contratantes?.[0]?.cpf ?? null },
  { grupo: 'CIOT e Vale-Pedágio', label: 'CIOT (12 dígitos)', caminho: 'modal_rodoviario.ciot.0.ciot', origem: 'Formulário abaixo (Repom)', opcional: true },
  { grupo: 'CIOT e Vale-Pedágio', label: 'IDVPO (comprovante do vale-pedágio)', caminho: 'modal_rodoviario.dispositivos_vale_pedagio.0.numero_comprovante_compra', origem: 'Formulário abaixo (Repom)', opcional: true },
  { grupo: 'CIOT e Vale-Pedágio', label: 'Valor do vale-pedágio', caminho: 'modal_rodoviario.dispositivos_vale_pedagio.0.valor_vale_pedagio', origem: 'Formulário abaixo (Repom)', tipo: 'dinheiro', opcional: true },
  { grupo: 'Pagamento do frete ao motorista', label: 'Valor total do contrato', caminho: 'modal_rodoviario.pagamentos.0.valor_total_contrato', origem: 'Condição de pagamento da operação', tipo: 'dinheiro', opcional: true },
  {
    grupo: 'Pagamento do frete ao motorista',
    label: 'Forma de pagamento',
    origem: 'Condição de pagamento da operação',
    opcional: true,
    valor: (p) => ({ '0': 'À vista', '1': 'A prazo' } as Record<string, string>)[p.modal_rodoviario?.pagamentos?.[0]?.forma_pagamento] ?? null,
  },
  { grupo: 'Pagamento do frete ao motorista', label: 'Adiantamento', caminho: 'modal_rodoviario.pagamentos.0.valor_adiantamento', origem: 'Condição de pagamento da operação', tipo: 'dinheiro', opcional: true },
  {
    grupo: 'Pagamento do frete ao motorista',
    label: 'Destino do pagamento',
    origem: 'Cadastro do motorista',
    opcional: true,
    valor: (p) => {
      const pg = p.modal_rodoviario?.pagamentos?.[0]
      return pg?.pix ? `PIX ${pg.pix}` : pg?.numero_banco ? `Banco ${pg.numero_banco} ag. ${pg.numero_agencia}` : pg?.cnpj_instituicao_pagamento ?? null
    },
  },
  { grupo: 'Responsável técnico', label: 'E-mail', caminho: 'email_responsavel_tecnico', origem: 'Cadastro fiscal da RBR' },
]

const CAMPOS_NFSE: Campo[] = [
  { grupo: 'Prestador (a RBR)', label: 'CNPJ', caminho: 'prestador.cnpj', origem: 'Cadastro fiscal da RBR', tipo: 'cnpj' },
  { grupo: 'Prestador (a RBR)', label: 'Inscrição Municipal (IM)', caminho: 'prestador.inscricao_municipal', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Prestador (a RBR)', label: 'Município do prestador (IBGE)', caminho: 'prestador.codigo_municipio', origem: 'Fixo do sistema' },
  { grupo: 'Prestador (a RBR)', label: 'Regime', origem: 'Fixo do sistema', valor: (p) => (p.optante_simples_nacional ? 'Optante pelo Simples Nacional' : 'Não optante') },
  { grupo: 'Tomador (cliente)', label: 'Razão social', caminho: 'tomador.razao_social', origem: 'Cadastro do cliente da operação' },
  { grupo: 'Tomador (cliente)', label: 'CNPJ/CPF', origem: 'Cadastro do cliente da operação', valor: (p) => p.tomador?.cnpj || p.tomador?.cpf || null },
  { grupo: 'Tomador (cliente)', label: 'E-mail', caminho: 'tomador.email', origem: 'Cadastro do cliente da operação', opcional: true },
  {
    grupo: 'Tomador (cliente)',
    label: 'Endereço',
    origem: 'Cadastro do cliente da operação',
    opcional: true,
    valor: (p) => [p.tomador?.endereco?.logradouro, p.tomador?.endereco?.numero, p.tomador?.endereco?.bairro, p.tomador?.endereco?.uf, p.tomador?.endereco?.cep].filter(Boolean).join(', ') || null,
  },
  { grupo: 'Serviço', label: 'Item da lista de serviço', caminho: 'servico.item_lista_servico', origem: 'Cadastro fiscal da RBR' },
  { grupo: 'Serviço', label: 'Descrição', caminho: 'servico.discriminacao', origem: 'Calculado pelo sistema' },
  { grupo: 'Serviço', label: 'Município da prestação (IBGE)', caminho: 'servico.codigo_municipio', origem: 'Cotação' },
  { grupo: 'Serviço', label: 'Valor do serviço', caminho: 'servico.valor_servicos', origem: 'Cotação', tipo: 'dinheiro' },
  { grupo: 'Impostos', label: 'Alíquota de ISS', origem: 'Calculado pelo sistema', valor: (p) => (p.servico?.aliquota != null ? `${(Number(p.servico.aliquota) * 100).toLocaleString('pt-BR')}%` : null) },
  { grupo: 'Impostos', label: 'Valor do ISS', caminho: 'servico.valor_iss', origem: 'Calculado pelo sistema', tipo: 'dinheiro' },
  { grupo: 'Impostos', label: 'ISS retido pelo tomador', origem: 'Calculado pelo sistema', valor: (p) => (p.servico?.iss_retido ? 'Sim' : 'Não — a RBR recolhe') },
]

function formatarValor(v: unknown, tipo: Campo['tipo']): string {
  if (v === null || v === undefined || v === '') return ''
  if (tipo === 'dinheiro') return formatMoney(Number(v))
  if (tipo === 'peso') return `${Number(v).toLocaleString('pt-BR')} kg`
  if (tipo === 'cnpj') {
    const d = String(v).replace(/\D/g, '')
    return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : String(v)
  }
  if (tipo === 'cpf') {
    const d = String(v).replace(/\D/g, '')
    return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(v)
  }
  return String(v)
}

function estaVazio(v: unknown, tipo: Campo['tipo']): boolean {
  if (v === null || v === undefined || v === '') return true
  if ((tipo === 'peso' || tipo === 'dinheiro') && !(Number(v) > 0)) return true
  return false
}

interface Previa {
  sucesso: boolean
  previa?: boolean
  ambiente?: string
  bloqueios?: string[]
  // O que muda por ser homologação e o que só a SEFAZ confere (ex.: se a NF-e existe).
  avisos?: string[]
  payload?: Payload
  erro?: string
}

export default function ConferenciaEmissaoModal({
  operacaoId,
  tipo,
  titulo,
  emitindo,
  onCancelar,
  onConfirmar,
}: {
  operacaoId: string
  tipo: TipoConferencia
  titulo: string
  emitindo: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const [carregando, setCarregando] = useState(true)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCarregando(true)
      setErroCarga(null)
      const funcao = tipo === 'cte' ? 'emitir-cte' : tipo === 'mdfe' ? 'emitir-mdfe' : 'emitir-nfse-intramunicipal'
      const { data, error } = await supabase.functions.invoke<Previa>(funcao, { body: { operacao_id: operacaoId, previa: true } })
      if (!vivo) return
      if (error || !data) {
        setErroCarga(error?.message ?? 'Não consegui montar a conferência.')
      } else if (data.sucesso === false) {
        setErroCarga(data.erro ?? 'Não consegui montar a conferência.')
      } else {
        setPrevia(data)
      }
      setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [operacaoId, tipo, versao])

  const linhas = useMemo(() => {
    const p = previa?.payload ?? {}
    const defs = tipo === 'cte' ? CAMPOS_CTE : tipo === 'mdfe' ? CAMPOS_MDFE : CAMPOS_NFSE
    return defs.map((c) => {
      const bruto = c.valor ? c.valor(p) : c.caminho ? ler(p, c.caminho) : null
      return { ...c, texto: formatarValor(bruto, c.tipo), vazio: estaVazio(bruto, c.tipo) && !c.opcional }
    })
  }, [previa, tipo])

  const grupos = useMemo(() => {
    const m = new Map<string, typeof linhas>()
    for (const l of linhas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l])
    return Array.from(m.entries())
  }, [linhas])

  const bloqueios = previa?.bloqueios ?? []
  const avisos = previa?.avisos ?? []
  const faltando = linhas.filter((l) => l.vazio)
  const podeEmitir = !carregando && !erroCarga && bloqueios.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(18,23,61,0.55)' }}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" style={{ boxShadow: '0 20px 60px rgba(18,23,61,0.35)' }}>
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-sm font-extrabold text-[color:var(--rbr-navy-dark)]">Conferir antes de emitir — {titulo}</div>
          <div className="text-[11px] text-[color:var(--rbr-muted)] mt-0.5">
            É isto que vai para a SEFAZ (via Focus). Cada linha mostra de onde o dado vem; o que vem de cotação ou cadastro é
            preenchido por você lá, e o resto é automático.
            {previa?.ambiente === 'homologacao' && ' Ambiente de homologação: sem validade fiscal.'}
          </div>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex flex-col gap-3">
          {carregando && <div className="text-xs text-[color:var(--rbr-muted)]">Montando a conferência…</div>}
          {erroCarga && (
            <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {erroCarga}
            </div>
          )}

          {!carregando && !erroCarga && bloqueios.length > 0 && (
            <div className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              <strong>Falta resolver antes de emitir ({bloqueios.length}):</strong>
              <ul className="list-disc pl-4 flex flex-col gap-0.5">
                {bloqueios.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {!carregando && !erroCarga && avisos.length > 0 && (
            <div className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ background: '#FFF6E0', color: 'var(--rbr-navy-dark)' }}>
              <strong>Atenção:</strong>
              <ul className="list-disc pl-4 flex flex-col gap-0.5">
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {!carregando && !erroCarga && bloqueios.length === 0 && faltando.length === 0 && (
            <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#E8F5EC', color: 'var(--rbr-positive)' }}>
              Tudo preenchido. Confira os dados abaixo e confirme.
            </div>
          )}

          {!carregando &&
            !erroCarga &&
            grupos.map(([grupo, itens]) => (
              <div key={grupo} className="rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)', background: 'var(--rbr-muted-bg)' }}>
                  {grupo}
                </div>
                <div className="flex flex-col">
                  {itens.map((l) => (
                    <div key={l.label} className="grid gap-2 px-3 py-1.5 text-xs border-b last:border-b-0 items-start" style={{ gridTemplateColumns: '1fr 1.4fr', borderColor: 'var(--rbr-border)' }}>
                      <div className="text-[color:var(--rbr-muted)]">{l.label}</div>
                      <div className="flex flex-col gap-0.5">
                        {l.vazio ? (
                          <span className="font-bold" style={{ color: 'var(--rbr-danger)' }}>
                            Faltando
                          </span>
                        ) : (
                          <span className="font-semibold text-[color:var(--rbr-navy-dark)] break-words">{l.texto || '—'}</span>
                        )}
                        <span className="text-[10px] text-[color:var(--rbr-muted)]">
                          {ORIGEM_MANUAL.includes(l.origem) ? `Você preenche em: ${l.origem}` : `Automático: ${l.origem}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {!carregando && !erroCarga && tipo === 'mdfe' && (
            <FormularioCiotVpo operacaoId={operacaoId} onSalvo={() => setVersao((v) => v + 1)} />
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <button onClick={onCancelar} disabled={emitindo} className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60" style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}>
            Fechar
          </button>
          <button
            onClick={onConfirmar}
            disabled={!podeEmitir || emitindo}
            className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--rbr-navy)', color: '#fff' }}
          >
            {emitindo ? 'Enviando…' : `Confirmar e emitir ${titulo}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// Preenchimento manual do que sai do portal da Repom (enquanto não há integração por API).
function FormularioCiotVpo({ operacaoId, onSalvo }: { operacaoId: string; onSalvo: () => void }) {
  const [ciot, setCiot] = useState('')
  const [idvpo, setIdvpo] = useState('')
  const [valor, setValor] = useState('')
  const [cnpjForn, setCnpjForn] = useState('')
  const [tipoVpo, setTipoVpo] = useState('')
  const [averbacao, setAverbacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data } = await supabase.from('operacao_ciot_vpo').select('*').eq('operacao_id', operacaoId).maybeSingle()
      if (!vivo || !data) return
      setCiot(data.ciot ?? '')
      setIdvpo(data.vpo_idvpo ?? '')
      setValor(data.vpo_valor != null ? String(data.vpo_valor) : '')
      setCnpjForn(data.vpo_cnpj_fornecedora ?? '')
      setTipoVpo(data.vpo_tipo ?? '')
      setAverbacao(data.numero_averbacao ?? '')
    })()
    return () => {
      vivo = false
    }
  }, [operacaoId])

  async function salvar() {
    setSalvando(true)
    setMsg(null)
    const digitos = (v: string) => v.replace(/\D/g, '')
    const { error } = await supabase.from('operacao_ciot_vpo').upsert(
      {
        operacao_id: operacaoId,
        ciot: digitos(ciot) || null,
        vpo_idvpo: digitos(idvpo) || null,
        vpo_valor: valor ? Number(valor.replace(',', '.')) : null,
        vpo_cnpj_fornecedora: digitos(cnpjForn) || null,
        vpo_tipo: tipoVpo || null,
        numero_averbacao: averbacao.trim() || null,
        origem: 'manual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'operacao_id' },
    )
    setSalvando(false)
    if (error) {
      setMsg(`Não consegui salvar: ${error.message}`)
      return
    }
    setMsg('Salvo.')
    onSalvo()
  }

  const campo = 'text-xs rounded-lg border px-2.5 py-1.5 w-full bg-white'
  const estilo = { borderColor: 'var(--rbr-border)' }
  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] border-b" style={{ borderColor: 'var(--rbr-border)', background: 'var(--rbr-muted-bg)' }}>
        Preencher agora — CIOT, Vale-Pedágio (portal Repom) e averbação
      </div>
      <div className="p-3 grid gap-2.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          <span>CIOT (12 dígitos)<Obrig entidade="operacao_ciot_vpo" campo="ciot" /></span>
          <input className={campo} style={estilo} value={ciot} onChange={(e) => setCiot(e.target.value)} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          <span>IDVPO (comprovante do pedágio)<Obrig entidade="operacao_ciot_vpo" campo="vpo_idvpo" /></span>
          <input className={campo} style={estilo} value={idvpo} onChange={(e) => setIdvpo(e.target.value)} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          Valor do vale-pedágio (R$)
          <input className={campo} style={estilo} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          CNPJ da credenciada (Repom)
          <input className={campo} style={estilo} value={cnpjForn} onChange={(e) => setCnpjForn(e.target.value)} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          <span>Número da averbação do seguro<Obrig entidade="operacao_ciot_vpo" campo="numero_averbacao" /></span>
          <input className={campo} style={estilo} value={averbacao} onChange={(e) => setAverbacao(e.target.value)} placeholder="Protocolo/número da averbação do CT-e" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          Tipo do vale-pedágio
          <select className={campo} style={estilo} value={tipoVpo} onChange={(e) => setTipoVpo(e.target.value)}>
            <option value="">—</option>
            <option value="01">TAG</option>
            <option value="04">Leitura de placa</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button onClick={salvar} disabled={salvando} className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>
            {salvando ? 'Salvando…' : 'Salvar e reconferir'}
          </button>
          {msg && <span className="text-[11px] text-[color:var(--rbr-muted)]">{msg}</span>}
        </div>
      </div>
    </div>
  )
}
