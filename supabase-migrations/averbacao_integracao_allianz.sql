-- averbacao_integracao_allianz — JÁ APLICADA no banco real em 2026-10-16 (supabase_migrations.schema_migrations,
-- version 20261016032054). Conteúdo copiado de schema_migrations.statements; NÃO reaplicar.
-- Segunda integracao Averba (AT&M/NSTech): caixa postal 11486306 (Allianz, RCTR-C e RC-DC). A primeira (11486292) ficou ligada a Sompo.
create or replace function public.get_nstech_averba_senha_allianz()
returns text
language sql
security definer
set search_path to ''
as $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'nstech_averba_senha_integracao_allianz'
  limit 1;
$function$;

revoke all on function public.get_nstech_averba_senha_allianz() from public;
revoke all on function public.get_nstech_averba_senha_allianz() from anon;
revoke all on function public.get_nstech_averba_senha_allianz() from authenticated;
grant execute on function public.get_nstech_averba_senha_allianz() to service_role;

insert into public.integracao_averbacao
  (provedor, caixa_postal, codigo_atm, usuario_integracao, senha_integracao_vault_secret_id, ativo, observacoes)
select 'nstech_atm_allianz', '11486306', '11486306', 'WS_RBR_ALLIANZ',
       (select id from vault.secrets where name = 'nstech_averba_senha_integracao_allianz' limit 1),
       true,
       'Caixa 11486306: apolices Allianz (ramo 54 RCTR-C, ramo 55 RC-DC). Usada pela enviar-averbacao para o CT-e (RCTR-C). Criada em 2026-10-16.'
where not exists (select 1 from public.integracao_averbacao where provedor = 'nstech_atm_allianz');
