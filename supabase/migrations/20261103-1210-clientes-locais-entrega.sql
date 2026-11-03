-- B12 (03/11/2026): varios locais de entrega por cliente (destinatario). SO ESTRUTURA: sem regra fiscal de triangulacao
-- (depende da orientacao do Alan) e sem tela ainda. Tabela nova e aditiva. RLS LIGADO e SEM politica de proposito:
-- ninguem le nem grava pela API ate o Pedro autorizar as politicas (mudanca de acesso fica fora desta rodada).
create table if not exists public.clientes_locais_entrega (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  apelido text not null,
  cnpj text null,
  inscricao_estadual text null,
  logradouro text null,
  numero text null,
  complemento text null,
  bairro text null,
  cidade text null,
  uf text null,
  cep text null,
  codigo_ibge text null,
  contato_nome text null,
  contato_telefone text null,
  contato_email text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clientes_locais_entrega_cliente_idx on public.clientes_locais_entrega (cliente_id);
alter table public.clientes_locais_entrega enable row level security;
comment on table public.clientes_locais_entrega is 'Locais de entrega de um cliente (estrutura apenas; sem regra de triangulacao; RLS ligado sem politica ate autorizacao).';
