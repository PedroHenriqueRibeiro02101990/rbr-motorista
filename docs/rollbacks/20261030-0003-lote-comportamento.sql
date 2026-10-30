-- Rollback de supabase-migrations/20261030_03_lote_comportamento.sql. Aplicar em UMA transação.
-- Os valores novos dos enums (papel_pessoa e status_operacao) NÃO saem: o PostgreSQL não remove rótulo de enum. São inofensivos sem uso.
-- Antes de rodar, conferir que nenhuma pessoa foi cadastrada com papel novo e nenhuma operação está num status novo.

-- B12: devolve o encerramento automático do MDF-e.
create trigger trg_encerrar_mdfe_na_entrega after update of status on public.operacoes
  for each row execute function public.trg_fn_encerrar_mdfe_na_entrega();

-- C04
drop trigger if exists trg_ciot_troca_carreta on public.operacao_reboques;
drop function if exists public.trg_fn_ciot_troca_carreta();

-- A05
drop function if exists public.avancar_em_nome_do_motorista(uuid, text);

-- A06
drop trigger if exists trg_doc_versoes on public.documentacao_operacao;
drop function if exists public.trg_fn_doc_versoes();
drop table if exists public.documentacao_operacao_versoes;
alter table public.documentacao_operacao drop column if exists versao;

-- A02/A03
drop trigger if exists trg_doc_segregacao on public.documentacao_operacao;
drop function if exists public.trg_fn_doc_segregacao();
drop trigger if exists trg_zz_operacao_ator on public.operacoes;
drop function if exists public.trg_fn_operacao_ator();
alter table public.operacoes drop column if exists alocada_por, drop column if exists gerada_por;

-- Políticas aditivas
drop policy if exists cotacoes_carteira_comercial on public.cotacoes;
drop policy if exists cotacoes_select_funcoes on public.cotacoes;
drop policy if exists clientes_carteira_comercial on public.clientes;
drop policy if exists clientes_select_funcoes on public.clientes;
drop policy if exists faturas_select_financeiro on public.faturas;
drop policy if exists lancamentos_select_financeiro on public.lancamentos_financeiros;
drop policy if exists eventos_fiscais_select_funcoes on public.eventos_fiscais_operacao;
drop policy if exists docop_select_funcoes on public.documentacao_operacao;
drop policy if exists op_select_comercial on public.operacoes;
drop policy if exists op_select_funcoes on public.operacoes;
drop policy if exists trilha_auditoria_gestor_grava on public.trilha_auditoria;
drop function if exists public.cliente_na_minha_carteira(uuid);

-- A07
drop function if exists public.transferir_carteira(uuid, uuid, text);
drop trigger if exists trg_cliente_carteira on public.clientes;
drop function if exists public.trg_fn_cliente_carteira();
alter table public.clientes drop column if exists vendedor_id;

-- A01
drop function if exists public.tem_funcao(text);
drop table if exists public.funcoes_pessoa;
