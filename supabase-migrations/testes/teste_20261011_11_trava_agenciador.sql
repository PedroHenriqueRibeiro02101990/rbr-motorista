-- Teste da migration 20261011_11 (trava do agenciador só depois da 1ª publicação do contrato).
-- Roda inteiro dentro de um DO block que termina com raise exception 'TESTE_OK': TUDO é desfeito (rollback).
-- Rodar depois das migrations 20261011_01 a _11, como postgres (SQL editor). Resultado esperado: ERROR "TESTE_OK"
-- com os NOTICEs "ok: ...". Qualquer outro erro = falha. Simula o login pelo request.jwt.claims, como o Supabase faz.
do $$
declare g uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ag uuid; t uuid; c uuid; o uuid;
begin
  insert into pessoas (auth_user_id, nome, papel) values (g, 'Gestor', 'gestor_rbr');
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  insert into pessoas (auth_user_id, nome, papel, cpf) values (ua, 'Agência', 'agenciador', '1') returning id into ag;
  if contrato_agenciador_em_vigor() then
    raise exception 'Este teste supõe que nenhuma versão do contrato do agenciador foi publicada ainda.';
  end if;
  -- ANTES da publicação: agenciador sem contrato opera normalmente (a declaração da carga continua exigida)
  assert agenciador_pode_operar(ag), 'deveria operar antes da publicação';
  insert into cotacoes (agenciador_id) values (ag) returning id into c;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform declarar_carga(c, jsonb_build_object('embarcador_nome','E','embarcador_documento','1','mercadoria','M','quantidade','1','valor',1000,'nf_numero','1',
          'nf_chave', repeat('1', 44),'endereco_coleta','A','endereco_entrega','B','contato_entrega_nome','C','contato_entrega_telefone','1',
          'declaracoes', jsonb_build_object('a',true,'b',true,'c',true,'d',true)), 'teste');
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  update cotacoes set status = 'convertida' where id = c;
  insert into operacoes (agenciador_id, cotacao_id) values (ag, c) returning id into o;
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
  insert into cotacoes (agenciador_id) values (ag) returning id into c;
  begin update cotacoes set status = 'convertida' where id = c; raise exception 'x'; exception when raise_exception then raise notice 'ok: DEPOIS trava a cotação (%)', sqlerrm; end;
  begin insert into operacoes (agenciador_id) values (ag); raise exception 'x'; exception when raise_exception then raise notice 'ok: DEPOIS trava a operação (%)', sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin perform documentos_operacao_agenciador(o); raise exception 'x'; exception when raise_exception then raise notice 'ok: DEPOIS trava a documentação (%)', sqlerrm; end;
  raise exception 'TESTE_OK';
end $$;
