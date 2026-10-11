-- Ajuste da Tarefa 8 (11/10/2026): a trava do contrato do agenciador só passa a valer depois que a PRIMEIRA versão do
-- contrato do agenciador for publicada (mesmo critério do termo do motorista). Antes disso ninguém consegue assinar,
-- então travar pararia todas as cargas de agenciador. Agenciador SUSPENSO continua travado sempre.
-- Afeta as três travas que usam esta função: cotação convertida, criação de operação e "Baixar documentação"
-- (e também declarar_carga, que exige agenciador_pode_operar).

create or replace function public.contrato_agenciador_em_vigor()
returns boolean language sql stable security definer set search_path = public as $$
  -- publicada uma vez = há versão publicada ou arquivada (arquivar só acontece quando outra é publicada)
  select exists (select 1 from termos_contrato where tipo = 'agenciador' and status in ('publicado', 'arquivado'))
$$;
revoke all on function public.contrato_agenciador_em_vigor() from public, anon;
grant execute on function public.contrato_agenciador_em_vigor() to authenticated, service_role;

create or replace function public.agenciador_pode_operar(p_agenciador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_agenciador is null
      or (
        not exists (select 1 from pessoas where id = p_agenciador and status_contrato_agenciador = 'suspenso')
        and (not contrato_agenciador_em_vigor()
             or exists (select 1 from pessoas where id = p_agenciador and status_contrato_agenciador = 'validado'))
      )
$$;
revoke all on function public.agenciador_pode_operar(uuid) from public, anon;
grant execute on function public.agenciador_pode_operar(uuid) to authenticated, service_role;
