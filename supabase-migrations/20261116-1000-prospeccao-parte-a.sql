-- Prospeccao (agente SDR), PARTE A: banco, pontuacao, flags e trilha de auditoria. ADITIVA. NAO APLICADA (o Pedro aplica).
-- Nada aqui envia e-mail, le caixa ou chama SMTP/IMAP. Flags nascem "nao".
-- Acesso: so gestor_rbr (RLS). Sem acesso anon. Escrita pelo front via policies; service_role so em backend.
-- Rollback: supabase/rollback/rollback-20261116-1000-prospeccao-parte-a.sql
set local lock_timeout = '8s';

-- ---------------------------------------------------------------------------------------------------------
-- 1) Pesos editaveis da pontuacao (14 criterios, soma 100)
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_pesos (
  criterio text primary key,
  rotulo text not null,
  peso int not null check (peso >= 0 and peso <= 100),
  ordem int not null
);
comment on table public.prospeccao_pesos is 'Prospeccao: peso de cada um dos 14 criterios da pontuacao. Editavel; alterar recalcula todas as empresas.';
insert into public.prospeccao_pesos (criterio, rotulo, peso, ordem) values
  ('funcionarios',        'Numero de funcionarios',             20, 1),
  ('segmento_cnae',       'Segmento / CNAE',                    12, 2),
  ('email_logistica',     'E-mail de logistica ou compras',     10, 3),
  ('vende_b2b',           'Vende B2B',                           8, 4),
  ('vagas_logistica',     'Vagas de expedicao/logistica/motorista', 8, 5),
  ('mais_de_uma_unidade', 'Mais de uma unidade',                 6, 6),
  ('interestadual',       'Interestadual ou exporta',            6, 7),
  ('capital_porte',       'Capital / porte',                     6, 8),
  ('perto_rodovia',       'Perto de rodovia ou polo',            6, 9),
  ('frota_propria',       'Frota propria',                       4, 10),
  ('cnpj_3_anos',         'Mais de 3 anos de CNPJ',              4, 11),
  ('nome_responsavel',    'Nome do responsavel',                 4, 12),
  ('telefone_whatsapp',   'Telefone / WhatsApp',                 3, 13),
  ('site_ativo',          'Site ativo',                          3, 14);

-- ---------------------------------------------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  cnae text,
  segmento text not null check (segmento in ('alimentos', 'bebidas', 'plasticos', 'metalurgia', 'maquinas')),
  cidade text,
  uf text check (uf is null or char_length(uf) = 2),
  funcionarios int check (funcionarios is null or funcionarios >= 0),
  site text,
  telefone text,
  veiculo_provavel text check (veiculo_provavel in ('bau', 'sider', 'graneleiro', 'prancha', 'munck')),
  cargas_semana_estimadas numeric,
  criterios jsonb not null default '{}'::jsonb,
  pontuacao int not null default 0,
  classe text not null default 'C' check (classe in ('A', 'B', 'C')),
  penalidade_risco boolean not null default false,
  penalidade_motivo text,
  status text not null default 'novo'
    check (status in ('novo', 'qualificado', 'em_aprovacao', 'em_contato', 'respondeu', 'quente', 'descartado', 'descadastrado', 'repouso')),
  repouso_ate date,
  origem_contato text not null check (char_length(btrim(origem_contato)) > 0),
  lead_id uuid references public.leads(id) on delete set null,
  responsavel_id uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index prospeccao_empresas_cnpj_uq on public.prospeccao_empresas (cnpj);
create index prospeccao_empresas_status_idx on public.prospeccao_empresas (status);
create index prospeccao_empresas_classe_idx on public.prospeccao_empresas (classe, pontuacao desc);
comment on table public.prospeccao_empresas is 'Prospeccao ativa (agente SDR): empresas-alvo. NAO misturar com leads (que chegam pelo Google Ads); ao responder pedindo cotacao vira leads com origem = prospeccao via lead_id.';
comment on column public.prospeccao_empresas.origem_contato is 'Onde obtivemos a empresa e o e-mail (obrigatorio, base de LGPD/legitimo interesse).';

create table public.prospeccao_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.prospeccao_empresas(id) on delete cascade,
  nome text,
  cargo text,
  email text not null,
  tipo_email text not null default 'pessoal' check (tipo_email in ('generico', 'pessoal')),
  validacao_status text not null default 'pendente'
    check (validacao_status in ('pendente', 'sintaxe_ok', 'mx_ok', 'verificado', 'catch_all', 'invalido', 'devolvido')),
  validado_em timestamptz,
  origem_contato text not null check (char_length(btrim(origem_contato)) > 0),
  criado_em timestamptz not null default now()
);
create unique index prospeccao_contatos_email_uq on public.prospeccao_contatos (empresa_id, lower(email));
create index prospeccao_contatos_email_idx on public.prospeccao_contatos (lower(email));
comment on table public.prospeccao_contatos is 'Prospeccao: contatos (e-mails) de cada empresa, com situacao de validacao e origem.';

