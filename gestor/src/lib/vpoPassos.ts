// Vale-pedágio (NSPEDAGIO): estado do cartão e "Registro de passos" a partir de vpo_requisicoes (uma linha por chamada).
// Só leitura de dados já gravados; sem rede. Testes: node --test gestor/test/vpoPassos.test.ts

export type RequisicaoVpo = {
  id: string
  acao: string
  ambiente: string
  http_status: number | null
  id_vpo_antt: string | null
  numero_viagem: string | null
  id_recibo: string | null
  total_viagem: number | null
  erro: string | null
  criado_em: string
  request_json?: unknown
  response_json?: unknown
}

export type EstadoVpo = 'nao_simulado' | 'simulado' | 'comprado' | 'cancelado'

export const ROTULO_ESTADO_VPO: Record<EstadoVpo, string> = {
  nao_simulado: 'Não simulado',
  simulado: 'Simulado',
  comprado: 'Comprado',
  cancelado: 'Cancelado',
}

export const ROTULO_ACAO_VPO: Record<string, string> = {
  simular: 'Simulação do valor',
  'consultar-tag': 'Consulta da tag',
  comprar: 'Compra do vale',
  cancelar: 'Cancelamento',
  recibo: 'Recibo',
  'trocar-placa': 'Troca de placa',
  status: 'Consulta de status',
}

// Chamada que o NSPEDAGIO aceitou. Linha sem resposta ainda (http_status nulo) não conta.
export const deuCerto = (r: RequisicaoVpo) => r.erro == null && r.http_status != null && r.http_status >= 200 && r.http_status < 300

export function estadoVpo(reqs: RequisicaoVpo[]): EstadoVpo {
  const ordenadas = [...reqs].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  let estado: EstadoVpo = 'nao_simulado'
  for (const r of ordenadas) {
    if (!deuCerto(r)) continue
    if (r.acao === 'simular' && estado === 'nao_simulado') estado = 'simulado'
    else if (r.acao === 'comprar') estado = 'comprado'
    else if (r.acao === 'cancelar' && estado === 'comprado') estado = 'cancelado'
  }
  return estado
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type Passo = { id: string; quando: string; titulo: string; resultado: 'ok' | 'erro' | 'andamento'; detalhe: string }

export function passoDe(r: RequisicaoVpo): Passo {
  const titulo = ROTULO_ACAO_VPO[r.acao] ?? r.acao
  if (r.http_status == null && r.erro == null) return { id: r.id, quando: r.criado_em, titulo, resultado: 'andamento', detalhe: 'Enviado; sem resposta registrada.' }
  if (!deuCerto(r)) return { id: r.id, quando: r.criado_em, titulo, resultado: 'erro', detalhe: r.erro ?? `NSPEDAGIO respondeu HTTP ${r.http_status}.` }
  const partes: string[] = []
  if (r.id_vpo_antt) partes.push(`ID do vale ${r.id_vpo_antt}`)
  if (r.numero_viagem) partes.push(`viagem ${r.numero_viagem}`)
  if (r.id_recibo) partes.push(`recibo ${r.id_recibo}`)
  if (r.total_viagem != null) partes.push(`total ${brl(r.total_viagem)}`)
  return { id: r.id, quando: r.criado_em, titulo, resultado: 'ok', detalhe: partes.join(' · ') || 'Concluído.' }
}

export const registroDePassos = (reqs: RequisicaoVpo[]): Passo[] => [...reqs].sort((a, b) => a.criado_em.localeCompare(b.criado_em)).map(passoDe)

// Exportação do registro (JSON). Os campos já vêm sem segredo e sem token (a função grava assim); aqui só se remove
// qualquer chave com cara de credencial por garantia.
const CHAVE_SENSIVEL = /token|secret|senha|password|authorization|client_?id|hash/i
function limpar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(limpar)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, CHAVE_SENSIVEL.test(k) ? '***' : limpar(x)]))
  }
  return v
}
export function registroEmJson(operacaoId: string, reqs: RequisicaoVpo[]): string {
  const ordenadas = [...reqs].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  return JSON.stringify({ operacao_id: operacaoId, ambiente: 'homologacao', passos: limpar(ordenadas) }, null, 2)
}

// Pode comprar? Só depois de simular, com a operação de teste e sem compra ativa.
export function podeComprar(estado: EstadoVpo): boolean {
  return estado === 'simulado' || estado === 'cancelado'
}
export function podeCancelar(estado: EstadoVpo): boolean {
  return estado === 'comprado'
}
