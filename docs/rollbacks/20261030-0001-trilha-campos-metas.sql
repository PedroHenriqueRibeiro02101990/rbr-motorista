-- Rollback de supabase-migrations/20261030_01_trilha_campos_metas.sql (só remove objetos criados por ela).
-- Rode somente se ninguém tiver gravado dados nas tabelas/colunas novas.
drop table if exists public.metas;
drop table if exists public.trilha_auditoria;
drop table if exists public.operacao_alteracoes;
alter table public.operacoes drop column if exists comprovante_entrega_path, drop column if exists versao_proposta,
  drop column if exists protocolo_gr, drop column if exists aceite_motorista_em, drop column if exists exigencias_carga,
  drop column if exists contato_recebe_whatsapp, drop column if exists contato_recebe_email, drop column if exists contato_recebe_nome,
  drop column if exists contato_coleta_whatsapp, drop column if exists contato_coleta_email, drop column if exists contato_coleta_nome,
  drop column if exists motorista_id, drop column if exists cavalo_veiculo_id;
alter table public.eventos_fiscais_operacao drop column if exists fato_em, drop column if exists origem_acao, drop column if exists ator_id;
alter table public.documentacao_operacao drop column if exists fato_em, drop column if exists origem_acao, drop column if exists emitido_por;
