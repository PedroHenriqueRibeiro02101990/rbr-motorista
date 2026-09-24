import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { formatMoney, formatDate, TIPO_DOC_LABEL } from '@rbr/shared/format'

type T = Database['public']['Tables']
export type Operacao = T['operacoes']['Row']
export type Cotacao = T['cotacoes']['Row']
export type Veiculo = T['veiculos']['Row']
export type Pessoa = T['pessoas']['Row']
export type Cliente = T['clientes']['Row']
export type Documento = T['documentacao_operacao']['Row']
export type CondicaoPagamento = T['condicoes_pagamento_operacao']['Row']
export type Apolice = T['apolices_seguro']['Row']
export type CustoItem = T['cotacao_custos_adicionais']['Row'] & {
  tipos_custo_adicional: { nome: string; codigo: string } | null
  fornecedores: { nome: string | null; razao_social: string | null } | null
}

export interface EnderecoJson {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  municipio?: string | null
  codigo_ibge?: string | null
  uf?: string | null
  cep?: string | null
}

export interface DadosEmpresa {
  razao_social?: string
  cnpj?: string
  rntrc?: string
  inscricao_estadual?: string
  endereco?: EnderecoJson & { logradouro?: string; municipio?: string }
  telefone_comercial?: string
  email_comercial?: string
}

export interface AssessoriaContato {
  nome: string
  whatsapp: string
  email: string
}

export interface DetalheOperacao {
  operacao: Operacao
  cotacao: Cotacao | null
  cliente: Cliente | null
  custos: CustoItem[]
  veiculo: Veiculo | null
  reboques: Veiculo[]
  motorista: Pessoa | null
  titular: Pessoa | null
  condicao: CondicaoPagamento | null
  documentos: Documento[]
  apolice: Apolice | null
  empresa: DadosEmpresa
}

