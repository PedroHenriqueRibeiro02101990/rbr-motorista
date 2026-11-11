// Modo de demonstração da aba Fiscal (reunião com a NSTech). Sem React e sem rede, para testar com
// node --test gestor/test/modoDemonstracao.test.ts
// Só vale com TRÊS condições juntas, TODAS da própria operação: eh_teste, a marca modo_demonstracao e nenhum documento dela em produção
// (CIOT/efrete e NSPEDAGIO só rodam em homologação). NÃO olha o ambiente fiscal global do sistema (parametros_fiscais), que no gestor de
// produção vale 'producao' e escondia o modo. Isto decide só o que a tela MOSTRA: nenhuma trava de emissão muda.
import { estadoVpo, type EstadoVpo, type RequisicaoVpo } from './vpoPassos.ts'

export function modoDemonstracaoAtivo(op: { eh_teste?: boolean | null; modo_demonstracao?: boolean | null } | null | undefined, docs: { ambiente?: string | null }[] | null | undefined): boolean {
  if (!op || op.eh_teste !== true || op.modo_demonstracao !== true) return false
  return !(docs ?? []).some((d) => d.ambiente === 'producao')
}

// ---- Esteira completa: CT-e, Averbação, Vale-pedágio, CIOT, MDF-e ----
export type CaixaEsteira = { id: 'cte' | 'averbacao' | 'vpo' | 'ciot' | 'mdfe'; rotulo: string; ativo: boolean; status: string; concluido: boolean }
export type Esteira = { caixas: CaixaEsteira[]; concluidos: number; total: number; contador: string }

const ROTULO_VPO: Record<EstadoVpo, string> = {
  nao_simulado: 'Pendente',
  simulado: 'Pendente',
  comprando: 'Em processamento',
  comprado: 'Comprado',
  cancelando: 'Em processamento',
  cancelado: 'Cancelado',
  nao_confirmado: 'Não confirmado',
}
export function statusCiot(s: string | null | undefined): { texto: string; concluido: boolean } {
  if (s === 'emitido') return { texto: 'Emitido', concluido: true }
  if (s === 'encerrado') return { texto: 'Encerrado', concluido: true }
  if (s === 'cancelado') return { texto: 'Cancelado', concluido: false }
  if (s === 'erro') return { texto: 'Com erro', concluido: false }
  return { texto: 'Pendente', concluido: false }
}

export function esteiraDemonstracao(vpoReqs: RequisicaoVpo[], ciotStatus: string | null | undefined, agora = Date.now()): Esteira {
  const vpo = estadoVpo(vpoReqs, agora)
  const ciot = statusCiot(ciotStatus)
  const fora = 'Fora desta demonstração'
  const caixas: CaixaEsteira[] = [
    { id: 'cte', rotulo: 'CT-e', ativo: false, status: fora, concluido: false },
    { id: 'averbacao', rotulo: 'Averbação do CT-e', ativo: false, status: fora, concluido: false },
    { id: 'vpo', rotulo: 'Vale-pedágio (VPO)', ativo: true, status: ROTULO_VPO[vpo], concluido: vpo === 'comprado' },
    { id: 'ciot', rotulo: 'CIOT', ativo: true, status: ciot.texto, concluido: ciot.concluido },
    { id: 'mdfe', rotulo: 'MDF-e', ativo: false, status: fora, concluido: false },
  ]
  const ativos = caixas.filter((c) => c.ativo)
  const concluidos = ativos.filter((c) => c.concluido).length
  return { caixas, concluidos, total: ativos.length, contador: `${concluidos} de ${ativos.length}` }
}

// ---- "De onde vem cada dado" ----
export type OrigemDado = 'Cadastro' | 'Cotação' | 'Operação' | 'Rota' | 'Fiscal'
export type LinhaDado = { dado: string; valor: string; origem: OrigemDado }
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
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : null)

export type PisoResumo = { ok: boolean; piso?: number; tabela?: string; eixos?: number; distanciaKm?: number }

