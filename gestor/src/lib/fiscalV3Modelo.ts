// Modelo da aba Fiscal v3 igual a previa aprovada (docs/design/preview-fiscal-completo-v3-2026-11-18.html). Funcoes puras: o componente so desenha.
// Estados da previa: "CT-e a emitir", "VPO e CIOT pendentes", "MDF-e a emitir", "tudo emitido". Teste: node --test gestor/test/fiscalV3Modelo.test.ts
import { etapaCiot, etapaVpo, type Item, type LinhaCiotVpo } from '../../../supabase/functions/_shared/lancamentoManual.ts'

export type ChaveCartao = 'cte' | 'vpo' | 'ciot' | 'mdfe'
export interface DocFiscal { status?: string | null; numero_documento?: string | null; emitido_em?: string | null; chave_acesso?: string | null }

export interface EstadoFiscal {
  cte: DocFiscal | null
  atm: DocFiscal | null // averbacao do CT-e
  mdfe: DocFiscal | null
  rcv: { averbacao_rcv_status?: string | null; averbacao_rcv_numero?: string | null } | null
  ciotVpo: (LinhaCiotVpo & { ciot_ambiente?: string | null }) | null
  /** itens do pre-voo do MDF-e vindos da PREVIA do emitter (fonte unica). null = ainda nao carregou */
  preVoo: Item[] | null
}

export interface CartaoEsteira {
  chave: ChaveCartao
  titulo: string
  texto: string
  classe: 'done' | 'next' | 'wait' | ''
  averbado: boolean
  concluido: boolean
}

