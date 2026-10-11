-- Tarefa 8 (11/10/2026): contrato do agenciador assinado no gov.br (trava de segurança).
-- O risco de procedência da carga vem do agenciador: ele só opera com contrato VALIDADO pelo gestor.
-- Fluxo: o sistema gera o PDF do contrato (dados do agenciador + versão) -> o agenciador assina no assinador do gov.br
-- (conta prata/ouro) -> sobe o PDF assinado -> o gestor confere à mão (signatário = responsável, assinatura válida em
-- validar.iti.gov.br, versão correta) e marca validado ou recusado com motivo.
-- NÃO há integração com API de assinatura nem validação da assinatura por código.
-- Também cria contrato_config (campos {{...}} que não vêm do cadastro), usada pelo contrato do prestador (Tarefa 9).

-- ---------------------------------------------------------------- status no cadastro do agenciador
alter table public.pessoas
  add column if not exists status_contrato_agenciador text not null default 'sem_contrato',
  add column if not exists status_contrato_motivo text,
  add column if not exists status_contrato_em timestamptz,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_cpf text;
alter table public.pessoas drop constraint if exists pessoas_status_contrato_agenciador_chk;
alter table public.pessoas add constraint pessoas_status_contrato_agenciador_chk check (status_contrato_agenciador in
  ('sem_contrato', 'aguardando_assinatura', 'assinado_enviado', 'validado', 'recusado', 'suspenso'));
comment on column public.pessoas.responsavel_nome is 'Agenciador PJ: responsável que assina o contrato (gov.br). PF: vazio = a própria pessoa.';

-- O status só muda pelas funções abaixo (que ligam a flag rbr.contrato_rpc na transação).
create or replace function public.proteger_status_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('rbr.contrato_rpc', true), '') = '1' or eh_backend() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status_contrato_agenciador <> 'sem_contrato' then
      raise exception 'O status do contrato do agenciador só muda pelo fluxo do contrato.';
    end if;
  elsif new.status_contrato_agenciador is distinct from old.status_contrato_agenciador
     or new.status_contrato_motivo is distinct from old.status_contrato_motivo
     or new.status_contrato_em is distinct from old.status_contrato_em then
    raise exception 'O status do contrato do agenciador só muda pelo fluxo do contrato.';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_status_contrato() from public, anon;
drop trigger if exists trg_proteger_status_contrato on public.pessoas;
create trigger trg_proteger_status_contrato before insert or update on public.pessoas
  for each row execute function public.proteger_status_contrato();