create table public.prospeccao_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.prospeccao_empresas(id) on delete cascade,
  contato_id uuid not null references public.prospeccao_contatos(id) on delete cascade,
  toque int not null check (toque between 1 and 4),
  assunto text not null,
  corpo text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'descartado', 'enviado', 'falhou')),
  criado_por uuid references public.pessoas(id),
  aprovado_por uuid references public.pessoas(id),
  aprovado_em timestamptz,
  enviado_em timestamptz,
  message_id text,
  erro text,
  criado_em timestamptz not null default now()
);
create index prospeccao_mensagens_status_idx on public.prospeccao_mensagens (status, criado_em);
create index prospeccao_mensagens_empresa_idx on public.prospeccao_mensagens (empresa_id, toque);
comment on table public.prospeccao_mensagens is 'Prospeccao: mensagens (texto puro). Aprovar apenas muda o status; quem envia e o robo da Parte B.';

create table public.prospeccao_respostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.prospeccao_empresas(id) on delete cascade,
  mensagem_id uuid references public.prospeccao_mensagens(id) on delete set null,
  recebido_em timestamptz not null default now(),
  de_email text,
  assunto text,
  corpo text,
  classificacao text check (classificacao in ('cotacao', 'preco_prazo', 'nao_sou_eu', 'agora_nao', 'fora_do_escritorio', 'sair', 'reclamacao', 'outro')),
  rascunho_resposta text,
  assumido_por uuid references public.pessoas(id),
  assumido_em timestamptz,
  tratada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index prospeccao_respostas_empresa_idx on public.prospeccao_respostas (empresa_id, recebido_em desc);
comment on table public.prospeccao_respostas is 'Prospeccao: respostas recebidas (preenchida pelo robo de leitura da Parte B).';

create table public.prospeccao_bloqueio (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('email', 'dominio')),
  valor text not null check (valor = lower(valor)),
  motivo text not null check (motivo in ('sair', 'reclamacao', 'devolvido', 'manual')),
  constraint prospeccao_bloqueio_dominio_publico_ck check (tipo <> 'dominio' or valor not in
    ('gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'icloud.com')),
  criado_em timestamptz not null default now()
);
create unique index prospeccao_bloqueio_valor_uq on public.prospeccao_bloqueio (valor);
comment on table public.prospeccao_bloqueio is 'Prospeccao: lista global de bloqueio (e-mail ou dominio). Ninguem aqui pode ter mensagem aprovada.';

create table public.prospeccao_envio_diario (
  data date primary key,
  enviados int not null default 0,
  devolvidos int not null default 0,
  descadastros int not null default 0,
  respostas int not null default 0
);
comment on table public.prospeccao_envio_diario is 'Prospeccao: contadores por dia (somente leitura na Parte A; preenchida pelos robos da Parte B).';

-- ---------------------------------------------------------------------------------------------------------
-- 3) Pontuacao: funcao + gatilhos (pesos vem da tabela, nada hardcoded)
-- ---------------------------------------------------------------------------------------------------------
create function public.prospeccao_calcular_pontuacao(p_criterios jsonb, p_funcionarios int, p_penalidade boolean)
returns table (pontuacao int, classe text)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_soma numeric;
  v_pont int;
  v_classe text;
begin
  select coalesce(sum(
           least(1, greatest(0, coalesce(nullif(p_criterios ->> p.criterio, '')::numeric, 0))) * p.peso), 0)
    into v_soma
    from public.prospeccao_pesos p;
  v_pont := round(v_soma)::int;
  v_classe := case when v_pont >= 70 then 'A' when v_pont >= 50 then 'B' else 'C' end;
  if p_funcionarios is not null and p_funcionarios < 50 then v_classe := 'C'; end if;
  if coalesce(p_penalidade, false) then
    v_classe := case v_classe when 'A' then 'B' else 'C' end;
  end if;
  return query select v_pont, v_classe;
end $$;

create function public.trg_fn_prospeccao_empresa_pontuar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  select c.pontuacao, c.classe into new.pontuacao, new.classe
    from public.prospeccao_calcular_pontuacao(new.criterios, new.funcionarios, new.penalidade_risco) c;
  new.atualizado_em := now();
  return new;
