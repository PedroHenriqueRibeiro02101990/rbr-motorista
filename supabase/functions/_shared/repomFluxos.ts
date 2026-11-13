// Fluxos das edge functions repom-vpo e repom-frete, SEPARADOS do Deno para testar com mock (repomFluxos.test.ts).
// A função (index.ts) só autentica (verify_jwt + gestor_rbr), lê segredos do Vault, monta as dependências e chama estes fluxos.
// Nada aqui lê banco nem rede por conta própria: tudo entra por `deps`. Respostas nunca carregam segredo nem token.
import { executarComEstado, identificadorContratoDe, processoCodigoDe, sha256Hex, type Conferencia, type RegistroOperacaoRepom, type RepositorioOperacaoRepom, type SaidaOperacao } from './repomOperacao.ts'
import { decidirApi, type ConfirmacaoHumana } from './repomTrava.ts'
import { lerErroRepom } from './repomClient.ts'
import { normalizarPlaca, validarPedidoVale, type ClienteRepomVpr, type PedidoVale } from './repomVprClient.ts'
import { situacaoProcessamento, validarContratoFrete, type ClienteRepomFrete, type PedidoContratoFrete } from './repomFreteClient.ts'

export interface DepsFluxo {
  repo: RepositorioOperacaoRepom
  ambiente: 'qa' | 'prd'
  apiLiberada: boolean
  valorMaximo: number
  /** limite diário global de chamadas reais: mensagem de recusa (429) ou null */
  antesDeChamar(): Promise<string | null>
  agora?: number
}

export type SaidaFluxo = { status: number; corpo: Record<string, unknown> }
const recusa = (status: number, erro: string, extra: Record<string, unknown> = {}): SaidaFluxo => ({ status, corpo: { ok: false, erro, ...extra } })

/** Visão do registro SEM payload e SEM segredo (o que a função devolve ao front). */
export function registroPublico(r: RegistroOperacaoRepom) {
  return {
    id: r.id, operacao_id: r.operacao_id, tipo: r.tipo, ambiente: r.ambiente, emTeste: r.ambiente !== 'prd', estado: r.estado, tentativa: r.tentativa,
    codigo_viagem: r.codigo_viagem, codigo_viagem_repom: r.codigo_viagem_repom, idvpo: r.idvpo, codigo_contrato: r.codigo_contrato, ciot: r.ciot,
    operation_key: r.operation_key, valor: r.valor, erro: r.erro, confirmado_por: r.confirmado_por, confirmado_em: r.confirmado_em, atualizado_em: r.atualizado_em,
  }
}
function saida(s: SaidaOperacao): SaidaFluxo {
  if (s.ok) return { status: 200, corpo: { ok: true, jaExistia: s.jaExistia, registro: registroPublico(s.registro) } }
  return { status: s.status, corpo: { ok: false, erro: s.erro, conferirNoPortal: s.conferirNoPortal ?? false, ...(s.registro ? { registro: registroPublico(s.registro) } : {}) } }
}

// ---------- prévia (o que a pessoa confere antes de confirmar) ----------

export interface Previa {
  valor: number
  motorista: string
  placa: string
  carreta: string | null
  rota: string
  eixos: number
}
export async function hashPrevia(p: Previa): Promise<string> {
  return sha256Hex(JSON.stringify([p.valor, p.motorista, p.placa, p.carreta, p.rota, p.eixos]))
}
export function previaDoVale(p: PedidoVale, valor: number, rotaDescricao?: string): Previa {
  return { valor, motorista: p.nomeMotorista.trim(), placa: normalizarPlaca(p.placa), carreta: p.carretaPlaca ? normalizarPlaca(p.carretaPlaca) : null, rota: rotaDescricao?.trim() || (p.roteiro ? `Roteiro ${p.roteiro.roteiroCodigo} / percurso ${p.roteiro.percursoCodigo}` : ''), eixos: p.numeroEixos + (p.carretaNumeroEixos ?? 0) }
}

