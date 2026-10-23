-- 20261023_01 — documentos_pessoais_imagens aceita o tipo 'comprovante_residencia'.
-- Antes: CHECK (tipo = ANY (ARRAY['cnh','crlv','rg','cartao_cnpj'])). RLS, gatilhos e colunas iguais.
-- Rollback: supabase/rollback/rollback-20261023_01_documentos_tipo_comprovante_residencia.sql
set local lock_timeout = '8s';
alter table public.documentos_pessoais_imagens drop constraint documentos_pessoais_imagens_tipo_check;
alter table public.documentos_pessoais_imagens add constraint documentos_pessoais_imagens_tipo_check
  check (tipo = any (array['cnh'::text, 'crlv'::text, 'rg'::text, 'cartao_cnpj'::text, 'comprovante_residencia'::text]));
