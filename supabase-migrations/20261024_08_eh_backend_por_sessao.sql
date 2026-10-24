-- 20261024_08 — eh_backend() lê a sessão (auth.role()) em vez de current_user.
-- Motivo: dentro de funções SECURITY DEFINER, current_user vira o dono (postgres), então a versão antiga dava TRUE para
-- qualquer usuário logado. Isso liberava as portas de gestor de publicar_termo, agenciador_suspender,
-- anexar_nota_parceiro, reter_para_apuracao, painel_conformidade e outras, além dos gatilhos de proteção de campos.
-- Com esta correção, pode_ver_operacao já não depende de eh_backend() para barrar quem não é da operação, então a
-- antiga migration 07 não é necessária.
-- JÁ APLICADO no ERP RBR (produção) pela ferramenta do Supabase. Esta migration só registra o mesmo corpo.
-- Rollback: supabase/rollback/rollback-20261024_08_eh_backend_por_sessao.sql
set local lock_timeout = '8s';

create or replace function public.eh_backend()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(auth.role(), '') not in ('authenticated', 'anon');
$function$;
