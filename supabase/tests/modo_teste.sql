-- Testes do modo teste (migration 20261014_01_modo_teste.sql, revisão 2026-10-15).
-- Rodar numa branch do Supabase (schema real) ou num Postgres local descartável, DEPOIS da migration:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/modo_teste.sql
-- Tudo roda dentro de uma transação que termina em ROLLBACK: nada fica gravado.
-- Cada caso imprime "OK <n>" (NOTICE) ou para com "FALHOU <n>: ...".
-- Usuários simulados com "set local role authenticated" + request.jwt.claims (como o PostgREST faz).

\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------------------------------------------------
-- Fixtures (como postgres)
-- ---------------------------------------------------------------------------------------------------------
do $$
begin
  -- No Supabase real, pessoas.auth_user_id aponta para auth.users.
  if to_regclass('auth.users') is not null then
    execute $q$insert into auth.users (id, email) values
      ('7e570000-0000-0000-0000-00000000000a', 'gestor.teste@rbr.invalid'),
      ('7e570000-0000-0000-0000-00000000000b', 'agenciador.a@rbr.invalid'),
      ('7e570000-0000-0000-0000-00000000000c', 'agenciador.b@rbr.invalid'),
      ('7e570000-0000-0000-0000-00000000000d', 'motorista.teste@rbr.invalid')
      on conflict do nothing$q$;
  end if;
end $$;

insert into pessoas (id, auth_user_id, papel, nome, aprovacao_status) values
  ('7e571000-0000-0000-0000-00000000000a', '7e570000-0000-0000-0000-00000000000a', 'gestor_rbr', 'Gestor (teste)', 'aprovado'),
  ('7e571000-0000-0000-0000-00000000000b', '7e570000-0000-0000-0000-00000000000b', 'agenciador', 'Agenciador A (teste)', 'aprovado'),
  ('7e571000-0000-0000-0000-00000000000c', '7e570000-0000-0000-0000-00000000000c', 'agenciador', 'Agenciador B (teste)', 'aprovado'),
  ('7e571000-0000-0000-0000-00000000000d', '7e570000-0000-0000-0000-00000000000d', 'titular_motorista', 'Motorista (teste)', 'aprovado');

insert into clientes (id, cnpj, razao_social) values ('7e572000-0000-0000-0000-0000000000c1', '99887766000155', 'CLIENTE TERCEIRO (teste)');

-- Cotação real do gestor (frete 1.000, total 1.500, NF 900) com operação, condição de pagamento e um lançamento manual.
insert into cotacoes (id, origem, cliente_id, tomador_papel, nf_remetente_cnpj, nf_remetente_razao_social, nf_destinatario_cnpj,
                      nf_destinatario_razao_social, nf_destinatario_endereco, valor_nf, peso_bruto_kg, pedagio,
                      valor_frete_motorista, preco_modo, valor_total, cidade_origem, uf_origem, cidade_destino, uf_destino)
values ('7e573000-0000-0000-0000-0000000000a1', 'gestor', '7e572000-0000-0000-0000-0000000000c1', 'terceiro',
        '99887766000155', 'CLIENTE TERCEIRO (teste)', '99887766000155', 'CLIENTE TERCEIRO (teste)',
        '{"cep":"13000000","municipio":"Campinas","uf":"SP"}', 900, 1200, 35, 1000, 'valor_final', 1500,
        'São Paulo', 'SP', 'Campinas', 'SP');
insert into operacoes (id, cotacao_id, cliente_id, pessoa_alocada_id)
values ('7e574000-0000-0000-0000-0000000000b1', '7e573000-0000-0000-0000-0000000000a1', '7e572000-0000-0000-0000-0000000000c1',
        '7e571000-0000-0000-0000-00000000000d');
insert into condicoes_pagamento_operacao (operacao_id, origem, tipo, meio_pagamento, valor_total_contrato, valor_adiantamento, percentual_adiantamento)
values ('7e574000-0000-0000-0000-0000000000b1', 'rbr_direta', 'diferido', 'pix', 1000, 800, 0.8);
insert into lancamentos_financeiros (id, tipo, descricao, valor, data_vencimento, operacao_id, origem)
values ('7e575000-0000-0000-0000-0000000000d1', 'pagar', 'Despesa lançada à mão (teste)', 50, current_date + 5,
        '7e574000-0000-0000-0000-0000000000b1', 'manual');

