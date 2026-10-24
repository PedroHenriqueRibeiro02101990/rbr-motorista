-- 20261024_01 — efrete (NSTech), passo 3: registro dos pedidos de CIOT e dos pagamentos, ANTES de chamar a efrete.
-- Anti-duplicidade: id_operacao_cliente e id_pagamento_cliente são únicos; numa nova tentativa a Edge Function consulta
-- a efrete pela mesma referência e só emite se a efrete disser que não existe.
-- Tabelas novas porque ciot_registros / pagamentos_motorista / operacao_ciot_vpo exigem uma operação real do ERP;
-- aqui operacao_id é opcional (teste de homologação). No passo 4, o CIOT emitido é copiado para operacao_ciot_vpo.
-- Acesso: RLS ligada e nenhuma política => só service_role (Edge Functions). Nada para anon/authenticated.
-- Sem dado sensível: não guarda chave Pix, conta, token nem credencial; resumo_retorno só com campos de status.
-- Rollback: supabase/rollback/rollback-20261024_01_efrete_ciot_pedidos.sql
set local lock_timeout = '8s';

create table public.efrete_ciot_pedidos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid references public.operacoes(id) on delete set null,
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  tipo_viagem text not null check (tipo_viagem in ('Padrao', 'Fracionado', 'TAC_Agregado')),
  id_operacao_cliente text not null unique,
  documento_viagem text not null,
  status text not null default 'pendente' check (status in ('pendente', 'emitido', 'erro', 'cancelado')),
  ciot text check (ciot is null or char_length(ciot) = 12),
  ciot_origem text not null default 'efrete',
  protocolo text,
  valor_frete numeric(14, 2),
  data_inicio_viagem timestamptz,
  data_fim_viagem timestamptz,
  emitido_em timestamptz,
  cancelado_em timestamptz,
  cancelamento_protocolo text,
  cancelamento_motivo text,
  tentativas int not null default 0,
  ultimo_erro text,
  resumo_retorno jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.efrete_ciot_pedidos is 'Pedidos de CIOT à efrete (NSTech), gravados antes da chamada. Referência única = IdOperacaoCliente. Só service_role.';

create table public.efrete_ciot_pagamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.efrete_ciot_pedidos(id) on delete cascade,
  id_pagamento_cliente text not null unique,
  categoria text not null check (categoria in ('Adiantamento', 'Quitacao', 'Estadia', 'SemCategoria')),
  valor numeric(14, 2) not null check (valor > 0),
  data_liberacao timestamptz not null,
  meio text not null default 'pix' check (meio in ('pix', 'conta')),
  status text not null default 'pendente' check (status in ('pendente', 'registrado', 'liquidado', 'estornado', 'cancelado', 'erro')),
  status_efrete text,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create index efrete_ciot_pagamentos_pedido_idx on public.efrete_ciot_pagamentos (pedido_id);

alter table public.efrete_ciot_pedidos enable row level security;
alter table public.efrete_ciot_pagamentos enable row level security;
revoke all on public.efrete_ciot_pedidos from anon, authenticated;
revoke all on public.efrete_ciot_pagamentos from anon, authenticated;