create or replace function public.mudar_status_contrato(p_agenciador uuid, p_status text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_antes text;
begin
  select status_contrato_agenciador into v_antes from pessoas where id = p_agenciador;
  perform set_config('rbr.contrato_rpc', '1', true);
  update pessoas set status_contrato_agenciador = p_status, status_contrato_motivo = p_motivo, status_contrato_em = now() where id = p_agenciador;
  perform set_config('rbr.contrato_rpc', '', true);
  insert into auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
  values ('contrato_agenciador_status', 'pessoas', p_agenciador::text, jsonb_build_object('status', v_antes),
          jsonb_build_object('status', p_status, 'motivo', p_motivo), current_papel()::text, current_pessoa_id());
end;
$$;
revoke all on function public.mudar_status_contrato(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- campos {{...}} configuráveis
create table if not exists public.contrato_config (
  tipo text not null check (tipo in ('prestador', 'agenciador')),
  chave text not null,
  valor text,
  descricao text,
  updated_at timestamptz not null default now(),
  primary key (tipo, chave)
);
alter table public.contrato_config enable row level security;
drop policy if exists gestor_acesso_total on public.contrato_config;
create policy gestor_acesso_total on public.contrato_config for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select, insert, update, delete on public.contrato_config to authenticated;
grant all on public.contrato_config to service_role;

insert into public.contrato_config (tipo, chave, descricao) values
  ('agenciador', 'prazo_atualizacao_cadastro', 'Prazo para o agenciador atualizar o cadastro'),
  ('agenciador', 'prazo_retencao_dias', 'Dias de retenção da comissão sob apuração'),
  ('agenciador', 'comissao_regra', 'Regra da comissão'),
  ('agenciador', 'prazo_pagamento_comissao', 'Prazo de pagamento da comissão'),
  ('agenciador', 'observacao_tributaria_agenciador', 'Observação tributária (definir com o contador)'),
  ('agenciador', 'aviso_previo_dias', 'Aviso prévio para encerrar o contrato (dias)'),
  ('agenciador', 'multa_contratual_agenciador', 'Multa contratual'),
  ('agenciador', 'ajuste_multa_juridico', 'Ajuste da multa (advogado)'),
  ('agenciador', 'contato_encarregado', 'Contato do encarregado de dados (LGPD)'),
  ('agenciador', 'representante_rbr', 'Representante legal da RBR que assina'),
  ('agenciador', 'foro', 'Foro do contrato'),
  ('prestador', 'prazo_pagamento_dias_uteis', 'Prazo de pagamento do frete (dias úteis)'),
  ('prestador', 'marco_do_prazo', 'Marco que inicia a contagem do prazo de pagamento'),
  ('prestador', 'dia_envio_nfse', 'Dia do mês para o prestador enviar a NFS-e'),
  ('prestador', 'prazo_atualizacao_cadastro', 'Prazo para o prestador atualizar o cadastro'),
  ('prestador', 'prazo_bo_horas', 'Prazo para registrar boletim de ocorrência (horas)'),
  ('prestador', 'aviso_previo_dias', 'Aviso prévio para encerrar o contrato (dias)'),
  ('prestador', 'multa_contratual', 'Multa contratual'),
  ('prestador', 'ajuste_multa_juridico', 'Ajuste da multa (advogado)'),
  ('prestador', 'observacao_irrf_iss', 'Observação sobre IRRF e ISS (definir com o contador)'),
  ('prestador', 'canal_denuncia', 'Canal de denúncia'),
  ('prestador', 'prazo_retencao_dias', 'Dias de retenção do pagamento sob apuração'),
  ('prestador', 'contato_encarregado', 'Contato do encarregado de dados (LGPD)'),
  ('prestador', 'representante_rbr', 'Representante legal da RBR que assina'),
  ('prestador', 'foro', 'Foro do contrato')
on conflict (tipo, chave) do nothing;

-- Campos que vêm do cadastro (não ficam em contrato_config).
create or replace function public.campos_do_cadastro(p_tipo text, p_pessoa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'prestador' then jsonb_build_object(
      'prestador_nome', p.nome,
      'prestador_documento', coalesce(nullif(p.cnpj, ''), p.cpf),
      'prestador_tipo', case p.tipo_parceiro when 'tac_pf' then 'Transportador Autônomo de Cargas (TAC), pessoa física'
                                              when 'mei_caminhoneiro' then 'MEI Caminhoneiro'
                                              when 'etc' then 'Empresa de Transporte de Cargas (ETC)' end,
      'prestador_rntrc', p.rntrc_numero)
    else jsonb_build_object(
      'agenciador_nome', p.nome,
      'agenciador_documento', coalesce(nullif(p.cnpj, ''), p.cpf),
      'agenciador_responsavel', coalesce(nullif(p.responsavel_nome, ''), p.nome)
        || coalesce(' (CPF ' || nullif(coalesce(nullif(p.responsavel_cpf, ''), case when p.cnpj is null then p.cpf end), '') || ')', ''))
  end
  from pessoas p where p.id = p_pessoa
$$;
revoke all on function public.campos_do_cadastro(text, uuid) from public, anon;

create or replace function public.chaves_do_cadastro(p_tipo text)
returns text[] language sql immutable as $$
  select case p_tipo
    when 'prestador' then array['prestador_nome', 'prestador_documento', 'prestador_tipo', 'prestador_rntrc']
    else array['agenciador_nome', 'agenciador_documento', 'agenciador_responsavel']
  end
$$;

-- Agora o texto é renderizado com os campos {{...}}: do cadastro e de contrato_config. Campo sem valor fica como {{chave}}.
create or replace function public.renderizar_termo(p_termo uuid, p_pessoa uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t record;
  v_texto text;
  v_campos jsonb;
  k text;
  v text;
begin
  select * into t from termos_contrato where id = p_termo;
  v_texto := t.texto;
  v_campos := coalesce((select jsonb_object_agg(chave, valor) from contrato_config where tipo = t.tipo and nullif(btrim(valor), '') is not null), '{}'::jsonb)
           || coalesce(case when p_pessoa is not null then jsonb_strip_nulls(campos_do_cadastro(t.tipo, p_pessoa)) end, '{}'::jsonb);
  for k, v in select key, value from jsonb_each_text(v_campos) loop
    v_texto := replace(v_texto, '{{' || k || '}}', v);
  end loop;
  return v_texto;
end;
$$;
revoke all on function public.renderizar_termo(uuid, uuid) from public, anon;
grant execute on function public.renderizar_termo(uuid, uuid) to service_role;

-- Campos {{...}} do texto que ainda estão sem valor na configuração (os do cadastro não contam).
create or replace function public.campos_pendentes_termo(p_termo uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with t as (select tipo, texto from termos_contrato where id = p_termo),
  usados as (select distinct m[1] as chave from t, regexp_matches(t.texto, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') as m)
  select coalesce(array_agg(u.chave order by u.chave), '{}')
  from usados u, t
  where u.chave <> all (chaves_do_cadastro(t.tipo))
    and not exists (select 1 from contrato_config c where c.tipo = t.tipo and c.chave = u.chave and nullif(btrim(c.valor), '') is not null)
$$;
revoke all on function public.campos_pendentes_termo(uuid) from public, anon;
grant execute on function public.campos_pendentes_termo(uuid) to authenticated, service_role;

-- Publicar: campos pendentes e texto ainda não importado BLOQUEIAM; cláusulas de aceite só são exigidas no prestador.
create or replace function public.publicar_termo(p_termo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_pend text[];
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor da RBR publica termos e contratos.';
  end if;
  select * into t from termos_contrato where id = p_termo for update;
  if t.id is null or t.status <> 'rascunho' then
    raise exception 'Só um rascunho pode ser publicado.';
  end if;
  if position('[IMPORTAR' in t.texto) > 0 then
    raise exception 'O texto da minuta ainda não foi importado.';
  end if;
  v_pend := campos_pendentes_termo(p_termo);
  if coalesce(array_length(v_pend, 1), 0) > 0 then
    raise exception 'Campos pendentes no contrato: %. Preencha em Conformidade > Termos e contratos.', array_to_string(v_pend, ', ');
  end if;
  if t.tipo = 'prestador' and not exists (select 1 from termos_contrato_clausulas where termo_id = p_termo) then
    raise exception 'A versão não tem cláusulas para aceite.';
  end if;
  update termos_contrato set status = 'arquivado' where tipo = t.tipo and status = 'publicado';
  update termos_contrato set status = 'publicado', publicado_em = now(), publicado_por = current_pessoa_id() where id = p_termo;
end;
$$;
revoke all on function public.publicar_termo(uuid) from public, anon;
grant execute on function public.publicar_termo(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- envios do contrato assinado
create table if not exists public.contratos_agenciador (
  id uuid primary key default gen_random_uuid(),
  agenciador_id uuid not null references public.pessoas(id),
  termo_id uuid not null references public.termos_contrato(id),
  versao integer not null,
  arquivo_path text not null,
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  enviado_em timestamptz not null default now(),
  status text not null default 'enviado' check (status in ('enviado', 'validado', 'recusado')),
  conferencia jsonb,
  motivo text,
  validado_por uuid references public.pessoas(id),
  validado_em timestamptz
);
create index if not exists contratos_agenciador_idx on public.contratos_agenciador (agenciador_id, enviado_em desc);
alter table public.contratos_agenciador enable row level security;
drop policy if exists gestor_acesso_total on public.contratos_agenciador;
create policy gestor_acesso_total on public.contratos_agenciador for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
drop policy if exists agenciador_le_os_seus on public.contratos_agenciador;
create policy agenciador_le_os_seus on public.contratos_agenciador for select to authenticated
  using (agenciador_id = (select current_pessoa_id()));
grant select on public.contratos_agenciador to authenticated;
grant all on public.contratos_agenciador to service_role;

-- Bucket privado dos contratos: <tipo>/<pessoa_id>/arquivo.pdf. Dono lê e envia na própria pasta; gestor tudo.
insert into storage.buckets (id, name, public) values ('contratos', 'contratos', false) on conflict (id) do nothing;
drop policy if exists contratos_gestor on storage.objects;
create policy contratos_gestor on storage.objects for all to authenticated
  using (bucket_id = 'contratos' and (select current_papel()) = 'gestor_rbr'::papel_pessoa)
  with check (bucket_id = 'contratos' and (select current_papel()) = 'gestor_rbr'::papel_pessoa);
drop policy if exists contratos_dono_le on storage.objects;
create policy contratos_dono_le on storage.objects for select to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[2] = (select current_pessoa_id())::text);
drop policy if exists contratos_dono_envia on storage.objects;
create policy contratos_dono_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos' and (storage.foldername(name))[2] = (select current_pessoa_id())::text);

-- Agenciador: contrato para baixar (texto preenchido + versão). Passa o status para "aguardando assinatura".
create or replace function public.contrato_agenciador_gerar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pessoa uuid := current_pessoa_id();
  v_termo uuid := termo_publicado('agenciador');
  t record;
  v_status text;
begin
  if (select current_papel()) is distinct from 'agenciador'::papel_pessoa then
    raise exception 'Só o agenciador gera o próprio contrato.';
  end if;
  if v_termo is null then
    raise exception 'O contrato do agenciador ainda não foi publicado pela RBR.';
  end if;
  select * into t from termos_contrato where id = v_termo;
  select status_contrato_agenciador into v_status from pessoas where id = v_pessoa;
  if v_status in ('sem_contrato', 'recusado') then
    perform mudar_status_contrato(v_pessoa, 'aguardando_assinatura', null);
  end if;
  return jsonb_build_object('termo_id', t.id, 'versao', t.versao, 'titulo', t.titulo, 'minuta', t.minuta, 'texto', renderizar_termo(t.id, v_pessoa));
end;
$$;
revoke all on function public.contrato_agenciador_gerar() from public, anon;
grant execute on function public.contrato_agenciador_gerar() to authenticated;

-- Agenciador: registra o PDF assinado que subiu para o bucket (na própria pasta).
create or replace function public.contrato_agenciador_enviar(p_path text, p_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pessoa uuid := current_pessoa_id();
  v_termo uuid := termo_publicado('agenciador');
  v_status text;
begin
  if (select current_papel()) is distinct from 'agenciador'::papel_pessoa then
    raise exception 'Só o agenciador envia o próprio contrato.';
  end if;
  if v_termo is null then
    raise exception 'O contrato do agenciador ainda não foi publicado pela RBR.';
  end if;
  if p_path not like 'agenciador/' || v_pessoa::text || '/%' then
    raise exception 'Arquivo fora da sua pasta.';
  end if;
  select status_contrato_agenciador into v_status from pessoas where id = v_pessoa;
  if v_status = 'suspenso' then
    raise exception 'Agenciador suspenso: fale com a RBR.';
  end if;
  insert into contratos_agenciador (agenciador_id, termo_id, versao, arquivo_path, hash_sha256)
  values (v_pessoa, v_termo, (select versao from termos_contrato where id = v_termo), p_path, lower(p_hash));
  perform mudar_status_contrato(v_pessoa, 'assinado_enviado', null);
end;
$$;
revoke all on function public.contrato_agenciador_enviar(text, text) from public, anon;
grant execute on function public.contrato_agenciador_enviar(text, text) to authenticated;

-- Gestor: confere e valida ou recusa (motivo obrigatório na recusa; conferência completa na validação).
create or replace function public.contrato_agenciador_validar(p_envio uuid, p_aprovar boolean, p_motivo text, p_conferencia jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then
    raise exception 'Só o gestor da RBR valida contratos.';
  end if;
  select * into e from contratos_agenciador where id = p_envio for update;
  if e.id is null or e.status <> 'enviado' then
    raise exception 'Este envio já foi conferido.';
  end if;
  if p_aprovar then
    if not (coalesce((p_conferencia->>'signatario_confere')::boolean, false)
        and coalesce((p_conferencia->>'assinatura_valida')::boolean, false)
        and coalesce((p_conferencia->>'versao_correta')::boolean, false)) then
      raise exception 'Para validar, confirme os três itens da conferência.';
    end if;
    if e.versao <> (select versao from termos_contrato where id = termo_publicado('agenciador')) then
      raise exception 'O PDF é de uma versão que não está mais em vigor: peça a assinatura da versão atual.';
    end if;
  elsif nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da recusa.';
  end if;
  update contratos_agenciador
     set status = case when p_aprovar then 'validado' else 'recusado' end, conferencia = p_conferencia,
         motivo = nullif(btrim(p_motivo), ''), validado_por = current_pessoa_id(), validado_em = now()
   where id = p_envio;
  perform mudar_status_contrato(e.agenciador_id, case when p_aprovar then 'validado' else 'recusado' end, nullif(btrim(p_motivo), ''));
end;
$$;
revoke all on function public.contrato_agenciador_validar(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.contrato_agenciador_validar(uuid, boolean, text, jsonb) to authenticated;

-- Gestor: suspender trava novas cargas na hora (histórico preservado); reativar volta ao último status do contrato.
create or replace function public.agenciador_suspender(p_agenciador uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor da RBR suspende agenciadores.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da suspensão.';
  end if;
  perform mudar_status_contrato(p_agenciador, 'suspenso', btrim(p_motivo));
end;
$$;
revoke all on function public.agenciador_suspender(uuid, text) from public, anon;
grant execute on function public.agenciador_suspender(uuid, text) to authenticated, service_role;

create or replace function public.agenciador_reativar(p_agenciador uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_volta text;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then
    raise exception 'Só o gestor da RBR reativa agenciadores.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da reativação.';
  end if;
  select case when e.versao = (select versao from termos_contrato where id = termo_publicado('agenciador')) then 'validado' else 'sem_contrato' end
    into v_volta
    from contratos_agenciador e where e.agenciador_id = p_agenciador and e.status = 'validado' order by e.validado_em desc limit 1;
  perform mudar_status_contrato(p_agenciador, coalesce(v_volta, 'sem_contrato'), btrim(p_motivo));
end;
$$;
revoke all on function public.agenciador_reativar(uuid, text) from public, anon;
grant execute on function public.agenciador_reativar(uuid, text) to authenticated;

-- Agenciador: situação do próprio contrato (painel).
create or replace function public.meu_contrato_agenciador()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', p.status_contrato_agenciador,
    'motivo', p.status_contrato_motivo,
    'versao_publicada', (select versao from termos_contrato where id = termo_publicado('agenciador')),
    'ultimo_envio', (select jsonb_build_object('versao', e.versao, 'enviado_em', e.enviado_em, 'status', e.status, 'motivo', e.motivo)
                       from contratos_agenciador e where e.agenciador_id = p.id order by e.enviado_em desc limit 1)
  )
  from pessoas p where p.id = current_pessoa_id()
$$;
revoke all on function public.meu_contrato_agenciador() from public, anon;
grant execute on function public.meu_contrato_agenciador() to authenticated;

-- Nova versão publicada do contrato do agenciador: quem estava validado numa versão anterior volta a "sem contrato".
create or replace function public.contrato_agenciador_nova_versao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ag uuid;
begin
  if new.tipo = 'agenciador' and new.status = 'publicado' and old.status is distinct from 'publicado' then
    for v_ag in
      select p.id from pessoas p
       where p.papel = 'agenciador' and p.status_contrato_agenciador in ('validado', 'assinado_enviado', 'aguardando_assinatura')
         and not exists (select 1 from contratos_agenciador e where e.agenciador_id = p.id and e.termo_id = new.id and e.status = 'validado')
    loop
      perform mudar_status_contrato(v_ag, 'sem_contrato', format('Nova versão do contrato (v%s): assine de novo.', new.versao));
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.contrato_agenciador_nova_versao() from public, anon;
drop trigger if exists trg_contrato_agenciador_nova_versao on public.termos_contrato;
create trigger trg_contrato_agenciador_nova_versao after update of status on public.termos_contrato
  for each row execute function public.contrato_agenciador_nova_versao();

-- ---------------------------------------------------------------- TRAVAS
create or replace function public.agenciador_pode_operar(p_agenciador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_agenciador is null or exists (select 1 from pessoas where id = p_agenciador and status_contrato_agenciador = 'validado')
$$;
revoke all on function public.agenciador_pode_operar(uuid) from public, anon;
grant execute on function public.agenciador_pode_operar(uuid) to authenticated, service_role;

-- (1) cotação de agenciador não vira carga fechada sem contrato validado
create or replace function public.trava_contrato_cotacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'convertida' and (tg_op = 'INSERT' or old.status is distinct from 'convertida')
     and new.agenciador_id is not null and not agenciador_pode_operar(new.agenciador_id) then
    raise exception 'Contrato pendente: agenciador sem contrato validado (ou suspenso) não fecha carga.';
  end if;
  return new;
end;
$$;
revoke all on function public.trava_contrato_cotacao() from public, anon;
drop trigger if exists trg_trava_contrato_cotacao on public.cotacoes;
create trigger trg_trava_contrato_cotacao before insert or update of status on public.cotacoes
  for each row execute function public.trava_contrato_cotacao();

-- (2) não vira operação (cobre a conversão e o "abrir próximas cargas")
create or replace function public.trava_contrato_operacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.agenciador_id is not null and not agenciador_pode_operar(new.agenciador_id) then
    raise exception 'Contrato pendente: agenciador sem contrato validado (ou suspenso) não abre operação.';
  end if;
  return new;
end;
$$;
revoke all on function public.trava_contrato_operacao() from public, anon;
drop trigger if exists trg_trava_contrato_operacao on public.operacoes;
create trigger trg_trava_contrato_operacao before insert on public.operacoes
  for each row execute function public.trava_contrato_operacao();

-- (3) não baixa documentação
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
  if not agenciador_pode_operar(o.agenciador_id) then
    raise exception 'Contrato pendente: a documentação fica liberada depois que o contrato for validado pela RBR.';
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

-- Versão 1 do contrato do agenciador: rascunho com marcador [IMPORTAR] (bloqueia a publicação até o texto da minuta
-- claude/contrato-agenciador-minuta-2026-10-11.md ser importado pela tela) e todos os campos {{...}} da minuta.
do $seed$
begin
  if exists (select 1 from termos_contrato where tipo = 'agenciador') then
    return;
  end if;
  insert into termos_contrato (tipo, versao, titulo, texto, minuta) values ('agenciador', 1, 'Contrato de agenciamento de cargas',
$t$MINUTA PARA REVISÃO JURÍDICA

[IMPORTAR] Este é um espaço reservado. Importe o texto de claude/contrato-agenciador-minuta-2026-10-11.md em
Conformidade > Termos e contratos > Importar minuta. A publicação fica bloqueada até lá.

Campos da minuta: {{agenciador_nome}} {{agenciador_documento}} {{agenciador_responsavel}} {{prazo_atualizacao_cadastro}}
{{prazo_retencao_dias}} {{comissao_regra}} {{prazo_pagamento_comissao}} {{observacao_tributaria_agenciador}} {{aviso_previo_dias}}
{{multa_contratual_agenciador}} {{ajuste_multa_juridico}} {{contato_encarregado}} {{representante_rbr}} {{foro}}$t$, true);
end;
$seed$;