// ---------- repom-vpo ----------

export interface EntradaVpo {
  acao: 'tag' | 'previa' | 'emitir' | 'cancelar' | 'consultar'
  operacao_id?: string
  placa?: string
  pedido?: Omit<PedidoVale, 'processoCodigoCliente'>
  valor?: number
  rota_descricao?: string
  confirmacao?: Partial<ConfirmacaoHumana> & { previa_hash?: string }
  usuario?: string
}

function conferirVale(vpr: ClienteRepomVpr) {
  return async (r: RegistroOperacaoRepom): Promise<Conferencia> => {
    if (!r.codigo_viagem) return { achou: 'indefinido', erro: 'A Repom não devolveu o código da viagem; só dá para conferir no portal.' } // a API só consulta por codigoViagem
    const c = await vpr.consultarVale(r.codigo_viagem)
    if (c.ok) return { achou: true, patch: { codigo_viagem: c.dados.codigoViagem, codigo_viagem_repom: c.dados.codigoViagemRepom, idvpo: c.dados.idvpo, valor: c.dados.valor ?? r.valor } }
    return !c.ok && lerErroRepom(c.bruto)?.numeroErro === '205' ? { achou: false } : { achou: 'indefinido', erro: c.erro }
  }
}

export async function fluxoVpo(e: EntradaVpo, vpr: ClienteRepomVpr, deps: DepsFluxo): Promise<SaidaFluxo> {
  const api = decidirApi(deps.apiLiberada)
  if (!api.permitido) return recusa(api.status, api.erro)

  if (e.acao === 'tag') {
    const lim = await deps.antesDeChamar()
    if (lim) return recusa(429, lim, { limite: true })
    const r = await vpr.consultarTag(String(e.placa ?? ''))
    return r.ok ? { status: 200, corpo: { ok: true, tags: r.dados, ambiente: deps.ambiente } } : recusa(r.http === 0 ? 422 : 502, r.erro)
  }
  if (!e.operacao_id) return recusa(400, 'Informe a operação.')

  if (e.acao === 'consultar') {
    const reg = await deps.repo.buscar(e.operacao_id, 'vpo', deps.ambiente)
    if (!reg) return recusa(404, 'Não há vale-pedágio Repom para esta operação.')
    if (reg.estado === 'enviado' || !reg.codigo_viagem) {
      const lim = await deps.antesDeChamar()
      if (lim) return recusa(429, lim, { limite: true })
      const conf = await conferirVale(vpr)(reg)
      if (conf.achou === true) return { status: 200, corpo: { ok: true, registro: registroPublico(await deps.repo.atualizar(reg.id, { ...conf.patch, estado: 'emitido', erro: null })) } }
    }
    return { status: 200, corpo: { ok: true, registro: registroPublico(reg) } }
  }

  if (e.acao === 'cancelar') {
    const reg = await deps.repo.buscar(e.operacao_id, 'vpo', deps.ambiente)
    if (!reg || reg.estado !== 'emitido' || !reg.codigo_viagem) return recusa(404, 'Não há vale-pedágio emitido para cancelar nesta operação.')
    const usuario = String(e.usuario ?? e.confirmacao?.nome ?? '').trim()
    if (usuario.length < 3) return recusa(400, 'Informe quem está cancelando.')
    const lim = await deps.antesDeChamar()
    if (lim) return recusa(429, lim, { limite: true })
    const c = await vpr.cancelarVale(reg.codigo_viagem, usuario)
    if (!c.ok && c.numeroErro !== '325') return recusa(c.incerto ? 202 : 422, c.erro)
    return { status: 200, corpo: { ok: true, registro: registroPublico(await deps.repo.atualizar(reg.id, { estado: 'cancelado', erro: null })) } }
  }

  // previa e emitir
  if (!e.pedido) return recusa(400, 'Informe os dados do vale-pedágio.')
  const valor = Number(e.valor)
  const pedidoSem = { ...e.pedido, processoCodigoCliente: 'PREVIA' } as PedidoVale
  const inval = validarPedidoVale(pedidoSem)
  if (inval) return recusa(422, inval)
  const previa = previaDoVale(pedidoSem, valor, e.rota_descricao)
  if (e.acao === 'previa') return { status: 200, corpo: { ok: true, previa, previa_hash: await hashPrevia(previa), ambiente: deps.ambiente, emTeste: deps.ambiente !== 'prd', maximo: deps.valorMaximo } }

  if (e.confirmacao?.previa_hash !== (await hashPrevia(previa))) return recusa(400, 'Os dados mudaram depois da prévia. Confira a prévia de novo e confirme.')

  const saidaOp = await executarComEstado({
    repo: deps.repo, operacaoId: e.operacao_id, tipo: 'vpo', acao: 'emitir_vale', ambiente: deps.ambiente, apiLiberada: deps.apiLiberada, valorMaximo: deps.valorMaximo,
    valor: Number.isFinite(valor) ? valor : null, confirmacao: e.confirmacao, chaveExterna: (t) => processoCodigoDe(e.operacao_id!, t),
    payload: e.pedido, conferir: conferirVale(vpr), antesDeChamar: deps.antesDeChamar, agora: deps.agora,
    async enviar(reg) {
      const r = await vpr.emitirVale({ ...e.pedido!, processoCodigoCliente: reg.chave_externa })
      if (r.ok) return { ok: true, patch: { codigo_viagem: r.dados.codigoViagem, codigo_viagem_repom: r.dados.codigoViagemRepom, idvpo: r.dados.idvpo, valor: r.dados.valor ?? reg.valor, resposta_sanitizada: { statusCarga: r.dados.statusCarga, tipoEmissao: r.dados.tipoEmissao, pracas: r.dados.pracas.length } } }
      return { ok: false, erro: r.erro, incerto: r.incerto }
    },
  })
  return saida(saidaOp)
}

