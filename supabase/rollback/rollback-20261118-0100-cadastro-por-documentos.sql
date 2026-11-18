-- Desfaz 20261118-0100-cadastro-por-documentos.sql (so objetos novos; nenhum dado antigo foi alterado por ele).
drop function if exists public.confirmar_cadastro_por_documentos(jsonb);
drop table if exists public.cadastro_auditoria;
drop policy if exists cadastro_documentos_gestor on storage.objects;
-- O bucket 'cadastro-documentos' so deve ser apagado se estiver vazio (pelo painel do Supabase).
alter table public.veiculos drop column if exists carreta_padrao_id, drop column if exists crlv_extracao_id, drop column if exists tipo_crlv,
  drop column if exists pbt_kg, drop column if exists cmt_kg, drop column if exists chassi_crlv, drop column if exists proprietario_documento,
  drop column if exists tara_origem;
alter table public.pessoas drop column if exists documento_origem, drop column if exists cnh_extracao_id;
