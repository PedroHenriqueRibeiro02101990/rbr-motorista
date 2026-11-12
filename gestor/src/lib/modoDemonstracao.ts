// Modo de demonstração da aba Fiscal (reunião com a NSTech). Sem React e sem rede, para testar com
// node --test gestor/test/modoDemonstracao.test.ts
// Só vale com TRÊS condições juntas, TODAS da própria operação: eh_teste, a marca modo_demonstracao e nenhum documento dela em produção
// (CIOT/efrete e NSPEDAGIO só rodam em homologação). NÃO olha o ambiente fiscal global do sistema (parametros_fiscais), que no gestor de
// produção vale 'producao' e escondia o modo. Isto decide só o que a tela MOSTRA: nenhuma trava de emissão muda.
import { estadoVpo, deuCerto, type EstadoVpo, type RequisicaoVpo } from './vpoPassos.ts'

export function modoDemonstracaoAtivo(op: { eh_teste?: boolean | null; modo_demonstracao?: boolean | null } | null | undefined, docs: { ambiente?: string | null }[] | null | undefined): boolean {
  if (!op || op.eh_teste !== true || op.modo_demonstracao !== true) return false
  return !(docs ?? []).some((d) => d.ambiente === 'producao')
}

// ---- Textos de exibição ----
// Só na tela da demonstração: tira "(apagar depois)" e o prefixo "TESTE ... - " dos nomes de cadastros de teste. Não renomeia nada no banco.
export function limparNomeTeste(nome: string | null | undefined): string | null {
  if (nome == null) return null
  const limpo = nome
    .replace(/\s*\(\s*apagar depois\s*\)\s*/gi, ' ')
    .replace(/^\s*TESTE[^-]*-\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return limpo || null
}

// "confirmado por X em DATA": só nome de pessoa. Registro automático de ensaio não é pessoa.
export function textoConfirmacao(nome: string | null | undefined, quando: string | null | undefined, formatar: (iso: string) => string = (i) => new Date(i).toLocaleString('pt-BR')): string {
  const em = quando ? formatar(quando) : '—'
  const automatico = !nome || /ensaio automatizado|teste automatizado|\(claude\)/i.test(nome)
  return automatico ? `confirmado em ${em}` : `confirmado por ${nome} em ${em}`
}

const dataHoraCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : null

// ---- Esteira completa: CT-e, Averbação, Vale-pedágio, CIOT, MDF-e ----
export type EstadoCaixa = 'fora' | 'a_emitir' | 'processando' | 'emitido' | 'cancelado'
export type CaixaEsteira = { id: 'cte' | 'averbacao' | 'vpo' | 'ciot' | 'mdfe'; rotulo: string; ativo: boolean; estado: EstadoCaixa; status: string; detalhe: string | null; concluido: boolean }
export type Esteira = { caixas: CaixaEsteira[]; concluidos: number; total: number; contador: string }

export function statusCiot(s: string | null | undefined): { texto: string; concluido: boolean } {
  if (s === 'emitido') return { texto: 'Emitido', concluido: true }
  if (s === 'encerrado') return { texto: 'Encerrado', concluido: true }
  if (s === 'cancelado') return { texto: 'Cancelado', concluido: false }
  if (s === 'erro') return { texto: 'Com erro', concluido: false }
  return { texto: 'A emitir', concluido: false }
}

function caixaVpo(reqs: RequisicaoVpo[], agora: number): Pick<CaixaEsteira, 'estado' | 'status' | 'detalhe' | 'concluido'> {
  const e: EstadoVpo = estadoVpo(reqs, agora)
  const ultimo = (acao: string) => [...reqs].filter((r) => r.acao === acao && deuCerto(r)).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]
  if (e === 'comprado') return { estado: 'emitido', status: 'Comprado', detalhe: dataHoraCurta(ultimo('comprar')?.criado_em), concluido: true }
  if (e === 'cancelado') return { estado: 'cancelado', status: 'Cancelado', detalhe: `cancelado em ${dataHoraCurta(ultimo('cancelar')?.criado_em) ?? '—'} · comprar de novo`, concluido: false }
  if (e === 'comprando' || e === 'cancelando') return { estado: 'processando', status: 'Em processamento', detalhe: null, concluido: false }
  if (e === 'nao_confirmado') return { estado: 'processando', status: 'Não confirmado', detalhe: 'consulte de novo', concluido: false }
  return { estado: 'a_emitir', status: 'A comprar', detalhe: null, concluido: false }
}

