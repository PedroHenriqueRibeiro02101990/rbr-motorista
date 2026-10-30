-- Rollback de 20261030_10_devolucao_fiscal.sql
-- Antes: devolver para aguardando_liberacao_fiscal qualquer operacao em devolvida_pelo_fiscal.
update public.operacoes set status = 'aguardando_liberacao_fiscal' where status = 'devolvida_pelo_fiscal';
drop function if exists public.devolver_pelo_fiscal(uuid, text, text, text);