end $$;
create trigger trg_prospeccao_empresa_pontuar before insert or update of criterios, funcionarios, penalidade_risco
  on public.prospeccao_empresas for each row execute function public.trg_fn_prospeccao_empresa_pontuar();

-- Mudou um peso: recalcula todas as empresas (o gatilho acima faz a conta).
create function public.trg_fn_prospeccao_pesos_recalcular() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.prospeccao_empresas set criterios = criterios;
  return null;
end $$;
create trigger trg_prospeccao_pesos_recalcular after update of peso on public.prospeccao_pesos
  for each statement execute function public.trg_fn_prospeccao_pesos_recalcular();

-- ---------------------------------------------------------------------------------------------------------
-- 4) Bloqueio na aprovacao + auditoria (aprovar, descartar, bloquear)
-- ---------------------------------------------------------------------------------------------------------
create function public.prospeccao_contato_bloqueado(p_email text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.prospeccao_bloqueio b
     where (b.tipo = 'email' and b.valor = lower(p_email))
        or (b.tipo = 'dominio' and b.valor = lower(split_part(p_email, '@', 2)))
  );
$$;

create function public.trg_fn_prospeccao_mensagem_regras() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text;
  v_valid text;
  v_status_emp text;
begin
  if new.status = 'aprovado' and (tg_op = 'INSERT' or old.status is distinct from 'aprovado') then
    select c.email, c.validacao_status into v_email, v_valid from public.prospeccao_contatos c where c.id = new.contato_id;
    select e.status into v_status_emp from public.prospeccao_empresas e where e.id = new.empresa_id;
    if v_valid in ('invalido', 'devolvido') then
      raise exception 'Nao da para aprovar: o e-mail do contato esta marcado como %.', v_valid;
    end if;
    if public.prospeccao_contato_bloqueado(v_email) then
      raise exception 'Nao da para aprovar: o e-mail ou o dominio do contato esta na lista de bloqueio.';
    end if;
    if v_status_emp in ('descartado', 'descadastrado') then
      raise exception 'Nao da para aprovar: a empresa esta %.', v_status_emp;
    end if;
    new.aprovado_por := coalesce(new.aprovado_por, public.current_pessoa_id());
    new.aprovado_em := coalesce(new.aprovado_em, now());
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('aprovado', 'descartado') then
    insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
    values (public.current_pessoa_id(), public.current_papel()::text,
            'prospeccao_mensagem_' || new.status, 'prospeccao_mensagens', new.id,
            jsonb_build_object('status', old.status),
            jsonb_build_object('status', new.status, 'empresa_id', new.empresa_id, 'toque', new.toque));
  end if;
  return new;
end $$;
create trigger trg_prospeccao_mensagem_regras before insert or update on public.prospeccao_mensagens
  for each row execute function public.trg_fn_prospeccao_mensagem_regras();

create function public.trg_fn_prospeccao_bloqueio_auditoria() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
  values (public.current_pessoa_id(), public.current_papel()::text,
          case tg_op when 'INSERT' then 'prospeccao_bloqueio_adicionado' else 'prospeccao_bloqueio_removido' end,
          'prospeccao_bloqueio', coalesce(new.id, old.id),
          case when tg_op = 'DELETE' then to_jsonb(old) end,
          case when tg_op = 'INSERT' then to_jsonb(new) end);
  return null;
end $$;
create trigger trg_prospeccao_bloqueio_auditoria after insert or delete on public.prospeccao_bloqueio
  for each row execute function public.trg_fn_prospeccao_bloqueio_auditoria();

-- Auditoria pedida pelo front (importacao de planilha, geracao de rascunhos): so acoes prospeccao_*, so gestor.
create function public.prospeccao_auditar(p_acao text, p_dado jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_papel() is distinct from 'gestor_rbr' then raise exception 'Sem permissao.'; end if;
  if p_acao is null or p_acao !~ '^prospeccao_[a-z_]{3,60}$' then raise exception 'Acao de auditoria invalida.'; end if;
  insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, dado_depois)
  values (public.current_pessoa_id(), public.current_papel()::text, p_acao, 'prospeccao', coalesce(p_dado, '{}'::jsonb));
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 5) Flags (parametros_sistema, mesmo padrao do Escudo). So o usuario do Pedro troca as chaves de liberacao.
-- ---------------------------------------------------------------------------------------------------------
insert into public.parametros_sistema (chave, valor, descricao) values
  ('PROSPECCAO_UI_LIBERADA',    '"nao"'::jsonb, 'Prospeccao: mostra a aba no gestor. So "sim" libera.'),
  ('PROSPECCAO_ENVIO_LIBERADO', '"nao"'::jsonb, 'Prospeccao: chave geral de envio (kill switch). So "sim" libera.'),
  ('PROSPECCAO_LIMITE_DIARIO',  '10'::jsonb,    'Prospeccao: limite diario de e-mails enviados.')