export function esteiraDemonstracao(vpoReqs: RequisicaoVpo[], ciotStatus: string | null | undefined, agora = Date.now(), datasCiot?: { emitidoEm?: string | null; canceladoEm?: string | null }): Esteira {
  const ciot = statusCiot(ciotStatus)
  const fora = 'Fora desta demonstração'
  const vpo = caixaVpo(vpoReqs, agora)
  const ciotEstado: EstadoCaixa = ciotStatus === 'emitido' || ciotStatus === 'encerrado' ? 'emitido' : ciotStatus === 'cancelado' ? 'cancelado' : 'a_emitir'
  const ciotDetalhe = ciotEstado === 'emitido' ? dataHoraCurta(datasCiot?.emitidoEm) : ciotEstado === 'cancelado' ? `cancelado em ${dataHoraCurta(datasCiot?.canceladoEm) ?? '—'} · emitir de novo` : null
  const caixas: CaixaEsteira[] = [
    { id: 'cte', rotulo: 'CT-e', ativo: false, estado: 'fora', status: fora, detalhe: null, concluido: false },
    { id: 'averbacao', rotulo: 'Averbação do CT-e', ativo: false, estado: 'fora', status: fora, detalhe: null, concluido: false },
    { id: 'vpo', rotulo: 'Vale-pedágio (VPO)', ativo: true, ...vpo },
    { id: 'ciot', rotulo: 'CIOT', ativo: true, estado: ciotEstado, status: ciot.texto, detalhe: ciotDetalhe, concluido: ciot.concluido },
    { id: 'mdfe', rotulo: 'MDF-e', ativo: false, estado: 'fora', status: fora, detalhe: null, concluido: false },
  ]
  const ativos = caixas.filter((c) => c.ativo)
  const concluidos = ativos.filter((c) => c.concluido).length
  return { caixas, concluidos, total: ativos.length, contador: `${concluidos} de ${ativos.length}` }
}

// Selo do cartão do vale na demonstração: nada que sugira dado de mentira.
export function seloVale(estado: EstadoVpo, houveSimulacao: boolean): string {
  if (estado === 'comprando') return 'Comprando…'
  if (estado === 'cancelando') return 'Cancelando…'
  if (estado === 'comprado') return 'Comprado'
  if (estado === 'cancelado') return 'Cancelado'
  if (estado === 'nao_confirmado') return 'Não confirmado'
  return houveSimulacao || estado === 'simulado' ? 'Valor calculado pelo NSPEDÁGIO' : 'Ainda sem simulação'
}

// ---- "De onde vem cada dado" ----
export type LinhaDado = { dado: string; valor: string; origem: string }
export const NAO_INFORMADO = 'não informado'

export type DadosDemo = {
  contratante: { nome: string | null; cnpj: string | null }
  titular: { nome: string | null; documento: string | null; rntrc: string | null; pix: string | null }
  motorista: { nome: string | null; cpf: string | null; cnh: string | null }
  veiculos: { placa: string; eixos: number | null; cavalo: boolean }[]
  rota: { origem: string | null; destino: string | null; distanciaKm: number | null; ibgeOrigem: string | null; ibgeDestino: string | null }
  carga: { ncm: string | null; pesoKg: number | null }
  frete: { total: number | null; adiantamento: number | null }
  datas: { inicio: string | null; fim: string | null }
  numeroOperacao: number | null
  vpo: { idvpo: string | null; valor: number | null }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const textoOu = (v: string | null | undefined) => (v == null || v.trim() === '' ? NAO_INFORMADO : v)
const moedaOu = (v: number | null) => (v == null ? NAO_INFORMADO : brl(v))

// Documentos pessoais aparecem mascarados (a tela é mostrada em chamada de vídeo).
export function mascarar(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '')
  if (!d) return null
  return d.length <= 4 ? d : `${'•'.repeat(Math.max(d.length - 4, 3))}${d.slice(-4)}`
}
// AAAAMMDD <-> dd/mm/aaaa e ISO
export function dataDeAAAAMMDD(v: string): string | null {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : null
}
export const aaaammddDeIso = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/-/g, '') : ''

