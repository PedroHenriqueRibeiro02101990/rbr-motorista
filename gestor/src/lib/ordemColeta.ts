// Rascunho da ordem de coleta a partir da operação (o gestor confere e ajusta antes de gerar o PDF).
// Local de carregamento: coleta em outro local (cotacoes.origem_*) > endereço do remetente da NF-e na cidade de origem
// > endereço do cliente na cidade de origem > só cidade/UF. Usado por components/operacao/OrdemColeta.tsx;
// testes em gestor/test/ordemColeta.test.ts. PDF: shared/ordemColetaPdf.ts.
import type { OrdemColeta } from '@rbr/shared/ordemColetaPdf'
import { tituloRota } from './tituloRota.ts'

type Endereco = { logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null; cep?: string | null; telefone?: string | null }

export interface FonteOrdem {
  operacao: { id: string; coleta_prevista: string | null; peso_bruto: number | null }
  cotacao: {
    cidade_origem: string | null
    uf_origem: string | null
    cidade_destino: string | null
    uf_destino: string | null
    tipo_cotacao?: string | null
    origem_cep?: string | null
    origem_endereco?: string | null
    nf_remetente_endereco?: unknown
    nf_produto_predominante?: string | null
    tipo_carga?: string | null
    peso_bruto_kg?: number | null
    nf_quantidade_volumes?: number | null
    nf_numero?: string | null
    nf_chave_acesso?: string | null
  } | null
  cliente: { logradouro?: string | null; numero_endereco?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null; nome_contato_comercial?: string | null; celular_whatsapp?: string | null } | null
  documentos: { tipo: string; status?: string | null; numero_documento?: string | null; chave_acesso?: string | null }[]
  motorista: { nome: string } | null
  veiculo: { placa: string } | null
  empresa?: { razao_social?: string; telefone_comercial?: string }
}

export type RascunhoOrdem = Omit<OrdemColeta, 'codigo' | 'gerada_em' | 'rota' | 'empresa'>

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
const linhaEndereco = (logradouro?: string | null, numero?: string | null, bairro?: string | null) =>
  [[logradouro, numero].filter((x) => (x ?? '').trim()).join(', '), bairro].filter((x) => (x ?? '').trim()).join(' — ')
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '') || null

export function rascunhoOrdemColeta(f: FonteOrdem): RascunhoOrdem {
  const c = f.cotacao
  const cidade = c?.cidade_origem ?? ''
  const uf = (c?.uf_origem ?? '').toUpperCase()
  const rem = (c?.nf_remetente_endereco ?? null) as Endereco | null
  let endereco = ''
  let cep: string | null = null
  if (digitos(c?.origem_cep)) {
    endereco = (c?.origem_endereco ?? '').trim()
    cep = digitos(c?.origem_cep)
  } else if (rem && norm(rem.municipio) === norm(cidade)) {
    endereco = linhaEndereco(rem.logradouro, rem.numero, rem.bairro)
    cep = digitos(rem.cep)
  } else if (f.cliente && norm(f.cliente.cidade) === norm(cidade)) {
    endereco = linhaEndereco(f.cliente.logradouro, f.cliente.numero_endereco, f.cliente.bairro)
    cep = digitos(f.cliente.cep)
  }
  const documentos: OrdemColeta['documentos'] = []
  if (c?.nf_numero || c?.nf_chave_acesso) documentos.push({ tipo: 'nfe', numero: c.nf_numero ?? null })
  for (const t of ['cte', 'mdfe', 'nfse']) {
    const d = f.documentos.find((x) => x.tipo === t && x.status === 'emitido')
    if (d) documentos.push({ tipo: t, numero: d.numero_documento ?? null })
  }
  return {
    endereco_carregamento: endereco || `${cidade}/${uf}`,
    cep_carregamento: cep,
    cidade_carregamento: cidade,
    uf_carregamento: uf,
    contato_nome: f.cliente?.nome_contato_comercial ?? null,
    contato_telefone: f.cliente?.celular_whatsapp ?? rem?.telefone ?? null,
    coleta_prevista_em: f.operacao.coleta_prevista,
    carga_descricao: c?.nf_produto_predominante || c?.tipo_carga || null,
    peso_kg: c?.peso_bruto_kg ?? f.operacao.peso_bruto ?? null,
    volumes: c?.nf_quantidade_volumes ?? null,
    documentos,
    observacoes: null,
    motorista: f.motorista?.nome ?? null,
    placa: f.veiculo?.placa ?? null,
  }
}

export function ordemCompleta(f: FonteOrdem, r: RascunhoOrdem, versao: number, geradaEm = new Date().toISOString()): OrdemColeta {
  return {
    ...r,
    codigo: `${f.operacao.id.slice(0, 8).toUpperCase()}-v${versao}`,
    rota: f.cotacao ? tituloRota(f.cotacao) : '',
    gerada_em: geradaEm,
    empresa: { nome: 'RBR Cargo', telefone: f.empresa?.telefone_comercial ?? null },
  }
}

// O que falta para a ordem fazer sentido para o motorista (aviso, não bloqueia).
export function faltasOrdem(r: RascunhoOrdem): string[] {
  const f: string[] = []
  if (!r.endereco_carregamento.trim() || r.endereco_carregamento === `${r.cidade_carregamento}/${r.uf_carregamento}`) f.push('endereço de carregamento')
  if (!r.contato_nome && !r.contato_telefone) f.push('contato no local')
  if (!r.coleta_prevista_em) f.push('data da coleta')
  return f
}
