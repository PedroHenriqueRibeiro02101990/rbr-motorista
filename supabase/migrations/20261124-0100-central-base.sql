-- Central (painel de controle do Pedro + Fila do SDR) 24/11/2026. ADITIVA: so cria objetos novos (prefixo central_), uma coluna nova em prospeccao_base e parametros novos.
-- Depende de: 20261116-1000..1410 (prospeccao_*, prospeccao_eh_pedro) e 20261119-0100-radar-modulo (prospeccao_base).
-- Rollback: supabase/rollback/rollback-20261124-0100-central-base.sql
-- STATUS: NAO APLICADA. So aplicar quando o Pedro escrever "pode aplicar". Aplicar inteira, uma vez.
-- Nao altera nem apaga dado de prospeccao_* nem de leads. Nao muda nenhuma flag PROSPECCAO_*. Nao guarda segredo.
set local lock_timeout = '8s';

-- ---------------------------------------------------------------------------------------------------------
-- 1) Parametros novos (valores iniciais seguros)
-- ---------------------------------------------------------------------------------------------------------
insert into public.parametros_sistema (chave, valor, descricao) values
  ('CENTRAL_UI_LIBERADA',       '"nao"'::jsonb, 'Central: mostra o grupo Central no menu do gestor. So "sim" libera.'),
  ('CENTRAL_SDR_CORTE_NOTA',    '""'::jsonb,    'Central: nota minima para empresa com telefone entrar na Fila do SDR. VAZIO ate o Pedro escolher (ver distribuicao de prospeccao_base.pontuacao). Vazio = so quem respondeu entra.'),
  ('CENTRAL_SDR_MAX_DIA',       '10'::jsonb,    'Central: maximo de empresas NOVAS por dia na Fila do SDR (por nota).'),
  ('CENTRAL_IMPORTAR_AUTO',     '"nao"'::jsonb, 'Central: "sim" = quando a LISTAS termina, cria sozinho o comando importar_base.'),
  ('CENTRAL_AGENTE_PESSOA_ID',  '""'::jsonb,    'Central: id (pessoas) do login proprio do Agente RBR. Preenchido pelo Pedro depois de criar o usuario do agente.'),
  ('CENTRAL_SDR_PESSOAS',       coalesce((select jsonb_agg(p.id::text) from public.pessoas p where p.nome = 'José Carlos' and p.papel = 'gestor_rbr' and p.deleted_at is null), '[]'::jsonb),
                                'Central: pessoas (alem do Pedro) que veem e trabalham a Fila do SDR. Para liberar a pre-vendedores em janeiro, basta incluir o id aqui.')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 1b) Papel proprio do agente: "agente_central". Nao reaproveita "operacao" (esse papel le/escreve clientes, cotacoes, operacoes, documentos fiscais, CIOT/VPO e
--     dois buckets de documentos). Este valor novo nao aparece em NENHUMA politica existente: sem as funcoes central_*, ele nao le nem altera nada do sistema.
--     (Nota: o valor novo so pode ser USADO depois do commit; por isso as funcoes abaixo comparam por texto.)
-- ---------------------------------------------------------------------------------------------------------
alter type public.papel_pessoa add value if not exists 'agente_central';

-- ---------------------------------------------------------------------------------------------------------
-- 2) Quem e quem (falha fechado). admin = Pedro (mesma regra do Radar); sdr = admin + lista; agente = login proprio do agente do PC.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.central_eh_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.prospeccao_eh_pedro(), false);
$$;

create or replace function public.central_eh_sdr() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.central_eh_admin()
      or coalesce((
           select exists (
             select 1 from public.parametros_sistema pr, jsonb_array_elements_text(pr.valor) x
              where pr.chave = 'CENTRAL_SDR_PESSOAS' and jsonb_typeof(pr.valor) = 'array'
                and x = public.current_pessoa_id()::text)
           and exists (select 1 from public.pessoas p where p.id = public.current_pessoa_id() and p.papel = 'gestor_rbr')
         ), false);
$$;