-- Cotação de agenciador (dono = agenciador A).
insert into cotacoes (id, origem, agenciador_id, cliente_id, nf_remetente_cnpj, nf_destinatario_cnpj, valor_nf,
                      valor_frete_motorista, preco_modo, valor_total)
values ('7e573000-0000-0000-0000-0000000000a2', 'agenciador', '7e571000-0000-0000-0000-00000000000b',
        '7e572000-0000-0000-0000-0000000000c1', '99887766000155', '99887766000155', 900, 1000, 'valor_final', 1500);

create temp table _rbr as
  select regexp_replace(cnpj, '\D', '', 'g') as cnpj from parametros_fiscais where ativo order by updated_at desc limit 1;
grant select on _rbr to authenticated;
create temp table _lanc_antes as
  select origem_chave, valor, status from lancamentos_financeiros
   where operacao_id = '7e574000-0000-0000-0000-0000000000b1' and origem = 'operacao' and status <> 'cancelado';

-- ---------------------------------------------------------------------------------------------------------
-- 0) Helper: não-gestor dentro de SECURITY DEFINER não vira backend (A1/A6)
-- ---------------------------------------------------------------------------------------------------------
create function pg_temp.helper_dentro_de_definer() returns boolean language sql security definer
  as $$ select public.eh_gestor_ou_backend() $$;
grant execute on function pg_temp.helper_dentro_de_definer() to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ begin
  if public.eh_gestor_ou_backend() or pg_temp.helper_dentro_de_definer() then
    raise exception 'FALHOU 0a: motorista passou por gestor/backend';
  end if;
  raise notice 'OK 0a: motorista não é gestor nem backend (inclusive dentro de SECURITY DEFINER)';
end $$;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
do $$ begin
  if public.eh_gestor_ou_backend() is distinct from false then
    raise exception 'FALHOU 0b: usuário sem linha em pessoas devolveu % (esperado false, nunca NULL)', public.eh_gestor_ou_backend();
  end if;
  raise notice 'OK 0b: usuário sem linha em pessoas -> false (não NULL)';
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  if not public.eh_gestor_ou_backend() then raise exception 'FALHOU 0c: service_role não reconhecido'; end if;
  raise notice 'OK 0c: service_role é backend';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------------------------------------
-- 3) Agenciador dono tenta LIGAR: exceção (A1/A11)
-- ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    update cotacoes set eh_teste = true where id = '7e573000-0000-0000-0000-0000000000a2';
  exception when others then
    if sqlerrm = 'Só um gestor RBR liga ou desliga a operação de teste.' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 3a: agenciador ligou o teste'; end if;
  raise notice 'OK 3a: agenciador dono não liga o teste';
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- 1) Gestor liga o teste na cotação real
-- ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update cotacoes set eh_teste = true where id = '7e573000-0000-0000-0000-0000000000a1';
update cotacoes set eh_teste = true where id = '7e573000-0000-0000-0000-0000000000a2';
reset role;

