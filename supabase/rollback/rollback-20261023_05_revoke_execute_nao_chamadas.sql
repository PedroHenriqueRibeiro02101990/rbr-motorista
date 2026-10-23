-- Rollback da proposta 20261023_05: devolve o EXECUTE como estava em 23/10/2026.
grant execute on function public.sincronizar_financeiro_operacao(uuid) to authenticated;
grant execute on function public.trg_fn_interacao_primeiro_contato() to public;
