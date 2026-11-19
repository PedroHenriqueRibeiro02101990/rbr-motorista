// Cliente do Supabase sem tipos para as tabelas prospeccao_* (ainda nao estao em shared/database.types.ts,
// que e gerado pelo Supabase depois da migration ser aplicada). Mesma sessao, mesmas regras de RLS.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'

export const db = supabase as unknown as SupabaseClient

export type Empresa = {
  id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; cnae: string | null; segmento: string
  cidade: string | null; uf: string | null; funcionarios: number | null; site: string | null; telefone: string | null
  veiculo_provavel: string | null; cargas_semana_estimadas: number | null; criterios: Record<string, number>
  pontuacao: number; classe: 'A' | 'B' | 'C'; penalidade_risco: boolean; penalidade_motivo: string | null
  status: string; repouso_ate: string | null; origem_contato: string; lead_id: string | null; criado_em: string
}
export type Contato = {
  id: string; empresa_id: string; nome: string | null; cargo: string | null; email: string; tipo_email: string
  validacao_status: string; origem_contato: string
}
export type Mensagem = {
  id: string; empresa_id: string; contato_id: string; toque: number; assunto: string; corpo: string; status: string
  aprovado_em: string | null; enviado_em: string | null; erro: string | null; criado_em: string
}
export type Bloqueio = { id: string; tipo: 'email' | 'dominio'; valor: string; motivo: string; criado_em: string }

// Registra uma acao na auditoria (RPC que so aceita acoes prospeccao_* de gestor).
export async function auditar(acao: string, dado: Record<string, unknown> = {}) {
  const { error } = await db.rpc('prospeccao_auditar', { p_acao: acao, p_dado: dado })
  if (error) throw new Error(error.message)
}

export const CHAVE_UI = 'PROSPECCAO_UI_LIBERADA'
export const CHAVE_ENVIO = 'PROSPECCAO_ENVIO_LIBERADO'
export const CHAVE_LIMITE = 'PROSPECCAO_LIMITE_DIARIO'

export async function lerFlag(chave: string): Promise<string | null> {
  const { data } = await db.from('parametros_sistema').select('valor').eq('chave', chave).maybeSingle()
  return data ? String(data.valor) : null
}
