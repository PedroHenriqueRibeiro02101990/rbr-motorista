-- Testes da migracao 20261119-0900 (titular do veiculo = proprietario do CRLV; documentos vinculados). Depende de 20261118-0100 e 20261119-0900 aplicadas.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cadastro_por_documentos_titular_e_docs.sql
-- Transacao com ROLLBACK no fim (nada fica no banco). Imprime "OK <n>" ou para com "FALHOU <n>". Dados sinteticos (CPF/CNPJ/placas de teste).

\set ON_ERROR_STOP 1
begin;

do $$ begin
  if to_regclass('auth.users') is not null then
    execute $q$insert into auth.users (id, email) values ('7e590000-0000-0000-0000-00000000000a', 'gestor.cadastro@rbr.invalid') on conflict do nothing$q$;
  end if;
end $$;
-- quem cadastra: um FUNCIONARIO (gestor_rbr). Ele NUNCA pode virar titular de veiculo.
insert into pessoas (id, auth_user_id, papel, nome, cpf, aprovacao_status) values
  ('7e591000-0000-0000-0000-00000000000a', '7e590000-0000-0000-0000-00000000000a', 'gestor_rbr', 'Funcionario (teste)', '39053344705', 'aprovado');
-- motorista ja cadastrado (e dono do cavalo do caso 1)
insert into pessoas (id, papel, nome, cpf) values ('7e591000-0000-0000-0000-0000000000b1', 'titular_motorista', 'Motorista Dono (teste)', '52998224725');
-- empresa ja cadastrada (dona da carreta do caso 3)
insert into pessoas (id, papel, nome, cnpj, tipo_pessoa_doc) values ('7e591000-0000-0000-0000-0000000000c1', 'prestador_parceiro', 'Transportes Teste LTDA', '11222333000181', 'PJ');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e590000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- CASO 1: motorista dono do veiculo (CPF do CRLV = CPF do motorista) + CNH, RG e RNTRC no lote
select set_config('t.r1', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'motorista', jsonb_build_object('nome', 'Motorista Dono (teste)', 'cpf', '52998224725', 'cnh_numero_registro', '12345678900', 'cnh_categoria', 'E', 'cnh_validade', '2030-05-01', 'rntrc_numero', '012345678'),
  'cavalo', jsonb_build_object('placa', 'TST1A11', 'renavam', '11111111111', 'tipo_crlv', 'CAMINHAO TRATOR', 'tipo_veiculo', 'cavalo mecanico', 'proprietario_documento', '52998224725', 'proprietario_nome', 'Motorista Dono (teste)', 'uf_licenciamento', 'SP'),
  'documentos', jsonb_build_array(
    jsonb_build_object('tipo', 'cnh', 'path', 'lote-t1/cnh.pdf', 'alvo', 'motorista'),
    jsonb_build_object('tipo', 'rg', 'path', 'lote-t1/rg.pdf', 'alvo', 'motorista'),
    jsonb_build_object('tipo', 'rntrc', 'path', 'lote-t1/rntrc.pdf', 'alvo', 'motorista'),
    jsonb_build_object('tipo', 'cpf', 'path', 'lote-t1/cpf.pdf', 'alvo', 'motorista'),
    jsonb_build_object('tipo', 'comprovante_residencia', 'path', 'lote-t1/comp.pdf', 'alvo', 'motorista', 'data', '2026-10-25'),
    jsonb_build_object('tipo', 'crlv', 'path', 'lote-t1/crlv.pdf', 'alvo', 'cavalo'))
))::text, true);
do $$ declare r jsonb := current_setting('t.r1')::jsonb; begin
  if (select titular_id from veiculos where placa = 'TST1A11') <> '7e591000-0000-0000-0000-0000000000b1' then raise exception 'FALHOU 1: titular nao e o motorista dono do CRLV'; end if;
  if (select titular_id from veiculos where placa = 'TST1A11') = '7e591000-0000-0000-0000-00000000000a' then raise exception 'FALHOU 1b: titular virou o funcionario'; end if;
  if (r->>'documentos_vinculados')::int <> 6 then raise exception 'FALHOU 1c: documentos vinculados = %', r->>'documentos_vinculados'; end if;
  if (select count(*) from documentos_pessoais_imagens where pessoa_id = '7e591000-0000-0000-0000-0000000000b1' and tipo in ('cnh', 'rg', 'rntrc', 'cpf', 'comprovante_residencia')) <> 5 then raise exception 'FALHOU 1d: documentos da pessoa'; end if;
  if (select count(*) from documentos_pessoais_imagens where veiculo_id = (select id from veiculos where placa = 'TST1A11') and tipo = 'crlv' and arquivo_url = 'cadastro-documentos/lote-t1/crlv.pdf') <> 1 then raise exception 'FALHOU 1e: CRLV do veiculo'; end if;
  if (select cnh_foto_url from pessoas where id = '7e591000-0000-0000-0000-0000000000b1') <> 'cadastro-documentos/lote-t1/cnh.pdf' then raise exception 'FALHOU 1f: cnh_foto_url'; end if;
  if (select cnh_extracao_id from pessoas where id = '7e591000-0000-0000-0000-0000000000b1') <> 'cadastro-documentos/lote-t1/cnh.pdf' then raise exception 'FALHOU 1g: cnh_extracao_id'; end if;
  if (select comprovante_residencia_url from pessoas where id = '7e591000-0000-0000-0000-0000000000b1') <> 'cadastro-documentos/lote-t1/comp.pdf' then raise exception 'FALHOU 1h: comprovante url'; end if;
  if (select comprovante_residencia_data from pessoas where id = '7e591000-0000-0000-0000-0000000000b1') <> date '2026-10-25' then raise exception 'FALHOU 1i: comprovante data'; end if;
  raise notice 'OK 1';
