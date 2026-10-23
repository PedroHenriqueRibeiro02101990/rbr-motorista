-- Rollback de 20261023_04: recria o backup com a mesma linha (valores lidos em 2026-10-23).
create table public._bkp_gr_exigido_20261015 (
  id uuid, operacao_id uuid, tipo public.tipo_documento_fiscal, exigido boolean, motivo_exigencia text, copiado_em timestamptz
);
alter table public._bkp_gr_exigido_20261015 enable row level security;
insert into public._bkp_gr_exigido_20261015 values
  ('c5da0cf3-78e0-4c6b-b5f8-09fe8c20308e', '150cbc5d-96a2-41a7-bf5b-4b112efad3cc', 'gr', true,
   'Pesquisa de gerenciamento de risco antes de toda carga', '2026-10-15 19:08:58.256939+00');
delete from supabase_migrations.schema_migrations where name = 'drop_bkp_gr_exigido';
