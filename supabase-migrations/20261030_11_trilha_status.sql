-- A09/G05: toda mudança de status de operação e todo documento fiscal emitido ou cancelado entra na trilha_auditoria
-- (quem, qual papel, de onde, antes e depois). Aditiva: dois gatilhos AFTER que só inserem na trilha; não alteram a linha.
begin;

create or replace function public.trg_fn_trilha_status_operacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.trilha_auditoria (tipo, operacao_id, ator_id, papel, origem_acao, antes, depois)
  values ('status_operacao', new.id, current_pessoa_id(), coalesce(current_papel()::text, 'sistema'),
          case when auth.uid() is null then 'servidor' else 'tela' end,
          jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  return null;
end $$;

drop trigger if exists trg_trilha_status_operacao on public.operacoes;
create trigger trg_trilha_status_operacao after update of status on public.operacoes
  for each row when (old.status is distinct from new.status) execute function public.trg_fn_trilha_status_operacao();

create or replace function public.trg_fn_trilha_documento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.trilha_auditoria (tipo, operacao_id, ator_id, papel, origem_acao, antes, depois)
  values ('documento_' || new.tipo::text, new.operacao_id, coalesce(new.emitido_por, current_pessoa_id()), coalesce(current_papel()::text, 'sistema'),
          case when auth.uid() is null then 'servidor' else 'tela' end,
          jsonb_build_object('status', case when tg_op = 'UPDATE' then old.status end), jsonb_build_object('status', new.status, 'numero', new.numero_documento));
  return null;
end $$;

drop trigger if exists trg_trilha_documento on public.documentacao_operacao;
create trigger trg_trilha_documento after insert on public.documentacao_operacao
  for each row when (new.status::text in ('emitido', 'cancelado')) execute function public.trg_fn_trilha_documento();
drop trigger if exists trg_trilha_documento_upd on public.documentacao_operacao;
create trigger trg_trilha_documento_upd after update of status on public.documentacao_operacao
  for each row when (new.status::text in ('emitido', 'cancelado') and old.status is distinct from new.status) execute function public.trg_fn_trilha_documento();

commit;