export type PisoResumo = { ok: boolean; piso?: number; tabela?: string; eixos?: number; distanciaKm?: number }

export function linhasDadosCiot(d: DadosDemo, piso: PisoResumo | null | undefined, pisoDoPedido?: number | null, pedagio?: string | null): LinhaDado[] {
  const placas = d.veiculos.length ? d.veiculos.map((v) => `${v.placa}${v.eixos != null ? ` (${v.eixos} eixos)` : ''}`).join(' + ') : null
  const saldo = d.frete.total != null && d.frete.adiantamento != null ? d.frete.total - d.frete.adiantamento : null
  // O piso é o mesmo da conferência/confirmação do CIOT: o da prévia quando há, senão o gravado no pedido.
  const valorPiso = piso?.ok && piso.piso != null ? piso.piso : pisoDoPedido != null ? pisoDoPedido : null
  const detalhePiso = piso?.ok && piso.piso != null ? ` · tabela ${piso.tabela ?? '?'} · ${piso.eixos ?? '?'} eixos · ${piso.distanciaKm ?? '?'} km` : ''
  return [
    { dado: 'Contratante', valor: textoOu(d.contratante.nome ? `${d.contratante.nome}${d.contratante.cnpj ? ` · ${d.contratante.cnpj}` : ''}` : null), origem: 'Cadastro' },
    { dado: 'Contratado e RNTRC', valor: textoOu(d.titular.nome ? `${limparNomeTeste(d.titular.nome)} · RNTRC ${d.titular.rntrc ?? NAO_INFORMADO}` : null), origem: 'Cadastro' },
    { dado: 'Motorista, CPF e CNH', valor: textoOu(d.motorista.nome ? `${limparNomeTeste(d.motorista.nome)} · CPF ${mascarar(d.motorista.cpf) ?? NAO_INFORMADO} · CNH ${mascarar(d.motorista.cnh) ?? NAO_INFORMADO}` : null), origem: 'Cadastro' },
    { dado: 'Veículos, placas e eixos', valor: textoOu(placas), origem: 'Cadastro' },
    { dado: 'Origem, destino e distância', valor: d.rota.origem && d.rota.destino ? `${d.rota.origem} → ${d.rota.destino}${d.rota.distanciaKm != null ? ` · ${d.rota.distanciaKm} km` : ''}` : NAO_INFORMADO, origem: 'Rota' },
    { dado: 'Carga, NCM e peso', valor: d.carga.ncm || d.carga.pesoKg != null ? `NCM ${d.carga.ncm ?? NAO_INFORMADO} · ${d.carga.pesoKg != null ? `${d.carga.pesoKg.toLocaleString('pt-BR')} kg` : NAO_INFORMADO}` : NAO_INFORMADO, origem: 'Cotação' },
    { dado: 'Frete, adiantamento e saldo', valor: d.frete.total != null ? `${brl(d.frete.total)} · adiant. ${moedaOu(d.frete.adiantamento)} · saldo ${moedaOu(saldo)}` : NAO_INFORMADO, origem: 'Operação' },
    { dado: 'Chave Pix', valor: d.titular.pix ? `${mascarar(d.titular.pix)} (do transportador)` : NAO_INFORMADO, origem: 'Cadastro' },
    { dado: 'Piso mínimo da ANTT', valor: valorPiso != null ? `${brl(valorPiso)}${detalhePiso}` : NAO_INFORMADO, origem: 'Fiscal (tabela ANTT)' },
    ...(pedagio ? [{ dado: 'Pedágio do CIOT', valor: pedagio, origem: 'Operação' as const }] : []),
    { dado: 'Número do vale-pedágio', valor: textoOu(d.vpo.idvpo), origem: 'Operação' },
  ]
}