on conflict (chave) do nothing;

create function public.prospeccao_eh_pedro() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  -- Compara a pessoa logada com o parametro PROSPECCAO_ADMIN_PESSOA_ID (jsonb string com um uuid, preenchido pelo Pedro ao aplicar).
  -- Falha fechado: parametro ausente, vazio ou diferente = false.
  select coalesce(
           (select (pr.valor #>> '{}') = public.current_pessoa_id()::text
              from public.parametros_sistema pr
             where pr.chave = 'PROSPECCAO_ADMIN_PESSOA_ID'
               and jsonb_typeof(pr.valor) = 'string'),
           false)
     and exists (select 1 from public.pessoas p where p.id = public.current_pessoa_id() and p.papel = 'gestor_rbr');
$$;

create function public.trg_fn_prospeccao_flag_guarda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_chave text := coalesce(new.chave, old.chave);
begin
  if v_chave not like 'PROSPECCAO\_%' then return coalesce(new, old); end if;
  -- Backend (service_role / migration) nao tem pessoa logada: passa. Gestor: chaves de liberacao so o Pedro.
  if public.current_pessoa_id() is not null
     and v_chave <> 'PROSPECCAO_LIMITE_DIARIO'
     and not public.prospeccao_eh_pedro() then
    raise exception 'So o usuario do Pedro pode alterar a chave %.', v_chave;
  end if;
  if tg_op <> 'DELETE' then
    insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, dado_antes, dado_depois)
    values (public.current_pessoa_id(), public.current_papel()::text, 'prospeccao_flag_alterada', 'parametros_sistema',
            case when tg_op = 'UPDATE' then jsonb_build_object('chave', v_chave, 'valor', old.valor) end,
            jsonb_build_object('chave', v_chave, 'valor', new.valor));
    return new;
  end if;
  return old;
end $$;
create trigger trg_prospeccao_flag_guarda before insert or update or delete on public.parametros_sistema
  for each row execute function public.trg_fn_prospeccao_flag_guarda();

-- ---------------------------------------------------------------------------------------------------------
-- 6) RLS: so gestor_rbr; sem anon
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_pesos enable row level security;
alter table public.prospeccao_empresas enable row level security;
alter table public.prospeccao_contatos enable row level security;
alter table public.prospeccao_mensagens enable row level security;
alter table public.prospeccao_respostas enable row level security;
alter table public.prospeccao_bloqueio enable row level security;
alter table public.prospeccao_envio_diario enable row level security;

create policy prospeccao_pesos_gestor on public.prospeccao_pesos for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_empresas_gestor on public.prospeccao_empresas for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_contatos_gestor on public.prospeccao_contatos for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_mensagens_gestor on public.prospeccao_mensagens for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_respostas_gestor on public.prospeccao_respostas for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_bloqueio_gestor on public.prospeccao_bloqueio for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_envio_diario_gestor on public.prospeccao_envio_diario for select to authenticated
  using (public.current_papel() = 'gestor_rbr');

revoke all on public.prospeccao_pesos, public.prospeccao_empresas, public.prospeccao_contatos, public.prospeccao_mensagens,
  public.prospeccao_respostas, public.prospeccao_bloqueio, public.prospeccao_envio_diario from anon;

-- Funcoes: gatilhos nao precisam de EXECUTE; as chamadas pelo front ficam so para authenticated (checam o papel por dentro).
revoke all on function public.trg_fn_prospeccao_empresa_pontuar() from public, anon, authenticated;
revoke all on function public.trg_fn_prospeccao_pesos_recalcular() from public, anon, authenticated;
revoke all on function public.trg_fn_prospeccao_mensagem_regras() from public, anon, authenticated;
revoke all on function public.trg_fn_prospeccao_bloqueio_auditoria() from public, anon, authenticated;
revoke all on function public.trg_fn_prospeccao_flag_guarda() from public, anon, authenticated;
revoke all on function public.prospeccao_contato_bloqueado(text) from public, anon, authenticated;
revoke all on function public.prospeccao_eh_pedro() from public, anon;
revoke all on function public.prospeccao_calcular_pontuacao(jsonb, int, boolean) from public, anon;
revoke all on function public.prospeccao_auditar(text, jsonb) from public, anon;
grant execute on function public.prospeccao_eh_pedro() to authenticated;
grant execute on function public.prospeccao_calcular_pontuacao(jsonb, int, boolean) to authenticated;
grant execute on function public.prospeccao_auditar(text, jsonb) to authenticated;
