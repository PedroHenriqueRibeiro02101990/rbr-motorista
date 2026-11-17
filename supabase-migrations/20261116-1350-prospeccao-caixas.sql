-- Prospeccao, Etapa 3: caixas de e-mail (3 caixas Hostinger), diagnostico, caixa de entrada (conversas e e-mails) e cadastro de segredos pelo painel.
-- ADITIVA (so cria tabelas/funcoes/linhas novas; nao altera nada existente). Depende de 1000, 1100, 1200 e 1300.
-- Rollback: supabase/rollback/rollback-20261116-1350-prospeccao-caixas.sql
-- SEGREDOS: aqui entram so os NOMES no Vault (valor "PREENCHER"). A senha de cada caixa o Pedro cadastra pelo painel (funcao abaixo, so o usuario do Pedro).
set local lock_timeout = '8s';

-- ---------------------------------------------------------------------------------------------------------
-- 1) Caixas
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_caixas (
  id uuid primary key default gen_random_uuid(),
  endereco text not null unique check (endereco = lower(endereco) and endereco ~ '^[a-z0-9._-]+@rbrcargo\.com\.br$'),
  nome_exibicao text not null,
  assinatura text not null default 'Pedro | RBR Cargo',
  papel text not null check (papel in ('agente_1', 'agente_2', 'reserva')),
  ativa boolean not null default false,
  limite_diario int not null default 50 check (limite_diario between 0 and 100),
  rampa jsonb,                                   -- null = usa a tabela prospeccao_rampa; formato [{"dia_inicio":1,"limite":10},...]
  primeiro_envio_em date,                        -- dia 1 da rampa DESTA caixa
  intervalo_min_seg int not null default 90 check (intervalo_min_seg between 30 and 3600),
  smtp_host text not null default 'smtp.hostinger.com',
  smtp_porta int not null default 465 check (smtp_porta in (465, 587)),
  imap_host text not null default 'imap.hostinger.com',
  imap_porta int not null default 993,
  segredo_senha text not null check (segredo_senha ~ '^PROSPECCAO_CAIXA_[A-Z0-9]+_SENHA$'),   -- NOME do segredo no Vault (a senha nunca fica aqui)
  pasta_entrada text not null default 'INBOX',
  pasta_enviados text,                           -- descobertas por LIST; ajustaveis no painel
  pasta_spam text,
  pasta_lixo text,
  guardar_copia_enviados boolean not null default true,   -- o diagnostico desliga se o servidor ja guarda sozinho
  leitura_a_cada_min int not null default 5 check (leitura_a_cada_min between 3 and 15),
  modo_caixa_completa boolean not null default false,     -- ligado: a Caixa de entrada mostra tambem e-mails que nao sao de prospeccao
  idle_suportado boolean,                        -- detectado pelo diagnostico
  idle_ligado boolean not null default false,    -- opcao; so faz diferenca se idle_suportado
  imap_estado jsonb not null default '{}'::jsonb, -- {"INBOX":{"uidvalidity":1,"ultimo_uid":10}, ...}
  ultima_leitura_em timestamptz,
  ultimo_diagnostico_em timestamptz,
  ultimo_diagnostico_resumo text check (ultimo_diagnostico_resumo in ('verde', 'amarelo', 'vermelho')),
  proximo_envio_apos timestamptz,
  recuo_nivel int not null default 0 check (recuo_nivel between 0 and 6),
  parada_motivo text,                            -- p.ex. erro de autenticacao: a caixa para sozinha e avisa
  parada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.prospeccao_caixas is 'Prospeccao: caixas Hostinger. Limite total de 100/dia somando as ativas (o codigo nunca passa de 100). Senha so no Vault.';
comment on column public.prospeccao_caixas.imap_estado is 'Ultimo UID lido por pasta (e uidvalidity). O robo le so o que e novo.';

insert into public.prospeccao_caixas (endereco, nome_exibicao, assinatura, papel, ativa, limite_diario, segredo_senha) values
  ('pedro@rbrcargo.com.br',       'Pedro | RBR Cargo',      'Pedro | RBR Cargo', 'agente_1', true,  50, 'PROSPECCAO_CAIXA_PEDRO_SENHA'),
  ('comercial@rbrcargo.com.br',   'Pedro | RBR Cargo',      'Pedro | RBR Cargo', 'agente_2', true,  50, 'PROSPECCAO_CAIXA_COMERCIAL_SENHA'),
  ('operacional@rbrcargo.com.br', 'RBR Cargo Operacional',  'RBR Cargo',         'reserva',  false, 0,  'PROSPECCAO_CAIXA_OPERACIONAL_SENHA');

create table public.prospeccao_caixa_diagnostico (
  id uuid primary key default gen_random_uuid(),
  caixa_id uuid not null references public.prospeccao_caixas(id) on delete cascade,
  executado_em timestamptz not null default now(),
  resumo text not null check (resumo in ('verde', 'amarelo', 'vermelho')),
  conexao_nuvem_ok boolean,
  smtp_ok boolean,
  smtp_porta_usada int,
  imap_ok boolean,
  idle_suportado boolean,
  pastas_descobertas jsonb,
  append_ok boolean,
  flags_ok boolean,
  mover_ok boolean,
  cabecalhos_preservados jsonb,                  -- {"message_id":true,"in_reply_to":true,"references":true,"list_unsubscribe":true,"list_unsubscribe_post":true}
  servidor_guarda_enviados boolean,
  observacoes text
);
create index prospeccao_caixa_diagnostico_caixa_idx on public.prospeccao_caixa_diagnostico (caixa_id, executado_em desc);
comment on table public.prospeccao_caixa_diagnostico is 'Prospeccao: resultado de cada "Testar caixa". Nunca guarda senha nem conteudo de e-mail de terceiros.';

-- ---------------------------------------------------------------------------------------------------------
-- 2) Caixa de entrada: conversas e e-mails
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.prospeccao_empresas(id) on delete set null,
  caixa_id uuid not null references public.prospeccao_caixas(id),
  assunto text not null default '',
  thread_raiz text,                              -- message_id do primeiro e-mail (liga respostas pela cadeia References)
  status text not null default 'nova' check (status in ('nova', 'precisa_de_voce', 'rascunho_pronto', 'aguardando_cliente', 'assumida', 'encerrada')),
  ultima_mensagem_em timestamptz not null default now(),
  nao_lidas int not null default 0 check (nao_lidas >= 0),
  assumida_por uuid references public.pessoas(id),
  assumida_em timestamptz,
  classificacao_ia text,
  resumo_ia text,
  dados_extraidos jsonb not null default '{}'::jsonb,    -- origem, destino, carga, veiculo, cnpj, whatsapp (so quando o agente de IA extrair)
  ia_pausada boolean not null default false,
  encerrada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index prospeccao_conversas_status_idx on public.prospeccao_conversas (status, ultima_mensagem_em desc);
