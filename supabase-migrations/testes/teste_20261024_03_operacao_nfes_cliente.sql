-- Teste da migration 20261024_03 (NF-e do cliente na operação: RLS, dígito verificador, duplicada, várias notas).
-- Roda inteiro dentro de um DO block que termina com raise exception 'TESTE_OK': TUDO é desfeito (rollback),
-- inclusive os usuários de teste criados em auth.users, as pessoas, as operações e o objeto no bucket.
-- Simula o login pelo request.jwt.claims + role authenticated, como o Supabase faz.
--
-- Pré-condições (hoje verdadeiras): nenhum termo de prestador publicado e contrato do agenciador fora de vigor. Se um
-- termo for publicado, a alocação do motorista de teste exige o aceite e o teste para com essa mensagem.
--
-- COMO RODAR (Pedro, no SQL Editor do Supabase, projeto ERP RBR)
--   1. Cole o arquivo inteiro e rode de uma vez (Run). Não rode trechos soltos: fora do DO block nada é desfeito.
--   2. Resultado esperado: ERROR "TESTE_OK" (é assim que o rollback acontece). Na aba de mensagens aparecem as
--      linhas "ok: ..." (12, mais 3 do bucket; ou, no lugar destas 3, um "aviso" de que o bucket foi pulado).
--   3. Qualquer outro ERROR = o teste falhou; a mensagem diz qual regra não se comportou. Também é desfeito.
--   4. Limpeza: não precisa apagar nada (o rollback desfaz). Para conferir, rode a consulta do fim do arquivo
--      (fica comentada): ela deve voltar 0. Se voltar mais que 0, rode o delete que está logo abaixo dela.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); um uuid := gen_random_uuid(); ug uuid := gen_random_uuid();
  ag_a uuid; ag_b uuid; mot uuid; op_a uuid; op_b uuid; n int; dup text[]; com_bucket boolean := true;
  cpfs text[] := '{}'; base text; d1 int; d2 int;
  k1 text := '35261069115969000104550010000000011000000019';
  k2 text := '35261069115969000104550010000000021000000024';
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'teste-ag-a-' || ua || '@rbr.invalid', 'authenticated', 'authenticated'),
    (ub, 'teste-ag-b-' || ub || '@rbr.invalid', 'authenticated', 'authenticated'),
    (um, 'teste-mot-' || um || '@rbr.invalid', 'authenticated', 'authenticated'),
    (ug, 'teste-gestor-' || ug || '@rbr.invalid', 'authenticated', 'authenticated');
  -- CPFs válidos gerados na hora e que não existem em pessoas (cpf é único; CPF fixo colidia com cadastro de teste).
  while coalesce(array_length(cpfs, 1), 0) < 4 loop
    base := lpad((floor(random() * 999999999))::bigint::text, 9, '0');
    select (sum(substr(base, k, 1)::int * (11 - k)) * 10 % 11) % 10 into d1 from generate_series(1, 9) k;
    select (sum(substr(base || d1, k, 1)::int * (12 - k)) * 10 % 11) % 10 into d2 from generate_series(1, 10) k;
    if base !~ '^(\d)\1{8}$' and not exists (select 1 from pessoas where cpf = base || d1 || d2) then
      cpfs := cpfs || (base || d1 || d2);
    end if;
  end loop;

  -- Gestor primeiro (papel fora do fluxo de aprovação: já nasce aprovado). Os demais cadastros e as operações são
  -- criados "logado" como esse gestor, como no app: assim nascem aprovados e passam pelas travas de alocação.
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ug, 'Gestor teste', 'gestor_rbr', cpfs[4]);
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ua, 'Agência A teste', 'agenciador', cpfs[1]) returning id into ag_a;
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ub, 'Agência B teste', 'agenciador', cpfs[2]) returning id into ag_b;
  insert into pessoas (auth_user_id, nome, papel, cpf) values (um, 'Motorista teste', 'titular_motorista', cpfs[3]) returning id into mot;
  insert into operacoes (agenciador_id, pessoa_alocada_id) values (ag_a, mot) returning id into op_a;
  insert into operacoes (agenciador_id) values (ag_b) returning id into op_b;
  perform set_config('request.jwt.claims', '', true);

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

  -- Bucket operacao-nfe: um XML em cada operação (<operacao>/<chave>.xml). Se o Storage não deixar inserir direto
  -- em storage.objects, a parte do bucket é pulada com um aviso (o resto do teste segue).
  begin
    insert into storage.objects (bucket_id, name) values
      ('operacao-nfe', op_a || '/' || k1 || '.xml'),
      ('operacao-nfe', op_b || '/' || k1 || '.xml');
  exception when others then
    com_bucket := false;
    raise notice 'aviso: parte do bucket pulada (%): confira as políticas operacao_nfe_* à mão', sqlerrm;
  end;

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
  update operacao_nfes set valor = 1 where operacao_id = op_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'agenciador B alterou % nota(s) da operação de A', n; end if;
  delete from operacao_nfes where operacao_id = op_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'agenciador B apagou % nota(s) da operação de A', n; end if;
  raise notice 'ok: agenciador B não altera nem apaga notas da operação de A';
  if com_bucket then
    select count(*) into n from storage.objects where bucket_id = 'operacao-nfe' and name like op_a || '/%';
    if n <> 0 then raise exception 'agenciador B viu % XML da operação de A no bucket', n; end if;
    select count(*) into n from storage.objects where bucket_id = 'operacao-nfe' and name like op_b || '/%';
    if n <> 1 then raise exception 'agenciador B deveria ver 1 XML da própria operação, viu %', n; end if;
    raise notice 'ok: bucket — agenciador B vê só o XML da própria operação';
  end if;
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
  update operacao_nfes set valor = 1 where operacao_id = op_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'motorista alterou % nota(s)', n; end if;
  begin
    insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_a, '35261069115969000104550010000000031000000030', 'digitada');
    raise exception 'motorista gravou nota';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from operacao_nfes where operacao_id = op_b;
  if n <> 0 then raise exception 'motorista viu % nota(s) de operação em que não está alocado', n; end if;
  raise notice 'ok: motorista lê as notas da operação dele, não grava/altera/apaga e não vê as outras';
  if com_bucket then
    select count(*) into n from storage.objects where bucket_id = 'operacao-nfe';
    if n <> 1 then raise exception 'motorista deveria ver só 1 XML (o da operação dele), viu %', n; end if;
    raise notice 'ok: bucket — motorista vê só o XML da operação dele';
  end if;

  -- Gestor: vê e grava em qualquer operação
  perform set_config('request.jwt.claims', json_build_object('sub', ug, 'role', 'authenticated')::text, true);
  select count(*) into n from operacao_nfes where operacao_id in (op_a, op_b);
  if n <> 3 then raise exception 'gestor deveria ver as 3 notas de teste, viu %', n; end if;
  insert into operacao_nfes (operacao_id, chave_acesso, origem) values (op_b, k2, 'digitada');
  update operacao_nfes set valor = 1 where operacao_id = op_a;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'gestor deveria alterar 2 notas da operação A, alterou %', n; end if;
  raise notice 'ok: gestor vê, grava e altera em todas as operações';
  if com_bucket then
    select count(*) into n from storage.objects where bucket_id = 'operacao-nfe' and name similar to '(' || op_a || '|' || op_b || ')/%';
    if n <> 2 then raise exception 'gestor deveria ver os 2 XML de teste, viu %', n; end if;
    raise notice 'ok: bucket — gestor vê todos os XML';
  end if;

  -- anon não chega na tabela
  perform set_config('role', 'anon', true);
  begin
    perform 1 from operacao_nfes limit 1;
    raise exception 'anon leu operacao_nfes';
  exception when insufficient_privilege then raise notice 'ok: anon sem acesso';
  end;

  raise exception 'TESTE_OK';
end $$;

-- Conferência da limpeza (rode separado, depois do teste; deve voltar 0):
-- select count(*) from auth.users where email like 'teste-%@rbr.invalid';
-- Só se voltar mais que 0 (não deveria: o DO block desfaz tudo):
-- delete from pessoas where auth_user_id in (select id from auth.users where email like 'teste-%@rbr.invalid');
-- delete from auth.users where email like 'teste-%@rbr.invalid';
