-- Rollback de 20261024_07_pode_ver_operacao_sem_backend.sql
-- Volta à versão de 20261011_13 (com or eh_backend()). ATENÇÃO: essa versão libera qualquer operação para quem chama
-- dentro de SECURITY DEFINER (ver o cabeçalho da migration).
set local lock_timeout = '8s';

create or replace function public.pode_ver_operacao(p_operacao uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_papel()::text, '') = 'gestor_rbr'
      or eh_backend()
      or (current_pessoa_id() is not null and exists (
            select 1 from operacoes o
             where o.id = p_operacao
               and current_pessoa_id() in (o.agenciador_id, o.pessoa_alocada_id, titular_da_operacao(o.id))))
$$;

delete from supabase_migrations.schema_migrations where name = 'pode_ver_operacao_sem_backend';
