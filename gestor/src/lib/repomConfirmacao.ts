// Tela de prévia e confirmação do Repom (PENDENTE de homologação da Repom e de revisão do Pedro).
// Toda a regra fica aqui (pura, testada em node); a tela (pages/RepomConfirmacao.tsx) só desenha e chama a função.
// ADITIVO e ESCONDIDO: a rota só existe com VITE_REPOM_UI = "sim" (padrão desligado). Não mexe em nada da demonstração.
// A API já exige previa_hash + confirmação humana (nome, hora <= 15 min); a tela só repete essa regra para o gestor não errar.

// import.meta.env não existe quando os testes rodam em node: o ?. deixa a flag desligada.
const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
export const REPOM_UI_HABILITADA = ENV?.VITE_REPOM_UI === 'sim'

export type ClienteRepom = '9501' | '9520'
export const CLIENTES: { id: ClienteRepom; rotulo: string }[] = [
  { id: '9501', rotulo: '9501 · Vale-pedágio (VPO)' },
  { id: '9520', rotulo: '9520 · Frete / CIOT' },
]

export function funcaoDoCliente(c: ClienteRepom): 'repom-vpo' | 'repom-frete' {
  return c === '9501' ? 'repom-vpo' : 'repom-frete'
}
export function acoesDoCliente(c: ClienteRepom): { previa: string; emitir: string } {
  return c === '9501' ? { previa: 'previa', emitir: 'emitir' } : { previa: 'previa_contrato', emitir: 'emitir_contrato' }
}

export interface FormularioRepom {
  cliente: ClienteRepom
  operacaoId: string
  valor: string
  rota: string // só o 9501 usa (descrição da rota na prévia)
  dadosJson: string // pedido (9501) ou contrato (9520), como a função espera
}

export function lerDadosJson(texto: string): { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string } {
  if (!texto.trim()) return { ok: false, erro: 'Cole os dados da operação (JSON).' }
  try {
    const d = JSON.parse(texto) as unknown
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, erro: 'Os dados precisam ser um objeto JSON.' }
    return { ok: true, dados: d as Record<string, unknown> }
  } catch {
    return { ok: false, erro: 'Os dados não são um JSON válido.' }
  }
}

