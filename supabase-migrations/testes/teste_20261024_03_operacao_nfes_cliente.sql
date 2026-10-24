-- Teste da migration 20261024_03 (NF-e do cliente na operação: RLS, dígito verificador, duplicada, várias notas).
-- Roda inteiro dentro de um DO block que termina com raise exception 'TESTE_OK': TUDO é desfeito (rollback).
-- Rodar como postgres (SQL editor). Resultado esperado: ERROR "TESTE_OK" com os NOTICEs "ok: ...".
-- Simula o login pelo request.jwt.claims + role authenticated, como o Supabase faz.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); um uuid := gen_random_uuid();
  ag_a uuid; ag_b uuid; mot uuid; op_a uuid; op_b uuid; n int; dup text[];
  k1 text := '35261069115969000104550010000000011000000019';
  k2 text := '35261069115969000104550010000000021000000024';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'teste-ag-a-' || ua || '@rbr.invalid', 'authenticated', 'authenticated'),
    (ub, 'teste-ag-b-' || ub || '@rbr.invalid', 'authenticated', 'authenticated'),
    (um, 'teste-mot-' || um || '@rbr.invalid', 'authenticated', 'authenticated');
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ua, 'Agência A teste', 'agenciador', '52998224725') returning id into ag_a;
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ub, 'Agência B teste', 'agenciador', '39053344705') returning id into ag_b;
  insert into pessoas (auth_user_id, nome, papel, cpf) values (um, 'Motorista teste', 'motorista', '11144477735') returning id into mot;
  insert into operacoes (agenciador_id, pessoa_alocada_id) values (ag_a, mot) returning id into op_a;
  insert into operacoes (agenciador_id) values (ag_b) returning id into op_b;

  -- Várias notas na mesma operação
  insert into operacao_nfes (operacao_id, chave_acesso, numero, serie, valor, peso_kg, origem) values
    (op_a, k1, '1', '1', 1000, 500, 'digitada'),
    (op_a, k2, '2', '1', 2500, 700, 'digitada');
  select count(*) into n from operacao_nfes where operacao_id = op_a;
  if n <> 2 then raise exception 'esperava 2 notas na operação A, veio %', n; end if;
  raise notice 'ok: várias notas na mesma operação (2)';

  -- Chave inválida (dígito verificador errado) é recusada pelo banco
  begin
    insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_b, '35261069115969000104550010000000011000000018', 'digitada');
    raise exception 'chave com DV errado foi aceita';
  exception when check_violation then raise notice 'ok: chave com dígito verificador errado recusada';
  end;

  -- XML sem arquivo é recusado (origem xml exige o caminho no bucket)
  begin
    insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_b, k2, 'xml');
    raise exception 'origem xml sem arquivo foi aceita';
  exception when check_violation then raise notice 'ok: origem xml sem arquivo recusada';
  end;

  -- Mesma nota duas vezes na mesma operação: recusada
  begin
    insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_a, k1, 'digitada');
    raise exception 'nota repetida na mesma operação foi aceita';
  exception when unique_violation then raise notice 'ok: nota repetida na mesma operação recusada';
  end;

  -- Duplicada em OUTRA operação: aceita (só avisa), e a função aponta a chave
  insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_b, k1, 'digitada');

  -- RLS: agenciador B não vê as notas da operação do agenciador A
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from operacao_nfes where operacao_id = op_a;
  if n <> 0 then raise exception 'agenciador B viu % nota(s) da operação de A', n; end if;
  begin
    insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_a, '35261069115969000104550010000000031000000030', 'digitada');
    raise exception 'agenciador B gravou nota na operação de A';
  exception when insufficient_privilege then raise notice 'ok: agenciador B não grava na operação de A';
  end;
  select nfes_em_outra_operacao(op_b, array[k1]) into dup;
  if dup <> array[k1] then raise exception 'duplicada não apontada: %', dup; end if;
  raise notice 'ok: agenciador B não vê a operação de A e é avisado da NF duplicada (só a chave)';
  begin
    perform nfes_em_outra_operacao(op_a, array[k1]);
    raise exception 'agenciador B consultou duplicadas da operação de A';
  exception when raise_exception then
    if sqlerrm not like 'Sem permissão%' then raise; end if;
    raise notice 'ok: agenciador B não consulta a operação de A';
  end;

  -- Agenciador A vê as 2 notas dele
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select count(*) into n from operacao_nfes where operacao_id = op_a;
  if n <> 2 then raise exception 'agenciador A deveria ver 2 notas, viu %', n; end if;
  raise notice 'ok: agenciador A vê as notas da própria operação';

  -- Motorista alocado: lê, não grava
  perform set_config('request.jwt.claims', json_build_object('sub', um, 'role', 'authenticated')::text, true);
  select count(*) into n from operacao_nfes where operacao_id = op_a;
  if n <> 2 then raise exception 'motorista deveria ler 2 notas, leu %', n; end if;
  begin
    delete from operacao_nfes where operacao_id = op_a;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'motorista apagou % nota(s)', n; end if;
  end;
  raise notice 'ok: motorista lê as notas da operação dele e não apaga';

  -- anon não chega na tabela
  perform set_config('role', 'anon', true);
  begin
    perform 1 from operacao_nfes limit 1;
    raise exception 'anon leu operacao_nfes';
  exception when insufficient_privilege then raise notice 'ok: anon sem acesso';
  end;

  raise exception 'TESTE_OK';
end $$;
