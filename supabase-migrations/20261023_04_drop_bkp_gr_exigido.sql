-- 20261023_04 — apaga o backup de 15/10 (1 linha: GR da operação de teste 150cbc5d, exigido=true antes da
-- migration que tornou a GR opcional). Sem dependentes. Rollback: supabase/rollback/rollback-20261023_04_drop_bkp_gr_exigido.sql
drop table if exists public._bkp_gr_exigido_20261015;
