-- Testes da migracao 20261119-1000 (dados bancarios so se vazio; PDF manual de CIOT/VPO pendente ate ter numero). Depende de 20261118-0200, 20261119-0900 e 20261119-1000.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/banco_e_status_documento_manual.sql
-- Transacao com ROLLBACK no fim. Dados sinteticos.

\set ON_ERROR_STOP 1
begin;

do $$ begin
  if to_regclass('auth.users') is not null then
    execute $q$insert into auth.users (id, email) values ('7e5a0000-0000-0000-0000-00000000000a', 'gestor.banco@rbr.invalid') on conflict do nothing$q$;
  end if;
end $$;
insert into pessoas (id, auth_user_id, papel, nome, aprovacao_status) values ('7e5a1000-0000-0000-0000-00000000000a', '7e5a0000-0000-0000-0000-00000000000a', 'gestor_rbr', 'Gestor (banco)', 'aprovado');
insert into pessoas (id, papel, nome, cpf) values ('7e5a1000-0000-0000-0000-0000000000b1', 'titular_motorista', 'Sem Banco (teste)', '52998224725');
insert into pessoas (id, papel, nome, cpf, pix) values ('7e5a1000-0000-0000-0000-0000000000b2', 'titular_motorista', 'Com Pix (teste)', '11144477735', 'chave-antiga');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e5a0000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- BANCO 1: pessoa sem banco/pix -> grava
select set_config('t.b1', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'motorista', jsonb_build_object('nome', 'Sem Banco (teste)', 'cpf', '52998224725'),
  'banco', jsonb_build_object('banco_codigo', '001', 'agencia', '1234', 'conta', '99999-0', 'tipo_conta', 'corrente', 'pix', 'novo@teste.invalid')))::text, true);
do $$ begin
  if not exists (select 1 from pessoas where id = '7e5a1000-0000-0000-0000-0000000000b1' and banco_codigo = '001' and banco_agencia = '1234' and banco_conta = '99999-0' and banco_tipo_conta = 'corrente' and pix = 'novo@teste.invalid') then raise exception 'FALHOU B1: nao gravou o banco da pessoa sem banco'; end if;
  if jsonb_array_length(current_setting('t.b1')::jsonb->'avisos') <> 0 then raise exception 'FALHOU B1b: avisou sem precisar'; end if;
  raise notice 'OK B1';
end $$;

-- BANCO 2: pessoa que ja tem PIX -> NAO sobrescreve, avisa
select set_config('t.b2', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'motorista', jsonb_build_object('nome', 'Com Pix (teste)', 'cpf', '11144477735'),
  'banco', jsonb_build_object('banco_codigo', '237', 'agencia', '1', 'conta', '2', 'pix', 'outra-chave')))::text, true);
do $$ begin
  if (select pix from pessoas where id = '7e5a1000-0000-0000-0000-0000000000b2') <> 'chave-antiga' then raise exception 'FALHOU B2: sobrescreveu o PIX existente'; end if;
  if (select banco_codigo from pessoas where id = '7e5a1000-0000-0000-0000-0000000000b2') is not null then raise exception 'FALHOU B2b: gravou parte do banco'; end if;
  if jsonb_array_length(current_setting('t.b2')::jsonb->'avisos') <> 1 then raise exception 'FALHOU B2c: sem aviso'; end if;
  raise notice 'OK B2';
end $$;

-- STATUS: PDF de CIOT/VPO subido a mao fica pendente e so vira emitido quando o numero e confirmado
reset role;
insert into cotacoes (id, origem, valor_frete_motorista, preco_modo, valor_total) values ('7e5a3000-0000-0000-0000-0000000000a1', 'gestor', 1000, 'valor_final', 1500);
insert into operacoes (id, cotacao_id) values ('7e5a4000-0000-0000-0000-0000000000b1', '7e5a3000-0000-0000-0000-0000000000a1');
delete from documentacao_operacao where operacao_id = '7e5a4000-0000-0000-0000-0000000000b1';
insert into documentacao_operacao (operacao_id, tipo, status) values ('7e5a4000-0000-0000-0000-0000000000b1', 'ciot', 'pendente'), ('7e5a4000-0000-0000-0000-0000000000b1', 'vpo', 'pendente');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e5a0000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
-- sem numero: continua pendente
select public.confirmar_ciot_vpo_manual('7e5a4000-0000-0000-0000-0000000000b1', jsonb_build_object('vpo_valor', 100));
do $$ begin
  if exists (select 1 from documentacao_operacao where operacao_id = '7e5a4000-0000-0000-0000-0000000000b1' and status <> 'pendente') then raise exception 'FALHOU S1: virou emitido sem numero'; end if;
  raise notice 'OK S1';
end $$;
-- com CIOT: so o documento ciot vira emitido; com IDVPO: o vpo
select public.confirmar_ciot_vpo_manual('7e5a4000-0000-0000-0000-0000000000b1', jsonb_build_object('ciot', '123456789012'));
do $$ begin
  if (select status from documentacao_operacao where operacao_id = '7e5a4000-0000-0000-0000-0000000000b1' and tipo = 'ciot') <> 'emitido' then raise exception 'FALHOU S2: ciot nao virou emitido'; end if;
  if (select status from documentacao_operacao where operacao_id = '7e5a4000-0000-0000-0000-0000000000b1' and tipo = 'vpo') <> 'pendente' then raise exception 'FALHOU S2b: vpo mudou sem IDVPO'; end if;
  raise notice 'OK S2';
end $$;
select public.confirmar_ciot_vpo_manual('7e5a4000-0000-0000-0000-0000000000b1', jsonb_build_object('vpo_idvpo', 'IDVPO-TESTE'));
do $$ begin
  if (select status from documentacao_operacao where operacao_id = '7e5a4000-0000-0000-0000-0000000000b1' and tipo = 'vpo') <> 'emitido' then raise exception 'FALHOU S3: vpo nao virou emitido'; end if;
  raise notice 'OK S3';
end $$;

rollback;