create or replace function public.central_eh_agente() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (pr.valor #>> '{}') = public.current_pessoa_id()::text
                     from public.parametros_sistema pr
                    where pr.chave = 'CENTRAL_AGENTE_PESSOA_ID' and jsonb_typeof(pr.valor) = 'string'
                      and (pr.valor #>> '{}') <> ''), false)
     -- so vale se a pessoa tiver o papel proprio do agente (se o id for de um gestor ou de qualquer outro papel, falha fechado)
     and exists (select 1 from public.pessoas p where p.id = public.current_pessoa_id() and p.papel::text = 'agente_central');
$$;

-- So o Pedro muda chaves CENTRAL_* (backend/migration, sem pessoa logada, passa). Audita a troca.
create or replace function public.trg_fn_central_flag_guarda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_chave text := coalesce(new.chave, old.chave);
begin
  if v_chave not like 'CENTRAL\_%' then return coalesce(new, old); end if;
  if public.current_pessoa_id() is not null and not public.central_eh_admin() then
    raise exception 'So o usuario do Pedro pode alterar a chave %.', v_chave;
  end if;
  if tg_op <> 'DELETE' then
    insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, dado_antes, dado_depois)
    values (public.current_pessoa_id(), public.current_papel()::text, 'central_flag_alterada', 'parametros_sistema',
            case when tg_op = 'UPDATE' then jsonb_build_object('chave', v_chave, 'valor', old.valor) end,
            jsonb_build_object('chave', v_chave, 'valor', new.valor));
    return new;
  end if;
  return old;
end $$;
create trigger trg_central_flag_guarda before insert or update or delete on public.parametros_sistema
  for each row execute function public.trg_fn_central_flag_guarda();

-- ---------------------------------------------------------------------------------------------------------
-- 3) Coluna nova na base (so acrescenta): marca de que lote veio cada empresa, para o DESFAZER do lote.
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_base add column if not exists lote_importacao text;
create index if not exists prospeccao_base_lote_idx on public.prospeccao_base (lote_importacao) where lote_importacao is not null;

-- ---------------------------------------------------------------------------------------------------------
-- 4) Tabelas central_*
-- ---------------------------------------------------------------------------------------------------------
create table public.central_robos (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  nome text not null,
  onde_roda text not null check (onde_roda in ('pc','nuvem')),
  tipo text not null check (tipo in ('servico','agendado')),
  hora text check (hora is null or hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ligado boolean not null default false,
  travado boolean not null default false,              -- fiscal/Repom: sem botao, nunca liga
  bloqueado_motivo text,                               -- nao nulo = chave bloqueada (ex.: Radar ainda nao le as regras de resposta)
  flag_chave text references public.parametros_sistema(chave) on update cascade,  -- quando o robo E uma flag de parametros_sistema
  ultimo_inicio timestamptz,
  ultimo_fim timestamptz,
  ultimo_resultado text,
  atualizado_em timestamptz not null default now(),
  check (not (travado and ligado))
);
comment on table public.central_robos is 'Central: um cartao por robo. Garimpo e Central LISTAS sao UM so (garimpo_listas). Robo-flag: ligado vem da flag, nao desta coluna.';

create table public.central_comandos (
  id uuid primary key default gen_random_uuid(),
  robo_id text references public.central_robos(id),
  comando text not null check (comando in ('ligar','desligar','rodar','pausar','retomar','importar_base','encerrar_processo')),
  parametros jsonb not null default '{}'::jsonb,       -- importar_base: {lote, total_empresas, total_contatos}; encerrar_processo: {pid, inicio}
  pedido_por uuid references public.pessoas(id),
  status text not null default 'pendente' check (status in ('pendente','executando','feito','erro')),
  resultado text,
  progresso jsonb,                                     -- importar_base: {lotes_total, lotes_feitos, enviadas, repetidas, erros}
  criado_em timestamptz not null default now(),
  feito_em timestamptz,
  check ((comando in ('importar_base','encerrar_processo')) or robo_id is not null),
  check (comando <> 'encerrar_processo' or (parametros ? 'pid' and parametros ? 'inicio'))
);
create index central_comandos_pendentes_idx on public.central_comandos (criado_em) where status in ('pendente','executando');
create unique index central_comandos_importar_aberto_uidx on public.central_comandos ((comando)) where comando = 'importar_base' and status in ('pendente','executando');

create table public.central_heartbeat (
  maquina text primary key check (char_length(maquina) between 1 and 60),
  ultimo_batimento timestamptz not null default now(),
  versao_agente text,
  -- resumo_json guarda, entre outros, "processos": [{pid, nome, arquivo, inicio, memoria_mb, dono}] (bloco V8). dono = id do robo da Central ou "sem dono".
  resumo_json jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(resumo_json) = 'object'),
  check (jsonb_typeof(resumo_json -> 'processos') is null or jsonb_typeof(resumo_json -> 'processos') = 'array')
);
comment on column public.central_heartbeat.resumo_json is 'Livre, mas "processos" (se existir) e uma lista: [{pid, nome, arquivo, inicio, memoria_mb, dono}]. Nunca guardar segredo nem linha de comando completa.';

