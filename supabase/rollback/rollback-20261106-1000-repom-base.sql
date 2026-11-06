-- Rollback de 20261106-1000-repom-base.sql
drop table if exists public.repom_requisicoes;
drop table if exists public.repom_pedagios;
drop table if exists public.repom_rotas;
drop function if exists public.repom_segredo(text);
