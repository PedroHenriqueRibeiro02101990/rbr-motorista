// Fornecedor (empresa que emite) de CIOT e de VPO por operação. Sem rede e sem Deno: testável com node --test.
// Novo fornecedor no futuro = uma linha em fornecedores_fiscais + um adaptador registrado na fábrica. Nada de "if" por nome no resto do código.
import type { ProvedorNsPedagio } from './nspedagioClient.ts'
import type { ProvedorCiot as ProvedorCiotEfrete } from './efreteClient.ts'

export const FORNECEDOR_NSTECH = 'nstech'
export type TipoFornecimento = 'ciot' | 'vpo'

// Interfaces únicas. Os provedores atuais já cumprem: o NSPEDAGIO (ProvedorNsPedagio) e a efrete (ProvedorCiot do efreteClient).
export type ProvedorVpo = ProvedorNsPedagio
export type ProvedorCiot = ProvedorCiotEfrete

export interface FornecedorFiscal {
  id: string
  nome: string
  capacidades: string[]
  ativo: boolean
  disponivel_emissao: boolean
  padrao_ciot?: boolean
  padrao_vpo?: boolean
}

export interface EscolhaOperacao {
  ciot_fornecedor?: string | null
  vpo_fornecedor?: string | null
}

export const mensagemIndisponivel = (nome: string) => `Fornecedor ${nome} ainda não está disponível para emitir.`

export function padraoDo(catalogo: FornecedorFiscal[], tipo: TipoFornecimento): string {
  const f = catalogo.find((x) => (tipo === 'ciot' ? x.padrao_ciot : x.padrao_vpo) && x.ativo)
  return f?.id ?? FORNECEDOR_NSTECH
}

// Quem atende uma ação:
//  - operação de demonstração: sempre nstech (a escolha é ignorada);
//  - sem escolha feita: o padrão atual;
//  - cancelar, reemitir, consultar e recibo usam SEMPRE quem emitiu o documento (a escolha gravada), nunca o padrão de hoje.
export function fornecedorEfetivo(a: { tipo: TipoFornecimento; escolha: EscolhaOperacao | null | undefined; catalogo: FornecedorFiscal[]; demo?: boolean }): { id: string; doPadrao: boolean } {
  if (a.demo) return { id: FORNECEDOR_NSTECH, doPadrao: false }
  const escolhido = a.tipo === 'ciot' ? a.escolha?.ciot_fornecedor : a.escolha?.vpo_fornecedor
  if (escolhido) return { id: escolhido, doPadrao: false }
  return { id: padraoDo(a.catalogo, a.tipo), doPadrao: true }
}

export type Fabrica<T> = Record<string, () => T>

// Devolve o provedor do fornecedor ou um erro claro em português, SEM chamar ninguém.
export function criarProvedor<T>(adaptadores: Fabrica<T>, catalogo: FornecedorFiscal[], tipo: TipoFornecimento, id: string): { ok: true; provedor: T } | { ok: false; erro: string } {
  const f = catalogo.find((x) => x.id === id)
  const nome = f?.nome ?? id
  const fabrica = adaptadores[id]
  if (!f || !f.ativo || !f.capacidades.includes(tipo) || !f.disponivel_emissao || !fabrica) return { ok: false, erro: mensagemIndisponivel(nome) }
  return { ok: true, provedor: fabrica() }
}

// Cliente mínimo (o do Supabase serve): só leitura.
type Lista = PromiseLike<{ data: unknown; error: unknown }>
interface Leitor {
  from(tabela: string): { select(cols: string): { eq(col: string, v: string): { maybeSingle(): Lista } } & Lista }
}

// Guarda das edge functions: só o nstech tem adaptador hoje. Qualquer falha de leitura (tabela ainda não criada, rede)
// NÃO bloqueia: o comportamento do nstech fica exatamente como era.
export async function guardaFornecedor(admin: Leitor, operacaoId: string, tipo: TipoFornecimento, demo: boolean): Promise<{ ok: true; fornecedor: string } | { ok: false; erro: string }> {
  if (demo) return { ok: true, fornecedor: FORNECEDOR_NSTECH }
  try {
    const cat = (await admin.from('fornecedores_fiscais').select('id, nome, capacidades, ativo, disponivel_emissao, padrao_ciot, padrao_vpo')) as unknown as { data: FornecedorFiscal[] | null; error: unknown }
    if (cat.error || !cat.data) return { ok: true, fornecedor: FORNECEDOR_NSTECH }
    const esc = (await admin.from('operacao_ciot_vpo').select('ciot_fornecedor, vpo_fornecedor').eq('operacao_id', operacaoId).maybeSingle()) as unknown as { data: EscolhaOperacao | null; error: unknown }
    if (esc.error) return { ok: true, fornecedor: FORNECEDOR_NSTECH }
    const { id } = fornecedorEfetivo({ tipo, escolha: esc.data, catalogo: cat.data })
    const r = criarProvedor<true>({ [FORNECEDOR_NSTECH]: () => true }, cat.data, tipo, id)
    return r.ok ? { ok: true, fornecedor: id } : { ok: false, erro: r.erro }
  } catch {
    return { ok: true, fornecedor: FORNECEDOR_NSTECH }
  }
}