const reais = (n: number) => `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const emitido = (d: DocFiscal | null) => d?.status === 'emitido'

export function contarBloqueios(itens: Item[] | null): number {
  return (itens ?? []).filter((i) => i.nivel === 'bloqueio').length
}
export function rotuloFaltam(n: number): string {
  return n === 1 ? 'falta 1 item' : `faltam ${n} itens`
}

export function temBloqueioPreVoo(itens: Item[] | null): boolean {
  return (itens ?? []).some((i) => i.nivel === 'bloqueio')
}

/** CIOT/VPO: UM so estado por cartao, da mesma fonte (operacao_ciot_vpo). */
export function estadoCiot(l: EstadoFiscal['ciotVpo']) {
  const e = etapaCiot(l)
  return { ...e, homologacao: l?.ciot_ambiente === 'homologacao' }
}

export function modeloFiscal(e: EstadoFiscal) {
  const vpo = etapaVpo(e.ciotVpo, true)
  const ciot = estadoCiot(e.ciotVpo)
  const cteOk = emitido(e.cte), mdfeOk = emitido(e.mdfe)
  // ciot em homologacao nao conta como concluido (sem validade fiscal)
  const ciotOk = ciot.concluida && !ciot.homologacao
  const pre = cteOk && vpo.concluida && ciotOk
  const mdfeLiberado = pre && !temBloqueioPreVoo(e.preVoo)
  const cteAverbado = e.atm?.status === 'emitido'
  const mdfeAverbado = e.rcv?.averbacao_rcv_status === 'emitido' || Boolean(e.rcv?.averbacao_rcv_numero)

  const valor = Number(e.ciotVpo?.vpo_valor ?? 0)
  const cartoes: CartaoEsteira[] = [
    { chave: 'cte', titulo: 'CT-e', texto: cteOk ? `Emitido · nº ${e.cte?.numero_documento ?? ''}`.trim() : 'A emitir', classe: cteOk ? 'done' : 'next', averbado: cteOk && cteAverbado, concluido: cteOk },
    { chave: 'vpo', titulo: 'Vale-pedágio (VPO)', texto: vpo.concluida ? `Comprado · ${reais(valor)}` : 'A comprar', classe: vpo.concluida ? 'done' : 'next', averbado: false, concluido: vpo.concluida },
    { chave: 'ciot', titulo: 'CIOT', texto: ciotOk ? 'Emitido' : ciot.homologacao && ciot.concluida ? 'Homologação · sem validade' : 'A emitir', classe: ciotOk ? 'done' : vpo.concluida ? 'next' : '', averbado: false, concluido: ciotOk },
    { chave: 'mdfe', titulo: 'MDF-e', texto: mdfeOk ? `Emitido · nº ${e.mdfe?.numero_documento ?? ''}`.trim() : pre ? 'A emitir' : 'Aguardando CT-e, CIOT e VPO', classe: mdfeOk ? 'done' : pre ? 'next' : 'wait', averbado: mdfeOk && mdfeAverbado, concluido: mdfeOk },
  ]
  const concluidas = cartoes.filter((c) => c.concluido).length
  const inicial: ChaveCartao = (['cte', 'vpo', 'ciot'] as const).find((k) => !cartoes.find((c) => c.chave === k)!.concluido) ?? 'mdfe'

  // Botoes (previa): habilitados conforme o estado; Emitir MDF-e apagado enquanto o pre-voo tiver item em vermelho
  const motivoMdfe = mdfeOk ? '' : !pre ? 'Falta emitir o CT-e, o CIOT e comprar o vale-pedágio para liberar a emissão.' : temBloqueioPreVoo(e.preVoo) ? `Emitir MDF-e fica apagado: ${rotuloFaltam(contarBloqueios(e.preVoo))}. Veja a lista ao lado, cada item leva à aba onde se corrige.` : ''
  const botoes = {
    emitirCte: !cteOk,
    baixarCte: cteOk, baixarXmlCte: cteOk, cartaCorrecao: cteOk, cancelarCte: cteOk,
    comprarVpo: !vpo.concluida,
    emitirMdfe: !mdfeOk && mdfeLiberado,
    baixarMdfe: mdfeOk, baixarXmlMdfe: mdfeOk, trocarCondutor: mdfeOk && !e.mdfe?.status?.includes('encerr'), cancelarMdfe: mdfeOk,
  }
  return { cartoes, contador: `${concluidas} de 4 concluídas`, inicial, botoes, motivoMdfe, mdfeLiberado, cteAverbado, mdfeAverbado, ciotHomologacao: ciot.homologacao && ciot.concluida, tagMdfe: mdfeOk ? `EMITIDO · Nº ${e.mdfe?.numero_documento ?? ''}` : pre ? 'A EMITIR' : 'AGUARDANDO', tagCte: cteOk ? `EMITIDO · Nº ${e.cte?.numero_documento ?? ''}` : 'A EMITIR' }
}

/** Linhas da "Conferencia antes de emitir" do MDF-e (previa): ✓ / ! / ✗, derivadas do estado e da previa do emissor. */
export function linhasConferenciaMdfe(e: EstadoFiscal): { sinal: 'y' | 'a' | 'x'; texto: string; campo?: string }[] {
  const out: { sinal: 'y' | 'a' | 'x'; texto: string; campo?: string }[] = []
  const cteOk = emitido(e.cte), v = etapaVpo(e.ciotVpo, true), c = estadoCiot(e.ciotVpo)
  out.push(cteOk ? { sinal: 'y', texto: `CT-e emitido (nº ${e.cte?.numero_documento ?? ''})${e.atm?.status === 'emitido' ? ' e averbado' : ''}` } : { sinal: 'x', texto: 'CT-e ainda não emitido', campo: 'cte' })
  out.push(c.concluida && !c.homologacao ? { sinal: 'y', texto: 'CIOT emitido · obrigatório no MDF-e a partir de 23/11/2026' } : { sinal: 'x', texto: c.homologacao && c.concluida ? 'CIOT de homologação (sem validade fiscal) · obrigatório no MDF-e a partir de 23/11/2026' : 'CIOT não emitido · obrigatório no MDF-e a partir de 23/11/2026', campo: 'ciot' })
  out.push(v.concluida ? { sinal: 'y', texto: 'Vale-pedágio comprado' } : { sinal: 'x', texto: 'Vale-pedágio não comprado', campo: 'vpo' })
  const pv = e.preVoo ?? []
  const bloq = pv.filter((i) => i.nivel === 'bloqueio' && !['cte', 'ciot', 'vpo'].includes(i.campo))
  const avis = pv.filter((i) => i.nivel === 'aviso')
  for (const b of bloq) out.push({ sinal: 'x', texto: b.mensagem, campo: b.campo })
  for (const a of avis) out.push({ sinal: 'a', texto: a.mensagem, campo: a.campo }) // D: tara fora da faixa e AVISO (nao bloqueia)
  if (e.preVoo) {
    const sem = (re: RegExp) => !pv.some((i) => i.nivel === 'bloqueio' && re.test(`${i.campo} ${i.mensagem}`))
    if (sem(/reboque|carreta/i)) out.push({ sinal: 'y', texto: 'Cavalo e carreta vinculados ao cadastro' })
    if (sem(/cep/i)) out.push({ sinal: 'y', texto: 'CEP de descarregamento da NF-e' })
    if (sem(/pagamento|ipef/i)) out.push({ sinal: 'y', texto: e.ciotVpo?.ciot_origem === 'rbr_repom' ? 'Destino do pagamento: IPEF Repom' : 'Destino do pagamento definido' })
  }
  return out
}

/** Converte a resposta da PREVIA do emitir-mdfe (bloqueios/avisos/regras) em itens do pre-voo. Fonte unica: o proprio emissor. */
export function itensDaPrevia(r: { regras?: { tipo: string; origem?: string; mensagem: string }[]; bloqueios?: string[]; avisos?: string[] } | null | undefined): Item[] {
  if (!r) return []
  const campoDe = (m: string) => (/CEP de carregamento/i.test(m) ? 'cep_carregamento' : /CEP de descarregamento|cep_descarregamento/i.test(m) ? 'cep_descarregamento' : /CT-e/i.test(m) ? 'cte' : /CIOT/i.test(m) ? 'ciot' : /vale-?ped/i.test(m) ? 'vpo' : /reboque|carreta/i.test(m) ? 'reboque' : /pagamento/i.test(m) ? 'destino_pagamento' : /tara/i.test(m) ? 'tara' : /NCM/i.test(m) ? 'ncm' : /averba/i.test(m) ? 'averbacao' : 'outro')
  if (r.regras?.length) return r.regras.filter((x) => x.tipo === 'bloqueio' || x.tipo === 'aviso').map((x) => ({ nivel: x.tipo === 'bloqueio' ? 'bloqueio' : 'aviso', campo: campoDe(x.mensagem), mensagem: x.mensagem }))
  return [...(r.bloqueios ?? []).map((m) => ({ nivel: 'bloqueio' as const, campo: campoDe(m), mensagem: m })), ...(r.avisos ?? []).map((m) => ({ nivel: 'aviso' as const, campo: campoDe(m), mensagem: m }))]
}

/** NCM da operacao (causa do erro B): operacoes.ncm -> NCM das NF-e -> ncms da cotacao. O pre-voo do MDF-e e o da Repom usam ESTA funcao. */
export function ncmDaOperacao(f: { ncmOperacao?: string | null; ncmsNfes?: (string | null | undefined)[]; ncmsCotacao?: string[] | null }): string | null {
  const ok = (s: unknown) => String(s ?? '').replace(/\D/g, '')
  for (const c of [f.ncmOperacao, ...(f.ncmsNfes ?? []), ...(f.ncmsCotacao ?? [])]) if (ok(c).length >= 8) return ok(c)
  return null
}

export interface DestinoItem { rotulo: string; vista?: ChaveCartao; rota?: string }
/** Para onde o item da previa leva: a visao da propria esteira (CT-e/VPO/CIOT), a aba da operacao ou o cadastro. Pura: so olha o campo e o texto. */
export function destinoDoItem(i: { campo: string; mensagem: string }, operacaoId: string): DestinoItem {
  const t = `${i.campo} ${i.mensagem}`
  if (i.campo === 'cte' || /^CT-e|sem CT-e/i.test(i.mensagem)) return { rotulo: 'CT-e', vista: 'cte' }
  if (i.campo === 'ciot' || /CIOT/.test(t)) return { rotulo: 'CIOT', vista: 'ciot' }
  if (i.campo === 'vpo' || /vale-?ped|categoria de combina/i.test(t)) return { rotulo: 'Vale-pedágio', vista: 'vpo' }
  if (/cep|ncm|nf-e|averba/i.test(t)) return { rotulo: 'NF-e e CT-e', vista: 'cte' }
  if (i.campo === 'destino_pagamento' || /pagamento|contrato de frete|parcela/i.test(t)) return { rotulo: 'Financeiro', rota: `/operacoes?op=${operacaoId}&aba=financeiro` }
  if (/condutor|motorista|CNH/i.test(t)) return { rotulo: 'Motorista e veículo', rota: `/operacoes?op=${operacaoId}&aba=motorista` }
  if (/ve[íi]culo|reboque|carreta|cavalo|tara|propriet|RNTRC|renavam|carroceria|rodado|capacidade/i.test(t)) return { rotulo: 'Cadastro do veículo', rota: '/cadastros?aba=motoristas' }
  return { rotulo: 'Fiscal', vista: 'mdfe' }
}

type Obj = Record<string, unknown>
const txt = (v: unknown) => (v == null || v === '' ? '' : String(v))
/** Linhas de "Ver o que enviamos" lidas da PREVIA (payload que iria para a Focus). Sem previa: lista vazia. */
export function linhasDoQueEnviamos(payload: Obj | null | undefined): { dado: string; valor: string; origem: string }[] {
  if (!payload) return []
  const m = (payload.modal_rodoviario ?? {}) as Obj
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : [])
  const cont = arr(m.contratantes)[0]
  const docProp = txt(m.cpf_proprietario_veiculo) || txt(m.cnpj_proprietario_veiculo)
  const reb = arr(m.veiculos_reboque)
  const ciot = arr(m.ciot)[0]
  const vale = arr(m.dispositivos_vale_pedagio)[0]
  return [
    { dado: 'Contratante', valor: cont ? `${txt(cont.nome)} · ${txt(cont.cnpj) || txt(cont.cpf)}` : '—', origem: docProp ? 'Emitente (regra 741: com proprietário, contratante = emitente)' : 'Cliente da cotação' },
    { dado: 'Proprietário do veículo', valor: docProp ? `${txt(m.razao_social_proprietario_veiculo)} · ${docProp} · UF ${txt(m.uf_proprietario_veiculo) || '—'}` : 'sem proprietário (frota da RBR)', origem: 'Cadastro do veículo/titular' },
    { dado: 'Cavalo', valor: `${txt(m.placa_veiculo) || '—'} · tara ${txt(m.tara_veiculo) || '—'} kg`, origem: 'Cadastro' },
    { dado: 'Reboques', valor: reb.length ? reb.map((r) => `${txt(r.placa)} (tara ${txt(r.tara) || '—'} kg)`).join(' + ') : 'nenhum', origem: 'Cadastro / vínculo da operação' },
    { dado: 'CIOT (12 dígitos)', valor: ciot ? txt(ciot.ciot) : 'não vai no MDF-e', origem: 'Fiscal (CIOT)' },
    { dado: 'Vale-pedágio', valor: vale ? `${txt(vale.numero_comprovante_compra)} · R$ ${txt(vale.valor_vale_pedagio)} · categoria ${txt(vale.categoria_combinacao_veicular) || '—'}` : 'não vai no MDF-e', origem: 'Fiscal (VPO)' },
  ]
}