export function lerValor(v: string): number | null {
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function validarFormulario(f: FormularioRepom): string | null {
  if (!f.operacaoId.trim()) return 'Informe a operação.'
  if (lerValor(f.valor) == null) return 'Informe um valor maior que zero.'
  const d = lerDadosJson(f.dadosJson)
  return d.ok ? null : d.erro
}

/** Identifica os dados da prévia: se qualquer campo mudar, a prévia antiga deixa de valer. */
export function assinaturaDoFormulario(f: FormularioRepom): string {
  return JSON.stringify([f.cliente, f.operacaoId.trim(), lerValor(f.valor), f.rota.trim(), f.dadosJson.trim()])
}

export type EntradaFuncao = Record<string, unknown>

function corpoBase(f: FormularioRepom): EntradaFuncao {
  const d = lerDadosJson(f.dadosJson)
  const dados = d.ok ? d.dados : {}
  const base: EntradaFuncao = { operacao_id: f.operacaoId.trim(), valor: lerValor(f.valor) }
  if (f.cliente === '9501') return { ...base, pedido: dados, rota_descricao: f.rota.trim() || undefined }
  return { ...base, contrato: dados }
}

export function montarEntradaPrevia(f: FormularioRepom): EntradaFuncao {
  return { acao: acoesDoCliente(f.cliente).previa, ...corpoBase(f) }
}

export function montarEntradaEnvio(f: FormularioRepom, previaHash: string, nome: string, agora: Date = new Date()): EntradaFuncao {
  return { acao: acoesDoCliente(f.cliente).emitir, ...corpoBase(f), confirmacao: { nome: nome.trim(), em: agora.toISOString(), previa_hash: previaHash } }
}

export interface PreviaRecebida {
  previa: { valor: number; motorista: string; placa: string; carreta: string | null; rota: string; eixos: number }
  previa_hash: string
  ambiente: 'qa' | 'prd'
  emTeste: boolean
  maximo: number
}

/** Lê a resposta da ação de prévia. Devolve null se não for uma prévia completa. */
export function lerPrevia(resposta: unknown): PreviaRecebida | null {
  const r = resposta as Partial<PreviaRecebida> | null
  if (!r || typeof r !== 'object' || !r.previa || typeof r.previa !== 'object' || typeof r.previa_hash !== 'string' || !r.previa_hash) return null
  if (r.ambiente !== 'qa' && r.ambiente !== 'prd') return null
  return r as PreviaRecebida
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function resumoDaPrevia(p: PreviaRecebida, cliente: ClienteRepom): { rotulo: string; valor: string }[] {
  const x = p.previa
  const linhas = [
    { rotulo: 'Cliente Repom', valor: CLIENTES.find((c) => c.id === cliente)?.rotulo ?? cliente },
    { rotulo: 'Ambiente', valor: p.ambiente === 'prd' ? 'Produção (vale de verdade)' : 'QA (teste)' },
    { rotulo: 'Valor', valor: brl(x.valor) },
    { rotulo: 'Limite por operação', valor: brl(p.maximo) },
    { rotulo: 'Rota', valor: x.rota || '—' },
    { rotulo: 'Motorista', valor: x.motorista || '—' },
    { rotulo: 'Placa', valor: x.carreta ? `${x.placa} + ${x.carreta}` : x.placa || '—' },
  ]
  if (x.eixos) linhas.push({ rotulo: 'Eixos', valor: String(x.eixos) })
  return linhas
}

/** A trava (REPOM_API_LIBERADA) só se vê pela resposta: prévia com 200 = ligada; 503 = desligada. */
export type EstadoTrava = 'ligada' | 'desligada' | 'desconhecida'
export function estadoDaTrava(status: number | null, resposta: unknown): EstadoTrava {
  if (status === 503) return 'desligada'
  if (lerPrevia(resposta)) return 'ligada'
  return 'desconhecida'
}
export const TEXTO_TRAVA: Record<EstadoTrava, string> = {
  ligada: 'Trava LIBERADA: a Repom será chamada ao enviar.',
  desligada: 'Trava DESLIGADA: nenhuma chamada à Repom é feita.',
  desconhecida: 'Trava ainda não conferida (gere a prévia).',
}

export function nomeValido(nome: string): boolean {
  return nome.trim().length >= 3
}

export const JANELA_CONFIRMACAO_MIN = 15
/** A API recusa confirmação com mais de 15 min: a tela pede nova prévia antes disso. */
export function previaExpirada(geradaEm: number | null, agora: number = Date.now()): boolean {
  return geradaEm == null || agora - geradaEm > (JANELA_CONFIRMACAO_MIN - 1) * 60_000
}

export function podeEnviar(p: { previa: PreviaRecebida | null; formularioMudou: boolean; nome: string; confirmou: boolean; ocupado: boolean; trava: EstadoTrava; geradaEm: number | null; agora?: number }): { pode: boolean; motivo: string | null } {
  if (p.ocupado) return { pode: false, motivo: 'Aguarde a resposta.' }
  if (!p.previa) return { pode: false, motivo: 'Gere a prévia primeiro.' }
  if (p.formularioMudou) return { pode: false, motivo: 'Os dados mudaram: gere a prévia de novo.' }
  if (previaExpirada(p.geradaEm, p.agora)) return { pode: false, motivo: 'A prévia ficou velha: gere de novo.' }
  if (p.trava === 'desligada') return { pode: false, motivo: 'A trava da Repom está desligada.' }
  if (!nomeValido(p.nome)) return { pode: false, motivo: 'Digite o nome do responsável.' }
  if (!p.confirmou) return { pode: false, motivo: 'Marque a confirmação.' }
  return { pode: true, motivo: null }
}

/** Remove qualquer coisa que pareça token, senha ou credencial e limita o tamanho (a tela nunca mostra segredo). */
export function erroCurto(mensagem: unknown, max = 200): string {
  let t = String(mensagem ?? '').replace(/\s+/g, ' ').trim()
  t = t.replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
  t = t.replace(/\b(access_token|token|password|senha|secret|authorization|passwd|pwd)\b(["']?\s*[:=]\s*)(["']?)[^\s,"'}&]+/gi, '$1$2$3***')
  t = t.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '***')
  return (t || 'Não foi possível concluir.').slice(0, max)
}

export type SaidaEnvio = { tipo: 'emitido'; texto: string } | { tipo: 'incerto'; texto: string } | { tipo: 'erro'; texto: string }

/** Traduz a resposta da ação de envio em um status curto. 202 = resultado incerto: NÃO reenviar sem conferir. */
export function statusDoEnvio(status: number, corpo: unknown): SaidaEnvio {
  const c = (corpo ?? {}) as { ok?: boolean; erro?: unknown; registro?: { estado?: unknown } }
  if (status === 202 || (c.registro && c.registro.estado === 'enviado')) return { tipo: 'incerto', texto: erroCurto(c.erro ?? 'A Repom ainda não confirmou. Não envie de novo: confira a operação antes.') }
  if (status >= 200 && status < 300 && c.ok !== false) return { tipo: 'emitido', texto: c.registro?.estado ? `Estado: ${erroCurto(c.registro.estado, 40)}` : 'Enviado.' }
  return { tipo: 'erro', texto: erroCurto(c.erro ?? `A função respondeu ${status}.`) }
}