// ---------- repom-frete ----------

export type AcaoFrete =
  | 'previa_contrato' | 'emitir_contrato' | 'consultar_contrato' | 'cancelar_contrato' | 'interromper_contrato'
  | 'autorizar_pagamento' | 'quitar' | 'consultar_pagamento' | 'cancelar_autorizacao' | 'cancelar_quitacao'
  | 'ciot_retificar' | 'ciot_cancelar' | 'ciot_encerrar'
  | 'cadastro' | 'validar' | 'consultar_saldo'

export interface EntradaFrete {
  acao: AcaoFrete
  operacao_id?: string
  contrato?: Omit<PedidoContratoFrete, 'identifier'>
  valor?: number
  confirmacao?: Partial<ConfirmacaoHumana> & { previa_hash?: string }
  /** cadastro e validar: {recurso:'contratado'|'motorista'|'veiculo', metodo:'criar'|'consultar'|'alterar'|'bloquear', ...} */
  recurso?: 'contratado' | 'motorista' | 'veiculo' | 'documento' | 'veiculo_tag' | 'cartao' | 'tipos_carga'
  metodo?: 'criar' | 'consultar' | 'alterar' | 'bloquear' | 'validar'
  chave?: string // documento, placa ou cartão
  corpo?: Record<string, unknown>
  bloquear?: boolean
  motivo?: string
  dados?: Record<string, unknown> // pagamento, quitação, ciot
}

const idRegistro = (r: RegistroOperacaoRepom) => r.codigo_contrato

