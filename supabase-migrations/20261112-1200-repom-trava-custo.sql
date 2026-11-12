-- Repom: trava de custo e origem do pedagio da cotacao. ADITIVA: nada apagado nem alterado. NAO APLICADA (o Pedro aplica).
-- 1) Segredo REPOM_ROTEIRIZACAO_LIBERADA = 'nao' no Vault (so cria se nao existir; nao exibe nem grava nenhum outro segredo).
--    Para liberar depois: vault.update_secret(<id>, 'sim'). REPOM_LIMITE_DIARIO (padrao 100) e opcional.
-- 2) cotacoes.pedagio_origem ('manual' | 'repom') e cotacoes.pedagio_consultado_em.
-- 3) repom_requisicoes.status passa a usar tambem 'cache' e 'bloqueado_limite' (campo text livre); indice para a contagem diaria.
-- Rollback: supabase/rollback/rollback-20261112-1200-repom-trava-custo.sql
select vault.create_secret('nao', 'REPOM_ROTEIRIZACAO_LIBERADA', 'Trava de custo da roteirizacao Repom: so "sim" libera')
where not exists (select 1 from vault.secrets where name = 'REPOM_ROTEIRIZACAO_LIBERADA');

alter table public.cotacoes
  add column if not exists pedagio_origem text check (pedagio_origem in ('manual', 'repom')),
  add column if not exists pedagio_consultado_em timestamptz;
comment on column public.cotacoes.pedagio_origem is 'De onde veio o valor do pedagio: manual (digitado) ou repom (calculo automatico aceito). Nulo = cotacao antiga.';

create index if not exists repom_requisicoes_dia_idx on public.repom_requisicoes (criado_em desc) where acao = 'pedagio-rota' and status in ('pendente', 'ok', 'erro');
