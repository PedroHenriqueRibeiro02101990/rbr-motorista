-- Testes da liberação com ressalva (migration 20261015_02; depende de 20261014_01).
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/liberacao_com_ressalva.sql
-- Transação com ROLLBACK no fim. Imprime "OK <n>" ou para com "FALHOU <n>".

\set ON_ERROR_STOP 1
begin;

do $$ begin
  if to_regclass('auth.users') is not null then
    execute $q$insert into auth.users (id, email) values
      ('7e580000-0000-0000-0000-00000000000a', 'gestor.lib@rbr.invalid'),
      ('7e580000-0000-0000-0000-00000000000d', 'motorista.lib@rbr.invalid') on conflict do nothing$q$;
  end if;
end $$;
insert into pessoas (id, auth_user_id, papel, nome, aprovacao_status) values
  ('7e581000-0000-0000-0000-00000000000a', '7e580000-0000-0000-0000-00000000000a', 'gestor_rbr', 'Gestor (lib)', 'aprovado'),
  ('7e581000-0000-0000-0000-00000000000d', '7e580000-0000-0000-0000-00000000000d', 'titular_motorista', 'Motorista (lib)', 'aprovado');
insert into veiculos (id, titular_id, placa, renavam, tipo_veiculo)
values ('7e582000-0000-0000-0000-0000000000e1', '7e581000-0000-0000-0000-00000000000d', 'TST0L01', '99999999901', 'Truck');
insert into cotacoes (id, origem, valor_frete_motorista, preco_modo, valor_total)
values ('7e583000-0000-0000-0000-0000000000a1', 'gestor', 1000, 'valor_final', 1500);
insert into operacoes (id, cotacao_id) values ('7e584000-0000-0000-0000-0000000000b1', '7e583000-0000-0000-0000-0000000000a1');
update operacoes set veiculo_id = '7e582000-0000-0000-0000-0000000000e1', pessoa_alocada_id = '7e581000-0000-0000-0000-00000000000d'
 where id = '7e584000-0000-0000-0000-0000000000b1';
-- Cenário controlado: só CT-e (emitido, não conferido) e MDF-e (exigido, conferido); sem condição de pagamento.
delete from documentacao_operacao where operacao_id = '7e584000-0000-0000-0000-0000000000b1';
delete from condicoes_pagamento_operacao where operacao_id = '7e584000-0000-0000-0000-0000000000b1';
insert into documentacao_operacao (operacao_id, tipo, status, exigido, chave_acesso, conferencia_status) values
  ('7e584000-0000-0000-0000-0000000000b1', 'cte', 'emitido', true, '35261000000000000000570010000000011000000010', 'nao_conferido'),
  ('7e584000-0000-0000-0000-0000000000b1', 'mdfe', 'emitido', true, '35261000000000000000580010000000011000000010', 'ok');

do $$ begin
  if (select status from operacoes where id = '7e584000-0000-0000-0000-0000000000b1') <> 'aguardando_liberacao_fiscal' then
    raise exception 'FALHOU 0: fixture não ficou aguardando liberação';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e580000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 1) Sem ressalva continua bloqueando como hoje.
do $$ declare ok boolean := false; begin
  begin
    update operacoes set status = 'liberada_coleta' where id = '7e584000-0000-0000-0000-0000000000b1';
  exception when others then
    if sqlerrm = 'Documentos ainda não conferidos: CT-e.' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 1: liberou sem ressalva'; end if;
  raise notice 'OK 1: sem ressalva, documento não conferido continua bloqueando';
end $$;

-- 2) Motivo curto: recusa.
do $$ declare ok boolean := false; begin
  begin
    perform liberar_operacao_com_ressalva('7e584000-0000-0000-0000-0000000000b1', 'curto');
  exception when others then
    if sqlerrm like 'Informe o motivo para seguir mesmo assim%' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 2: aceitou motivo curto'; end if;
  raise notice 'OK 2: motivo obrigatório (mínimo 10 caracteres)';
