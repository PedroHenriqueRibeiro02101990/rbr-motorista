import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Cliente SEM tipagem, só para as tabelas, colunas e RPCs criadas pelas migrations supabase-migrations/20261011_*.sql,
// que ainda NÃO existem no banco real (kwscmegsfbtvlnyxougt) e por isso não estão no database.types.ts.
// Tudo o que já existe no banco continua usando `supabase` (tipado).
// Quando essas migrations forem aplicadas e os tipos regenerados (supabase gen types), trocar cada `dbNovo` por
// `supabase`, deixar o tsc apontar os ajustes e apagar este arquivo.
export const dbNovo = supabase as unknown as SupabaseClient

// Colunas novas de pessoas (20261011_01 e seguintes). Uma linha lida com select('*') já traz esses campos em runtime;
// `novos()` só dá o tipo a eles. Some junto com este arquivo quando os tipos forem regenerados.
export type TipoParceiro = 'tac_pf' | 'mei_caminhoneiro' | 'etc'
export type ClassificacaoCiot = 'tac' | 'etc_equiparada_tac' | 'etc_ciot_proprio' | 'etc_frota_nao_informada'
export type PessoaNova = {
  tipo_parceiro?: TipoParceiro | null
  qtd_veiculos_rntrc?: number | null
  opcao_inss_direto?: boolean | null
  data_comunicacao_inss_direto?: string | null
  classificacao_ciot?: ClassificacaoCiot | null
  // 20261011_08 (contrato do agenciador)
  status_contrato_agenciador?: string | null
  status_contrato_motivo?: string | null
  status_contrato_em?: string | null
  responsavel_nome?: string | null
  responsavel_cpf?: string | null
  // 20261011_10 (escudo contra carga ilícita)
  nivel_confianca?: 'novo' | 'verificado' | 'restrito' | null
  suspenso_em?: string | null
  suspensao_motivo?: string | null
  validade_exame_toxicologico?: string | null
  consentimento_consulta_antecedentes?: boolean | null
  consentimento_antecedentes_em?: string | null
}
export const novos = <T extends object>(linha: T) => linha as T & PessoaNova

// Colunas novas de operacoes (20261011_05 e seguintes).
export type OperacaoNova = {
  piso_minimo_valor?: number | null
  tipo_documento_cliente?: 'nfse' | 'cte_mdfe' | null
  tipo_documento_aviso?: string | null
  tipo_documento_mudou_em?: string | null
  // 20261011_10 (incidente)
  congelada_em?: string | null
  congelada_motivo?: string | null
}
export const novosOp = <T extends object>(linha: T) => linha as T & OperacaoNova
