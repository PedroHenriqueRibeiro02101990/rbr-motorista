-- Rollback de 20261024_02_efrete_ciot_verificador.sql
set local lock_timeout = '8s';
alter table public.efrete_ciot_pedidos drop column if exists ciot_verificador;
delete from supabase_migrations.schema_migrations where name = 'efrete_ciot_verificador';