export async function carregarDetalhe(operacaoId: string): Promise<DetalheOperacao> {
  const { data: operacao, error } = await supabase.from('operacoes').select('*').eq('id', operacaoId).single()
  if (error || !operacao) throw error ?? new Error('Operação não encontrada.')

  const hoje = new Date().toLocaleDateString('sv-SE') // data local
  const [cot, cli, custos, veic, rebs, mot, cond, docs, apos, emp] = await Promise.all([
    operacao.cotacao_id ? supabase.from('cotacoes').select('*').eq('id', operacao.cotacao_id).maybeSingle() : Promise.resolve({ data: null }),
    operacao.cliente_id ? supabase.from('clientes').select('*').eq('id', operacao.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    operacao.cotacao_id
      ? supabase
          .from('cotacao_custos_adicionais')
          .select('*, tipos_custo_adicional(nome, codigo), fornecedores(nome, razao_social)')
          .eq('cotacao_id', operacao.cotacao_id)
      : Promise.resolve({ data: [] }),
    operacao.veiculo_id ? supabase.from('veiculos').select('*').eq('id', operacao.veiculo_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('operacao_reboques').select('ordem, veiculos(*)').eq('operacao_id', operacaoId).order('ordem'),
    operacao.pessoa_alocada_id ? supabase.from('pessoas').select('*').eq('id', operacao.pessoa_alocada_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('condicoes_pagamento_operacao').select('*').eq('operacao_id', operacaoId).maybeSingle(),
    supabase.from('documentacao_operacao').select('*').eq('operacao_id', operacaoId),
    supabase
      .from('apolices_seguro')
      .select('*')
      .or(`vigencia_inicio.is.null,vigencia_inicio.lte.${hoje}`)
      .order('vigencia_inicio', { ascending: false, nullsFirst: false }),
    supabase.from('parametros_sistema').select('valor').eq('chave', 'dados_empresa').maybeSingle(),
  ])

  const veiculo = (veic.data as Veiculo | null) ?? null
  const motorista = (mot.data as Pessoa | null) ?? null
  const titularId = veiculo?.titular_id ?? motorista?.titular_id ?? motorista?.id ?? null
  let titular: Pessoa | null = null
  if (titularId) {
    titular = titularId === motorista?.id ? motorista : ((await supabase.from('pessoas').select('*').eq('id', titularId).maybeSingle()).data ?? null)
  }
  const apolice =
    ((apos.data ?? []) as Apolice[]).find((a) => !a.vigencia_fim || a.vigencia_fim >= hoje) ?? null

  return {
    operacao,
    cotacao: (cot.data as Cotacao | null) ?? null,
    cliente: (cli.data as Cliente | null) ?? null,
    custos: ((custos.data ?? []) as unknown as CustoItem[]),
    veiculo,
    reboques: ((rebs.data ?? []) as unknown as { veiculos: Veiculo }[]).map((r) => r.veiculos).filter(Boolean),
    motorista,
    titular,
    condicao: (cond.data as CondicaoPagamento | null) ?? null,
    documentos: (docs.data ?? []) as Documento[],
    apolice,
    empresa: ((emp.data?.valor ?? {}) as DadosEmpresa) || {},
  }
}

// ---------------------------------------------------------------------------
// Ficha de emissão para a assessoria (CT-e, MDF-e, CIOT, VPO, averbação, GR...)
// ---------------------------------------------------------------------------

export interface LinhaFicha {
  campo: string
  valor: string
  faltando: boolean // obrigatório e vazio → aparece em vermelho
}

export interface SecaoFicha {
  titulo: string
  linhas: LinhaFicha[]
}

const vazio = (v: unknown) => v == null || String(v).trim() === ''

function l(campo: string, valor: unknown, obrigatorio = true): LinhaFicha {
  const txt = vazio(valor) ? '' : String(valor)
  return { campo, valor: txt || (obrigatorio ? 'FALTANDO' : '—'), faltando: obrigatorio && vazio(valor) }
}

function endereco(e: EnderecoJson | null | undefined): string {
  if (!e) return ''
  const partes = [
    [e.logradouro, e.numero].filter((x) => !vazio(x)).join(', '),
    e.complemento,
    e.bairro,
    [e.municipio, e.uf].filter((x) => !vazio(x)).join('/'),
    e.cep ? `CEP ${e.cep}` : null,
    e.codigo_ibge ? `IBGE ${e.codigo_ibge}` : null,
  ].filter((x) => !vazio(x))
  return partes.join(' — ')
}

function enderecoPessoa(p: Pessoa | null): string {
  if (!p) return ''
  return endereco({
    logradouro: p.logradouro,
    numero: p.numero_endereco,
    complemento: p.complemento,
    bairro: p.bairro,
    municipio: p.cidade,
    uf: p.uf,
    cep: p.cep,
  })
}

function secaoVeiculo(titulo: string, v: Veiculo, dono: Pessoa | null): SecaoFicha {
  return {
    titulo,
    linhas: [
      l('Placa', v.placa),
      l('RENAVAM', v.renavam),
      l('UF de licenciamento', v.uf_licenciamento),
      l('RNTRC do veículo', v.rntrc_numero),
      l('Tipo', v.tipo_veiculo),
      l('Carroceria', v.tipo_carroceria, !v.e_reboque ? false : true),
      l('Tara (kg)', v.tara_kg),
      l('Capacidade (kg)', v.capacidade_carga),
      l('Eixos', v.quantidade_eixos),
      l('Proprietário', dono ? `${dono.nome} — ${dono.cnpj || dono.cpf || 'sem documento'}` : ''),
    ],
  }
}

export function montarFicha(d: DetalheOperacao): SecaoFicha[] {
  const { operacao: o, cotacao: c, cliente, veiculo, reboques, motorista, titular, condicao, apolice, empresa, custos } = d
  const exigidos = new Set(d.documentos.filter((x) => x.exigido).map((x) => x.tipo))
  const secoes: SecaoFicha[] = []

  secoes.push({
    titulo: 'Documentos a emitir',
    linhas: Array.from(exigidos).map((t) => ({ campo: TIPO_DOC_LABEL[t] ?? t, valor: 'emitir', faltando: false })),
  })

  secoes.push({
    titulo: 'Emitente / contratante — RBR Cargo',
    linhas: [
      l('Razão social', empresa.razao_social),
      l('CNPJ', empresa.cnpj),
      l('Inscrição estadual', empresa.inscricao_estadual),
      l('RNTRC', empresa.rntrc),
      l('Endereço', endereco(empresa.endereco as EnderecoJson)),
    ],
  })

  secoes.push({
    titulo: 'Remetente',
    linhas: [
      l('Razão social', c?.nf_remetente_razao_social),
      l('CNPJ/CPF', c?.nf_remetente_cnpj),
      l('Inscrição estadual', c?.nf_remetente_ie),
      l('Endereço', endereco(c?.nf_remetente_endereco as EnderecoJson | null)),
    ],
  })

  secoes.push({
    titulo: 'Destinatário',
    linhas: [
      l('Razão social', c?.nf_destinatario_razao_social),
      l('CNPJ/CPF', c?.nf_destinatario_cnpj),
      l('Inscrição estadual', c?.nf_destinatario_ie, false),
      l('Endereço', endereco(c?.nf_destinatario_endereco as EnderecoJson | null)),
    ],
  })

  const tomadorTxt =
    c?.tomador_papel === 'remetente'
      ? 'Remetente'
      : c?.tomador_papel === 'destinatario'
        ? 'Destinatário'
        : c?.tomador_papel === 'terceiro'
          ? `Terceiro — ${cliente?.razao_social ?? ''} (${cliente?.cnpj ?? cliente?.cpf ?? 'sem documento'})`
          : ''
  secoes.push({
    titulo: 'Tomador do serviço (quem paga o frete)',
    linhas: [
      l('Tomador', tomadorTxt),
      ...(c?.tomador_papel === 'terceiro'
        ? [
            l(
              'Endereço do tomador',
              cliente
                ? endereco({
                    logradouro: cliente.logradouro,
                    numero: cliente.numero_endereco,
                    complemento: cliente.complemento,
                    bairro: cliente.bairro,
                    municipio: cliente.cidade,
                    uf: cliente.uf,
                    cep: cliente.cep,
                  })
                : '',
            ),
          ]
        : []),
    ],
  })

  secoes.push({
    titulo: 'Carga e NF-e',
    linhas: [
      l('Chave da NF-e', c?.nf_chave_acesso),
      l('Nº / série', [c?.nf_numero, c?.nf_serie].filter((x) => !vazio(x)).join(' / '), false),
      l('Emissão da NF', c?.nf_data_emissao ? formatDate(c.nf_data_emissao) : '', false),
      l('Natureza da operação', c?.natureza_operacao, false),
      l('Produto predominante', c?.nf_produto_predominante),
      l('NCM(s)', c?.ncms_produtos?.join(', '), false),
      l('Tipo de carga (ANTT)', c?.tipo_carga),
      l('Peso bruto (kg)', c?.peso_bruto_kg ?? o.peso_bruto),
      l('Volumes', c?.nf_quantidade_volumes, false),
      l('Valor da mercadoria', c?.valor_nf != null ? formatMoney(c.valor_nf) : ''),
      l('Carga perigosa', o.carga_complexa_eixo1_perigosa ? `SIM${o.numero_onu ? ` — ONU ${o.numero_onu}` : ' — informar nº ONU'}` : 'Não', false),
      ...(o.carga_complexa_eixo2_superdimensionada
        ? [l('Dimensões C×L×A (cm)', o.comprimento_cm && o.largura_cm && o.altura_cm ? `${o.comprimento_cm} × ${o.largura_cm} × ${o.altura_cm}` : '')]
        : []),
    ],
  })

  secoes.push({
    titulo: 'Rota',
    linhas: [
      l('Origem', c?.cidade_origem ? `${c.cidade_origem}/${c.uf_origem ?? ''}` : ''),
      l('Destino', c?.cidade_destino ? `${c.cidade_destino}/${c.uf_destino ?? ''}` : ''),
      l('Distância (km)', c?.distancia_km, false),
    ],
  })

  secoes.push({
    titulo: 'Valores do CT-e',
    linhas: [
      l('Valor total da prestação', c?.valor_total != null ? formatMoney(c.valor_total) : ''),
      l('Pedágio (vale-pedágio)', c?.pedagio != null ? formatMoney(c.pedagio) : '', false),
      l('Imposto estimado na cotação', c?.valor_imposto != null ? `${formatMoney(c.valor_imposto)} (alíquota/CST definidos pela assessoria)` : '', false),
    ],
  })

  if (veiculo) secoes.push(secaoVeiculo('Veículo — cavalo / tração', veiculo, titular))
  else secoes.push({ titulo: 'Veículo — cavalo / tração', linhas: [l('Veículo', '')] })
  reboques.forEach((r, i) => secoes.push(secaoVeiculo(`Carreta ${i + 1}`, r, titular)))

  secoes.push({
    titulo: 'Motorista (condutor)',
    linhas: [
      l('Nome', motorista?.nome),
      l('CPF', motorista?.cpf),
      l('CNH nº', motorista?.cnh_numero_registro),
      l('CNH categoria', motorista?.cnh_categoria),
      l('CNH validade', motorista?.cnh_validade ? formatDate(motorista.cnh_validade) : ''),
      l('Celular', motorista?.celular, false),
    ],
  })

  secoes.push({
    titulo: 'Contratado — transportador (CIOT)',
    linhas: [
      l('Nome / razão social', titular?.nome),
      l('CPF/CNPJ', titular?.cnpj || titular?.cpf),
      l('RNTRC', titular?.rntrc_numero),
      l('Endereço', enderecoPessoa(titular)),
    ],
  })

  const saldo = condicao ? condicao.valor_total_contrato - (condicao.valor_adiantamento ?? 0) : null
  secoes.push({
    titulo: 'Pagamento do frete ao motorista (CIOT / MDF-e)',
    linhas: [
      l('Valor total do contrato', condicao ? formatMoney(condicao.valor_total_contrato) : ''),
      l('Forma', condicao ? (condicao.tipo === 'imediato' ? 'À vista (pagamento único)' : 'Com adiantamento + saldo') : ''),
      ...(condicao?.tipo === 'diferido'
        ? [l('Adiantamento', formatMoney(condicao.valor_adiantamento ?? 0)), l('Saldo', formatMoney(saldo ?? 0))]
        : []),
      l('Meio', condicao ? (condicao.meio_pagamento === 'pix' ? 'PIX' : condicao.meio_pagamento === 'transferencia' ? 'Transferência' : 'IPEF') : ''),
      condicao?.meio_pagamento === 'pix'
        ? l('Chave PIX do contratado', titular?.pix)
        : l(
            'Banco / agência / conta',
            titular?.banco_codigo ? `${titular.banco_codigo} / ${titular.banco_agencia ?? ''} / ${titular.banco_conta ?? ''} (${titular.banco_tipo_conta ?? ''})` : '',
          ),
    ],
  })

  if (exigidos.has('vpo')) {
    secoes.push({
      titulo: 'Vale-pedágio (VPO)',
      linhas: [
        l('Valor', c?.pedagio != null ? formatMoney(c.pedagio) : ''),
        l('Eixos (conjunto)', c?.eixos),
        l('Placa', veiculo?.placa),
        l('Rota', c?.cidade_origem ? `${c.cidade_origem}/${c.uf_origem} → ${c.cidade_destino}/${c.uf_destino}` : ''),
      ],
    })
  }

  secoes.push({
    titulo: 'Seguro da carga / averbação',
    linhas: [
      l('Seguradora', apolice?.seguradora_nome),
      l('CNPJ da seguradora', apolice?.seguradora_cnpj),
      l('Nº da apólice', apolice?.numero_apolice),
      l('Responsável pelo seguro', apolice ? (apolice.responsavel_seguro === 'emitente' ? 'Emitente (RBR)' : 'Tomador') : ''),
      l('Valor a averbar', c?.valor_nf != null ? formatMoney(c.valor_nf) : ''),
    ],
  })

  if (exigidos.has('wialon')) {
    secoes.push({
      titulo: 'Rastreamento por satélite',
      linhas: [
        l('Tipo de rastreador', veiculo?.rastreador_tipo === 'wialon' ? 'Satélite (certificado)' : veiculo?.rastreador_tipo),
        l('Identificador', veiculo?.rastreador_identificador),
        l('Ativo', veiculo?.rastreador_ativo ? 'Sim' : ''),
      ],
    })
  }

  const adicionais = custos.filter((x) => x.recebedor !== 'motorista')
  if (adicionais.length > 0) {
    secoes.push({
      titulo: 'Custos adicionais da operação (referência)',
      linhas: adicionais.map((x) => ({
        campo: x.tipos_custo_adicional?.nome ?? 'Custo',
        valor: `${formatMoney(x.valor_total)}${x.fornecedores?.nome || x.fornecedores?.razao_social ? ` — ${x.fornecedores.nome || x.fornecedores.razao_social}` : ''}`,
        faltando: false,
      })),
    })
  }

  return secoes
}

export function textoFicha(d: DetalheOperacao, secoes: SecaoFicha[]): string {
  const cab = [
    'RBR CARGO — FICHA DE EMISSÃO DE DOCUMENTOS',
    `Operação ${d.operacao.id.slice(0, 8).toUpperCase()} · gerada em ${new Date().toLocaleString('pt-BR')}`,
    '',
  ]
  const corpo = secoes.flatMap((s) => [`== ${s.titulo.toUpperCase()} ==`, ...s.linhas.map((x) => `${x.campo}: ${x.valor}`), ''])
  return [...cab, ...corpo].join('\n')
}

export function camposFaltando(secoes: SecaoFicha[]): { secao: string; campo: string }[] {
  return secoes.flatMap((s) => s.linhas.filter((x) => x.faltando).map((x) => ({ secao: s.titulo, campo: x.campo })))
}
