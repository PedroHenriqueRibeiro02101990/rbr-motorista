-- Cotações: guarda o cálculo de rota, piso e pedágio (ADITIVA: só colunas novas, nada existente é alterado).
-- Já existiam: pedagio (total), pedagio_origem ('manual'|'repom' = fonte), pedagio_consultado_em, distancia_km, eixos,
-- ibge_origem, ibge_destino, tipo_carga, tabela_antt. Novas: ida, volta, incluir_volta, ambiente e descrição da rota.
alter table public.cotacoes
  add column if not exists pedagio_ida numeric(12,2),
  add column if not exists pedagio_volta numeric(12,2),
  add column if not exists incluir_volta boolean not null default false,
  add column if not exists pedagio_ambiente text,
  add column if not exists rota_descricao text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cotacoes_pedagio_ambiente_check') then
    alter table public.cotacoes add constraint cotacoes_pedagio_ambiente_check
      check (pedagio_ambiente is null or pedagio_ambiente in ('qa', 'prd'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cotacoes_pedagio_ida_volta_nao_negativo') then
    alter table public.cotacoes add constraint cotacoes_pedagio_ida_volta_nao_negativo
      check ((pedagio_ida is null or pedagio_ida >= 0) and (pedagio_volta is null or pedagio_volta >= 0));
  end if;
end $$;

comment on column public.cotacoes.pedagio_ida is 'Pedágio de ida (Repom). Preenchido quando o usuário clica em "Usar esse valor".';
comment on column public.cotacoes.pedagio_volta is 'Pedágio de volta (só quando incluir_volta = true).';
comment on column public.cotacoes.pedagio_ambiente is 'Ambiente da consulta de pedágio: qa (valor de teste) ou prd.';
