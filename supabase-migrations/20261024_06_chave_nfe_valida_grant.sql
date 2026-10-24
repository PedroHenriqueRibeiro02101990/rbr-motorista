-- 20261024_06 — grant de execute em chave_nfe_valida para authenticated.
-- Motivo: operacao_nfes tem a CHECK operacao_nfes_chave_dv (20261024_03) que chama chave_nfe_valida. A CHECK roda com o
-- privilégio de quem grava (agenciador, gestor, motorista), e sem este grant o insert de nota falha com permissão negada.
-- Antes disso a função estava sem EXECUTE para authenticated por causa do REVOKE de 20261011_13 (restrição geral das
-- funções novas). Esse REVOKE NÃO é alterado aqui; este grant reverte só o efeito dele nesta função.
-- Esta versão foi aplicada manualmente no banco; esta migration registra o mesmo comando.
-- Rollback: supabase/rollback/rollback-20261024_06_chave_nfe_valida_grant.sql
set local lock_timeout = '8s';

grant execute on function public.chave_nfe_valida(text) to authenticated;
