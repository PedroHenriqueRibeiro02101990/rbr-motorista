-- Tarefa 6 (11/10/2026): o sistema descobre sozinho o documento que a RBR emite ao cliente, pela origem e destino.
-- Compara SEMPRE o código IBGE do município (resolvido no cadastro municipios_ibge via buscar_municipio), nunca o texto.
--   * mesmo município e ele tem NFS-e configurada (São Paulo capital, 3550308) -> nfse (sem MDF-e; CIOT continua obrigatório)
--   * municípios diferentes (em qualquer trecho, quando há várias entregas)    -> cte_mdfe (MDF-e sempre, por padrão)
--   * mesmo município sem NFS-e configurada                                     -> sem documento + "falar com o contador"
-- Parâmetro mdfe_dispensavel_lotacao_sp (padrão desligado) fica guardado para quando o contador confirmar.

insert into public.parametros_sistema (chave, valor, descricao) values (
  'documento_cliente',
  jsonb_build_object('municipios_nfse', jsonb_build_array('3550308'), 'mdfe_dispensavel_lotacao_sp', false),
  'Municípios (IBGE) onde a RBR emite NFS-e para frete municipal; MDF-e dispensável em lotação intermunicipal de SP (desligado até o contador confirmar).'
) on conflict (chave) do nothing;

-- Código IBGE do município: só quando o cadastro devolve exatamente um município.
create or replace function public.ibge_municipio(p_cidade text, p_uf text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) = 1 then min(m.codigo_ibge) end
  from buscar_municipio(btrim(p_cidade), upper(btrim(p_uf))) m
  where nullif(btrim(p_cidade), '') is not null and nullif(btrim(p_uf), '') is not null
$$;
revoke all on function public.ibge_municipio(text, text) from public, anon;
grant execute on function public.ibge_municipio(text, text) to authenticated, service_role;

alter table public.cotacoes add column if not exists ibge_origem text, add column if not exists ibge_destino text;
alter table public.cotacao_destinos add column if not exists ibge_destino text;
alter table public.pre_cotacao_itens add column if not exists ibge_origem text, add column if not exists ibge_destino text;
alter table public.operacoes
  add column if not exists tipo_documento_cliente text,
  add column if not exists tipo_documento_aviso text,
  add column if not exists tipo_documento_detectado_em timestamptz,
  add column if not exists tipo_documento_mudou_em timestamptz;
alter table public.operacoes drop constraint if exists operacoes_tipo_documento_cliente_chk;
alter table public.operacoes add constraint operacoes_tipo_documento_cliente_chk
  check (tipo_documento_cliente is null or tipo_documento_cliente in ('nfse', 'cte_mdfe'));
comment on column public.operacoes.tipo_documento_cliente is 'Detectado pela origem/destino (IBGE): nfse | cte_mdfe; null = indefinido (ver tipo_documento_aviso).';

