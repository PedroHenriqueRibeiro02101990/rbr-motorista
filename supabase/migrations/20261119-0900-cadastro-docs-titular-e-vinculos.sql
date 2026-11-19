-- Correcoes da auditoria 19/11/2026 (C1 = D2 titular do veiculo, C2 = D1 vinculo dos documentos). Troca de FUNCAO + ampliacao de CHECK: nada apagado,
-- nenhuma linha existente alterada. Rollback: supabase/rollback/rollback-20261119-0900-cadastro-docs-titular-e-vinculos.sql
-- Teste (transacao com ROLLBACK): supabase/tests/cadastro_por_documentos_titular_e_docs.sql
--
-- ANTES DE APLICAR (conferir no banco, so leitura):
--   select tgname, tgenabled from pg_trigger where tgrelid = 'public.documentos_pessoais_imagens'::regclass and not tgisinternal;   -- gatilhos que a nova linha dispara
--   select indexname, indexdef from pg_indexes where tablename = 'documentos_pessoais_imagens';                                   -- indice unico por (pessoa, tipo)?
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.pessoas'::regclass and contype = 'c';   -- checks de pessoas (cpf/cnpj x tipo_pessoa_doc)
--
-- 1) O CHECK de tipo de documentos_pessoais_imagens passa a aceitar cpf, rntrc e dados_bancarios (o cadastro por documentos le esses tipos).
alter table public.documentos_pessoais_imagens drop constraint if exists documentos_pessoais_imagens_tipo_check;
alter table public.documentos_pessoais_imagens add constraint documentos_pessoais_imagens_tipo_check
  check (tipo = any (array['cnh'::text, 'crlv'::text, 'rg'::text, 'cartao_cnpj'::text, 'comprovante_residencia'::text, 'cpf'::text, 'rntrc'::text, 'dados_bancarios'::text]));