create table public.central_uso (
  id uuid primary key default gen_random_uuid(),
  servico text not null check (servico in ('qev','verifalia','exa','tavily','serper','ia_gratis','claude_noite')),
  periodo text not null check (periodo in ('dia','mes')),
  referencia date not null,                            -- dia: a data; mes: primeiro dia do mes
  usado numeric not null default 0 check (usado >= 0),
  limite numeric check (limite is null or limite >= 0), -- editavel pelo Pedro. Serper sem chave: nulo
  atualizado_em timestamptz not null default now(),
  unique (servico, periodo, referencia)
);

create table public.central_registro (
  id uuid primary key default gen_random_uuid(),
  quando timestamptz not null default now(),
  quem uuid references public.pessoas(id),
  o_que text not null,
  antes jsonb,
  depois jsonb,
  desfazivel boolean not null default true,            -- encerrar_processo entra sem desfazer
  desfeito_em timestamptz,
  desfeito_por uuid references public.pessoas(id)
);
create index central_registro_quando_idx on public.central_registro (quando desc);

create table public.central_sdr_fila (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.prospeccao_empresas(id),
  contato_id uuid references public.prospeccao_contatos(id),
  motivo text not null check (motivo in ('respondeu','nota_alta')),
  nota numeric,
  telefone text,
  status text not null default 'na_fila' check (status in ('na_fila','assumido','ligou','sem_resposta','pediu_cotacao','sem_interesse','telefone_errado','encerrado')),
  assumido_por uuid references public.pessoas(id),
  assumido_em timestamptz,
  resultado_em timestamptz,
  observacao text,
  lead_id uuid references public.leads(id),
  criado_em timestamptz not null default now(),
  check (status <> 'na_fila' or assumido_por is null),
  check (status <> 'assumido' or assumido_por is not null)
);
-- a mesma empresa nao entra duas vezes enquanto estiver aberta
create unique index central_sdr_fila_empresa_aberta_uidx on public.central_sdr_fila (empresa_id) where status in ('na_fila','assumido');
create index central_sdr_fila_status_idx on public.central_sdr_fila (status, criado_em);

-- ---------------------------------------------------------------------------------------------------------
-- 5) Robos de partida (nenhum liga sozinho; os de flag espelham a flag real)
-- ---------------------------------------------------------------------------------------------------------
insert into public.central_robos (id, nome, onde_roda, tipo, hora, travado, bloqueado_motivo, flag_chave) values
  ('garimpo_listas', 'Garimpo e listas',       'pc',    'agendado', null, false, null, null),
  ('tms',            'Robo do TMS',            'pc',    'agendado', null, false, null, null),
  ('freellm',        'IA gratis (FreeLLM)',    'pc',    'servico',  null, false, null, null),
  ('envio',          'Enviar e-mails',         'nuvem', 'servico',  null, false, null, 'PROSPECCAO_ENVIO_LIBERADO'),
  ('leitura',        'Ler respostas',          'nuvem', 'servico',  null, false, null, 'PROSPECCAO_LEITURA_LIBERADA'),
  ('resposta_auto',  'Responder sozinho',      'nuvem', 'servico',  null, false,
     'O robo de leitura ainda nao executa isso (ele ainda nao le as regras de resposta). A chave fica bloqueada ate o Radar passar a ler prospeccao_respostas_config.',
     'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA'),
  ('aprovacao',      'Aprovacao obrigatoria',  'nuvem', 'servico',  null, false, null, 'PROSPECCAO_APROVACAO_OBRIGATORIA'),
  ('modo_teste',     'Modo teste',             'nuvem', 'servico',  null, false, null, 'PROSPECCAO_MODO_TESTE'),
  ('repom_tag',      'REPOM consulta de tag',  'nuvem', 'servico',  null, true,  null, null),
  ('repom_api',      'REPOM API',              'nuvem', 'servico',  null, true,  null, null),
  ('mdfe_encerra',   'Encerramento automatico de MDF-e', 'nuvem', 'servico', null, true, null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 6) Travas no banco (valem mesmo se alguem pular a tela)
