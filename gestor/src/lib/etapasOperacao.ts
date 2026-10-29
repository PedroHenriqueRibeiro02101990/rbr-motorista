import type { DetalheOperacao, Documento } from './operacaoDetalhe'
import { estadoSompo } from './averbacaoSompo.ts'

// Linha do tempo da operação (painel enxuto, 2026-10-16). Só decide QUAIS etapas aparecem e em que estado; não cria
// regra nova. De onde vem cada regra:
//  - documento ao cliente (CT-e + MDF-e ou NFS-e): operacoes.tipo_documento_cliente (Tarefa 6, recalculado no banco
//    pela origem/destino) e as linhas de documentacao_operacao;
//  - o que é exigido ou dispensado (GR, VPO, rastreamento, AET, CIOT; dispensas da operação de teste): função
//    gerar_documentos_exigidos no banco, que grava exigido/dispensa_motivo em documentacao_operacao;
//  - frota própria da RBR (sem CIOT e sem pagamento a parceiro): veiculos.is_veiculo_proprio (a mesma que o MDF-e usa);
//  - quem gera o CIOT (TAC/MEI/ETC até 3 veículos = RBR; ETC com mais de 3 = parceiro): RPC ciot_origem_esperada,
//    usada pelo CiotOperacao; retenção de INSS do TAC: RPC calcular_retencao_inss (RetencaoInss);
//  - vale-pedágio: cotacoes.pedagio > 0 (o banco só exige a linha vpo quando há pedágio);
//  - averbações: Allianz = documentacao_operacao tipo atm; Sompo = operacao_ciot_vpo.averbacao_rcv_* (averbacaoSompo.ts);
//  - liberação: a mesma conta do gatilho trg_fn_operacao_valida_transicao (com a regra de 2026-10-16: emitido conta).

export type EstadoEtapa = 'concluida' | 'processando' | 'problema' | 'atual' | 'futura'
export type IdEtapa =
  | 'motorista'
  | 'gr'
  | 'aet'
  | 'rastreio'
  | 'documento'
  | 'averbacao_allianz'
  | 'ciot'
  | 'pagamento'
  | 'mdfe'
  | 'averbacao_sompo'
  | 'liberar'
  | 'viagem'

export interface Etapa {
  id: IdEtapa
  titulo: string
  estado: EstadoEtapa
}

type Doc = Pick<Documento, 'tipo' | 'status' | 'exigido' | 'dispensa_motivo' | 'conferencia_status' | 'referencia' | 'chave_acesso' | 'numero_documento' | 'arquivo_path' | 'ambiente'>

export function docPor(d: { documentos: Doc[] }, tipo: string): Doc | undefined {
  return d.documentos.find((x) => x.tipo === tipo)
}

export function dispensado(doc: Doc | undefined): boolean {
  return !!doc && !doc.exigido && !!doc.dispensa_motivo
}

// Cumprido = emitido (pelo sistema ou registrado como emitido) OU conferido/aceito a partir de arquivo enviado.
export function documentoCumprido(doc: Doc | undefined): boolean {
  if (!doc) return false
  return doc.status === 'emitido' || doc.conferencia_status === 'ok' || doc.conferencia_status === 'aceito_manual'
}

export function documentoComProblema(doc: Doc | undefined): boolean {
  if (!doc) return false
  return doc.status === 'erro' || doc.status === 'bloqueado' || doc.conferencia_status === 'divergente' || doc.conferencia_status === 'erro'
}

// Enviado à SEFAZ (tem referência na Focus) e ainda sem resposta final.
export function documentoProcessando(doc: Doc | undefined): boolean {
  return !!doc && doc.status === 'pendente' && !!doc.referencia && ['cte', 'mdfe', 'nfse'].includes(doc.tipo)
}

export function usaCteMdfe(d: DetalheOperacao): boolean {
  const t = d.operacao.tipo_documento_cliente
  if (t === 'cte_mdfe') return true
  if (t === 'nfse') return false
  const cte = docPor(d, 'cte')
  return !!cte && !dispensado(cte)
}

export function frotaPropria(d: DetalheOperacao): boolean {
  return d.veiculo?.is_veiculo_proprio === true
}

export function aplicavel(doc: Doc | undefined): boolean {
  return !!doc && (doc.exigido || doc.status === 'emitido') && !(dispensado(doc) && doc.status !== 'emitido')
}