function conferirContrato(frete: ClienteRepomFrete) {
  return async (r: RegistroOperacaoRepom): Promise<Conferencia> => {
    if (r.operation_key) {
      const s = await frete.consultarStatusPorChave(r.operation_key)
      if (s.ok && s.dados.length) {
        const sit = situacaoProcessamento(s.dados[0]!)
        if (sit === 'processando') return { achou: 'indefinido', erro: 'A Repom ainda está processando o contrato.' }
        if (sit === 'erro') return { achou: false, erro: s.dados[0]!.erros.join('; ') }
      }
    }
    const c = await frete.consultarContratoPorIdentificador(r.chave_externa)
    if (c.ok) {
      const x = (c.dados ?? {}) as Record<string, unknown>
      if (x.ShippingId == null) return { achou: 'indefinido', erro: 'A Repom respondeu sem o código da viagem.' }
      return { achou: true, patch: { codigo_contrato: String(x.ShippingId), ciot: x.CIOT ? String(x.CIOT) : null } }
    }
    return c.http === 404 ? { achou: false } : { achou: 'indefinido', erro: c.erro }
  }
}

export async function fluxoFrete(e: EntradaFrete, frete: ClienteRepomFrete, deps: DepsFluxo): Promise<SaidaFluxo> {
  const api = decidirApi(deps.apiLiberada)
  if (!api.permitido) return recusa(api.status, api.erro)
  const limitar = async () => {
    const lim = await deps.antesDeChamar()
    return lim ? recusa(429, lim, { limite: true }) : null
  }
  const resp = (r: { ok: boolean; http: number; erro?: string; dados?: unknown; incerto?: boolean }): SaidaFluxo =>
    r.ok ? { status: 200, corpo: { ok: true, dados: r.dados, ambiente: deps.ambiente } } : recusa(r.incerto ? 202 : r.http === 0 ? 422 : 502, r.erro ?? 'Erro na Repom.', { incerto: r.incerto ?? false })

  if (e.acao === 'consultar_saldo') {
    const l = await limitar()
    if (l) return l
    return resp(await frete.consultarSaldoCliente(String(e.dados?.inicio ?? ''), String(e.dados?.fim ?? '')))
  }

  if (e.acao === 'cadastro' || e.acao === 'validar') {
    const l = await limitar()
    if (l) return l
    const k = String(e.chave ?? '')
    if (e.acao === 'validar') {
      if (e.recurso === 'veiculo') return resp(await frete.validarVeiculo(k))
      if (e.recurso === 'veiculo_tag') return resp(await frete.validarVeiculoPorTag(k))
      if (e.recurso === 'documento') return resp(await frete.validarDocumentoPrestador(k))
      if (e.recurso === 'cartao') return resp(await frete.validarCartao(k, String(e.dados?.documento ?? '')))
      return recusa(400, 'Recurso de validação desconhecido.')
    }
    const c = e.corpo ?? {}
    const b = e.bloquear === true
    const m = String(e.motivo ?? '')
    if (e.recurso === 'tipos_carga') return resp(await frete.tiposDeCarga())
    if (e.recurso === 'contratado') return resp(e.metodo === 'criar' ? await frete.criarContratado(c) : e.metodo === 'alterar' ? await frete.alterarContratado(k, c) : e.metodo === 'bloquear' ? await frete.bloquearContratado(k, b, m) : await frete.consultarContratadoPorDocumento(k))
    if (e.recurso === 'motorista') return resp(e.metodo === 'criar' ? await frete.criarMotorista(c) : e.metodo === 'alterar' ? await frete.alterarMotorista(k, c) : e.metodo === 'bloquear' ? await frete.bloquearMotorista(k, b, m) : await frete.consultarMotorista(k))
    if (e.recurso === 'veiculo') return resp(e.metodo === 'criar' ? await frete.criarVeiculo(c) : e.metodo === 'alterar' ? await frete.alterarVeiculo(k, c) : e.metodo === 'bloquear' ? await frete.bloquearVeiculo(k, b, m) : await frete.consultarVeiculo(k))
    return recusa(400, 'Recurso de cadastro desconhecido.')
  }

  if (!e.operacao_id) return recusa(400, 'Informe a operação.')
  const operacaoId = e.operacao_id

  if (e.acao === 'previa_contrato' || e.acao === 'emitir_contrato') {
    if (!e.contrato) return recusa(400, 'Informe os dados do contrato.')
    const valor = Number(e.contrato.totalFreightValue)
    const ident = await identificadorContratoDe(operacaoId, 0)
    const inval = validarContratoFrete({ ...e.contrato, identifier: ident })
    if (inval) return recusa(422, inval)
    const previa: Previa = { valor, motorista: e.contrato.motoristas.find((m) => m.principal)?.cpf.replace(/\d(?=\d{4})/g, '*') ?? '', placa: e.contrato.placas.map(normalizarPlaca).join('+'), carreta: null, rota: `Roteiro ${e.contrato.routeRouteCode} / percurso ${e.contrato.routeTraceCode}`, eixos: 0 }
    const hash = await hashPrevia(previa)
    if (e.acao === 'previa_contrato') return { status: 200, corpo: { ok: true, previa, previa_hash: hash, ambiente: deps.ambiente, emTeste: deps.ambiente !== 'prd', maximo: deps.valorMaximo } }
    if (e.confirmacao?.previa_hash !== hash) return recusa(400, 'Os dados mudaram depois da prévia. Confira a prévia de novo e confirme.')

    return saida(await executarComEstado({
      repo: deps.repo, operacaoId, tipo: 'ciot', acao: 'emitir_contrato', ambiente: deps.ambiente, apiLiberada: deps.apiLiberada, valorMaximo: deps.valorMaximo,
      valor: Number.isFinite(valor) ? valor : null, confirmacao: e.confirmacao, chaveExterna: (t) => identificadorContratoDe(operacaoId, t),
      payload: e.contrato, conferir: conferirContrato(frete), antesDeChamar: deps.antesDeChamar, agora: deps.agora,
      async enviar(reg) {
        const r = await frete.emitirContrato({ ...e.contrato!, identifier: reg.chave_externa })
        // assíncrono: aceito com OperationKey NÃO é emitido; fica "enviado" até a consulta confirmar (Status Finished, sem erros)
        if (r.ok) return { ok: true, patch: { estado: 'enviado', operation_key: r.dados.operationKey } }
        return { ok: false, erro: r.erro, incerto: r.incerto }
      },
    }))
  }

  const reg = await deps.repo.buscar(operacaoId, e.acao.startsWith('autorizar') || e.acao === 'quitar' || e.acao === 'consultar_pagamento' || e.acao === 'cancelar_autorizacao' || e.acao === 'cancelar_quitacao' ? 'pagamento' : 'ciot', deps.ambiente)

  if (e.acao === 'consultar_contrato') {
    if (!reg) return recusa(404, 'Não há contrato Repom para esta operação.')
    if (reg.estado === 'enviado') {
      const l = await limitar()
      if (l) return l
      const conf = await conferirContrato(frete)(reg)
      if (conf.achou === true) return { status: 200, corpo: { ok: true, registro: registroPublico(await deps.repo.atualizar(reg.id, { ...conf.patch, estado: 'emitido', erro: null })) } }
      if (conf.achou === false && conf.erro) return { status: 200, corpo: { ok: true, registro: registroPublico(await deps.repo.atualizar(reg.id, { estado: 'erro', erro: conf.erro })) } }
    }
    return { status: 200, corpo: { ok: true, registro: registroPublico(reg) } }
  }

  if (e.acao === 'cancelar_contrato' || e.acao === 'interromper_contrato') {
    if (!reg || reg.estado !== 'emitido' || !idRegistro(reg)) return recusa(404, 'Não há contrato emitido para esta operação.')
    const l = await limitar()
    if (l) return l
    const r = e.acao === 'cancelar_contrato' ? await frete.cancelarContrato(reg.codigo_contrato!) : await frete.interromperContrato(reg.codigo_contrato!)
    if (!r.ok) return resp(r)
    return { status: 200, corpo: { ok: true, registro: registroPublico(await deps.repo.atualizar(reg.id, { estado: 'cancelado', erro: null })) } }
  }

  if (e.acao === 'ciot_retificar' || e.acao === 'ciot_cancelar' || e.acao === 'ciot_encerrar') {
    if (!reg || reg.estado !== 'emitido' || !reg.ciot) return recusa(404, 'Não há CIOT emitido para esta operação.')
    const l = await limitar()
    if (l) return l
    const d = e.dados ?? {}
    if (e.acao === 'ciot_encerrar') return resp(await frete.encerrarCiotAgregado(reg.ciot))
    if (e.acao === 'ciot_cancelar') {
      const r = await frete.cancelarCiotAgregado(reg.ciot, String(d.motivo ?? ''))
      if (r.ok) await deps.repo.atualizar(reg.id, { estado: 'cancelado', erro: null })
      return resp(r)
    }
    return resp(await frete.retificarCiotAgregado({ ciot: reg.ciot, veiculos: (Array.isArray(d.veiculos) ? d.veiculos : []) as { placa: string; rntrc: string }[], quantidade: Number(d.quantidade ?? 1), preco: Number(d.preco ?? 1) }))
  }

  // pagamento: autorização, quitação, consultas e cancelamentos
  const contrato = await deps.repo.buscar(operacaoId, 'ciot', deps.ambiente)
  if (e.acao === 'autorizar_pagamento' || e.acao === 'quitar') {
    if (!contrato || contrato.estado !== 'emitido' || !contrato.codigo_contrato) return recusa(409, 'O contrato precisa estar emitido na Repom antes do pagamento.')
    const d = e.dados ?? {}
    const valor = Number(e.valor)
    const chave = await sha256Hex(JSON.stringify([e.acao, operacaoId, contrato.codigo_contrato, valor]))
    return saida(await executarComEstado({
      repo: deps.repo, operacaoId, tipo: 'pagamento', acao: e.acao === 'quitar' ? 'quitacao' : 'pagamento', ambiente: deps.ambiente, apiLiberada: deps.apiLiberada, valorMaximo: deps.valorMaximo,
      valor: Number.isFinite(valor) ? valor : null, confirmacao: e.confirmacao, chaveExterna: async () => chave.slice(0, 20).toUpperCase(),
      payload: d, antesDeChamar: deps.antesDeChamar, agora: deps.agora, // sem conferência pela API: pagamento "enviado" sem resposta nunca é reenviado (vai ao portal)
      async enviar() {
        const r =
          e.acao === 'autorizar_pagamento'
            ? await frete.autorizarPagamento([{ shippingId: Number(contrato.codigo_contrato), identifier: contrato.chave_externa, branchCode: String(d.branchCode ?? ''), dataPagamento: String(d.dataPagamento ?? '') }])
            : await frete.quitarViagem({ branchCode: String(d.branchCode ?? ''), shippingId: contrato.codigo_contrato!, pesoDescarregado: d.pesoDescarregado != null ? Number(d.pesoDescarregado) : undefined, documentos: (Array.isArray(d.documentos) ? d.documentos : []) as never })
        return r.ok ? { ok: true, patch: {} } : { ok: false, erro: r.erro, incerto: r.incerto }
      },
    }))
  }
  if (e.acao === 'consultar_pagamento') {
    if (!contrato?.codigo_contrato) return recusa(404, 'Não há contrato Repom para esta operação.')
    const l = await limitar()
    if (l) return l
    return resp(await frete.consultarAutorizacaoPorViagem(contrato.codigo_contrato))
  }
  if (e.acao === 'cancelar_autorizacao' || e.acao === 'cancelar_quitacao') {
    if (!contrato?.codigo_contrato) return recusa(404, 'Não há contrato Repom para esta operação.')
    const l = await limitar()
    if (l) return l
    const d = e.dados ?? {}
    return resp(e.acao === 'cancelar_quitacao' ? await frete.cancelarQuitacao(contrato.codigo_contrato) : await frete.cancelarAutorizacao([{ shippingId: Number(contrato.codigo_contrato), identifier: contrato.chave_externa, branchCode: String(d.branchCode ?? '') }]))
  }
  return recusa(400, 'Ação desconhecida.')
}
