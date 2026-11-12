// Central de integrações · aba "Que usamos". SÓ LEITURA. Nunca lê nem mostra valor de segredo.
// Acesso: o app não distingue o dono dos demais gestores (só existe o papel gestor_rbr), então a Central fica atrás da flag
// VITE_CENTRAL_INTEGRACOES (desligada por padrão) E exige papel gestor_rbr. Sem acesso, a rota responde como página inexistente.

export function acessoCentral(papel: string | null | undefined, flag: string | boolean | null | undefined): boolean {
  return papel === 'gestor_rbr' && (flag === true || flag === 'true')
}

export type Fornecedor = {
  id: string
  nome: string
  serve: string
  // Tabela de onde sai a última chamada (quando existir) e como ler cada coluna.
  fonte?: { tabela: string; colData: string; colResultado: string; colErro: string; colAmbiente?: string; erroPorStatus?: string[] }
  ambienteFixo?: string
  validade: string
  custo: string
  credencial: string // sem expor valor: sempre apontar o painel
  nota?: string
}

const PAINEL = 'ver no painel do Supabase'

export const FORNECEDORES: Fornecedor[] = [
  { id: 'focus', nome: 'Focus NFe', serve: 'Emissão de CT-e, MDF-e, NF-e e NFS-e', validade: 'sem registro', custo: 'sem registro', credencial: PAINEL },
  { id: 'efrete', nome: 'efrete / NSTech (CIOT)', serve: 'Emissão e gestão do CIOT', fonte: { tabela: 'efrete_ciot_pedidos', colData: 'atualizado_em', colResultado: 'status', colErro: 'ultimo_erro', colAmbiente: 'ambiente', erroPorStatus: ['erro'] }, validade: 'sem registro', custo: 'sem registro', credencial: PAINEL },
  { id: 'nspedagio', nome: 'NSPEDAGIO', serve: 'Compra de vale-pedágio (VPO)', fonte: { tabela: 'vpo_requisicoes', colData: 'criado_em', colResultado: 'http_status', colErro: 'erro', colAmbiente: 'ambiente' }, validade: 'sem registro', custo: 'sem registro', credencial: PAINEL },
  { id: 'repom', nome: 'Repom', serve: 'Roteirização e vale-pedágio alternativo', fonte: { tabela: 'repom_requisicoes', colData: 'criado_em', colResultado: 'status', colErro: 'erro', colAmbiente: 'ambiente' }, validade: 'sem registro', custo: 'sem registro', credencial: PAINEL },
  { id: 'averbadora', nome: 'Averbadora (AT&M / NSTech)', serve: 'Averbação do seguro do CT-e', validade: 'sem registro', custo: 'sem registro', credencial: PAINEL, nota: 'Configuração em integracao_averbacao; não há registro de chamada.' },
  { id: 'gemini', nome: 'Gemini (Google)', serve: 'Leitura de documentos, resumo do dia e assistente', ambienteFixo: 'producao', validade: 'sem registro', custo: 'sem registro', credencial: PAINEL },
  { id: 'bancos', nome: 'Bancos (BTG, Inter)', serve: 'Apenas rótulo de conta no Financeiro', validade: 'sem registro', custo: 'sem registro', credencial: 'sem integração no código', nota: 'Não existe chamada de API a banco no código hoje.' },
]

export type LinhaBruta = Record<string, unknown>
export type ResumoFornecedor = {
  ultimaChamada: string | null
  resultado: string
  erros24h: number | null
  ambiente: string
}

const SEM = 'sem registro'

// Resume as últimas linhas (mais recente primeiro) de um fornecedor. Sem linhas = "sem registro"; nada é inventado.
export function resumir(f: Fornecedor, linhas: LinhaBruta[] | null, agora: Date = new Date()): ResumoFornecedor {
  if (!f.fonte || !linhas || linhas.length === 0) return { ultimaChamada: null, resultado: SEM, erros24h: null, ambiente: SEM }
  const { colData, colResultado, colErro, colAmbiente, erroPorStatus } = f.fonte
  const ult = linhas[0]
  const limite = agora.getTime() - 24 * 3600 * 1000
  const ehErro = (l: LinhaBruta) => {
    const e = l[colErro]
    if (typeof e === 'string' && e.trim() !== '') return true
    return Boolean(erroPorStatus?.includes(String(l[colResultado])))
  }
  const erros24h = linhas.filter((l) => {
    const t = Date.parse(String(l[colData] ?? ''))
    return Number.isFinite(t) && t >= limite && ehErro(l)
  }).length
  const res = ult[colResultado]
  const resultado = ehErro(ult) ? `erro${res != null ? ` (${String(res)})` : ''}` : res != null ? `ok (${String(res)})` : SEM
  return {
    ultimaChamada: typeof ult[colData] === 'string' ? (ult[colData] as string) : null,
    resultado,
    erros24h,
    ambiente: colAmbiente && typeof ult[colAmbiente] === 'string' ? (ult[colAmbiente] as string) : SEM,
  }
}

// Defesa: remove de qualquer texto o que parece segredo antes de mostrar (JWT, bearer, chave longa).
export function semSegredo(t: string | null | undefined): string {
  if (!t) return ''
  return t
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[oculto]')
    .replace(/bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [oculto]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[oculto]')
}