do $$
declare c record; o record; cp record; v_rbr text := (select cnpj from _rbr); v_cli_rbr uuid;
begin
  select * into c from cotacoes where id = '7e573000-0000-0000-0000-0000000000a1';
  select * into o from operacoes where id = '7e574000-0000-0000-0000-0000000000b1';
  select * into cp from condicoes_pagamento_operacao where operacao_id = o.id;
  select id into v_cli_rbr from clientes where regexp_replace(coalesce(cnpj,''), '\D', '', 'g') = v_rbr and deleted_at is null
   order by created_at limit 1;
  if not c.eh_teste then raise exception 'FALHOU 1: eh_teste não ligou'; end if;
  if c.nf_remetente_cnpj <> v_rbr or c.nf_destinatario_cnpj <> v_rbr then raise exception 'FALHOU 1: remetente/destinatário não são a RBR'; end if;
  if v_cli_rbr is null or c.cliente_id <> v_cli_rbr then raise exception 'FALHOU 1: cliente RBR não criado/atribuído'; end if;
  if c.valor_nf <> 1 or c.valor_total <> 1 or c.valor_frete_motorista <> 1 or coalesce(c.pedagio, 0) <> 0 then
    raise exception 'FALHOU 1: valores (nf %, total %, frete motorista %, pedágio %)', c.valor_nf, c.valor_total, c.valor_frete_motorista, c.pedagio;
  end if;
  if c.dados_antes_teste is null or (c.dados_antes_teste->>'valor_total')::numeric <> 1500
     or (c.dados_antes_teste->>'valor_frete_motorista')::numeric <> 1000 then
    raise exception 'FALHOU 1: retrato dos dados originais não gravado: %', c.dados_antes_teste;
  end if;
  if not o.eh_teste or o.cliente_id <> v_cli_rbr or o.cliente_antes_teste <> '7e572000-0000-0000-0000-0000000000c1' then
    raise exception 'FALHOU 1: operação não espelhou (eh_teste %, cliente %, antes %)', o.eh_teste, o.cliente_id, o.cliente_antes_teste;
  end if;
  if cp.valor_total_contrato <> 1 or cp.valor_adiantamento <> 0.8 then
    raise exception 'FALHOU 1: condição de pagamento do motorista não foi para R$ 1,00 (total %, adiantamento %)', cp.valor_total_contrato, cp.valor_adiantamento;
  end if;
  if exists (select 1 from lancamentos_financeiros where operacao_id = o.id and origem = 'operacao' and status in ('previsto','aberto')) then
    raise exception 'FALHOU 1/A10: sobrou lançamento da operação no teste';
  end if;
  if not exists (select 1 from lancamentos_financeiros where id = '7e575000-0000-0000-0000-0000000000d1') then
    raise exception 'FALHOU 1/A10: o lançamento manual foi apagado';
  end if;
  raise notice 'OK 1: gestor ligou — RBR nos dois lados, cliente RBR, NF/frete/frete motorista R$ 1,00, pedágio 0, retrato gravado, operação e condição espelhadas, lançamento manual preservado';
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 3) Agenciador tenta DESLIGAR: exceção; outro agenciador nem enxerga a cotação; retrato não é editável
-- ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    update cotacoes set eh_teste = false where id = '7e573000-0000-0000-0000-0000000000a2';
  exception when others then
    if sqlerrm = 'Só um gestor RBR liga ou desliga a operação de teste.' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 3b: agenciador desligou o teste'; end if;
  raise notice 'OK 3b: agenciador dono não desliga o teste';
  update cotacoes set dados_antes_teste = '{"valor_total": 999999}' where id = '7e573000-0000-0000-0000-0000000000a2';
end $$;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$ declare n int; begin
  update cotacoes set eh_teste = false where id = '7e573000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU 3c: agenciador B alterou cotação de outro'; end if;
  raise notice 'OK 3c: agenciador B não alcança a cotação do agenciador A (RLS, 0 linhas)';
end $$;
reset role;
do $$ begin
  if (select (dados_antes_teste->>'valor_total')::numeric from cotacoes where id = '7e573000-0000-0000-0000-0000000000a2') <> 1500
     or not (select eh_teste from cotacoes where id = '7e573000-0000-0000-0000-0000000000a2') then
    raise exception 'FALHOU 3d: retrato editado pelo agenciador ou teste desligado';
  end if;
  raise notice 'OK 3d: retrato dos dados originais não é editável pelo agenciador';
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 4) Motorista alocado tenta mudar operacoes.eh_teste / cliente_antes_teste: revertido (A1/A5)
-- ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
update operacoes set eh_teste = false, cliente_antes_teste = '7e571000-0000-0000-0000-00000000000d'
 where id = '7e574000-0000-0000-0000-0000000000b1';
reset role;
do $$ declare o record; begin
  select * into o from operacoes where id = '7e574000-0000-0000-0000-0000000000b1';
  if not o.eh_teste or o.cliente_antes_teste <> '7e572000-0000-0000-0000-0000000000c1' then
    raise exception 'FALHOU 4: motorista mudou eh_teste/cliente_antes_teste (%, %)', o.eh_teste, o.cliente_antes_teste;
  end if;
  raise notice 'OK 4: alteração do motorista em eh_teste/cliente_antes_teste foi desfeita';
end $$;
-- pessoas.eh_teste: o motorista edita a própria linha (policy pessoa_edita_a_si_mesma), mas não o flag (A6).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    update pessoas set eh_teste = true where id = '7e571000-0000-0000-0000-00000000000d';
  exception when others then
    if sqlerrm = 'Só um gestor RBR marca cadastro de teste.' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 4b: motorista marcou o próprio cadastro como teste'; end if;
  raise notice 'OK 4b: motorista não marca cadastro de teste';
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- 5) Teste ligado: terceiro e valores acima de R$ 5 barram
-- ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare casos text[][] := array[
  ['nf_destinatario_cnpj = ''99887766000155''', 'Operação de teste: remetente e destinatário têm de ser a RBR%'],
  ['valor_nf = 6',                             'Operação de teste: valor da NF entre%'],
  ['valor_total = 6',                          'Operação de teste: frete em "valor final"%'],
  ['valor_frete_motorista = 6',                'Operação de teste: frete do motorista até R$ 5,00.']];
  i int; ok boolean;
