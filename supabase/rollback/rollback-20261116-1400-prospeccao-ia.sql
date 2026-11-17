-- Rollback de 20261116-1400 (agente de IA). Apaga relatorios, experimentos, avisos e o historico de custo de IA.
alter table public.prospeccao_mensagens drop constraint if exists prospeccao_mensagens_experimento_fk;
drop table if exists public.prospeccao_avisos, public.prospeccao_experimentos, public.prospeccao_relatorios, public.prospeccao_ia_uso cascade;
alter table public.prospeccao_mensagens drop column if exists experimento_id, drop column if exists variante, drop column if exists validador_motivo;
drop index if exists public.prospeccao_respostas_agente_idx;
alter table public.prospeccao_respostas drop column if exists agente_processado_em, drop column if exists agente_categoria, drop column if exists agente_confianca,
  drop column if exists agente_dados, drop column if exists agente_acao, drop column if exists agente_motivo;
delete from public.parametros_sistema where chave in ('PROSPECCAO_IA_TETO_DIARIO_BRL', 'PROSPECCAO_IA_CAMBIO_USD_BRL', 'PROSPECCAO_IA_MODELO_CLASSIFICAR', 'PROSPECCAO_IA_MODELO_EXTRAIR',
  'PROSPECCAO_IA_MODELO_VALIDAR', 'PROSPECCAO_IA_MODELO_REDIGIR', 'PROSPECCAO_IA_MODELO_ESCALAR', 'PROSPECCAO_IA_AUTONOMIA', 'PROSPECCAO_IA_PRECOS_USD_MILHAO');
