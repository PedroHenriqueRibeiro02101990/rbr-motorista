-- Prospeccao (agente SDR), PARTE B: estado, rampa, jornada, modelos editaveis, log, modo de teste, segredos (so NOMES) e flags.
-- ADITIVA. NAO APLICADA (o Pedro aplica). Depende de 20261116-1000-prospeccao-parte-a.sql.
-- Tudo nasce DESLIGADO: envio=nao, leitura=nao, resposta automatica=nao, aprovacao obrigatoria=sim, modo teste=sim.
-- Rollback: supabase/rollback/rollback-20261116-1100-prospeccao-parte-b.sql
set local lock_timeout = '8s';

-- ---------------------------------------------------------------------------------------------------------
-- 1) Flags (parametros_sistema; so o usuario do Pedro troca, pelo gatilho da Parte A)
-- ---------------------------------------------------------------------------------------------------------
insert into public.parametros_sistema (chave, valor, descricao) values
  ('PROSPECCAO_LEITURA_LIBERADA',            '"nao"'::jsonb, 'Prospeccao: robo de leitura (IMAP). So "sim" libera.'),
  ('PROSPECCAO_APROVACAO_OBRIGATORIA',       '"sim"'::jsonb, 'Prospeccao: "sim" = o agente so prepara rascunhos e eles esperam aprovacao; "nao" = aprova e envia sozinho.'),
  ('PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA','"nao"'::jsonb, 'Prospeccao: "sim" = o agente responde sozinho o que for seguro (agora_nao, nao_sou_eu). Confirmacao de "sair" e sempre automatica.'),
  ('PROSPECCAO_MODO_TESTE',                  '"sim"'::jsonb, 'Prospeccao: "sim" = todo envio vai para prospeccao_destinos_teste com [TESTE] no assunto.')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_estado (
  id int primary key default 1 check (id = 1),
  proximo_envio_apos timestamptz,
  primeiro_envio_em date,
  parada_motivo text,
  parada_em timestamptz,
  imap_uidvalidity bigint,
  imap_ultimo_uid bigint not null default 0,
  atualizado_em timestamptz not null default now()
);
insert into public.prospeccao_estado (id) values (1);
comment on table public.prospeccao_estado is 'Prospeccao: estado unico dos robos (proximo envio, dia 1 da rampa, parada automatica, ultimo UID lido do IMAP).';

create table public.prospeccao_rampa (
  dia_inicio int primary key check (dia_inicio >= 1),
  limite int not null check (limite >= 0 and limite <= 100)
);
insert into public.prospeccao_rampa (dia_inicio, limite) values (1, 10), (6, 15), (11, 20), (16, 30);
comment on table public.prospeccao_rampa is 'Prospeccao: limite diario por dia de rampa (dia 1 = primeiro envio real). O codigo nunca passa de 100 por dia.';

create table public.prospeccao_modelos (
  tipo text primary key check (tipo in ('toque1', 'toque2', 'toque3', 'toque4', 'resp_sair', 'resp_agora_nao', 'resp_indicacao', 'resp_recebimento')),
  assunto text not null,
  corpo text not null,
  ativo boolean not null default false,
  atualizado_por uuid references public.pessoas(id),
  atualizado_em timestamptz not null default now()
);
comment on table public.prospeccao_modelos is 'Prospeccao: textos editaveis. Variaveis: {segmento_legivel} {segmento_frase} {cidade} {nome} {empresa} {veiculo}. Modelo inativo trava a jornada naquele ponto.';

create table public.prospeccao_jornada (
  toque int primary key check (toque between 1 and 4),
  atraso_dias int not null check (atraso_dias >= 0),
  modelo_tipo text not null references public.prospeccao_modelos(tipo)
);
-- (a carga inicial da jornada fica depois da carga de prospeccao_modelos: a FK exige os modelos antes)
comment on table public.prospeccao_jornada is 'Prospeccao: dias depois do toque anterior. Depois do toque 4 a empresa vai para repouso por 90 dias.';

