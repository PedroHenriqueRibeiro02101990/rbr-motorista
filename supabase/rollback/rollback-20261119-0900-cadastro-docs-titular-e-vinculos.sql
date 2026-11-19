-- Rollback de 20261119-0900: volta a RPC para a versao de 20261118-0100 e o CHECK de tipos para o de 20261023_01.
-- ATENCAO: o titular volta a ser coalesce(motorista, ator) (o defeito D2). Use so se a versao nova der problema em producao.
-- Linhas de documentos_pessoais_imagens dos tipos cpf/rntrc/dados_bancarios (criadas so pela versao nova) impedem recriar o CHECK antigo:
-- por isso elas sao REMOVIDAS (so o registro; o arquivo continua no Storage, bucket cadastro-documentos).
delete from public.documentos_pessoais_imagens where tipo in ('cpf', 'rntrc', 'dados_bancarios');
alter table public.documentos_pessoais_imagens drop constraint if exists documentos_pessoais_imagens_tipo_check;
alter table public.documentos_pessoais_imagens add constraint documentos_pessoais_imagens_tipo_check
  check (tipo = any (array['cnh'::text, 'crlv'::text, 'rg'::text, 'cartao_cnpj'::text, 'comprovante_residencia'::text]));
drop function if exists public._titular_do_crlv(text, text, text);