export function linhasDadosCiot(d: DadosDemo, piso: PisoResumo | null | undefined): LinhaDado[] {
  const placas = d.veiculos.length ? d.veiculos.map((v) => `${v.placa}${v.eixos != null ? ` (${v.eixos} eixos)` : ''}`).join(' + ') : null
  const saldo = d.frete.total != null && d.frete.adiantamento != null ? d.frete.total - d.frete.adiantamento : null
  return [
    { dado: 'Contratante', valor: textoOu(d.contratante.nome ? `${d.contratante.nome}${d.contratante.cnpj ? ` · ${d.contratante.cnpj}` : ''}` : null), origem: 'Cadastro' },
    { dado: 'Contratado e RNTRC', valor: textoOu(d.titular.nome ? `${d.titular.nome} · RNTRC ${d.titular.rntrc ?? NAO_INFORMADO}` : null), origem: 'Cadastro' },
    { dado: 'Motorista, CPF e CNH', valor: textoOu(d.motorista.nome ? `${d.motorista.nome} · CPF ${mascarar(d.motorista.cpf) ?? NAO_INFORMADO} · CNH ${mascarar(d.motorista.cnh) ?? NAO_INFORMADO}` : null), origem: 'Cadastro' },
    { dado: 'Veículos, placas e eixos', valor: textoOu(placas), origem: 'Cadastro' },
    { dado: 'Origem, destino e distância', valor: d.rota.origem && d.rota.destino ? `${d.rota.origem} → ${d.rota.destino}${d.rota.distanciaKm != null ? ` · ${d.rota.distanciaKm} km` : ''}` : NAO_INFORMADO, origem: 'Rota' },
    { dado: 'Carga, NCM e peso', valor: d.carga.ncm || d.carga.pesoKg != null ? `NCM ${d.carga.ncm ?? NAO_INFORMADO} · ${d.carga.pesoKg != null ? `${d.carga.pesoKg.toLocaleString('pt-BR')} kg` : NAO_INFORMADO}` : NAO_INFORMADO, origem: 'Cotação' },
    { dado: 'Frete, adiantamento e saldo', valor: d.frete.total != null ? `${brl(d.frete.total)} · adiant. ${moedaOu(d.frete.adiantamento)} · saldo ${moedaOu(saldo)}` : NAO_INFORMADO, origem: 'Operação' },
    { dado: 'Chave Pix', valor: d.titular.pix ? `${mascarar(d.titular.pix)} (do transportador)` : NAO_INFORMADO, origem: 'Cadastro' },
    { dado: 'Piso mínimo da ANTT', valor: piso?.ok && piso.piso != null ? `${brl(piso.piso)} · tabela ${piso.tabela ?? '?'} · ${piso.eixos ?? '?'} eixos · ${piso.distanciaKm ?? '?'} km` : NAO_INFORMADO, origem: 'Fiscal' },
    { dado: 'Número do vale-pedágio', valor: textoOu(d.vpo.idvpo), origem: 'Operação' },
  ]
}

export function linhasDadosVpo(d: DadosDemo, simulacao: string | null, placaUsada: string): LinhaDado[] {
  const cavalo = d.veiculos.find((v) => v.cavalo)
  const eixos = d.veiculos.reduce((s, v) => s + (v.eixos ?? 0), 0)
  return [
    { dado: 'Placa e eixos', valor: `${placaUsada || NAO_INFORMADO}${eixos > 0 ? ` · ${eixos} eixos (cavalo + carreta)` : ''}${cavalo && placaUsada && cavalo.placa !== placaUsada ? ` · placa de teste (a da operação é ${cavalo.placa})` : ''}`, origem: 'Cadastro' },
    { dado: 'Pontos da rota', valor: d.rota.origem && d.rota.destino ? `${d.rota.origem} (IBGE ${textoOu(d.rota.ibgeOrigem)}) → ${d.rota.destino} (IBGE ${textoOu(d.rota.ibgeDestino)})` : NAO_INFORMADO, origem: 'Cotação' },
    { dado: 'Vigência', valor: d.datas.inicio ? `${dia(d.datas.inicio)} a ${dia(d.datas.fim) ?? NAO_INFORMADO}` : NAO_INFORMADO, origem: 'Operação' },
    { dado: 'Transportadora e CNPJ', valor: textoOu(d.contratante.nome ? `${d.contratante.nome}${d.contratante.cnpj ? ` · ${d.contratante.cnpj}` : ''}` : null), origem: 'Cadastro' },
    { dado: 'Documento de transporte', valor: d.numeroOperacao != null ? `Operação nº ${d.numeroOperacao}` : NAO_INFORMADO, origem: 'Operação' },
    { dado: 'Valor do vale', valor: simulacao ?? (d.vpo.valor != null ? brl(d.vpo.valor) : 'aparece depois de Simular'), origem: 'Fiscal' },
  ]
}