-- ---------------------------------------------------------------------------------------------------------
-- Robo: quem tem login so liga se nao for travado nem bloqueado; travado/bloqueado/flag/onde roda so mudam por migration.
create or replace function public.trg_fn_central_robos_guarda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.atualizado_em := now();
  if public.current_pessoa_id() is null then return new; end if;   -- backend/migration
  if new.id is distinct from old.id or new.travado is distinct from old.travado or new.bloqueado_motivo is distinct from old.bloqueado_motivo
     or new.flag_chave is distinct from old.flag_chave or new.onde_roda is distinct from old.onde_roda or new.tipo is distinct from old.tipo then
    raise exception 'Esses campos do robo so mudam por migration.';
  end if;
  if public.central_eh_agente() then
    if new.ligado is distinct from old.ligado or new.hora is distinct from old.hora or new.nome is distinct from old.nome then
      raise exception 'O agente so atualiza ultimo_inicio, ultimo_fim e ultimo_resultado.';
    end if;
  elsif not public.central_eh_admin() then
    raise exception 'Sem permissao.';
  end if;
  if new.ligado and (old.travado or old.bloqueado_motivo is not null) then
    raise exception 'Este robo esta travado/bloqueado e nao pode ser ligado.';
  end if;
  return new;
end $$;
create trigger trg_central_robos_guarda before update on public.central_robos for each row execute function public.trg_fn_central_robos_guarda();

-- Comando: ligar/rodar/retomar nao vale para robo travado ou bloqueado. Pedido sempre sai com o nome do Pedro.
create or replace function public.trg_fn_central_comandos_guarda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_robo public.central_robos;
begin
  if tg_op = 'INSERT' then
    if public.current_pessoa_id() is not null then
      if not public.central_eh_admin() then raise exception 'Sem permissao.'; end if;
      new.pedido_por := public.current_pessoa_id();
      new.status := 'pendente'; new.resultado := null; new.progresso := null; new.feito_em := null;
    end if;
    if new.robo_id is not null then
      select * into v_robo from public.central_robos where id = new.robo_id;
      if new.comando in ('ligar','rodar','retomar') and (v_robo.travado or v_robo.bloqueado_motivo is not null) then
        raise exception 'O robo % esta travado/bloqueado.', new.robo_id;
      end if;
    end if;
    return new;
  end if;
  -- UPDATE: o que foi pedido nao muda
  if new.id is distinct from old.id or new.robo_id is distinct from old.robo_id or new.comando is distinct from old.comando
     or new.parametros is distinct from old.parametros or new.pedido_por is distinct from old.pedido_por or new.criado_em is distinct from old.criado_em then
    raise exception 'O pedido do comando nao pode ser alterado.';
  end if;
  return new;
end $$;
create trigger trg_central_comandos_guarda before insert or update on public.central_comandos for each row execute function public.trg_fn_central_comandos_guarda();

-- Fila do SDR: contato bloqueado (e-mail ou dominio) nunca entra; empresa descadastrada tambem nao.
create or replace function public.trg_fn_central_sdr_fila_guarda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
       select 1 from public.prospeccao_contatos c
        where c.empresa_id = new.empresa_id and (new.contato_id is null or c.id = new.contato_id)
          and exists (select 1 from public.prospeccao_bloqueio b
                       where (b.tipo = 'email' and b.valor = lower(c.email))
                          or (b.tipo = 'dominio' and b.valor = lower(split_part(c.email, '@', 2)))))
     or exists (select 1 from public.prospeccao_empresas e where e.id = new.empresa_id and e.status = 'descadastrado') then
    raise exception 'Contato bloqueado ou descadastrado nao entra na fila do SDR.';
  end if;
  return new;