create index prospeccao_conversas_empresa_idx on public.prospeccao_conversas (empresa_id);
create index prospeccao_conversas_thread_idx on public.prospeccao_conversas (caixa_id, thread_raiz) where thread_raiz is not null;

create table public.prospeccao_emails (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.prospeccao_conversas(id) on delete cascade,
  caixa_id uuid not null references public.prospeccao_caixas(id),
  direcao text not null check (direcao in ('entrada', 'saida')),
  message_id text,
  in_reply_to text,
  referencias text,
  de text not null default '',
  para text not null default '',
  cc text,
  assunto text not null default '',
  corpo_texto text,
  corpo_html text,                               -- guardado como veio; a TELA sanitiza antes de mostrar
  anexos jsonb not null default '[]'::jsonb,     -- [{"nome":"x.pdf","tipo":"application/pdf","tamanho":123,"caminho":"bucket/arquivo"}]
  uid_imap bigint,
  pasta text,
  recebido_em timestamptz not null default now(), -- entrada: data da mensagem; saida: data do envio (ou da criacao do rascunho)
  lido boolean not null default false,
  classificacao_ia text,
  rascunho_ia text,
  motivo_ia text,
  status_envio text check (status_envio in ('rascunho', 'aprovado', 'enviado', 'falhou', 'descartado', 'incerto')),   -- so para direcao = saida
  aprovado_por uuid references public.pessoas(id),
  aprovado_em timestamptz,
  erro text,
  mensagem_id uuid references public.prospeccao_mensagens(id) on delete set null,   -- toque da jornada que originou (saida automatica)
  resposta_id uuid references public.prospeccao_respostas(id) on delete set null,
  criado_em timestamptz not null default now(),
  check ((direcao = 'saida') = (status_envio is not null))
);
create index prospeccao_emails_conversa_idx on public.prospeccao_emails (conversa_id, recebido_em);
create unique index prospeccao_emails_uid_uq on public.prospeccao_emails (caixa_id, pasta, uid_imap) where uid_imap is not null;
create unique index prospeccao_emails_msgid_uq on public.prospeccao_emails (caixa_id, direcao, message_id) where message_id is not null;
create index prospeccao_emails_fila_idx on public.prospeccao_emails (status_envio) where direcao = 'saida' and status_envio in ('aprovado', 'incerto');

