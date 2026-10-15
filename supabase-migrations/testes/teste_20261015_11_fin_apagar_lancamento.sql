-- Testes de fin_apagar_lancamento (migration 20261015_11). Transação com ROLLBACK.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase-migrations/testes/teste_20261015_11_fin_apagar_lancamento.sql

\set ON_ERROR_STOP 1
begin;

do $$ begin
  if to_regclass('auth.users') is not null then
    execute $q$insert into auth.users (id, email) values
      ('7e590000-0000-0000-0000-00000000000a', 'gestor.fin@rbr.invalid'),
      ('7e590000-0000-0000-0000-00000000000d', 'motorista.fin@rbr.invalid') on conflict do nothing$q$;
  end if;
end $$;
insert into pessoas (id, auth_user_id, papel, nome, aprovacao_status) values
  ('7e591000-0000-0000-0000-00000000000a', '7e590000-0000-0000-0000-00000000000a', 'gestor_rbr', 'Gestor (fin)', 'aprovado'),
  ('7e591000-0000-0000-0000-00000000000d', '7e590000-0000-0000-0000-00000000000d', 'titular_motorista', 'Motorista (fin)', 'aprovado');
insert into clientes (id, cnpj, razao_social) values ('7e592000-0000-0000-0000-0000000000c1', '99887766000244', 'CLIENTE FIN (teste)');

-- Operação real com lançamentos automáticos (frete a receber e motorista).
insert into cotacoes (id, origem, cliente_id, valor_frete_motorista, preco_modo, valor_total)
values ('7e593000-0000-0000-0000-0000000000a1', 'gestor', '7e592000-0000-0000-0000-0000000000c1', 1000, 'valor_final', 1500);
insert into operacoes (id, cotacao_id, cliente_id) values ('7e594000-0000-0000-0000-0000000000b1', '7e593000-0000-0000-0000-0000000000a1', '7e592000-0000-0000-0000-0000000000c1');

insert into lancamentos_financeiros (id, tipo, descricao, valor, data_vencimento, origem) values
  ('7e595000-0000-0000-0000-000000000001', 'pagar', 'Manual sem baixa (teste)', 10, current_date + 3, 'manual'),
  ('7e595000-0000-0000-0000-000000000002', 'pagar', 'Manual com baixa (teste)', 20, current_date + 3, 'manual'),
  ('7e595000-0000-0000-0000-000000000003', 'receber', 'Na fatura aberta (teste)', 30, current_date + 3, 'manual'),
  ('7e595000-0000-0000-0000-000000000004', 'receber', 'Na fatura paga (teste)', 40, current_date + 3, 'manual');
insert into lancamentos_financeiros (id, tipo, descricao, valor, data_vencimento, origem, origem_chave) values
  ('7e595000-0000-0000-0000-000000000005', 'pagar', 'Aluguel — recorrência (teste)', 50, current_date + 3, 'recorrencia', 'rec:teste-apagar:2026-11-10');
insert into faturas (id, cliente_id, valor_total, data_vencimento, status) values
  ('7e596000-0000-0000-0000-0000000000f1', '7e592000-0000-0000-0000-0000000000c1', 30, current_date + 3, 'aguardando_pagamento'),
  ('7e596000-0000-0000-0000-0000000000f2', '7e592000-0000-0000-0000-0000000000c1', 40, current_date + 3, 'pago');
update lancamentos_financeiros set fatura_id = '7e596000-0000-0000-0000-0000000000f1' where id = '7e595000-0000-0000-0000-000000000003';
update lancamentos_financeiros set fatura_id = '7e596000-0000-0000-0000-0000000000f2' where id = '7e595000-0000-0000-0000-000000000004';
update faturas set status = 'pago' where id = '7e596000-0000-0000-0000-0000000000f2';
insert into baixas_financeiras (lancamento_id, valor) values ('7e595000-0000-0000-0000-000000000002', 20);

-- 1) Motorista não apaga.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e590000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin perform fin_apagar_lancamento('7e595000-0000-0000-0000-000000000001', 'tentativa do motorista');
  exception when others then if sqlerrm = 'Só o gestor RBR acessa o financeiro.' then ok := true; else raise; end if; end;
  if not ok then raise exception 'FALHOU 1'; end if;
  raise notice 'OK 1: só gestor apaga';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e590000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 2) Motivo obrigatório.
do $$ declare ok boolean := false; begin
  begin perform fin_apagar_lancamento('7e595000-0000-0000-0000-000000000001', '  ');
  exception when others then if sqlerrm = 'Informe o motivo para apagar o lançamento.' then ok := true; else raise; end if; end;
  if not ok then raise exception 'FALHOU 2'; end if;
  raise notice 'OK 2: motivo obrigatório';
end $$;

