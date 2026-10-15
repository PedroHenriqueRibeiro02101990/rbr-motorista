-- ROLLBACK de 20261015_03_revoga_funcoes_modo_teste
-- Devolve o EXECUTE que o default privileges dá a toda função nova (anon e authenticated). Só faz sentido se a
-- 20261014_01 continuar aplicada; se ela também for desfeita, as funções somem e este passo não é necessário.

begin;
grant execute on function public.cotacao_tem_documento_fiscal(uuid) to anon, authenticated;
grant execute on function public.trg_fn_cotacao_modo_teste() to anon, authenticated;
grant execute on function public.trg_fn_cotacao_modo_teste_pos() to anon, authenticated;
grant execute on function public.trg_fn_operacao_herda_teste() to anon, authenticated;
grant execute on function public.trg_fn_doc_teste_auditoria() to anon, authenticated;
delete from supabase_migrations.schema_migrations where name = '20261015_03_revoga_funcoes_modo_teste';
commit;