end $$;
reset role;

-- 3) Motorista não usa a ressalva.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e580000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    perform liberar_operacao_com_ressalva('7e584000-0000-0000-0000-0000000000b1', 'motivo qualquer do motorista');
  exception when others then
    if sqlerrm = 'Só um gestor RBR libera com ressalva.' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 3: motorista liberou com ressalva'; end if;
  raise notice 'OK 3: só gestor libera com ressalva';
end $$;
reset role;

-- 4) Documento exigido que nem existe: ressalva não resolve (exigência fiscal/ANTT).
insert into documentacao_operacao (operacao_id, tipo, status, exigido) values ('7e584000-0000-0000-0000-0000000000b1', 'ciot', 'pendente', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e580000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    perform liberar_operacao_com_ressalva('7e584000-0000-0000-0000-0000000000b1', 'Cliente confirmou por telefone, segue');
  exception when others then
    if sqlerrm like 'Documentos exigidos que ainda não existem%CIOT%' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 4: liberou sem o CIOT existir'; end if;
  raise notice 'OK 4: documento inexistente continua bloqueando mesmo com ressalva';
end $$;
reset role;
delete from documentacao_operacao where operacao_id = '7e584000-0000-0000-0000-0000000000b1' and tipo = 'ciot';

-- 5) CT-e emitido não conferido + sem condição de pagamento: libera com ressalva e grava auditoria.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e580000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select liberar_operacao_com_ressalva('7e584000-0000-0000-0000-0000000000b1', 'Conferência do CT-e fica para amanhã cedo');
reset role;
do $$ declare a record; o record; begin
  select * into o from operacoes where id = '7e584000-0000-0000-0000-0000000000b1';
  select * into a from auditoria_log where entidade_id = o.id and acao = 'liberacao_com_ressalva' order by id desc limit 1;
  if o.status <> 'liberada_coleta' or o.liberada_por <> '7e581000-0000-0000-0000-00000000000a' then
    raise exception 'FALHOU 5: não liberou (status %, por %)', o.status, o.liberada_por;
  end if;
  if a.id is null or a.dado_depois->>'motivo' <> 'Conferência do CT-e fica para amanhã cedo'
     or a.dado_depois->>'documentos_nao_conferidos' <> 'CT-e' or (a.dado_depois->>'sem_condicao_pagamento')::boolean is not true
     or a.pessoa_id_ator <> '7e581000-0000-0000-0000-00000000000a' then
    raise exception 'FALHOU 5: auditoria incompleta: %', to_jsonb(a);
  end if;
  if coalesce(current_setting('rbr.liberacao_ressalva', true), '') <> '' then
    raise exception 'FALHOU 5: motivo da ressalva vazou para fora da RPC';
  end if;
  raise notice 'OK 5: liberou com ressalva e gravou motivo, pendências e autor na auditoria';
end $$;

-- 6) Bloqueio fiscal manual continua bloqueando mesmo com ressalva.
update operacoes set status = 'aguardando_liberacao_fiscal', bloqueio_fiscal = true, bloqueio_fiscal_motivo = 'teste'
 where id = '7e584000-0000-0000-0000-0000000000b1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e580000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ declare ok boolean := false; begin
  begin
    perform liberar_operacao_com_ressalva('7e584000-0000-0000-0000-0000000000b1', 'Quero seguir mesmo com bloqueio fiscal');
  exception when others then
    if sqlerrm like 'Operação com bloqueio fiscal ativo%' then ok := true; else raise; end if;
  end;
  if not ok then raise exception 'FALHOU 6: ressalva passou por cima do bloqueio fiscal'; end if;
  raise notice 'OK 6: bloqueio fiscal continua bloqueando';
end $$;
reset role;

do $$ begin raise notice 'liberacao_com_ressalva.sql: todos os casos passaram'; end $$;
rollback;