end $$;
create trigger trg_central_sdr_fila_guarda before insert on public.central_sdr_fila for each row execute function public.trg_fn_central_sdr_fila_guarda();

-- ---------------------------------------------------------------------------------------------------------
-- 7) RLS: liga em tudo. Sem politica = ninguem. anon nunca.
-- ---------------------------------------------------------------------------------------------------------
alter table public.central_robos     enable row level security;
alter table public.central_comandos  enable row level security;
alter table public.central_heartbeat enable row level security;
alter table public.central_uso       enable row level security;
alter table public.central_registro  enable row level security;
alter table public.central_sdr_fila  enable row level security;

revoke all on public.central_robos, public.central_comandos, public.central_heartbeat, public.central_uso, public.central_registro, public.central_sdr_fila from public, anon;
grant select, update on public.central_robos to authenticated;
grant select, insert, update on public.central_comandos to authenticated;
grant select on public.central_heartbeat to authenticated;
grant select, update on public.central_uso to authenticated;
grant select on public.central_registro to authenticated;
grant select on public.central_sdr_fila to authenticated;
-- (heartbeat, uso-insert, registro-insert/update e a fila so mudam por funcao security definer abaixo)

-- admin (Pedro) / agente
create policy central_robos_sel  on public.central_robos for select to authenticated using (public.central_eh_admin() or public.central_eh_agente());
create policy central_robos_upd  on public.central_robos for update to authenticated using (public.central_eh_admin() or public.central_eh_agente()) with check (public.central_eh_admin() or public.central_eh_agente());
create policy central_comandos_sel on public.central_comandos for select to authenticated using (public.central_eh_admin() or public.central_eh_agente());
create policy central_comandos_ins on public.central_comandos for insert to authenticated with check (public.central_eh_admin());
create policy central_comandos_upd on public.central_comandos for update to authenticated using (public.central_eh_agente()) with check (public.central_eh_agente());
create policy central_heartbeat_sel on public.central_heartbeat for select to authenticated using (public.central_eh_admin());
create policy central_uso_sel on public.central_uso for select to authenticated using (public.central_eh_admin());
create policy central_uso_upd on public.central_uso for update to authenticated using (public.central_eh_admin()) with check (public.central_eh_admin());
create policy central_registro_sel on public.central_registro for select to authenticated using (public.central_eh_admin());
-- SDR (Pedro + lista de pessoas)
create policy central_sdr_fila_sel on public.central_sdr_fila for select to authenticated using (public.central_eh_sdr());

-- Colunas editaveis do uso: so o limite (o "usado" e do agente, por funcao).
revoke update on public.central_uso from authenticated;
grant update (limite) on public.central_uso to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 8) Funcoes (security definer, search_path fixo, sem acesso para anon)
-- ---------------------------------------------------------------------------------------------------------
-- 8.1 Registro de alteracoes (tela) + auditoria_log. Chamada pela tela depois de cada mudanca.
create or replace function public.central_registrar(p_o_que text, p_antes jsonb, p_depois jsonb, p_desfazivel boolean default true) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.central_eh_admin() then raise exception 'Sem permissao.'; end if;
  if coalesce(btrim(p_o_que), '') = '' then raise exception 'Descreva o que mudou.'; end if;
  insert into public.central_registro (quem, o_que, antes, depois, desfazivel)
  values (public.current_pessoa_id(), left(p_o_que, 300), p_antes, p_depois, coalesce(p_desfazivel, true)) returning id into v_id;
  insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
  values (public.current_pessoa_id(), public.current_papel()::text, 'central_alteracao', 'central_registro', v_id,
          jsonb_build_object('o_que', left(p_o_que, 300), 'antes', p_antes), jsonb_build_object('depois', p_depois));
  return v_id;
end $$;

