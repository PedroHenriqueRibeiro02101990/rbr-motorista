// Estado e idempotência das operações Repom (vale-pedágio, contrato/CIOT, pagamento). Sem Deno e sem rede: o repositório e os clientes
// são injetados (em produção, o Supabase com service_role e repomVprClient/repomFreteClient; nos testes, objetos em memória).
// Regras (item 4 do prompt, valem para tudo aqui):
//  - um registro por operação, tipo e ambiente; estados: pendente -> enviado -> emitido | erro | cancelado;
//  - o estado "enviado" é gravado ANTES de chamar a Repom; "enviado" sem resposta NUNCA reenvia: consulta primeiro (se houver como) e,
//    sem como conferir, devolve "conferir no portal da Repom" e mantém o estado;
//  - ordem das travas: API liberada (503) -> confirmação humana (400) -> valor máximo (422); só depois toca no banco ou na Repom;
//  - o payload gravado é SANITIZADO (sem nome, documento, placa, cartão, token ou senha);
//  - homologação (ambiente qa) nunca grava como produção e NUNCA libera MDF-e em produção (podeLiberarMdfe).
import { higienizar } from './repomClient.ts'
import { decidirOperacao, type AcaoRepom, type ConfirmacaoHumana } from './repomTrava.ts'

export type TipoOperacaoRepom = 'vpo' | 'ciot' | 'pagamento'
export type EstadoOperacaoRepom = 'pendente' | 'enviado' | 'emitido' | 'erro' | 'cancelado'

export interface RegistroOperacaoRepom {
  id: string
  operacao_id: string
  tipo: TipoOperacaoRepom
  ambiente: 'qa' | 'prd'
  estado: EstadoOperacaoRepom
  tentativa: number // sobe só depois de erro definitivo ou cancelamento
  chave_externa: string // processoCodigoCliente (vale) ou Identifier (contrato): a chave de idempotência junto da Repom
  codigo_viagem: string | null
  codigo_viagem_repom: string | null
  idvpo: string | null
  codigo_contrato: string | null // ShippingId do Repom Frete
  ciot: string | null
  operation_key: string | null
  valor: number | null
  payload_sanitizado: unknown
  resposta_sanitizada: unknown
  erro: string | null
  confirmado_por: string | null
  confirmado_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface RepositorioOperacaoRepom {
  buscar(operacaoId: string, tipo: TipoOperacaoRepom, ambiente: 'qa' | 'prd'): Promise<RegistroOperacaoRepom | null>
  criar(r: Omit<RegistroOperacaoRepom, 'id' | 'criado_em' | 'atualizado_em'>): Promise<RegistroOperacaoRepom>
  atualizar(id: string, patch: Partial<RegistroOperacaoRepom>): Promise<RegistroOperacaoRepom>
}

// ---------- regras puras ----------

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** processoCodigoCliente (vale, até 20): derivado de forma ESTÁVEL da operação (+ tentativa, que só sobe após erro definitivo). */
export async function processoCodigoDe(operacaoId: string, tentativa = 0): Promise<string> {
  const h = (await sha256Hex(`repom-vpo|${operacaoId}|${tentativa}`)).toUpperCase()
  return ('V' + h).slice(0, 20)
}
/** Identifier do contrato Repom Frete (texto livre; usamos o mesmo formato, 20 caracteres). */
export async function identificadorContratoDe(operacaoId: string, tentativa = 0): Promise<string> {
  const h = (await sha256Hex(`repom-frete|${operacaoId}|${tentativa}`)).toUpperCase()
  return ('C' + h).slice(0, 20)
}

const CHAVES_PESSOAIS = /(nome|documento|cpf|cnpj|placa|cartao|card|email|phone|telefone|senha|password|secret|token|authorization|login|usuario|user|partner|national|rntrc|inss|rg$|birth|nascimento|address|endereco|zip|cep)/i
/** Payload que vai para o banco: sem segredo (higienizar) e sem dado pessoal. Mantém valores, códigos e quantidades. */
export function sanitizarPayload(obj: unknown): unknown {
  const rec = (v: unknown, n: number): unknown => {
    if (n > 8 || v == null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map((x) => rec(x, n + 1))
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, CHAVES_PESSOAIS.test(k) && !/^(processo|codigo|idvpo)/i.test(k) ? '[oculto]' : rec(x, n + 1)]))
  }
  return rec(higienizar(obj), 0)
}

/** MDF-e só é liberado por vale/CIOT emitido em PRODUÇÃO. Registro de homologação (qa) nunca libera. */
export function podeLiberarMdfe(r: Pick<RegistroOperacaoRepom, 'ambiente' | 'estado'> | null | undefined): boolean {
  return Boolean(r && r.ambiente === 'prd' && r.estado === 'emitido')
}

// ---------- execução com estado ----------

export type SaidaOperacao =
  | { ok: true; status: 200; registro: RegistroOperacaoRepom; jaExistia: boolean }
  | { ok: false; status: number; erro: string; registro?: RegistroOperacaoRepom; conferirNoPortal?: boolean }

export type Envio = { ok: true; patch: Partial<RegistroOperacaoRepom> } | { ok: false; erro: string; incerto?: boolean; patch?: Partial<RegistroOperacaoRepom> }
export type Conferencia = { achou: true; patch: Partial<RegistroOperacaoRepom> } | { achou: false; erro?: string } | { achou: 'indefinido'; erro: string }

