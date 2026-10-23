-- 20261023_03 — CRM comercial, etapa 1: leads, interações, oportunidades e fila do dia.
-- Rollback: supabase/rollback/rollback-20261023_03_crm_etapa1.sql
-- Só gestor lê/escreve pelo app. O formulário do site grava pela Edge Function (service role), nunca direto do navegador.
set local lock_timeout = '8s';

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- quem é
  nome text not null,
  empresa text,
  cnpj text,
  tipo_pessoa text check (tipo_pessoa in ('PJ', 'PF')),
  whatsapp text,
  email text,
  -- o que quer
  origem_cidade text,
  origem_uf text check (origem_uf is null or char_length(origem_uf) = 2),
  destino_cidade text,
  destino_uf text check (destino_uf is null or char_length(destino_uf) = 2),
  veiculo text,
  mensagem text,
  -- de onde veio (campanha)
  origem text not null default 'site' check (origem in ('site', 'whatsapp', 'indicacao', 'manual', 'outro')),
  gclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  pagina text,
  -- funil
  status text not null default 'novo'
    check (status in ('novo', 'em_contato', 'qualificado', 'cotando', 'ganho', 'perdido', 'descartado')),
  motivo_perda text,
  responsavel_id uuid references public.pessoas(id),
  proxima_acao text,
  proxima_acao_em timestamptz,
  primeiro_contato_em timestamptz,
  cliente_id uuid references public.clientes(id)
);
create index leads_fila_idx on public.leads (status, proxima_acao_em, criado_em);
create index leads_gclid_idx on public.leads (gclid) where gclid is not null;

create table public.interacoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('formulario', 'whatsapp', 'email', 'ligacao', 'nota')),
  direcao text check (direcao in ('entrada', 'saida')),
  ocorreu_em timestamptz not null default now(),
  conteudo text,
  autor_id uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);
create index interacoes_lead_idx on public.interacoes (lead_id, ocorreu_em desc);

-- Oportunidade = lead qualificado que virou (ou vai virar) cotação. Uma cotação pertence a no máximo uma oportunidade.
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  cliente_id uuid references public.clientes(id),
  cotacao_id uuid unique references public.cotacoes(id) on delete set null,
  etapa text not null default 'qualificacao'
    check (etapa in ('qualificacao', 'cotacao_enviada', 'negociacao', 'ganha', 'perdida')),
  valor_estimado numeric,
  previsao_fechamento date,
  motivo_perda text,
  responsavel_id uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index oportunidades_etapa_idx on public.oportunidades (etapa, previsao_fechamento);

-- Primeiro contato registrado automaticamente na primeira interação de saída.
create function public.trg_fn_interacao_primeiro_contato() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.direcao = 'saida' then
    update public.leads set primeiro_contato_em = coalesce(primeiro_contato_em, new.ocorreu_em),
                            status = case when status = 'novo' then 'em_contato' else status end,
                            atualizado_em = now()
     where id = new.lead_id;
  end if;
  return new;
end $$;
create trigger trg_interacao_primeiro_contato after insert on public.interacoes
  for each row execute function public.trg_fn_interacao_primeiro_contato();

-- Fila do dia do pré-vendedor: abertos; próxima ação vencida primeiro, depois quem nunca foi contatado, depois o mais antigo.
create view public.v_fila_do_dia with (security_invoker = true) as
select l.*,
       (l.proxima_acao_em is not null and l.proxima_acao_em < now()) as acao_vencida,
       (l.primeiro_contato_em is null) as sem_contato
  from public.leads l
 where l.status in ('novo', 'em_contato', 'qualificado', 'cotando')
 order by (l.proxima_acao_em is not null and l.proxima_acao_em < now()) desc,
          (l.primeiro_contato_em is null) desc,
          coalesce(l.proxima_acao_em, l.criado_em) asc;

alter table public.leads enable row level security;
alter table public.interacoes enable row level security;
alter table public.oportunidades enable row level security;
create policy leads_gestor on public.leads for all using (current_papel() = 'gestor_rbr') with check (current_papel() = 'gestor_rbr');
create policy interacoes_gestor on public.interacoes for all using (current_papel() = 'gestor_rbr') with check (current_papel() = 'gestor_rbr');
create policy oportunidades_gestor on public.oportunidades for all using (current_papel() = 'gestor_rbr') with check (current_papel() = 'gestor_rbr');