create table public.prospeccao_log (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  robo text not null check (robo in ('enviar', 'ler', 'sistema')),
  acao text not null,
  empresa_id uuid references public.prospeccao_empresas(id) on delete set null,
  resultado text,
  erro text
);
create index prospeccao_log_momento_idx on public.prospeccao_log (momento desc);
create index prospeccao_log_robo_idx on public.prospeccao_log (robo, momento desc);
comment on table public.prospeccao_log is 'Prospeccao: log dos robos. Nunca guarda senha, token nem corpo de e-mail de terceiros.';

create table public.prospeccao_destinos_teste (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now()
);
comment on table public.prospeccao_destinos_teste is 'Prospeccao: com PROSPECCAO_MODO_TESTE = sim, todo envio vai para estes e-mails (cadastrados pelo Pedro). Vazia = nada e enviado.';

-- colunas novas nas tabelas da Parte A
alter table public.prospeccao_mensagens
  add column tentativas int not null default 0,
  add column teste_enviado_em timestamptz;
alter table public.prospeccao_respostas
  add column uid_imap bigint,
  add column message_id_origem text,
  add column classificacao_confianca numeric,
  add column indicacao_email text,
  add column para_pessoa boolean not null default true,
  add column aviso_recebimento_em timestamptz,
  add column lembrete_em timestamptz,
  add column escalado_em timestamptz;
create unique index prospeccao_respostas_uid_uq on public.prospeccao_respostas (uid_imap) where uid_imap is not null;
create index prospeccao_mensagens_msgid_idx on public.prospeccao_mensagens (message_id) where message_id is not null;
-- Um unico toque ativo por contato (impede mensagem duplicada para o mesmo contato/toque)
create unique index prospeccao_mensagens_contato_toque_uq on public.prospeccao_mensagens (contato_id, toque) where status <> 'descartado';

-- Lead que veio da prospeccao ativa
alter table public.leads drop constraint if exists leads_origem_check;
alter table public.leads add constraint leads_origem_check check (origem in ('site','whatsapp','indicacao','manual','outro','prospeccao'));

-- ---------------------------------------------------------------------------------------------------------
-- 3) Modelos: validacao (sem HTML, sem variavel desconhecida) e carga inicial
-- ---------------------------------------------------------------------------------------------------------
create function public.trg_fn_prospeccao_modelo_valida() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v text; m text[];
begin
  foreach v in array array[new.assunto, new.corpo] loop
    if v ~* '</?[a-z][^>]*>' then raise exception 'O texto nao pode conter HTML.'; end if;
    for m in select regexp_matches(v, '\{([^{}]*)\}', 'g') loop
      if m[1] not in ('segmento_legivel', 'segmento_frase', 'cidade', 'nome', 'empresa', 'veiculo') then
        raise exception 'Variavel desconhecida: {%}.', m[1];
      end if;
    end loop;
  end loop;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(public.current_pessoa_id(), new.atualizado_por);
  return new;
end $$;
create trigger trg_prospeccao_modelo_valida before insert or update on public.prospeccao_modelos
  for each row execute function public.trg_fn_prospeccao_modelo_valida();

