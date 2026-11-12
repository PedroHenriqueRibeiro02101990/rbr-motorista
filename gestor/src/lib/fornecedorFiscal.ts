// Escolha da empresa que emite CIOT e vale-pedágio por operação (aba Fiscal). Sem React e sem rede: node --test gestor/test/fornecedorFiscal.test.ts
// A regra de verdade (papel, trava, disponibilidade) também está no banco (função escolher_fornecedor_fiscal); aqui só decide o que a tela mostra.
export type TipoFornecimento = 'ciot' | 'vpo'

export type FornecedorFiscal = { id: string; nome: string; capacidades: string[]; ativo: boolean; disponivel_emissao: boolean; ordem?: number; padrao_ciot?: boolean; padrao_vpo?: boolean }

// Só Fiscal e gestor trocam a empresa.
export const PAPEIS_QUE_TROCAM = ['fiscal', 'gestor_rbr']
export const podeTrocarFornecedor = (papel: string | null | undefined) => !!papel && PAPEIS_QUE_TROCAM.includes(papel)

export type EstadoEmissao = { ciotStatus?: string | null; vpoIdvpo?: string | null; vpoEmAndamento?: boolean }

// Depois de emissão ativa com aquele fornecedor (vale comprado ou CIOT emitido), o seletor fica bloqueado.
export function bloqueioTroca(tipo: TipoFornecimento, e: EstadoEmissao): string | null {
  if (tipo === 'ciot' && ['pendente', 'emitido', 'encerrado'].includes(e.ciotStatus ?? '')) return 'Cancele antes de trocar a empresa (CIOT já emitido).'
  if (tipo === 'vpo' && (!!e.vpoIdvpo || e.vpoEmAndamento)) return 'Cancele antes de trocar a empresa (vale-pedágio já comprado ou em andamento).'
  return null
}

export type OpcaoFornecedor = { id: string; nome: string; desabilitada: boolean; rotulo: string }

// Só fornecedores ativos com a capacidade do cartão; os que ainda não emitem aparecem desabilitados, "em implantação".
export function opcoesFornecedor(catalogo: FornecedorFiscal[], tipo: TipoFornecimento): OpcaoFornecedor[] {
  return catalogo
    .filter((f) => f.ativo && f.capacidades.includes(tipo))
    .sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100))
    .map((f) => ({ id: f.id, nome: f.nome, desabilitada: !f.disponivel_emissao, rotulo: f.disponivel_emissao ? f.nome : `${f.nome} (em implantação)` }))
}

export const padraoDoCatalogo = (catalogo: FornecedorFiscal[], tipo: TipoFornecimento) =>
  catalogo.find((f) => f.ativo && (tipo === 'ciot' ? f.padrao_ciot : f.padrao_vpo))?.id ?? 'nstech'

// Nome do sistema por trás de cada etapa, para a esteira e o pré-voo ("VPO: NSPEDAGIO", "CIOT: efrete"). Só exibição.
const SISTEMA: Record<string, Record<TipoFornecimento, string>> = { nstech: { ciot: 'efrete', vpo: 'NSPEDAGIO' } }
export function rotuloEtapa(tipo: TipoFornecimento, fornecedorId: string, nomeDoCatalogo?: string): string {
  const sistema = SISTEMA[fornecedorId]?.[tipo] ?? nomeDoCatalogo ?? fornecedorId
  return `${tipo === 'vpo' ? 'VPO' : 'CIOT'}: ${sistema}`
}

// Texto curto do seletor: quem emite e se é o padrão ("sem escolha feita usam o padrão e dizem isso").
export function textoEmpresa(tipo: TipoFornecimento, escolhido: string | null | undefined, catalogo: FornecedorFiscal[], jaEmitido: boolean): string {
  const id = escolhido ?? padraoDoCatalogo(catalogo, tipo)
  const nome = catalogo.find((f) => f.id === id)?.nome ?? id
  if (jaEmitido) return `Emitido por ${nome}`
  return escolhido ? nome : `${nome} (padrão)`
}

// O seletor só existe com a flag ligada e fora da demonstração (a demo fica exatamente como está: nstech fixo).
export const seletorVisivel = (flag: boolean, demo: boolean) => flag && !demo
