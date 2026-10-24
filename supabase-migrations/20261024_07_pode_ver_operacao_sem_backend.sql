-- 20261024_07 — pode_ver_operacao sem eh_backend().
-- eh_backend() é current_user not in ('authenticated', 'anon'). Dentro de SECURITY DEFINER o current_user vira o dono
-- (postgres), então eh_backend() dava TRUE para qualquer chamador e a função liberava qualquer operação.
-- Só a checagem muda: sai "or eh_backend()". O resto do corpo fica igual (gestor_rbr ou pessoa ligada à operação:
-- agenciador, alocada ou titular). create or replace mantém o owner e os grants já existentes.
-- Desde 20261024_05, nenhuma função chama pode_ver_operacao; ela continua disponível só para service_role (20261011_13).
-- Rollback: supabase/rollback/rollback-20261024_07_pode_ver_operacao_sem_backend.sql
set local lock_timeout = '8s';

create or replace function public.pode_ver_operacao(p_operacao uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_papel()::text, '') = 'gestor_rbr'
      or (current_pessoa_id() is not null and exists (
            select 1 from operacoes o
             where o.id = p_operacao
               and current_pessoa_id() in (o.agenciador_id, o.pessoa_alocada_id, titular_da_operacao(o.id))))
$$;
