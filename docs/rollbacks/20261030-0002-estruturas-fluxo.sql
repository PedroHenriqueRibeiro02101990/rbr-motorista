-- Rollback de supabase-migrations/20261030_02_estruturas_fluxo.sql (só remove objetos criados por ela).
-- Rode somente se ninguém tiver gravado dados nessas tabelas/colunas.
drop table if exists public.saude_fiscal_achados;
drop table if exists public.disjuntor_fiscal;
drop table if exists public.operacao_cancelamento_passos;
drop table if exists public.avisos_disponibilidade;
drop table if exists public.propostas_publicas;
drop table if exists public.operacao_devolucoes_fiscal;
alter table public.operacoes drop column if exists assumida_em, drop column if exists assumida_por;