const CIOT_OK = (n: string | null | undefined) => (n ?? '').replace(/\D/g, '').length === 12

export function ciotAplicavel(d: DetalheOperacao): boolean {
  const ciot = docPor(d, 'ciot')
  return !frotaPropria(d) && !!ciot && !dispensado(ciot)
}

export function vpoAplicavel(d: DetalheOperacao): boolean {
  const vpo = docPor(d, 'vpo')
  return Number(d.cotacao?.pedagio ?? 0) > 0 && !!vpo && !dispensado(vpo)
}

export function pagamentoAplicavel(d: DetalheOperacao): boolean {
  return !frotaPropria(d)
}

export interface Pendencias {
  bloqueiam: string[] // falta de verdade (documento exigido que nem existe, alocação, bloqueio fiscal)
  ressalvaveis: string[] // regra da RBR: dá para seguir com motivo (liberar_operacao_com_ressalva)
}

const ROTULO_DOC: Record<string, string> = {
  cte: 'CT-e',
  mdfe: 'MDF-e',
  nfse: 'NFS-e',
  ciot: 'CIOT',
  vpo: 'Vale-pedágio',
  gr: 'Pesquisa GR',
  atm: 'Averbação',
  wialon: 'Rastreamento',
  aet: 'AET',
}

// Mesma conta do gatilho do banco (trg_fn_operacao_valida_transicao, regra de 2026-10-16).
export function pendenciasLiberacao(d: DetalheOperacao): Pendencias {
  const o = d.operacao
  const bloqueiam: string[] = []
  const ressalvaveis: string[] = []
  if (!o.veiculo_id || !o.pessoa_alocada_id) bloqueiam.push('alocar motorista e veículo')
  if (o.bloqueio_fiscal) bloqueiam.push('bloqueio fiscal ativo')
  if (!d.condicao) ressalvaveis.push('condição de pagamento do motorista')
  for (const doc of d.documentos.filter((x) => x.exigido && !documentoCumprido(x))) {
    const existe = !!doc.arquivo_path || !!doc.numero_documento || !!doc.chave_acesso
    const rotulo = ROTULO_DOC[doc.tipo] ?? doc.tipo
    if (existe) ressalvaveis.push(`conferir ${rotulo}`)
    else bloqueiam.push(rotulo)
  }
  return { bloqueiam, ressalvaveis }
}

type Bruto = { id: IdEtapa; titulo: string; estado: EstadoEtapa | 'pendente' }

function estadoDoc(doc: Doc | undefined): EstadoEtapa | 'pendente' {
  if (documentoCumprido(doc)) return 'concluida'
  if (documentoProcessando(doc)) return 'processando'
  if (documentoComProblema(doc)) return 'problema'
  return 'pendente'
}