// O que o formulário do cartão do vale tem agora: a MESMA fonte da tabela e do que é enviado ao NSPEDÁGIO.
export type FormularioVale = { origem: string; destino: string; placa: string; eixos: string; inicio: string; fim: string }

// Nome da cidade quando o IBGE é o da cotação; senão só o código.
function pontoDaRota(ibge: string, d: DadosDemo): string {
  const cod = (ibge ?? '').replace(/\D/g, '')
  if (!cod) return NAO_INFORMADO
  if (cod === d.rota.ibgeOrigem && d.rota.origem) return `${d.rota.origem} (IBGE ${cod})`
  if (cod === d.rota.ibgeDestino && d.rota.destino) return `${d.rota.destino} (IBGE ${cod})`
  return `IBGE ${cod}`
}

export function linhasDadosVpo(d: DadosDemo, form: FormularioVale, simulacao: string | null): LinhaDado[] {
  const cavalo = d.veiculos.find((v) => v.cavalo)
  const placaTeste = !!cavalo && !!form.placa && cavalo.placa !== form.placa
  const ini = dataDeAAAAMMDD(form.inicio)
  const fim = dataDeAAAAMMDD(form.fim)
  return [
    { dado: 'Placa e eixos', valor: `${form.placa || NAO_INFORMADO} · ${form.eixos || NAO_INFORMADO} eixos${placaTeste ? ` · placa de teste com TAG ativa; a da operação é ${cavalo!.placa}` : ''}`, origem: 'Cadastro' },
    { dado: 'Pontos da rota', valor: `${pontoDaRota(form.origem, d)} → ${pontoDaRota(form.destino, d)}`, origem: 'Cotação' },
    { dado: 'Vigência', valor: ini && fim ? `${ini} a ${fim}` : NAO_INFORMADO, origem: 'Operação' },
    { dado: 'Transportadora e CNPJ', valor: textoOu(d.contratante.nome ? `${d.contratante.nome}${d.contratante.cnpj ? ` · ${d.contratante.cnpj}` : ''}` : null), origem: 'Cadastro' },
    { dado: 'Documento de transporte', valor: d.numeroOperacao != null ? `Operação nº ${d.numeroOperacao}` : NAO_INFORMADO, origem: 'Operação' },
    { dado: 'Valor do vale', valor: simulacao ?? (d.vpo.valor != null ? brl(d.vpo.valor) : 'aparece depois de Simular'), origem: 'Fiscal' },
  ]
}

// ---- Abas Vale-pedágio / CIOT da demonstração ----
export type AbaDemo = 'vpo' | 'ciot'
export const CHAVE_ABA_DEMO = 'rbr-demo-aba'

export function abaDeHash(hash: string | null | undefined): AbaDemo | null {
  const h = (hash ?? '').replace(/^#/, '').toLowerCase()
  return h === 'vpo' || h === 'ciot' ? h : null
}
export function abaDeTexto(v: string | null | undefined): AbaDemo | null {
  return v === 'vpo' || v === 'ciot' ? v : null
}
// Qual aba abre: o hash da URL manda (F5 e link), depois o que ficou guardado na sessão, senão o Vale-pedágio.
export function abaInicial(hash: string | null | undefined, guardada: string | null | undefined): AbaDemo {
  return abaDeHash(hash) ?? abaDeTexto(guardada) ?? 'vpo'
}

// A faixa "próximo passo" e o anel dourado só aparecem com o vale comprado e o CIOT ainda sem estar emitido.
export function proximoPassoCiot(e: Esteira): boolean {
  const vpo = e.caixas.find((c) => c.id === 'vpo')
  const ciot = e.caixas.find((c) => c.id === 'ciot')
  return vpo?.estado === 'emitido' && !!ciot && ciot.estado !== 'emitido'
}

// Texto do estado de cada aba na esteira: "Comprado · R$ valor" quando há valor do vale.
export function textoEstadoAba(c: CaixaEsteira, valorVpo?: number | null): string {
  if (c.id === 'vpo' && c.estado === 'emitido' && valorVpo != null) return `${c.status} · ${brl(valorVpo)}`
  return c.status
}