-- Regra pura (sem tabela): origem + lista de destinos (IBGE).
create or replace function public.detectar_documento_cliente(p_ibge_origem text, p_ibge_destinos text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par jsonb := coalesce((select valor from parametros_sistema where chave = 'documento_cliente'), '{}'::jsonb);
  v_nfse boolean;
begin
  if p_ibge_origem is null or coalesce(array_length(p_ibge_destinos, 1), 0) = 0 or array_position(p_ibge_destinos, null) is not null then
    return jsonb_build_object('tipo', null, 'situacao', 'municipio_nao_identificado',
      'aviso', 'Não identifiquei o município (código IBGE) da origem ou de algum destino. Confira cidade e UF.');
  end if;
  if exists (select 1 from unnest(p_ibge_destinos) d where d <> p_ibge_origem) then
    return jsonb_build_object('tipo', 'cte_mdfe', 'situacao', 'intermunicipal',
      'aviso', 'Esta carga será faturada com CT-e e MDF-e.',
      'mdfe_dispensavel_lotacao_sp', coalesce((v_par->>'mdfe_dispensavel_lotacao_sp')::boolean, false));
  end if;
  v_nfse := coalesce(v_par->'municipios_nfse', '[]'::jsonb) ? p_ibge_origem;
  if v_nfse then
    return jsonb_build_object('tipo', 'nfse', 'situacao', 'municipal_com_nfse',
      'aviso', 'Esta carga será faturada com NFS-e, sem MDF-e (frete dentro da capital). O CIOT continua obrigatório.');
  end if;
  return jsonb_build_object('tipo', null, 'situacao', 'municipal_sem_nfse',
    'aviso', 'Município sem NFS-e configurada. Falar com o contador antes de emitir.');
end;
$$;
revoke all on function public.detectar_documento_cliente(text, text[]) from public, anon;
grant execute on function public.detectar_documento_cliente(text, text[]) to authenticated, service_role;

-- Para as telas, enquanto o usuário digita (pré-cotação, cotação): p_destinos = [{"cidade": "...", "uf": "SP"}, ...]
create or replace function public.detectar_documento_por_cidades(p_cidade_origem text, p_uf_origem text, p_destinos jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select detectar_documento_cliente(
    ibge_municipio(p_cidade_origem, p_uf_origem),
    coalesce((select array_agg(ibge_municipio(d->>'cidade', d->>'uf')) from jsonb_array_elements(coalesce(p_destinos, '[]'::jsonb)) d), '{}')
  )
$$;
revoke all on function public.detectar_documento_por_cidades(text, text, jsonb) from public, anon;
grant execute on function public.detectar_documento_por_cidades(text, text, jsonb) to authenticated, service_role;

-- IBGE gravado junto da cidade/UF.
create or replace function public.preencher_ibge_cotacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.ibge_origem := ibge_municipio(new.cidade_origem, new.uf_origem);
  new.ibge_destino := ibge_municipio(new.cidade_destino, new.uf_destino);
  return new;
end;
$$;
create or replace function public.preencher_ibge_cotacao_destino()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.ibge_destino := ibge_municipio(new.cidade_destino, new.uf_destino);
  return new;
end;
$$;
revoke all on function public.preencher_ibge_cotacao() from public, anon;
revoke all on function public.preencher_ibge_cotacao_destino() from public, anon;

drop trigger if exists trg_preencher_ibge on public.cotacoes;
create trigger trg_preencher_ibge before insert or update of cidade_origem, uf_origem, cidade_destino, uf_destino on public.cotacoes
  for each row execute function public.preencher_ibge_cotacao();
drop trigger if exists trg_preencher_ibge on public.pre_cotacao_itens;
create trigger trg_preencher_ibge before insert or update of cidade_origem, uf_origem, cidade_destino, uf_destino on public.pre_cotacao_itens
  for each row execute function public.preencher_ibge_cotacao();
drop trigger if exists trg_preencher_ibge on public.cotacao_destinos;
create trigger trg_preencher_ibge before insert or update of cidade_destino, uf_destino on public.cotacao_destinos
  for each row execute function public.preencher_ibge_cotacao_destino();

-- Documento da operação: origem da cotação; destino = o trecho da operação (cotacao_destino_id), senão todos os
-- destinos da cotação (várias entregas), senão o destino da cotação.
create or replace function public.documento_da_operacao(p_operacao uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select detectar_documento_cliente(
    c.ibge_origem,
    case
      when o.cotacao_destino_id is not null then array[(select d.ibge_destino from cotacao_destinos d where d.id = o.cotacao_destino_id)]
      when exists (select 1 from cotacao_destinos d where d.cotacao_id = c.id) then (select array_agg(d.ibge_destino order by d.ordem) from cotacao_destinos d where d.cotacao_id = c.id)
      else array[c.ibge_destino]
    end
  )
  from operacoes o
  left join cotacoes c on c.id = o.cotacao_id
  where o.id = p_operacao
$$;
revoke all on function public.documento_da_operacao(uuid) from public, anon;
grant execute on function public.documento_da_operacao(uuid) to authenticated, service_role;

-- Recalcula e guarda na operação. Se o tipo mudar depois de detectado, registra a mudança (aviso na tela).
create or replace function public.recalcular_documento_operacao(p_operacao uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := documento_da_operacao(p_operacao);
  o record;
begin
  select id, tipo_documento_cliente, tipo_documento_detectado_em into o from operacoes where id = p_operacao;
  if o.id is null then
    return;
  end if;
  if o.tipo_documento_detectado_em is not null and o.tipo_documento_cliente is distinct from (r->>'tipo') then
    update operacoes set tipo_documento_cliente = r->>'tipo', tipo_documento_aviso = r->>'aviso', tipo_documento_detectado_em = now(), tipo_documento_mudou_em = now()
     where id = p_operacao;
    insert into auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
    values ('documento_cliente_mudou', 'operacoes', p_operacao, jsonb_build_object('tipo', o.tipo_documento_cliente), r,
            current_papel()::text, current_pessoa_id());
  else
    update operacoes set tipo_documento_cliente = r->>'tipo', tipo_documento_aviso = r->>'aviso', tipo_documento_detectado_em = coalesce(tipo_documento_detectado_em, now())
     where id = p_operacao and (tipo_documento_cliente is distinct from r->>'tipo' or tipo_documento_aviso is distinct from r->>'aviso' or tipo_documento_detectado_em is null);
  end if;
end;
$$;
revoke all on function public.recalcular_documento_operacao(uuid) from public, anon;
grant execute on function public.recalcular_documento_operacao(uuid) to authenticated, service_role;

create or replace function public.doc_cliente_ao_mudar_operacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_documento_operacao(new.id);
  return null;
end;
$$;
create or replace function public.doc_cliente_ao_mudar_cotacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- to_jsonb: a mesma função serve para cotacoes (id) e cotacao_destinos (cotacao_id)
  v_linha jsonb := to_jsonb(coalesce(new, old));
  v_cot uuid := (case when tg_table_name = 'cotacoes' then v_linha->>'id' else v_linha->>'cotacao_id' end)::uuid;
  v_op uuid;
begin
  for v_op in select id from operacoes where cotacao_id = v_cot loop
    perform recalcular_documento_operacao(v_op);
  end loop;
  return null;
end;
$$;
revoke all on function public.doc_cliente_ao_mudar_operacao() from public, anon;
revoke all on function public.doc_cliente_ao_mudar_cotacao() from public, anon;

drop trigger if exists trg_doc_cliente on public.operacoes;
create trigger trg_doc_cliente after insert or update of cotacao_id, cotacao_destino_id on public.operacoes
  for each row execute function public.doc_cliente_ao_mudar_operacao();
drop trigger if exists trg_doc_cliente on public.cotacoes;
-- (lista cidade/UF também: o IBGE é preenchido pelo trigger BEFORE, e "update of" só olha as colunas do SET)
create trigger trg_doc_cliente after update of cidade_origem, uf_origem, cidade_destino, uf_destino, ibge_origem, ibge_destino on public.cotacoes
  for each row when (old.ibge_origem is distinct from new.ibge_origem or old.ibge_destino is distinct from new.ibge_destino)
  execute function public.doc_cliente_ao_mudar_cotacao();
drop trigger if exists trg_doc_cliente on public.cotacao_destinos;
create trigger trg_doc_cliente after insert or update of cidade_destino, uf_destino, ibge_destino or delete on public.cotacao_destinos
  for each row execute function public.doc_cliente_ao_mudar_cotacao();

-- Preenche o que já existe (IBGE das cotações e o documento das operações).
update public.cotacoes set ibge_origem = public.ibge_municipio(cidade_origem, uf_origem), ibge_destino = public.ibge_municipio(cidade_destino, uf_destino)
 where ibge_origem is null or ibge_destino is null;
update public.cotacao_destinos set ibge_destino = public.ibge_municipio(cidade_destino, uf_destino) where ibge_destino is null;
update public.pre_cotacao_itens set ibge_origem = public.ibge_municipio(cidade_origem, uf_origem), ibge_destino = public.ibge_municipio(cidade_destino, uf_destino)
 where ibge_origem is null or ibge_destino is null;
select public.recalcular_documento_operacao(id) from public.operacoes where tipo_documento_detectado_em is null;

-- "Baixar documentação" do agenciador: só documentos liberados para ele, da operação dele, e só os do tipo detectado
-- (NFS-e quando a operação é nfse; CT-e e MDF-e quando é cte_mdfe).
create or replace function public.documentos_operacao_agenciador(p_operacao uuid)
returns table (tipo text, numero_documento text, chave_acesso text, url_pdf text, url_xml text, emitido_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o record;
begin
  select id, agenciador_id, tipo_documento_cliente into o from operacoes where id = p_operacao;
  if o.id is null or o.agenciador_id is distinct from current_pessoa_id() then
    raise exception 'Operação não encontrada.';
  end if;
  return query
    select d.tipo::text, d.numero_documento, d.chave_acesso, d.url_pdf, d.url_xml, d.emitido_em
      from documentacao_operacao d
     where d.operacao_id = p_operacao
       and d.disponivel_para_agenciador
       and d.status = 'emitido'
       and case o.tipo_documento_cliente
             when 'nfse' then d.tipo::text = 'nfse'
             when 'cte_mdfe' then d.tipo::text in ('cte', 'mdfe')
             else d.tipo::text not in ('cte', 'mdfe', 'nfse')
           end
     order by d.tipo;
end;
$$;
revoke all on function public.documentos_operacao_agenciador(uuid) from public, anon;
grant execute on function public.documentos_operacao_agenciador(uuid) to authenticated, service_role;