-- 3) Manual, sem baixa, sem chave: DELETE de verdade + auditoria com o registro completo.
do $$ declare r jsonb; a record; begin
  r := fin_apagar_lancamento('7e595000-0000-0000-0000-000000000001', 'Lançado em duplicidade');
  if r->>'resultado' <> 'apagado' or exists (select 1 from lancamentos_financeiros where id = '7e595000-0000-0000-0000-000000000001') then
    raise exception 'FALHOU 3: %', r;
  end if;
  select * into a from auditoria_log where entidade_id = '7e595000-0000-0000-0000-000000000001' and acao = 'lancamento_apagado';
  if a.dado_antes->>'descricao' <> 'Manual sem baixa (teste)' or a.dado_depois->>'motivo' <> 'Lançado em duplicidade'
     or a.dado_depois->>'resultado' <> 'apagado' then
    raise exception 'FALHOU 3: auditoria %', to_jsonb(a);
  end if;
  raise notice 'OK 3: manual sem baixa -> apagado (%), auditoria com dado_antes completo', r->>'mensagem';
end $$;

-- 4) Origem operação: cancela "Apagado manualmente" e a sincronização não recria.
do $$ declare v_id uuid; r jsonb; n int; begin
  select id into v_id from lancamentos_financeiros where operacao_id = '7e594000-0000-0000-0000-0000000000b1' and tipo = 'receber' limit 1;
  if v_id is null then raise exception 'FALHOU 4: fixture sem lançamento da operação'; end if;
  r := fin_apagar_lancamento(v_id, 'Cliente pagou direto ao motorista');
  if r->>'resultado' <> 'cancelado' then raise exception 'FALHOU 4: %', r; end if;
  perform fin_sincronizar_operacao_interno('7e594000-0000-0000-0000-0000000000b1');
  select count(*) into n from lancamentos_financeiros
   where operacao_id = '7e594000-0000-0000-0000-0000000000b1' and tipo = 'receber' and status <> 'cancelado';
  if n <> 0 or (select cancelado_motivo from lancamentos_financeiros where id = v_id) <> 'Apagado manualmente: Cliente pagou direto ao motorista' then
    raise exception 'FALHOU 4: sincronização recriou (% ativos)', n;
  end if;
  raise notice 'OK 4: origem operação -> cancelado (%), sincronização não recria', r->>'mensagem';
end $$;

-- 5) Recorrência (tem origem_chave): cancela; a geração ("on conflict do nothing") não recria.
do $$ declare r jsonb; n int; begin
  r := fin_apagar_lancamento('7e595000-0000-0000-0000-000000000005', 'Contrato de aluguel encerrado');
  if r->>'resultado' <> 'cancelado' then raise exception 'FALHOU 5: %', r; end if;
  insert into lancamentos_financeiros (tipo, descricao, valor, data_vencimento, origem, origem_chave)
  values ('pagar', 'Aluguel — recorrência (teste)', 50, current_date + 3, 'recorrencia', 'rec:teste-apagar:2026-11-10')
  on conflict (origem_chave) do nothing;
  select count(*) into n from lancamentos_financeiros where origem_chave = 'rec:teste-apagar:2026-11-10' and status <> 'cancelado';
  if n <> 0 then raise exception 'FALHOU 5: recorrência recriada'; end if;
  raise notice 'OK 5: recorrência -> cancelado e não volta na geração';
end $$;

-- 6) Com baixa: recusa; com "estornar baixa(s) e apagar": estorna e cancela.
do $$ declare ok boolean := false; r jsonb; l record; begin
  begin perform fin_apagar_lancamento('7e595000-0000-0000-0000-000000000002', 'Pagamento foi para o lançamento errado');
  exception when others then if sqlerrm like 'Este lançamento tem 1 pagamento(s) registrado(s)%' then ok := true; else raise; end if; end;
  if not ok then raise exception 'FALHOU 6a'; end if;
  r := fin_apagar_lancamento('7e595000-0000-0000-0000-000000000002', 'Pagamento foi para o lançamento errado', true);
  select * into l from lancamentos_financeiros where id = '7e595000-0000-0000-0000-000000000002';
  if r->>'resultado' <> 'cancelado' or (r->>'baixas_estornadas')::int <> 1 or l.status <> 'cancelado' or l.valor_pago <> 0
     or exists (select 1 from baixas_financeiras where lancamento_id = l.id and not estornada) then
    raise exception 'FALHOU 6b: % / %', r, to_jsonb(l);
  end if;
  raise notice 'OK 6: com baixa recusa; estornar e apagar -> baixa estornada e lançamento cancelado';
end $$;

-- 7) Em fatura aberta: sai da fatura (total recalculado). Em fatura paga: recusa.
do $$ declare r jsonb; ok boolean := false; begin
  r := fin_apagar_lancamento('7e595000-0000-0000-0000-000000000003', 'Cobrado em outra fatura');
  if r->>'resultado' <> 'apagado' or (select valor_total from faturas where id = '7e596000-0000-0000-0000-0000000000f1') <> 0 then
    raise exception 'FALHOU 7a: % total %', r, (select valor_total from faturas where id = '7e596000-0000-0000-0000-0000000000f1');
  end if;
  begin perform fin_apagar_lancamento('7e595000-0000-0000-0000-000000000004', 'Tentando apagar da fatura paga');
  exception when others then if sqlerrm like 'Este lançamento está na fatura nº % já paga%' then ok := true; else raise; end if; end;
  if not ok then raise exception 'FALHOU 7b'; end if;
  raise notice 'OK 7: fatura aberta -> sai da fatura e total recalculado; fatura paga -> recusa';
end $$;
reset role;

do $$ begin raise notice 'teste_20261015_11: todos os casos passaram'; end $$;
rollback;