export interface ParametrosExecucao {
  repo: RepositorioOperacaoRepom
  operacaoId: string
  tipo: TipoOperacaoRepom
  acao: AcaoRepom
  ambiente: 'qa' | 'prd'
  apiLiberada: boolean
  valorMaximo: number
  valor: number | null
  confirmacao: Partial<ConfirmacaoHumana> | null | undefined
  /** chave junto da Repom (processoCodigoCliente / Identifier) para a tentativa informada */
  chaveExterna(tentativa: number): Promise<string>
  payload: unknown
  /** consulta o que a Repom já tem (só leitura). Sem como conferir: omitir (então "enviado" fica à conferência manual). */
  conferir?(r: RegistroOperacaoRepom): Promise<Conferencia>
  enviar(r: RegistroOperacaoRepom): Promise<Envio>
  /** limite diário global de chamadas reais: devolve a mensagem de recusa (429) ou null. Roda antes de qualquer chamada à Repom. */
  antesDeChamar?(): Promise<string | null>
  agora?: number
}

export async function executarComEstado(p: ParametrosExecucao): Promise<SaidaOperacao> {
  const agora = p.agora ?? Date.now()
  // 1) travas, antes de tocar em banco ou na Repom
  const v = decidirOperacao({ acao: p.acao, apiLiberada: p.apiLiberada, valor: p.valor, maximo: p.valorMaximo, confirmacao: p.confirmacao, agora })
  if (!v.permitido) return { ok: false, status: v.status, erro: v.erro }

  let reg = await p.repo.buscar(p.operacaoId, p.tipo, p.ambiente)

  // 2) já existe registro: nunca emite duas vezes
  if (reg) {
    if (reg.estado === 'emitido') return { ok: true, status: 200, registro: reg, jaExistia: true }
    if (reg.estado === 'enviado') {
      // 2a) enviado sem resposta: consulta primeiro
      const lim1 = p.conferir && p.antesDeChamar ? await p.antesDeChamar() : null
      if (lim1) return { ok: false, status: 429, erro: lim1, registro: reg }
      const conf = p.conferir ? await p.conferir(reg) : ({ achou: 'indefinido', erro: 'Sem como conferir pela API.' } as Conferencia)
      if (conf.achou === true) {
        reg = await p.repo.atualizar(reg.id, { ...conf.patch, estado: 'emitido', erro: null })
        return { ok: true, status: 200, registro: reg, jaExistia: true }
      }
      if (conf.achou === 'indefinido') return { ok: false, status: 409, erro: 'A emissão anterior não teve resposta. Confira no portal da Repom antes de tentar de novo. Nada foi reenviado.', registro: reg, conferirNoPortal: true }
      // a Repom confirmou que não existe: o envio anterior não chegou. Recomeça como nova tentativa.
      reg = await p.repo.atualizar(reg.id, { estado: 'pendente', tentativa: reg.tentativa + 1, chave_externa: await p.chaveExterna(reg.tentativa + 1), erro: null })
    } else if (reg.estado === 'erro' || reg.estado === 'cancelado') {
      // erro definitivo ou cancelamento: nova tentativa com nova chave
      reg = await p.repo.atualizar(reg.id, { estado: 'pendente', tentativa: reg.tentativa + 1, chave_externa: await p.chaveExterna(reg.tentativa + 1), erro: null })
    }
    // estado "pendente": nunca foi enviado; segue
  } else {
    reg = await p.repo.criar({
      operacao_id: p.operacaoId, tipo: p.tipo, ambiente: p.ambiente, estado: 'pendente', tentativa: 0, chave_externa: await p.chaveExterna(0),
      codigo_viagem: null, codigo_viagem_repom: null, idvpo: null, codigo_contrato: null, ciot: null, operation_key: null,
      valor: p.valor, payload_sanitizado: sanitizarPayload(p.payload), resposta_sanitizada: null, erro: null,
      confirmado_por: p.confirmacao?.nome?.trim() ?? null, confirmado_em: p.confirmacao?.em ?? null,
    })
  }
  reg = await p.repo.atualizar(reg.id, { valor: p.valor, payload_sanitizado: sanitizarPayload(p.payload), confirmado_por: p.confirmacao?.nome?.trim() ?? null, confirmado_em: p.confirmacao?.em ?? null })

  // 3) limite diário e depois grava "enviado" ANTES de chamar a Repom
  const lim2 = p.antesDeChamar ? await p.antesDeChamar() : null
  if (lim2) return { ok: false, status: 429, erro: lim2, registro: reg }
  reg = await p.repo.atualizar(reg.id, { estado: 'enviado' })
  const e = await p.enviar(reg)
  if (e.ok) {
    // contrato é assíncrono: a Repom aceitou (OperationKey) mas ainda não emitiu; o patch pode manter o estado "enviado"
    reg = await p.repo.atualizar(reg.id, { ...e.patch, estado: e.patch.estado ?? 'emitido', erro: null })
    return { ok: true, status: 200, registro: reg, jaExistia: false }
  }
  if (e.incerto) {
    // continua "enviado": a próxima chamada confere antes de qualquer reenvio
    reg = await p.repo.atualizar(reg.id, { ...(e.patch ?? {}), erro: e.erro })
    return { ok: false, status: 202, erro: e.erro, registro: reg, conferirNoPortal: !p.conferir }
  }
  reg = await p.repo.atualizar(reg.id, { ...(e.patch ?? {}), estado: 'erro', erro: e.erro })
  return { ok: false, status: 422, erro: e.erro, registro: reg }
}

/** Marca como cancelado o registro de uma operação (depois que a Repom confirmou o cancelamento). */
export async function marcarCancelado(repo: RepositorioOperacaoRepom, reg: RegistroOperacaoRepom, resposta: unknown): Promise<RegistroOperacaoRepom> {
  return repo.atualizar(reg.id, { estado: 'cancelado', resposta_sanitizada: sanitizarPayload(resposta), erro: null })
}