begin
  for i in 1..array_length(casos, 1) loop
    ok := false;
    begin
      execute format('update cotacoes set %s where id = %L', casos[i][1], '7e573000-0000-0000-0000-0000000000a1');
    exception when others then
      if sqlerrm like casos[i][2] then ok := true; else raise; end if;
    end;
    if not ok then raise exception 'FALHOU 5: "%" passou com o teste ligado', casos[i][1]; end if;
    raise notice 'OK 5.%: % -> barrado', i, casos[i][1];
  end loop;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------
-- 6) trava_teste_fiscal (A2): sem erro de array, mensagens legíveis
-- ---------------------------------------------------------------------------------------------------------
insert into cotacoes (id, origem, cliente_id, nf_remetente_cnpj, nf_destinatario_cnpj, valor_nf, valor_frete_motorista, preco_modo, valor_total)
values ('7e573000-0000-0000-0000-0000000000a3', 'gestor', '7e572000-0000-0000-0000-0000000000c1', '99887766000155', '99887766000155', 900, 1000, 'valor_final', 1500);
insert into operacoes (id, cotacao_id, cliente_id) values ('7e574000-0000-0000-0000-0000000000b3', '7e573000-0000-0000-0000-0000000000a3', '7e572000-0000-0000-0000-0000000000c1');
do $$ declare t jsonb; begin
  t := trava_teste_fiscal('7e574000-0000-0000-0000-0000000000b3', 'cte');
  if t->>'teste' <> 'false' or jsonb_array_length(t->'bloqueios') <> 0 then raise exception 'FALHOU 6a: %', t; end if;
  raise notice 'OK 6a: cotação normal -> %', t;
  t := trava_teste_fiscal('7e574000-0000-0000-0000-0000000000b1', 'cte');
  if t->>'teste' <> 'true' or jsonb_array_length(t->'bloqueios') <> 0 then raise exception 'FALHOU 6b: %', t; end if;
  raise notice 'OK 6b: teste em ordem -> %', t;
end $$;
-- operação apontando para cliente terceiro (backend, como um ajuste manual) e valor acima de R$ 5 (trigger fora do ar)
update operacoes set cliente_id = '7e572000-0000-0000-0000-0000000000c1' where id = '7e574000-0000-0000-0000-0000000000b1';
set local session_replication_role = replica;
update cotacoes set valor_nf = 50, valor_total = 80 where id = '7e573000-0000-0000-0000-0000000000a1';
set local session_replication_role = origin;
do $$ declare t jsonb; begin
  t := trava_teste_fiscal('7e574000-0000-0000-0000-0000000000b1', 'cte');
  if not (t->'bloqueios' ? 'Trava do modo teste: o cliente/contratante da operação tem de ser a RBR.')
     or not (t->'bloqueios' ? 'Trava do modo teste: valor da NF tem de estar entre R$ 0,01 e R$ 5,00.')
     or not (t->'bloqueios' ? 'Trava do modo teste: frete do CT-e tem de estar entre R$ 0,01 e R$ 5,00.') then
    raise exception 'FALHOU 6c: %', t;
  end if;
  raise notice 'OK 6c: terceiro e valor > R$ 5 -> %', t->'bloqueios';
end $$;
set local session_replication_role = replica;
update cotacoes set valor_nf = 1, valor_total = 1 where id = '7e573000-0000-0000-0000-0000000000a1';
set local session_replication_role = origin;
update operacoes set cliente_id = (select cliente_id from cotacoes where id = '7e573000-0000-0000-0000-0000000000a1')
 where id = '7e574000-0000-0000-0000-0000000000b1';

