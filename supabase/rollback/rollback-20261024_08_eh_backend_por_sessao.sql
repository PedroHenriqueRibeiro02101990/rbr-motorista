-- Rollback de 20261024_08_eh_backend_por_sessao.sql
-- Volta à definição antiga (current_user). ATENÇÃO: dentro de SECURITY DEFINER essa versão dá TRUE para qualquer usuário
-- logado, e libera as portas de gestor listadas no cabeçalho da migration 08.
set local lock_timeout = '8s';

create or replace function public.eh_backend()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select current_user not in ('authenticated', 'anon');
$function$;

delete from supabase_migrations.schema_migrations where name = 'eh_backend_por_sessao';
