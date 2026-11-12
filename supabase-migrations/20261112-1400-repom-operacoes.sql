-- Repom API completa: estado e idempotencia das operacoes (vale-pedagio, contrato/CIOT, pagamento) + travas novas. ADITIVA: nada apagado
-- nem alterado nas tabelas existentes. NAO APLICADA (o Claude/Pedro aplica depois de revisar).
-- 1) repom_operacoes: UM registro por operacao, tipo (vpo | ciot | pagamento) e ambiente (qa | prd). Estados: pendente, enviado, emitido,
--    erro, cancelado. "enviado" sem resposta NUNCA reenvia (a funcao consulta antes). Guarda os codigos devolvidos, o payload SANITIZADO
--    (sem nome, documento, placa, cartao, token ou senha) e quem confirmou (nome e hora). Homologacao (qa) nunca vale como producao.
-- 2) Segredos de trava no Vault, todos DESLIGADOS: REPOM_API_LIBERADA = 'nao' e REPOM_VALOR_MAXIMO_OPERACAO = '3000'.
--    (Credenciais do cliente 9520 e URLs NAO sao criadas aqui: o Pedro cadastra pelo painel do Supabase. Nomes em docs/RELATORIO-REPOM-API-2026-11-12.md.)
-- 3) indice para o limite diario GLOBAL (todas as acoes que foram a Repom).
-- RLS: so gestor_rbr le; escrita so service_role (que ignora RLS). Agenciador NAO le nada daqui.
-- Rollback: supabase/rollback/rollback-20261112-1400-repom-operacoes.sql
create table if not exists public.repom_operacoes (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id),
  tipo text not null check (tipo in ('vpo', 'ciot', 'pagamento')),
  ambiente text not null check (ambiente in ('qa', 'prd')),
  estado text not null default 'pendente' check (estado in ('pendente', 'enviado', 'emitido', 'erro', 'cancelado')),
  tentativa integer not null default 0 check (tentativa >= 0),
  chave_externa text not null,
  codigo_viagem text,
  codigo_viagem_repom text,
  idvpo text,
  codigo_contrato text,
  ciot text,
  operation_key text,
  valor numeric(14,2) check (valor is null or valor >= 0),
  payload_sanitizado jsonb,
  resposta_sanitizada jsonb,
  erro text,
  confirmado_por text,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (operacao_id, tipo, ambiente),
  unique (ambiente, tipo, chave_externa)
);
comment on table public.repom_operacoes is 'Estado e idempotencia das operacoes Repom (vpo, ciot, pagamento). Sem dado pessoal e sem segredo. Escrita so service_role.';

create or replace function public.repom_operacoes_toca() returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger repom_operacoes_atualizado before update on public.repom_operacoes for each row execute function public.repom_operacoes_toca();

alter table public.repom_operacoes enable row level security;
create policy repom_operacoes_gestor_le on public.repom_operacoes for select using (public.current_papel() = 'gestor_rbr');
revoke all on public.repom_operacoes from anon;
revoke insert, update, delete on public.repom_operacoes from authenticated;
revoke all on function public.repom_operacoes_toca() from public, anon, authenticated;

select vault.create_secret('nao', 'REPOM_API_LIBERADA', 'Trava da API Repom completa (vale, contrato/CIOT, pagamento): so "sim" libera')
where not exists (select 1 from vault.secrets where name = 'REPOM_API_LIBERADA');
select vault.create_secret('3000', 'REPOM_VALOR_MAXIMO_OPERACAO', 'Valor maximo por operacao Repom na fase de teste, em reais (padrao 3000)')
where not exists (select 1 from vault.secrets where name = 'REPOM_VALOR_MAXIMO_OPERACAO');

create index if not exists repom_requisicoes_dia_global_idx on public.repom_requisicoes (criado_em desc) where status in ('pendente', 'ok', 'erro');