-- 2) Titular do veiculo = proprietario do CRLV. Interna: so a RPC abaixo chama (nao e exposta a anon/authenticated).
--    CPF/CNPJ do CRLV bate com uma pessoa cadastrada -> usa; nao bate -> cria a pessoa titular (titular_motorista, sem login) com nome, documento e UF do CRLV.
--    NUNCA recebe nem usa o usuario logado nem o motorista do lote.
create or replace function public._titular_do_crlv(p_documento text, p_nome text, p_uf text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc text := regexp_replace(upper(coalesce(p_documento, '')), '[^0-9A-Z]', '', 'g');
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_uf text := nullif(upper(left(btrim(coalesce(p_uf, '')), 2)), '');
  v_id uuid;
begin
  if length(v_doc) not in (11, 14) then
    raise exception 'CRLV sem CPF/CNPJ do proprietario: nao ha titular para o veiculo. Digite o documento do proprietario como esta no CRLV.' using errcode = '22023';
  end if;
  -- prefere quem nao e da equipe interna (a equipe nunca e titular de veiculo de terceiro)
  select id into v_id from pessoas
   where deleted_at is null
     and (regexp_replace(upper(coalesce(cpf, '')), '[^0-9A-Z]', '', 'g') = v_doc or regexp_replace(upper(coalesce(cnpj, '')), '[^0-9A-Z]', '', 'g') = v_doc)
   order by (papel::text in ('gestor_rbr', 'operacao', 'fiscal')) asc, created_at asc
   limit 1;
  if v_id is not null then return v_id; end if;
  if v_nome is null then
    raise exception 'CRLV sem nome do proprietario: digite o nome para criar o titular (o documento % ainda nao esta cadastrado).', v_doc using errcode = '22023';
  end if;
  insert into pessoas (nome, papel, tipo_pessoa_doc, cpf, cnpj, uf, documento_origem)
    values (v_nome, 'titular_motorista', (case when length(v_doc) = 11 then 'PF' else 'PJ' end)::tipo_pessoa_doc,
            case when length(v_doc) = 11 then v_doc end, case when length(v_doc) = 14 then v_doc end, v_uf, 'documentos')
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public._titular_do_crlv(text, text, text) from public, anon, authenticated;

-- 3) A RPC. Mudancas em relacao a 20261118-0100: (a) titular_id vem do CRLV (nunca coalesce(motorista, ator)); (b) veiculo ja existente so troca de titular
--    se estava sem titular ou com alguem da equipe interna (divergencia vira aviso, nao troca em silencio); (c) p_payload->'documentos' vincula cada arquivo
--    a pessoa/veiculo em documentos_pessoais_imagens (+ cnh_foto_url, cnh_extracao_id, comprovante_residencia_url/data); (d) devolve avisos.
-- p_payload: igual ao anterior + cavalo/carreta.proprietario_nome + documentos: [{tipo, path, alvo: 'motorista'|'cavalo'|'carreta', data?}]
--   (path = caminho dentro do bucket cadastro-documentos; a coluna guarda 'cadastro-documentos/<path>', a mesma chave de documento_extracoes).
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
  v_titular uuid; v_tit_atual uuid;
  v_avisos jsonb := '[]'::jsonb;
  v_docs int := 0;
  d jsonb; v_tipo text; v_path text; v_alvo text; v_url text; v_pes uuid; v_vei uuid; v_campos jsonb; v_data date;
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
    -- C1: titular = proprietario do CRLV (acha pelo CPF/CNPJ ou cria). Nunca o motorista do lote, nunca quem esta logado.
    v_titular := _titular_do_crlv(v->>'proprietario_documento', v->>'proprietario_nome', v->>'uf_licenciamento');
    select id, titular_id into v_id, v_tit_atual from veiculos where placa = upper(v->>'placa') and deleted_at is null limit 1;
    if v_id is null then
      insert into veiculos (placa, renavam, titular_id)
        values (upper(v->>'placa'), coalesce(nullif(v->>'renavam', ''), 'PENDENTE-' || upper(v->>'placa')), v_titular)
        returning id into v_id;
    elsif v_tit_atual is distinct from v_titular then
      if v_tit_atual is null or exists (select 1 from pessoas where id = v_tit_atual and papel::text in ('gestor_rbr', 'operacao', 'fiscal')) then
        update veiculos set titular_id = v_titular where id = v_id;
      else
        v_avisos := v_avisos || to_jsonb(format('Veiculo %s: o titular cadastrado foi mantido; o CRLV aponta outro proprietario (%s). Se o veiculo mudou de dono, troque o titular em Cadastros.', upper(v->>'placa'), coalesce(v->>'proprietario_nome', v->>'proprietario_documento')));
      end if;
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

  -- C2 (D1): documentos enviados ficam vinculados a pessoa/veiculo certo e aparecem no cadastro dela (o painel le documentos_pessoais_imagens).
  for d in select * from jsonb_array_elements(coalesce(p_payload->'documentos', '[]'::jsonb)) loop
    v_tipo := d->>'tipo'; v_path := nullif(d->>'path', ''); v_alvo := d->>'alvo';
    continue when v_path is null or v_path like '%..%' or v_tipo is null
      or v_tipo not in ('cnh', 'crlv', 'rg', 'cpf', 'rntrc', 'comprovante_residencia', 'dados_bancarios');
    v_url := 'cadastro-documentos/' || v_path;
    v_pes := null; v_vei := null;
    if v_alvo = 'motorista' then v_pes := v_mot;
    elsif v_alvo = 'cavalo' then v_vei := v_cav;
    elsif v_alvo = 'carreta' then v_vei := v_car;
    end if;
    if v_pes is null and v_vei is null then
      v_avisos := v_avisos || to_jsonb(format('O documento %s (%s) nao foi vinculado: nao ha %s neste cadastro (sem CPF valido, o motorista nao e criado).', v_tipo, split_part(v_path, '/', 2), v_alvo));
      continue;
    end if;
    select campos into v_campos from documento_extracoes where path = v_url;
    -- idempotente: o mesmo arquivo nao entra duas vezes para o mesmo dono
    if not exists (select 1 from documentos_pessoais_imagens where arquivo_url = v_url and tipo = v_tipo and pessoa_id is not distinct from v_pes and veiculo_id is not distinct from v_vei) then
      insert into documentos_pessoais_imagens (tipo, arquivo_url, pessoa_id, veiculo_id, campos_extraidos, extraido_em)
        values (v_tipo, v_url, v_pes, v_vei, v_campos, case when v_campos is null then null else now() end);
      v_docs := v_docs + 1;
    end if;
    if v_pes is not null and v_tipo = 'cnh' then
      update pessoas set cnh_foto_url = v_url, cnh_extracao_id = v_url where id = v_pes;
    elsif v_pes is not null and v_tipo = 'comprovante_residencia' then
      v_data := case when coalesce(d->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'data')::date end;
      update pessoas set comprovante_residencia_url = v_url, comprovante_residencia_data = coalesce(v_data, comprovante_residencia_data) where id = v_pes;
    end if;
  end loop;

  for a in select * from jsonb_array_elements(coalesce(p_payload->'auditoria', '[]'::jsonb)) loop
    v_ent := a->>'entidade';
    insert into cadastro_auditoria (entidade, entidade_id, campo, valor_extraido, valor_confirmado, editado_manualmente, confianca, documento_path, documento_tipo, confirmado_por)
      select (case when v_ent = 'motorista' then 'pessoa' else 'veiculo' end),
              case v_ent when 'motorista' then v_mot when 'cavalo' then v_cav else v_car end,
              a->>'campo', a->>'valor_extraido', a->>'valor_confirmado', coalesce((a->>'editado')::boolean, false),
              nullif(a->>'confianca', ''), a->>'documento_path', a->>'documento_tipo', v_ator
      where case v_ent when 'motorista' then v_mot when 'cavalo' then v_cav else v_car end is not null;
  end loop;

  return jsonb_build_object('motorista_id', v_mot, 'cavalo_id', v_cav, 'carreta_id', v_car,
    'cavalo_titular_id', (select titular_id from veiculos where id = v_cav), 'carreta_titular_id', (select titular_id from veiculos where id = v_car),
    'documentos_vinculados', v_docs, 'avisos', v_avisos);
end;
$$;
revoke all on function public.confirmar_cadastro_por_documentos(jsonb) from public, anon;
grant execute on function public.confirmar_cadastro_por_documentos(jsonb) to authenticated, service_role;
