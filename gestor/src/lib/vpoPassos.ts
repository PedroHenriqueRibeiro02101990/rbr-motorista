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
  situacao?: string | null // 'em_processamento' enquanto o NSPEDAGIO ainda não concluiu (compra/cancelamento demorados)
  processando_desde?: string | null
}

// Quanto a tela espera pelo recibo (mesmos valores de supabase/functions/_shared/vpoAndamento.ts).
export const ESPERA_MAXIMA_MS = 5 * 60_000
export const INTERVALO_RECIBO_MS = 15_000

export type EstadoVpo = 'nao_simulado' | 'simulado' | 'comprando' | 'comprado' | 'cancelando' | 'cancelado' | 'nao_confirmado'

export const ROTULO_ESTADO_VPO: Record<EstadoVpo, string> = {
  nao_simulado: 'Não simulado',
  simulado: 'Simulado',
  comprando: 'Comprando…',
  comprado: 'Comprado',
  cancelando: 'Cancelando…',
  cancelado: 'Cancelado',
  nao_confirmado: 'Não confirmado',
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

// Compra/cancelamento que o NSPEDAGIO ainda não concluiu: marcada pela função, ou enviada sem nenhuma resposta nem erro
// (a função pode ter sido cortada antes de marcar). A espera conta a partir de processando_desde (ou do envio).
export type PendenciaVpo = { id: string; acao: 'comprar' | 'cancelar'; desde: number; expirou: boolean }
export function pendenciaVpo(reqs: RequisicaoVpo[], agora = Date.now()): PendenciaVpo | null {
  const lentas = reqs.filter((r) => (r.acao === 'comprar' || r.acao === 'cancelar') && (r.situacao === 'em_processamento' || (r.situacao == null && r.http_status == null && r.erro == null)))
  if (!lentas.length) return null
  const r = [...lentas].sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]
  const desde = new Date(r.processando_desde ?? r.criado_em).getTime()
  return { id: r.id, acao: r.acao as 'comprar' | 'cancelar', desde, expirou: agora - desde > ESPERA_MAXIMA_MS }
}

export function estadoVpo(reqs: RequisicaoVpo[], agora = Date.now()): EstadoVpo {
  const pend = pendenciaVpo(reqs, agora)
  if (pend) return pend.expirou ? 'nao_confirmado' : pend.acao === 'comprar' ? 'comprando' : 'cancelando'
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
  if (r.situacao === 'em_processamento') return { id: r.id, quando: r.criado_em, titulo, resultado: 'andamento', detalhe: 'Em processamento no NSPEDAGIO; a tela confere o recibo sozinha.' }
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