create or replace function public.confirmar_cadastro_por_documentos(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ator uuid := (select current_pessoa_id());
  v_mot uuid; v_cav uuid; v_car uuid;
  m jsonb := p_payload->'motorista'; c jsonb := p_payload->'cavalo'; r jsonb := p_payload->'carreta';
  a jsonb; v_ent text; v_id uuid;
  v_manual boolean := coalesce(jsonb_array_length(p_payload->'manual'), 0) > 0;
  v jsonb;
  v_reb boolean;
begin
  if (select current_papel()) is null or (select current_papel()) not in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa) then
    raise exception 'Sem permissao para cadastrar por documentos.' using errcode = '42501';
  end if;

  -- pesos: kg inteiro (regra G1)
  foreach v in array array[c, r] loop
    if v is not null then
      if (v ? 'tara_kg') and v->>'tara_kg' is not null and (v->>'tara_kg')::numeric <> trunc((v->>'tara_kg')::numeric) then
        raise exception 'Tara e em kg. Voce quis dizer %?', trunc((v->>'tara_kg')::numeric * 1000) using errcode = '22023';
      end if;
      if v->>'capacidade_carga' is not null and (v->>'capacidade_carga')::numeric <> trunc((v->>'capacidade_carga')::numeric) then
        raise exception 'Capacidade e em kg. Voce quis dizer %?', trunc((v->>'capacidade_carga')::numeric * 1000) using errcode = '22023';
      end if;
    end if;
  end loop;

  if m is not null and nullif(m->>'cpf', '') is not null then
    select id into v_mot from pessoas where cpf = m->>'cpf' and deleted_at is null limit 1;
    if v_mot is null then
      insert into pessoas (nome, papel, cpf, documento_origem)
        values (m->>'nome', 'titular_motorista', m->>'cpf', 'documentos') returning id into v_mot;
    end if;
    update pessoas set
      nome = coalesce(nullif(m->>'nome', ''), nome),
      cnh_numero_registro = coalesce(nullif(m->>'cnh_numero_registro', ''), cnh_numero_registro),
      cnh_categoria = coalesce(nullif(m->>'cnh_categoria', ''), cnh_categoria),
      cnh_validade = coalesce(nullif(m->>'cnh_validade', '')::date, cnh_validade),
      data_nascimento = coalesce(nullif(m->>'data_nascimento', '')::date, data_nascimento),
      cep = coalesce(nullif(m->>'cep', ''), cep),
      logradouro = coalesce(nullif(m->>'logradouro', ''), logradouro),
      numero_endereco = coalesce(nullif(m->>'numero_endereco', ''), numero_endereco),
      complemento = coalesce(nullif(m->>'complemento', ''), complemento),
      bairro = coalesce(nullif(m->>'bairro', ''), bairro),
      cidade = coalesce(nullif(m->>'cidade', ''), cidade),
      uf = coalesce(nullif(m->>'uf', ''), uf),
      rntrc_numero = coalesce(nullif(m->>'rntrc_numero', ''), rntrc_numero),
      cnh_extraido_por_ia = true,
      cnh_preenchido_manualmente = cnh_preenchido_manualmente or v_manual,
      documento_origem = coalesce(documento_origem, 'documentos')
    where id = v_mot;
  end if;

  -- cavalo e carreta (mesma rotina)
  for i in 1..2 loop
    v := case i when 1 then c else r end;
    continue when v is null or nullif(v->>'placa', '') is null;
    v_reb := case
      when lower(coalesce(v->>'tipo_crlv', '')) ~ 'reboque' then true
      when lower(coalesce(v->>'tipo_crlv', '')) like '%trator%' then false
      else i = 2 end;
    select id into v_id from veiculos where placa = upper(v->>'placa') and deleted_at is null limit 1;
    if v_id is null then
      insert into veiculos (placa, renavam, titular_id)
        values (upper(v->>'placa'), coalesce(nullif(v->>'renavam', ''), 'PENDENTE-' || upper(v->>'placa')), coalesce(v_mot, v_ator))
        returning id into v_id;
    end if;
    update veiculos set
      renavam = coalesce(nullif(v->>'renavam', ''), renavam),
      chassi = coalesce(nullif(v->>'chassi', ''), chassi),
      tipo_crlv = coalesce(nullif(v->>'tipo_crlv', ''), tipo_crlv),
      tipo_veiculo = coalesce(nullif(v->>'tipo_veiculo', ''), tipo_veiculo),
      tipo_carroceria = coalesce(nullif(v->>'tipo_carroceria', ''), tipo_carroceria),
      quantidade_eixos = coalesce(nullif(v->>'quantidade_eixos', '')::int, quantidade_eixos),
      tara_kg = coalesce(nullif(v->>'tara_kg', '')::numeric, tara_kg),
      tara_origem = coalesce(nullif(v->>'tara_origem', ''), tara_origem),
      capacidade_carga = coalesce(nullif(v->>'capacidade_carga', '')::numeric, capacidade_carga),
      pbt_kg = coalesce(nullif(v->>'pbt_kg', '')::int, pbt_kg),
      cmt_kg = coalesce(nullif(v->>'cmt_kg', '')::int, cmt_kg),
      uf_licenciamento = coalesce(nullif(v->>'uf_licenciamento', ''), uf_licenciamento),
      crlv_exercicio = coalesce(nullif(v->>'crlv_exercicio', '')::int, crlv_exercicio),
      proprietario_documento = coalesce(nullif(v->>'proprietario_documento', ''), proprietario_documento),
      marca_modelo = coalesce(nullif(v->>'marca_modelo', ''), marca_modelo),
      ano = coalesce(nullif(v->>'ano', '')::int, ano),
      crlv_foto_url = coalesce(nullif(v->>'crlv_foto_url', ''), crlv_foto_url),
      crlv_extracao_id = coalesce(nullif(v->>'crlv_extracao_id', ''), crlv_extracao_id),
      crlv_extraido_por_ia = true,
      crlv_preenchido_manualmente = crlv_preenchido_manualmente or v_manual,
      e_reboque = v_reb
    where id = v_id;
    if i = 1 then v_cav := v_id; else v_car := v_id; end if;
  end loop;

  if v_cav is not null and v_car is not null then
    update veiculos set carreta_padrao_id = v_car where id = v_cav;
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_payload->'auditoria', '[]'::jsonb)) loop
    v_ent := a->>'entidade';
    insert into cadastro_auditoria (entidade, entidade_id, campo, valor_extraido, valor_confirmado, editado_manualmente, confianca, documento_path, documento_tipo, confirmado_por)
      select (case when v_ent = 'motorista' then 'pessoa' else 'veiculo' end),
              case v_ent when 'motorista' then v_mot when 'cavalo' then v_cav else v_car end,
              a->>'campo', a->>'valor_extraido', a->>'valor_confirmado', coalesce((a->>'editado')::boolean, false),
              nullif(a->>'confianca', ''), a->>'documento_path', a->>'documento_tipo', v_ator
      where case v_ent when 'motorista' then v_mot when 'cavalo' then v_cav else v_car end is not null;
  end loop;

  return jsonb_build_object('motorista_id', v_mot, 'cavalo_id', v_cav, 'carreta_id', v_car);
end;
$$;
revoke all on function public.confirmar_cadastro_por_documentos(jsonb) from public, anon;
grant execute on function public.confirmar_cadastro_por_documentos(jsonb) to authenticated, service_role;