end $$;

-- CASO 1 de novo (mesmo lote): idempotente, nao duplica documento
select public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'motorista', jsonb_build_object('nome', 'Motorista Dono (teste)', 'cpf', '52998224725'),
  'cavalo', jsonb_build_object('placa', 'TST1A11', 'renavam', '11111111111', 'tipo_crlv', 'CAMINHAO TRATOR', 'proprietario_documento', '52998224725', 'proprietario_nome', 'Motorista Dono (teste)'),
  'documentos', jsonb_build_array(jsonb_build_object('tipo', 'cnh', 'path', 'lote-t1/cnh.pdf', 'alvo', 'motorista'), jsonb_build_object('tipo', 'crlv', 'path', 'lote-t1/crlv.pdf', 'alvo', 'cavalo'))));
do $$ begin
  if (select count(*) from documentos_pessoais_imagens where arquivo_url in ('cadastro-documentos/lote-t1/cnh.pdf', 'cadastro-documentos/lote-t1/crlv.pdf')) <> 2 then raise exception 'FALHOU 1j: duplicou documento ao repetir'; end if;
  raise notice 'OK 1j';
end $$;

-- CASO 2: veiculo de OUTRA pessoa (dono nao cadastrado): cria o titular com nome, documento e UF do CRLV; o motorista do lote NAO e o titular
select set_config('t.r2', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'motorista', jsonb_build_object('nome', 'Motorista Dono (teste)', 'cpf', '52998224725'),
  'cavalo', jsonb_build_object('placa', 'TST2B22', 'renavam', '22222222222', 'tipo_crlv', 'CAMINHAO TRATOR', 'proprietario_documento', '11144477735', 'proprietario_nome', 'Maria Dona (teste)', 'uf_licenciamento', 'MG')
))::text, true);
do $$ declare t uuid; begin
  select titular_id into t from veiculos where placa = 'TST2B22';
  if t = '7e591000-0000-0000-0000-0000000000b1' then raise exception 'FALHOU 2: titular virou o motorista do lote'; end if;
  if t = '7e591000-0000-0000-0000-00000000000a' then raise exception 'FALHOU 2b: titular virou o funcionario'; end if;
  if not exists (select 1 from pessoas where id = t and cpf = '11144477735' and nome = 'Maria Dona (teste)' and uf = 'MG' and papel::text = 'titular_motorista' and auth_user_id is null and tipo_pessoa_doc::text = 'PF') then raise exception 'FALHOU 2c: titular criado errado'; end if;
  raise notice 'OK 2';
end $$;

-- CASO 3: veiculo de EMPRESA (CNPJ): cadastrada -> usa; nova -> cria PJ
select set_config('t.r3', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'carreta', jsonb_build_object('placa', 'TST3C33', 'renavam', '33333333333', 'tipo_crlv', 'SEMIRREBOQUE', 'proprietario_documento', '11222333000181', 'proprietario_nome', 'Transportes Teste LTDA', 'uf_licenciamento', 'SP')
))::text, true);
select public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'carreta', jsonb_build_object('placa', 'TST3D44', 'renavam', '44444444444', 'tipo_crlv', 'SEMIRREBOQUE', 'proprietario_documento', '45.723.174/0001-10', 'proprietario_nome', 'Empresa Nova (teste) LTDA', 'uf_licenciamento', 'PR')));
do $$ begin
  if (select titular_id from veiculos where placa = 'TST3C33') <> '7e591000-0000-0000-0000-0000000000c1' then raise exception 'FALHOU 3: nao usou a empresa cadastrada'; end if;
  if not exists (select 1 from pessoas p join veiculos v on v.titular_id = p.id where v.placa = 'TST3D44' and p.cnpj = '45723174000110' and p.tipo_pessoa_doc::text = 'PJ' and p.uf = 'PR' and p.nome = 'Empresa Nova (teste) LTDA') then raise exception 'FALHOU 3b: PJ nova'; end if;
  raise notice 'OK 3';
end $$;