-- A tela escreve so RASCUNHO e APROVACAO de saida; o resto (enviado, incerto, falhou, entrada) e do robo.
create function public.trg_fn_prospeccao_emails_guarda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_pessoa_id() is null then return new; end if;   -- backend (robos) passa
  if tg_op = 'INSERT' then
    if new.direcao <> 'saida' or new.status_envio not in ('rascunho', 'aprovado') then
      raise exception 'A tela so cria e-mails de saida em rascunho ou aprovados.';
    end if;
    if new.status_envio = 'aprovado' then new.aprovado_por := public.current_pessoa_id(); new.aprovado_em := now(); end if;
    return new;
  end if;
  -- UPDATE pela tela: entrada so muda "lido"; saida so enquanto rascunho/aprovado e so para rascunho/aprovado/descartado
  if new.direcao is distinct from old.direcao or new.message_id is distinct from old.message_id or new.uid_imap is distinct from old.uid_imap
     or new.caixa_id is distinct from old.caixa_id or new.conversa_id is distinct from old.conversa_id then
    raise exception 'Campos de identificacao do e-mail nao podem ser alterados.';
  end if;
  if old.direcao = 'entrada' then
    if (to_jsonb(new) - 'lido') is distinct from (to_jsonb(old) - 'lido') then raise exception 'E-mail recebido so permite marcar como lido.'; end if;
    return new;
  end if;
  if old.status_envio not in ('rascunho', 'aprovado') then raise exception 'E-mail ja enviado ou em andamento nao pode ser alterado pela tela.'; end if;
  if new.status_envio not in ('rascunho', 'aprovado', 'descartado') then raise exception 'Status de envio invalido para a tela.'; end if;
  if new.status_envio = 'aprovado' and old.status_envio <> 'aprovado' then new.aprovado_por := public.current_pessoa_id(); new.aprovado_em := now(); end if;
  return new;
end $$;
create trigger trg_prospeccao_emails_guarda before insert or update on public.prospeccao_emails
  for each row execute function public.trg_fn_prospeccao_emails_guarda();
revoke all on function public.trg_fn_prospeccao_emails_guarda() from public, anon, authenticated;

-- atualiza a conversa quando chega/sai e-mail
create function public.trg_fn_prospeccao_emails_conversa() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.prospeccao_conversas c set
    ultima_mensagem_em = greatest(c.ultima_mensagem_em, new.recebido_em),
    nao_lidas = (select count(*) from public.prospeccao_emails e where e.conversa_id = c.id and e.direcao = 'entrada' and not e.lido),
    atualizado_em = now()
  where c.id = new.conversa_id;
  return null;
end $$;
create trigger trg_prospeccao_emails_conversa after insert or update of lido on public.prospeccao_emails
  for each row execute function public.trg_fn_prospeccao_emails_conversa();
revoke all on function public.trg_fn_prospeccao_emails_conversa() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3) RLS: so gestor; segredos nunca passam pelo front
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_caixas enable row level security;
alter table public.prospeccao_caixa_diagnostico enable row level security;
alter table public.prospeccao_conversas enable row level security;
alter table public.prospeccao_emails enable row level security;

create policy prospeccao_caixas_sel on public.prospeccao_caixas for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_caixas_upd on public.prospeccao_caixas for update to authenticated using (public.prospeccao_eh_pedro()) with check (public.prospeccao_eh_pedro());
create policy prospeccao_diag_sel on public.prospeccao_caixa_diagnostico for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_conversas_sel on public.prospeccao_conversas for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_conversas_upd on public.prospeccao_conversas for update to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_emails_sel on public.prospeccao_emails for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_emails_ins on public.prospeccao_emails for insert to authenticated with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_emails_upd on public.prospeccao_emails for update to authenticated
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');