-- ---------------------------------------------------------------------------------------------------------
-- 2) Gestor desliga: dados originais, cliente da operação e condição de pagamento voltam
-- ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update cotacoes set eh_teste = false where id = '7e573000-0000-0000-0000-0000000000a1';
reset role;
do $$ declare c record; o record; cp record; begin
  select * into c from cotacoes where id = '7e573000-0000-0000-0000-0000000000a1';
  select * into o from operacoes where id = '7e574000-0000-0000-0000-0000000000b1';
  select * into cp from condicoes_pagamento_operacao where operacao_id = o.id;
  if c.eh_teste or c.dados_antes_teste is not null then raise exception 'FALHOU 2: teste não desligou / retrato não limpo'; end if;
  if c.cliente_id <> '7e572000-0000-0000-0000-0000000000c1' or c.nf_remetente_cnpj <> '99887766000155'
     or c.nf_destinatario_cnpj <> '99887766000155' or c.tomador_papel <> 'terceiro'
     or c.valor_nf <> 900 or c.valor_total <> 1500 or c.pedagio <> 35 or c.valor_frete_motorista <> 1000
     or c.preco_modo <> 'valor_final' or c.peso_bruto_kg <> 1200 or c.nf_destinatario_endereco->>'cep' <> '13000000' then
    raise exception 'FALHOU 2: cotação não restaurada: cliente %, rem %, nf %, total %, pedágio %, frete mot %',
      c.cliente_id, c.nf_remetente_cnpj, c.valor_nf, c.valor_total, c.pedagio, c.valor_frete_motorista;
  end if;
  if o.eh_teste or o.cliente_id <> '7e572000-0000-0000-0000-0000000000c1' or o.cliente_antes_teste is not null then
    raise exception 'FALHOU 2: operação não restaurada (eh_teste %, cliente %)', o.eh_teste, o.cliente_id;
  end if;
  if cp.valor_total_contrato <> 1000 or cp.valor_adiantamento <> 800 then
    raise exception 'FALHOU 2: condição de pagamento não restaurada (%, %)', cp.valor_total_contrato, cp.valor_adiantamento;
  end if;
  raise notice 'OK 2: gestor desligou — cotação, cliente da operação e condição de pagamento restaurados';
end $$;

-- 8) Operação real de volta ao fluxo normal: lançamentos iguais aos de antes de ligar o teste.
do $$ declare n_diff int; begin
  select count(*) into n_diff from (
    (select origem_chave, valor, status from _lanc_antes
     except
     select origem_chave, valor, status from lancamentos_financeiros
      where operacao_id = '7e574000-0000-0000-0000-0000000000b1' and origem = 'operacao' and status <> 'cancelado')
    union all
    (select origem_chave, valor, status from lancamentos_financeiros
      where operacao_id = '7e574000-0000-0000-0000-0000000000b1' and origem = 'operacao' and status <> 'cancelado'
     except
     select origem_chave, valor, status from _lanc_antes)) d;
  if n_diff <> 0 or not exists (select 1 from _lanc_antes) then
    raise exception 'FALHOU 8: lançamentos da operação real diferem do que eram antes do teste (% diferenças)', n_diff;
  end if;
  raise notice 'OK 8: operação real recriou os mesmos lançamentos (% linhas)', (select count(*) from _lanc_antes);
end $$;

-- Desligar uma cotação marcada sem retrato (legado "[TESTE PRODUCAO"): não restaura e deixa aviso na auditoria.
set local session_replication_role = replica;
update cotacoes set eh_teste = true, dados_antes_teste = null where id = '7e573000-0000-0000-0000-0000000000a3';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update cotacoes set eh_teste = false where id = '7e573000-0000-0000-0000-0000000000a3';
reset role;
do $$ begin
  if not exists (select 1 from auditoria_log where entidade = 'cotacoes' and entidade_id = '7e573000-0000-0000-0000-0000000000a3'
                  and acao = 'modo_teste_desligado' and dado_depois->>'aviso' like 'Sem retrato%') then
    raise exception 'FALHOU 2b: desligar sem retrato não deixou aviso';
  end if;
  raise notice 'OK 2b: desligar sem retrato não restaura e deixa aviso na auditoria';
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 7) Documento fiscal emitido: ligar/desligar bloqueado
-- ---------------------------------------------------------------------------------------------------------
insert into documentacao_operacao (operacao_id, tipo, status, chave_acesso, referencia)
values ('7e574000-0000-0000-0000-0000000000b1', 'cte', 'emitido', '35261099887766000155570010000000011000000010', 'ref-teste')
on conflict (operacao_id, tipo) do update set status = 'emitido', chave_acesso = excluded.chave_acesso;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e570000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    update cotacoes set eh_teste = true where id = '7e573000-0000-0000-0000-0000000000a1';
  exception when others then
    if sqlerrm like 'Há documento fiscal emitido nesta cotação%' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 7: ligou com CT-e emitido'; end if;
  raise notice 'OK 7: com documento fiscal emitido, ligar/desligar é bloqueado';
end $$;
reset role;

do $$ begin raise notice 'modo_teste.sql: todos os casos passaram'; end $$;
rollback;