-- CASO 4: FUNCIONARIO cadastrando so o CRLV (sem CNH): o titular e o dono do CRLV, nunca o funcionario
select public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'cavalo', jsonb_build_object('placa', 'TST4E55', 'renavam', '55555555555', 'tipo_crlv', 'CAMINHAO TRATOR', 'proprietario_documento', '52998224725', 'proprietario_nome', 'Motorista Dono (teste)')));
do $$ begin
  if (select titular_id from veiculos where placa = 'TST4E55') <> '7e591000-0000-0000-0000-0000000000b1' then raise exception 'FALHOU 4: titular nao e o dono do CRLV'; end if;
  if exists (select 1 from veiculos v join pessoas p on p.id = v.titular_id where p.papel::text in ('gestor_rbr', 'operacao', 'fiscal') and v.placa like 'TST%') then raise exception 'FALHOU 4b: algum veiculo ficou com titular da equipe'; end if;
  raise notice 'OK 4';
end $$;

-- CASO 5: sem CPF/CNPJ no CRLV -> erro claro (nunca cai no funcionario); sem nome e documento novo -> erro
do $$ begin
  begin
    perform public.confirmar_cadastro_por_documentos(jsonb_build_object('cavalo', jsonb_build_object('placa', 'TST5F66', 'renavam', '66666666666', 'tipo_crlv', 'CAMINHAO TRATOR')));
    raise exception 'FALHOU 5: aceitou CRLV sem documento do proprietario';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.confirmar_cadastro_por_documentos(jsonb_build_object('cavalo', jsonb_build_object('placa', 'TST5G77', 'renavam', '77777777777', 'tipo_crlv', 'CAMINHAO TRATOR', 'proprietario_documento', '99999999999')));
    raise exception 'FALHOU 5b: criou titular sem nome';
  exception when sqlstate '22023' then null; end;
  if exists (select 1 from veiculos where placa in ('TST5F66', 'TST5G77')) then raise exception 'FALHOU 5c: veiculo ficou gravado apesar do erro'; end if;
  raise notice 'OK 5';
end $$;

-- CASO 6: veiculo JA existente. (a) titular = funcionario (defeito antigo) e corrigido; (b) titular de terceiro e mantido e vira aviso
reset role;
insert into veiculos (placa, renavam, titular_id) values ('TST6H88', '88888888888', '7e591000-0000-0000-0000-00000000000a'), ('TST6I99', '99999999990', '7e591000-0000-0000-0000-0000000000c1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e590000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.r6', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'cavalo', jsonb_build_object('placa', 'TST6H88', 'renavam', '88888888888', 'tipo_crlv', 'CAMINHAO TRATOR', 'proprietario_documento', '52998224725', 'proprietario_nome', 'Motorista Dono (teste)'),
  'carreta', jsonb_build_object('placa', 'TST6I99', 'renavam', '99999999990', 'tipo_crlv', 'SEMIRREBOQUE', 'proprietario_documento', '52998224725', 'proprietario_nome', 'Motorista Dono (teste)')))::text, true);
do $$ begin
  if (select titular_id from veiculos where placa = 'TST6H88') <> '7e591000-0000-0000-0000-0000000000b1' then raise exception 'FALHOU 6: titular funcionario nao foi corrigido'; end if;
  if (select titular_id from veiculos where placa = 'TST6I99') <> '7e591000-0000-0000-0000-0000000000c1' then raise exception 'FALHOU 6b: trocou titular de terceiro em silencio'; end if;
  if jsonb_array_length(current_setting('t.r6')::jsonb->'avisos') <> 1 then raise exception 'FALHOU 6c: sem aviso de divergencia'; end if;
  raise notice 'OK 6';
end $$;

-- CASO 7: documento sem dono (sem CPF do motorista) nao quebra: vira aviso
select set_config('t.r7', public.confirmar_cadastro_por_documentos(jsonb_build_object(
  'cavalo', jsonb_build_object('placa', 'TST7J00', 'renavam', '10101010101', 'tipo_crlv', 'CAMINHAO TRATOR', 'proprietario_documento', '52998224725', 'proprietario_nome', 'Motorista Dono (teste)'),
  'documentos', jsonb_build_array(jsonb_build_object('tipo', 'cnh', 'path', 'lote-t7/cnh.pdf', 'alvo', 'motorista'))))::text, true);
do $$ begin
  if jsonb_array_length(current_setting('t.r7')::jsonb->'avisos') <> 1 then raise exception 'FALHOU 7: documento sem dono sem aviso'; end if;
  if exists (select 1 from documentos_pessoais_imagens where arquivo_url = 'cadastro-documentos/lote-t7/cnh.pdf') then raise exception 'FALHOU 7b: vinculou documento sem dono'; end if;
  raise notice 'OK 7';
end $$;

-- o painel enxerga: documentos do motorista e do veiculo dele pela mesma consulta do PainelCadastro
do $$ begin
  if (select count(*) from documentos_pessoais_imagens where pessoa_id = '7e591000-0000-0000-0000-0000000000b1' or veiculo_id in (select id from veiculos where titular_id = '7e591000-0000-0000-0000-0000000000b1')) < 6 then raise exception 'FALHOU 8: painel nao ve os documentos'; end if;
  raise notice 'OK 8';
end $$;

rollback;