revoke all on public.prospeccao_caixas, public.prospeccao_caixa_diagnostico, public.prospeccao_conversas, public.prospeccao_emails from anon;
-- colunas que a tela pode alterar (o resto so o robo): grants por coluna
revoke update on public.prospeccao_caixas from authenticated;
grant update (ativa, limite_diario, rampa, intervalo_min_seg, nome_exibicao, assinatura, pasta_entrada, pasta_enviados, pasta_spam, pasta_lixo,
              guardar_copia_enviados, leitura_a_cada_min, modo_caixa_completa, idle_ligado, atualizado_em) on public.prospeccao_caixas to authenticated;
revoke update on public.prospeccao_conversas from authenticated;
grant update (status, assumida_por, assumida_em, ia_pausada, encerrada_em, atualizado_em) on public.prospeccao_conversas to authenticated;
revoke update on public.prospeccao_emails from authenticated;
grant update (lido, para, cc, assunto, corpo_texto, anexos, status_envio, caixa_id) on public.prospeccao_emails to authenticated;
revoke insert on public.prospeccao_emails from authenticated;
grant insert (conversa_id, caixa_id, direcao, in_reply_to, referencias, de, para, cc, assunto, corpo_texto, anexos, status_envio, recebido_em, resposta_id, rascunho_ia, motivo_ia) on public.prospeccao_emails to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4) Segredos: nomes no Vault + gravacao pelo painel (so o usuario do Pedro; o valor nunca volta ao front)
-- ---------------------------------------------------------------------------------------------------------
select vault.create_secret('PREENCHER', n, 'Prospeccao: valor a cadastrar pelo painel (Pedro)')
  from (values ('PROSPECCAO_CAIXA_PEDRO_SENHA'), ('PROSPECCAO_CAIXA_COMERCIAL_SENHA'), ('PROSPECCAO_CAIXA_OPERACIONAL_SENHA'), ('PROSPECCAO_IA_CHAVE')) v(n)
 where not exists (select 1 from vault.secrets s where s.name = v.n);

create function public.prospeccao_gravar_segredo(p_nome text, p_valor text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.prospeccao_eh_pedro() then raise exception 'So o usuario do Pedro cadastra segredos.'; end if;
  if p_nome is null or p_nome !~ '^PROSPECCAO_(CAIXA_[A-Z0-9]+_SENHA|IA_CHAVE)$' then raise exception 'Segredo nao permitido.'; end if;
  if p_valor is null or length(btrim(p_valor)) < 8 or length(p_valor) > 500 or btrim(p_valor) = 'PREENCHER' then raise exception 'Valor invalido.'; end if;
  select s.id into v_id from vault.secrets s where s.name = p_nome limit 1;
  if v_id is null then perform vault.create_secret(btrim(p_valor), p_nome, 'Prospeccao: cadastrado pelo painel');
  else perform vault.update_secret(v_id, btrim(p_valor)); end if;
  insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, dado_depois)
  values (public.current_pessoa_id(), public.current_papel()::text, 'prospeccao_segredo_cadastrado', 'prospeccao', jsonb_build_object('segredo', p_nome));   -- nunca o valor
end $$;
revoke all on function public.prospeccao_gravar_segredo(text, text) from public, anon;
grant execute on function public.prospeccao_gravar_segredo(text, text) to authenticated;

create function public.prospeccao_segredos_status() returns table (nome text, cadastrado boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_papel() <> 'gestor_rbr' then raise exception 'Sem permissao.'; end if;
  return query
    select s.name::text, (s.decrypted_secret is not null and s.decrypted_secret <> 'PREENCHER')
      from vault.decrypted_secrets s
     where s.name ~ '^PROSPECCAO_(CAIXA_[A-Z0-9]+_SENHA|IA_CHAVE)$' or s.name in ('PROSPECCAO_EMAIL_SENHA');
end $$;
revoke all on function public.prospeccao_segredos_status() from public, anon;
grant execute on function public.prospeccao_segredos_status() to authenticated;