export function etapasDaOperacao(d: DetalheOperacao): Etapa[] {
  const o = d.operacao
  const lista: Bruto[] = []
  const add = (id: IdEtapa, titulo: string, estado: Bruto['estado']) => lista.push({ id, titulo, estado })

  add('motorista', 'Motorista e veículo', o.veiculo_id && o.pessoa_alocada_id ? 'concluida' : 'pendente')

  const gr = docPor(d, 'gr')
  if (gr && gr.exigido) add('gr', 'Pesquisa GR (Shogun)', estadoDoc(gr))
  const aet = docPor(d, 'aet')
  if (aet && aet.exigido) add('aet', 'AET (DNIT)', estadoDoc(aet))
  const rastreio = docPor(d, 'wialon')
  if (rastreio && rastreio.exigido) add('rastreio', 'Rastreamento por satélite', estadoDoc(rastreio))

  const cteMdfe = usaCteMdfe(d)
  if (cteMdfe) {
    add('documento', 'CT-e', estadoDoc(docPor(d, 'cte')))
    const atm = docPor(d, 'atm')
    if (atm && aplicavel(atm)) {
      const cte = docPor(d, 'cte')
      const est: Bruto['estado'] =
        atm.status === 'emitido'
          ? 'concluida'
          : atm.status === 'erro' || atm.status === 'bloqueado'
            ? 'problema'
            : cte?.status === 'emitido' && cte.ambiente !== 'homologacao'
              ? 'processando'
              : 'pendente'
      add('averbacao_allianz', 'Averbação Allianz (RCTR-C) - CT-e', est)
    }
  } else {
    add('documento', 'NFS-e', estadoDoc(docPor(d, 'nfse')))
  }

  if (ciotAplicavel(d) || vpoAplicavel(d)) {
    const v = d.ciotVpo
    const ciotOk = !ciotAplicavel(d) || CIOT_OK(v?.ciot)
    const vpoOk = !vpoAplicavel(d) || !!(v?.vpo_idvpo ?? '').trim()
    add('ciot', ciotAplicavel(d) && vpoAplicavel(d) ? 'CIOT e vale-pedágio' : ciotAplicavel(d) ? 'CIOT' : 'Vale-pedágio', ciotOk && vpoOk ? 'concluida' : 'pendente')
  }
  if (pagamentoAplicavel(d) && (o.veiculo_id || d.condicao)) {
    add('pagamento', 'Pagamento ao motorista', d.condicao ? 'concluida' : 'pendente')
  }

  if (cteMdfe) {
    const mdfe = docPor(d, 'mdfe')
    add('mdfe', 'MDF-e', estadoDoc(mdfe))
    const sompo = estadoSompo(mdfe, d.averbacaoRcv)
    if (sompo !== 'homologacao') {
      add(
        'averbacao_sompo',
        'Averbação Sompo (RC-V) - MDF-e',
        sompo === 'averbado' ? 'concluida' : sompo === 'erro' || sompo === 'bloqueado' ? 'problema' : sompo === 'processando' ? 'processando' : 'pendente',
      )
    }
  }

  add('liberar', 'Liberar para coleta', o.liberada_em ? 'concluida' : 'pendente')
  if (o.liberada_em && o.status !== 'cancelada') {
    add('viagem', o.status === 'fechada' ? 'Viagem e fechamento' : 'Viagem', o.status === 'fechada' ? 'concluida' : 'pendente')
  }

  // A primeira etapa pendente é a "atual"; as seguintes ficam para depois.
  let achou = false
  return lista.map((e) => {
    if (e.estado !== 'pendente') return e as Etapa
    if (!achou) {
      achou = true
      return { ...e, estado: 'atual' }
    }
    return { ...e, estado: 'futura' }
  })
}

// O que fazer em cada etapa (texto do "Próximo passo" e do "Falta:" de cada passo).
export function verboDaEtapa(e: Pick<Etapa, 'id' | 'titulo'>): string | undefined {
  const verbo: Partial<Record<IdEtapa, string>> = {
    motorista: 'Alocar motorista e veículo',
    documento: `Emitir o ${e.titulo} na tela Fiscal`,
    mdfe: 'Emitir o MDF-e na tela Fiscal',
    ciot: `Registrar o ${e.titulo}`,
    pagamento: 'Definir o pagamento ao motorista',
    gr: 'Registrar a pesquisa GR',
    aet: 'Providenciar a AET',
    rastreio: 'Confirmar o rastreamento',
    averbacao_allianz: 'Averbar o CT-e na Allianz',
    averbacao_sompo: 'Averbar o MDF-e na Sompo',
  }
  return verbo[e.id]
}

// "Falta: ..." de um passo: vazio quando já está concluído.
export function oQueFalta(e: Etapa): string | null {
  if (e.estado === 'concluida') return null
  if (e.estado === 'processando') return 'aguardando o retorno'
  if (e.id === 'liberar') return 'cumprir os passos acima'
  if (e.id === 'viagem') return 'acompanhar até a entrega'
  return verboDaEtapa(e) ?? null
}

export const ROTULO_ESTADO: Record<EstadoEtapa, string> = {
  concluida: 'Concluído',
  processando: 'Processando',
  problema: 'Com problema',
  atual: 'Fazer agora',
  futura: 'Depois',
}

export interface ProximoPasso {
  texto: string
  pronto: boolean // verde: tudo o que se aplica está cumprido e dá para liberar
  etapa: IdEtapa | null
}

