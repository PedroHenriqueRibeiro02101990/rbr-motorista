-- Rollback de 20261023_01: recria o check sem 'comprovante_residencia'.
-- NOT VALID: se já houver linhas desse tipo, o check vale para as novas sem reprovar as antigas. Para validar de vez,
-- inative/apague essas linhas e rode: alter table public.documentos_pessoais_imagens validate constraint documentos_pessoais_imagens_tipo_check;
set local lock_timeout = '8s';
alter table public.documentos_pessoais_imagens drop constraint documentos_pessoais_imagens_tipo_check;
alter table public.documentos_pessoais_imagens add constraint documentos_pessoais_imagens_tipo_check
  check (tipo = any (array['cnh'::text, 'crlv'::text, 'rg'::text, 'cartao_cnpj'::text])) not valid;
delete from supabase_migrations.schema_migrations where name = 'documentos_tipo_comprovante_residencia';
