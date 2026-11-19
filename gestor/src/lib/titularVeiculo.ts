// C1 (19/11/2026): quem e o TITULAR do veiculo no cadastro por documentos. Regra unica, espelhada na RPC
// confirmar_cadastro_por_documentos (migracao 20261119-0900) e coberta por teste:
//   o titular e o PROPRIETARIO DO CRLV (nome e CPF/CNPJ lidos do documento). Nunca o motorista do lote, nunca quem esta logado.
//   - CPF/CNPJ do CRLV bate com uma pessoa cadastrada  -> usa essa pessoa.
//   - nao bate                                          -> cria a pessoa titular (papel titular_motorista, sem login) com nome, documento e UF do CRLV.
//   - sem documento ou sem nome no CRLV                 -> bloqueia (nao ha titular a inventar).
// Teste: node --test gestor/test/titularVeiculo.test.ts
import { cnpjValido, cpfValido, tipoDocumentoProprietario } from '../../../supabase/functions/_shared/validacoes-cadastro.ts'

export const PAPEIS_EQUIPE = ['gestor_rbr', 'operacao', 'fiscal'] as const

const limpo = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

export interface PessoaCadastrada { id: string; nome: string; cpf?: string | null; cnpj?: string | null; papel: string; deleted_at?: string | null }
export interface ProprietarioCrlv { documento?: string | null; nome?: string | null; uf?: string | null }

export type DecisaoTitular =
  | { acao: 'usar'; pessoaId: string; nome: string }
  | { acao: 'criar'; nome: string; documento: string; tipo: 'PF' | 'PJ'; uf: string | null; papel: 'titular_motorista' }
  | { acao: 'bloquear'; motivo: string }

/** Decide o titular a partir SO do que o CRLV diz e das pessoas ja cadastradas. Nao recebe (nem pode usar) o usuario logado. */
export function decidirTitular(prop: ProprietarioCrlv, pessoas: PessoaCadastrada[]): DecisaoTitular {
  const doc = limpo(prop.documento)
  const tipo = tipoDocumentoProprietario(doc)
  if (!tipo) return { acao: 'bloquear', motivo: 'CRLV sem CPF/CNPJ do proprietario. Digite o documento do proprietario (como esta no CRLV).' }
  if (tipo === 'cpf' ? !cpfValido(doc) : !cnpjValido(doc)) return { acao: 'bloquear', motivo: `CPF/CNPJ do proprietario invalido (${doc}). Confira no CRLV.` }
  const achadas = pessoas.filter((p) => !p.deleted_at && (limpo(p.cpf) === doc || limpo(p.cnpj) === doc))
  // se houver mais de uma, prefere quem nao e da equipe interna (a equipe nunca e titular de veiculo de terceiro)
  const escolhida = achadas.find((p) => !(PAPEIS_EQUIPE as readonly string[]).includes(p.papel)) ?? achadas[0]
  if (escolhida) return { acao: 'usar', pessoaId: escolhida.id, nome: escolhida.nome }
  const nome = String(prop.nome ?? '').trim()
  if (!nome) return { acao: 'bloquear', motivo: 'CRLV sem nome do proprietario. Digite o nome como esta no CRLV para criar o titular.' }
  const uf = String(prop.uf ?? '').trim().toUpperCase().slice(0, 2) || null
  return { acao: 'criar', nome, documento: doc, tipo: tipo === 'cpf' ? 'PF' : 'PJ', uf, papel: 'titular_motorista' }
}