insert into public.prospeccao_modelos (tipo, assunto, corpo, ativo) values
  ('toque1', 'Frete de {segmento_legivel} saindo de {cidade} (RBR Cargo)',
'Olá, tudo bem?

Meu nome é Pedro, da RBR Cargo. Somos uma agenciadora de cargas em São Paulo e atendemos indústrias com frete rodoviário em truck e carreta (baú, sider, graneleiro, prancha e munck).

Vi que vocês operam com {segmento_frase} e queria entender uma coisa: quantas cargas por semana vocês despacham hoje, e para quais regiões?

Com essa informação consigo avaliar se faz sentido eu preparar uma cotação comparativa para vocês, sem compromisso.

Se não for com você, pode me indicar quem cuida da logística?

Obrigado,

Pedro Henrique
RBR Cargo | Agenciamento e Transporte
(11) 5397-7966
pedro@rbrcargo.com.br
www.rbrcargo.com.br

Se preferir não receber mais mensagens, responda "sair".', true),
  ('toque2', 'Re: Frete de {segmento_legivel} saindo de {cidade} (RBR Cargo)', 'A DEFINIR (toque 2).', false),
  ('toque3', 'Re: Frete de {segmento_legivel} saindo de {cidade} (RBR Cargo)', 'A DEFINIR (toque 3).', false),
  ('toque4', 'Re: Frete de {segmento_legivel} saindo de {cidade} (RBR Cargo)', 'A DEFINIR (toque 4).', false),
  ('resp_sair', 'Re: descadastro', 'A DEFINIR (confirmação de descadastro).', false),
  ('resp_agora_nao', 'Re: agradecimento', 'A DEFINIR (agradecimento por "agora não").', false),
  ('resp_indicacao', 'Re: indicação', 'A DEFINIR (agradecimento pela indicação).', false),
  ('resp_recebimento', 'Recebemos sua mensagem', 'A DEFINIR (aviso de recebimento: o José Carlos retorna em breve, sem preço e sem prazo).', false);

insert into public.prospeccao_jornada (toque, atraso_dias, modelo_tipo) values (1, 0, 'toque1'), (2, 3, 'toque2'), (3, 7, 'toque3'), (4, 14, 'toque4');

-- ---------------------------------------------------------------------------------------------------------
-- 4) Segredos: so os NOMES (o Pedro cadastra os valores no Vault) + leitura restrita a service_role
-- ---------------------------------------------------------------------------------------------------------
select vault.create_secret('PREENCHER', n, 'Prospeccao: valor a cadastrar pelo Pedro (Vault)')
  from (values ('PROSPECCAO_SMTP_HOST'), ('PROSPECCAO_SMTP_PORTA'), ('PROSPECCAO_EMAIL_USUARIO'), ('PROSPECCAO_EMAIL_SENHA'),
               ('PROSPECCAO_IMAP_HOST'), ('PROSPECCAO_IMAP_PORTA')) v(n)
 where not exists (select 1 from vault.secrets s where s.name = v.n);

create function public.prospeccao_segredo(p_nome text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  if p_nome is null or p_nome !~ '^PROSPECCAO_[A-Z0-9_]+$' then
    raise exception 'Segredo nao permitido: so nomes PROSPECCAO_*';
  end if;
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.name = p_nome limit 1;
  return case when v = 'PREENCHER' then null else v end;
end $$;
comment on function public.prospeccao_segredo(text) is 'Le um segredo PROSPECCAO_* do Vault. Somente service_role (robos). Devolve null enquanto estiver como PREENCHER.';
revoke all on function public.prospeccao_segredo(text) from public, anon, authenticated;
grant execute on function public.prospeccao_segredo(text) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 5) RLS (so gestor_rbr; os robos usam service_role)
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_estado enable row level security;
alter table public.prospeccao_rampa enable row level security;
alter table public.prospeccao_modelos enable row level security;
alter table public.prospeccao_jornada enable row level security;
alter table public.prospeccao_log enable row level security;
alter table public.prospeccao_destinos_teste enable row level security;

create policy prospeccao_estado_gestor on public.prospeccao_estado for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_log_gestor on public.prospeccao_log for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_rampa_gestor on public.prospeccao_rampa for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_modelos_gestor on public.prospeccao_modelos for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_jornada_gestor on public.prospeccao_jornada for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_destinos_teste_gestor on public.prospeccao_destinos_teste for all to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

revoke all on public.prospeccao_estado, public.prospeccao_rampa, public.prospeccao_modelos, public.prospeccao_jornada,
  public.prospeccao_log, public.prospeccao_destinos_teste from anon;
revoke all on function public.trg_fn_prospeccao_modelo_valida() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6) Religar o envio (manual, pelo Pedro) limpa o motivo da parada automatica
-- ---------------------------------------------------------------------------------------------------------
create function public.trg_fn_prospeccao_limpa_parada() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.chave = 'PROSPECCAO_ENVIO_LIBERADO' and new.valor = '"sim"'::jsonb and old.valor is distinct from new.valor then
    update public.prospeccao_estado set parada_motivo = null, parada_em = null, atualizado_em = now() where id = 1;
  end if;
  return new;
end $$;
create trigger trg_prospeccao_limpa_parada after update on public.parametros_sistema
  for each row when (new.chave = 'PROSPECCAO_ENVIO_LIBERADO')
  execute function public.trg_fn_prospeccao_limpa_parada();
revoke all on function public.trg_fn_prospeccao_limpa_parada() from public, anon, authenticated;