-- 8.2 Marca uma linha do registro como desfeita (a tela aplica o "antes" e depois chama isto; tambem audita).
create or replace function public.central_marcar_desfeito(p_registro uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.central_registro;
begin
  if not public.central_eh_admin() then raise exception 'Sem permissao.'; end if;
  select * into r from public.central_registro where id = p_registro for update;
  if not found then raise exception 'Registro nao encontrado.'; end if;
  if not r.desfazivel then raise exception 'Esta alteracao nao pode ser desfeita.'; end if;
  if r.desfeito_em is not null then raise exception 'Ja foi desfeita.'; end if;
  update public.central_registro set desfeito_em = now(), desfeito_por = public.current_pessoa_id() where id = p_registro;
  insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
  values (public.current_pessoa_id(), public.current_papel()::text, 'central_desfeito', 'central_registro', p_registro,
          jsonb_build_object('depois', r.depois), jsonb_build_object('antes', r.antes));
end $$;

-- 8.3 Agente: batimento (a cada 30 s). Guarda a lista de processos em resumo_json.
create or replace function public.central_batimento(p_maquina text, p_versao text, p_resumo jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.central_eh_agente() then raise exception 'Sem permissao.'; end if;
  insert into public.central_heartbeat as h (maquina, ultimo_batimento, versao_agente, resumo_json)
  values (left(p_maquina, 60), now(), left(p_versao, 40), coalesce(p_resumo, '{}'::jsonb))
  on conflict (maquina) do update set ultimo_batimento = now(), versao_agente = excluded.versao_agente, resumo_json = excluded.resumo_json;
end $$;

-- 8.4 Agente: uso por servico. So mexe em "usado"; o limite e do Pedro (novo periodo herda o limite do anterior; 1o registro usa o padrao).
create or replace function public.central_registrar_uso(p_servico text, p_periodo text, p_referencia date, p_usado numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limite numeric;
begin
  if not public.central_eh_agente() then raise exception 'Sem permissao.'; end if;
  select u.limite into v_limite from public.central_uso u where u.servico = p_servico and u.periodo = p_periodo and u.limite is not null order by u.referencia desc limit 1;
  if v_limite is null then
    v_limite := case p_servico when 'qev' then 95 when 'verifalia' then 24 when 'exa' then 900 when 'tavily' then 1000 when 'ia_gratis' then 200 when 'claude_noite' then 2 else null end;
  end if;
  insert into public.central_uso (servico, periodo, referencia, usado, limite) values (p_servico, p_periodo, p_referencia, greatest(p_usado, 0), v_limite)
  on conflict (servico, periodo, referencia) do update set usado = greatest(excluded.usado, 0), atualizado_em = now();
end $$;

-- 8.5 Agente: andamento de um comando (marcar executando/feito/erro). Nao deixa voltar de feito/erro.
create or replace function public.central_comando_atualizar(p_id uuid, p_status text, p_resultado text default null, p_progresso jsonb default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.central_comandos;
begin
  if not public.central_eh_agente() then raise exception 'Sem permissao.'; end if;
  if p_status not in ('executando','feito','erro') then raise exception 'Status invalido.'; end if;
  select * into c from public.central_comandos where id = p_id for update;
  if not found then raise exception 'Comando nao encontrado.'; end if;
  if c.status in ('feito','erro') then raise exception 'Comando ja encerrado.'; end if;
  update public.central_comandos set status = p_status, resultado = coalesce(left(p_resultado, 500), resultado), progresso = coalesce(p_progresso, progresso),
         feito_em = case when p_status in ('feito','erro') then now() else feito_em end where id = p_id;
end $$;

-- 8.6 Agente: resultado da ultima execucao de um robo (ultimo_*).
create or replace function public.central_robo_resultado(p_robo text, p_inicio timestamptz, p_fim timestamptz, p_resultado text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.central_eh_agente() then raise exception 'Sem permissao.'; end if;
  update public.central_robos set ultimo_inicio = coalesce(p_inicio, ultimo_inicio), ultimo_fim = p_fim, ultimo_resultado = left(p_resultado, 300) where id = p_robo;
end $$;

-- 8.7 Agente: importar a base em lotes (ate 5000 linhas). Upsert por CNPJ, SEM apagar nada. lote_importacao so e gravado em linha NOVA
--     (linha que ja existia nao muda de lote, entao o DESFAZER do lote nunca apaga o que ja estava la antes).
create or replace function public.central_importar_base(p_linhas jsonb, p_lote text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; v_cnpj text; v_novo boolean; v_n int := 0; v_u int := 0; v_i int := 0; v_lote text := left(nullif(btrim(p_lote), ''), 80);
begin
  if not (public.central_eh_agente() or public.central_eh_admin()) then raise exception 'Sem permissao.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 5000 then raise exception 'Lote invalido (maximo 5000 linhas).'; end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    v_cnpj := regexp_replace(coalesce(r->>'cnpj', r->>'cnpj_formatado', ''), '\D', '', 'g');
    if v_cnpj !~ '^[0-9]{14}$' or coalesce(btrim(r->>'razao_social'), '') = '' or upper(coalesce(r->>'porte','')) = 'MEI' then v_i := v_i + 1; continue; end if;
    insert into public.prospeccao_base as b (cnpj, prioridade, cnpj_formatado, razao_social, nome_fantasia, segmento_rbr, cnae_principal, cnae_descricao, porte, capital_social,
      matriz_filial, gigante, data_inicio, logradouro, numero, complemento, bairro, municipio, uf, cep, distancia_km, telefone1, telefone2, email, dominio_email,
      dominio_valido, tem_site, motivo, origem, restricao, importado_em, lote_importacao)
    values (v_cnpj, r->>'prioridade', r->>'cnpj_formatado', btrim(r->>'razao_social'), nullif(r->>'nome_fantasia',''), r->>'segmento_rbr', r->>'cnae_principal', r->>'cnae_descricao',
      r->>'porte', nullif(replace(coalesce(r->>'capital_social',''), ',', '.'), '')::numeric, r->>'matriz_filial', lower(coalesce(r->>'gigante','')) in ('sim','true','1','s'),
      r->>'data_inicio', r->>'logradouro', r->>'numero', r->>'complemento', r->>'bairro', r->>'municipio', upper(r->>'uf'), r->>'cep',
      nullif(replace(coalesce(r->>'distancia_km',''), ',', '.'), '')::numeric, r->>'telefone1', r->>'telefone2', lower(nullif(btrim(r->>'email'),'')), lower(nullif(r->>'dominio_email','')),
      lower(coalesce(r->>'dominio_valido','')) in ('sim','true','1','s'), lower(coalesce(r->>'tem_site','')) in ('sim','true','1','s'), r->>'motivo', r->>'origem',
      public.radar_restricao_cnae(r->>'cnae_principal'), now(), v_lote)
    on conflict (cnpj) do update set prioridade = excluded.prioridade, cnpj_formatado = excluded.cnpj_formatado, razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia,
      segmento_rbr = excluded.segmento_rbr, cnae_principal = excluded.cnae_principal, cnae_descricao = excluded.cnae_descricao, porte = excluded.porte, capital_social = excluded.capital_social,
      matriz_filial = excluded.matriz_filial, gigante = excluded.gigante, data_inicio = excluded.data_inicio, logradouro = excluded.logradouro, numero = excluded.numero,
      complemento = excluded.complemento, bairro = excluded.bairro, municipio = excluded.municipio, uf = excluded.uf, cep = excluded.cep, distancia_km = excluded.distancia_km,
      telefone1 = excluded.telefone1, telefone2 = excluded.telefone2, email = excluded.email, dominio_email = excluded.dominio_email, dominio_valido = excluded.dominio_valido,
      tem_site = excluded.tem_site, motivo = excluded.motivo, origem = excluded.origem, restricao = excluded.restricao, importado_em = now()
    returning (xmax = 0) into v_novo;
    if v_novo then v_n := v_n + 1; else v_u := v_u + 1; end if;
  end loop;
  update public.prospeccao_base b set ja_na_lista = true
   where not b.ja_na_lista and exists (select 1 from public.prospeccao_empresas e where e.cnpj = b.cnpj)
     and b.cnpj in (select regexp_replace(coalesce(x->>'cnpj', x->>'cnpj_formatado', ''), '\D', '', 'g') from jsonb_array_elements(p_linhas) x);
  return jsonb_build_object('novos', v_n, 'repetidos', v_u, 'ignorados', v_i);
end $$;

-- 8.8 Pedro: desfaz um lote importado. Remove SO as linhas novas daquele lote que ainda nao foram para a lista de Empresas.
create or replace function public.central_desfazer_lote(p_lote text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_apagadas int; v_mantidas int;
begin
  if not public.central_eh_admin() then raise exception 'Sem permissao.'; end if;
  if coalesce(btrim(p_lote), '') = '' then raise exception 'Informe o lote.'; end if;
  select count(*) into v_mantidas from public.prospeccao_base where lote_importacao = p_lote and ja_na_lista;
  delete from public.prospeccao_base where lote_importacao = p_lote and not ja_na_lista;
  get diagnostics v_apagadas = row_count;
  return jsonb_build_object('removidas', v_apagadas, 'mantidas_por_ja_estarem_na_lista', v_mantidas);
end $$;

-- 8.9 Fila do SDR: assumir (so o primeiro vence) e devolver. Pedro + pessoas da lista.
create or replace function public.central_sdr_assumir(p_id uuid, p_quem uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_quem uuid := coalesce(p_quem, public.current_pessoa_id()); v_ok boolean; v_dono text;
begin
  if not public.central_eh_sdr() then raise exception 'Sem permissao.'; end if;
  -- escolher OUTRA pessoa so vale para quem esta na lista de SDR (ou o Pedro)
  if v_quem <> public.current_pessoa_id() and not exists (
       select 1 from public.pessoas p where p.id = v_quem and p.papel = 'gestor_rbr'
          and (p.id = (select (pr.valor #>> '{}')::uuid from public.parametros_sistema pr where pr.chave = 'PROSPECCAO_ADMIN_PESSOA_ID' and jsonb_typeof(pr.valor) = 'string' and (pr.valor #>> '{}') ~ '^[0-9a-f-]{36}$')
               or exists (select 1 from public.parametros_sistema pr2, jsonb_array_elements_text(pr2.valor) x where pr2.chave = 'CENTRAL_SDR_PESSOAS' and jsonb_typeof(pr2.valor) = 'array' and x = p.id::text))) then
    raise exception 'Essa pessoa nao esta na lista da Fila do SDR.';
  end if;
  update public.central_sdr_fila set status = 'assumido', assumido_por = v_quem, assumido_em = now()
   where id = p_id and status = 'na_fila' and assumido_por is null
   returning true into v_ok;
  if v_ok then return jsonb_build_object('ok', true); end if;
  select p.nome into v_dono from public.central_sdr_fila f left join public.pessoas p on p.id = f.assumido_por where f.id = p_id;
  return jsonb_build_object('ok', false, 'assumido_por_nome', v_dono);
end $$;

create or replace function public.central_sdr_devolver(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.central_eh_sdr() then raise exception 'Sem permissao.'; end if;
  update public.central_sdr_fila set status = 'na_fila', assumido_por = null, assumido_em = null
   where id = p_id and status = 'assumido' and (assumido_por = public.current_pessoa_id() or public.central_eh_admin());
  if not found then raise exception 'So quem assumiu (ou o Pedro) pode devolver.'; end if;
end $$;

-- Permissoes das funcoes: nunca anon/public; authenticated pode chamar (cada uma confere quem e).
revoke all on function public.central_eh_admin(), public.central_eh_sdr(), public.central_eh_agente(),
  public.central_registrar(text, jsonb, jsonb, boolean), public.central_marcar_desfeito(uuid), public.central_batimento(text, text, jsonb),
  public.central_registrar_uso(text, text, date, numeric), public.central_comando_atualizar(uuid, text, text, jsonb),
  public.central_robo_resultado(text, timestamptz, timestamptz, text), public.central_importar_base(jsonb, text), public.central_desfazer_lote(text),
  public.central_sdr_assumir(uuid, uuid), public.central_sdr_devolver(uuid) from public, anon;
grant execute on function public.central_eh_admin(), public.central_eh_sdr(), public.central_eh_agente(),
  public.central_registrar(text, jsonb, jsonb, boolean), public.central_marcar_desfeito(uuid), public.central_batimento(text, text, jsonb),
  public.central_registrar_uso(text, text, date, numeric), public.central_comando_atualizar(uuid, text, text, jsonb),
  public.central_robo_resultado(text, timestamptz, timestamptz, text), public.central_importar_base(jsonb, text), public.central_desfazer_lote(text),
  public.central_sdr_assumir(uuid, uuid), public.central_sdr_devolver(uuid) to authenticated;
