-- Teste da migration 20261011_11 (trava do agenciador só depois da 1ª publicação do contrato).
-- Roda inteiro dentro de um DO block que termina com raise exception 'TESTE_OK': TUDO é desfeito (rollback).
-- Rodar depois das migrations 20261011_01 a _11, como postgres (SQL editor). Resultado esperado: ERROR "TESTE_OK"
-- com os NOTICEs "ok: ...". Qualquer outro erro = falha. Simula o login pelo request.jwt.claims, como o Supabase faz.
-- Feito para o banco real: cria os usuários de teste em auth.users (FK de pessoas.auth_user_id), usa CPFs válidos
-- (constraint pf_tem_cpf), cotação com origem 'agenciador' (o funil trg_cotacao_valida_funil só vale para 'gestor') e
-- usa a operação criada pelo gatilho existente na conversão (trg_cotacao_convertida).
do $$
declare g uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ag uuid; t uuid; c uuid; o uuid;
begin
  -- (ajuste para o banco real: pessoas.auth_user_id tem FK para auth.users; tudo é desfeito no rollback)
  insert into auth.users (id, email, aud, role) values (g, 'teste-gestor-' || g || '@rbr.invalid', 'authenticated', 'authenticated'),
                                                       (ua, 'teste-agenciador-' || ua || '@rbr.invalid', 'authenticated', 'authenticated');
  insert into pessoas (auth_user_id, nome, papel, cpf) values (g, 'Gestor teste', 'gestor_rbr', '81396872787');
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ua, 'Agência teste', 'agenciador', '38120141814') returning id into ag;
  if contrato_agenciador_em_vigor() then
    raise exception 'Este teste supõe que nenhuma versão do contrato do agenciador foi publicada ainda.';
  end if;
  -- ANTES da publicação: agenciador sem contrato opera normalmente (a declaração da carga continua exigida)
  assert agenciador_pode_operar(ag), 'deveria operar antes da publicação';
  insert into cotacoes (agenciador_id, origem) values (ag, 'agenciador') returning id into c;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform declarar_carga(c, jsonb_build_object('embarcador_nome','E','embarcador_documento','1','mercadoria','M','quantidade','1','valor',1000,'nf_numero','1',
          'nf_chave', repeat('1', 44),'endereco_coleta','A','endereco_entrega','B','contato_entrega_nome','C','contato_entrega_telefone','1',
          'declaracoes', jsonb_build_object('a',true,'b',true,'c',true,'d',true)), 'teste');
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  update cotacoes set status = 'convertida' where id = c;
  -- (banco real: a conversão já cria a operação pelo gatilho existente)
  select id into o from operacoes where cotacao_id = c order by created_at limit 1;
  if o is null then raise exception 'a conversão não criou a operação'; end if;
  if (select agenciador_id from operacoes where id = o) is distinct from ag then raise exception 'operação criada sem o agenciador'; end if;
  raise notice 'ok: ANTES da publicação nada trava (converteu a cotação e abriu a operação)';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform documentos_operacao_agenciador(o);
  raise notice 'ok: ANTES da publicação a documentação é liberada';
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  perform agenciador_suspender(ag, 'teste');
  begin insert into operacoes (agenciador_id) values (ag); raise exception 'x'; exception when raise_exception then raise notice 'ok: suspenso trava sempre (%)', sqlerrm; end;
  perform agenciador_reativar(ag, 'teste');
  assert agenciador_pode_operar(ag);
  -- publica a 1ª versão: agora trava quem não tem contrato validado
  select id into t from termos_contrato where tipo = 'agenciador';
  update termos_contrato set texto = 'Contrato {{agenciador_nome}}' where id = t;
  update contrato_config set valor = 'x' where tipo = 'agenciador';
  perform publicar_termo(t);
  assert not agenciador_pode_operar(ag), 'deveria travar após a publicação';
  insert into cotacoes (agenciador_id, origem) values (ag, 'agenciador') returning id into c;
  begin update cotacoes set status = 'convertida' where id = c; raise exception 'x'; exception when raise_exception then raise notice 'ok: DEPOIS trava a cotação (%)', sqlerrm; end;
  begin insert into operacoes (agenciador_id) values (ag); raise exception 'x'; exception when raise_exception then raise notice 'ok: DEPOIS trava a operação (%)', sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin perform documentos_operacao_agenciador(o); raise exception 'x'; exception when raise_exception then raise notice 'ok: DEPOIS trava a documentação (%)', sqlerrm; end;
  raise exception 'TESTE_OK';
end $$;