export function proximoPasso(d: DetalheOperacao, etapas: Etapa[] = etapasDaOperacao(d)): ProximoPasso {
  const o = d.operacao
  if (o.status === 'cancelada') return { texto: 'Operação cancelada', pronto: false, etapa: null }
  if (o.status === 'fechada') return { texto: 'Operação fechada', pronto: false, etapa: null }
  if (o.status === 'entregue') return { texto: 'Fechar a operação', pronto: false, etapa: 'viagem' }
  if (o.status === 'carregando' || o.status === 'em_transito') return { texto: 'Acompanhar a viagem até a entrega', pronto: false, etapa: 'viagem' }
  if (o.status === 'liberada_coleta') return { texto: 'Aguardando a coleta pelo motorista', pronto: false, etapa: 'viagem' }
  const problema = etapas.find((e) => e.estado === 'problema')
  if (problema) return { texto: `Resolver: ${problema.titulo}`, pronto: false, etapa: problema.id }
  const atual = etapas.find((e) => e.estado === 'atual' && e.id !== 'liberar')
  if (atual) {
    return { texto: verboDaEtapa(atual) ?? atual.titulo, pronto: false, etapa: atual.id }
  }
  const processando = etapas.find((e) => e.estado === 'processando')
  if (processando) return { texto: `Aguardando: ${processando.titulo}`, pronto: false, etapa: processando.id }
  const p = pendenciasLiberacao(d)
  return { texto: 'Liberar para coleta', pronto: p.bloqueiam.length === 0 && p.ressalvaveis.length === 0, etapa: 'liberar' }
}

// Etapas principais do desenho aprovado (10/10); as demais (AET, rastreamento, pagamento, viagem) ficam recolhidas.
// As duas averbações ficam aqui: a Allianz depois do CT-e e a Sompo depois do MDF-e.
export const ETAPAS_PRINCIPAIS: IdEtapa[] = ['motorista', 'gr', 'documento', 'averbacao_allianz', 'ciot', 'mdfe', 'averbacao_sompo', 'liberar']

export function separarEtapas(etapas: Etapa[]): { principais: Etapa[]; recolhidas: Etapa[]; abrirRecolhidas: boolean } {
  const principais = etapas.filter((e) => ETAPAS_PRINCIPAIS.includes(e.id))
  const recolhidas = etapas.filter((e) => !ETAPAS_PRINCIPAIS.includes(e.id))
  // Se a etapa atual ou um problema está entre as recolhidas, a lista abre para ninguém perder o próximo passo.
  const abrirRecolhidas = recolhidas.some((e) => e.estado === 'atual' || e.estado === 'problema' || e.estado === 'processando')
  return { principais, recolhidas, abrirRecolhidas }
}

// Bolinha da linha do tempo: verde com ✓ = concluída; azul com anel = atual; cinza = futura; vermelho = problema.
export function visualEtapa(estado: EstadoEtapa): { cor: string; marca: string; anel: boolean } {
  if (estado === 'concluida') return { cor: '#137A45', marca: '✓', anel: false }
  if (estado === 'problema') return { cor: 'var(--rbr-danger)', marca: '!', anel: false }
  if (estado === 'futura') return { cor: '#B8BDCC', marca: '', anel: false }
  return { cor: 'var(--rbr-navy)', marca: '', anel: true }
}

// Rótulo do botão de upload de cada documento, com o nome dele ("Subir CT-e", "Trocar CT-e").
const NOME_DOC_UPLOAD: Record<string, string> = {
  cte: 'CT-e',
  mdfe: 'MDF-e',
  ciot: 'CIOT',
  atm: 'averbação',
  gr: 'comprovante GR',
  vpo: 'vale-pedágio',
  nfse: 'NFS-e',
  aet: 'AET',
  wialon: 'comprovante de rastreio',
}

export function rotuloAcaoDocumento(tipo: string, temArquivo: boolean): string {
  return `${temArquivo ? 'Trocar' : 'Subir'} ${NOME_DOC_UPLOAD[tipo] ?? 'arquivo'}`
}

// Linha de "Próximo passo" para o cartão fechado da lista (sem os documentos carregados).
export function proximoPassoPorStatus(status: string, temMotorista: boolean): string {
  if (status === 'alocando_motorista') return temMotorista ? 'Conferir a alocação' : 'Alocar motorista e veículo'
  if (status === 'aguardando_liberacao_fiscal') return 'Documentos e liberação para coleta'
  if (status === 'liberada_coleta') return 'Aguardando a coleta'
  if (status === 'carregando' || status === 'em_transito') return 'Em viagem'
  if (status === 'entregue') return 'Fechar a operação'
  return ''
}
