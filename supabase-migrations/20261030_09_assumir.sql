-- D02: assumir a operação. Quem assume vira o responsável; outra pessoa só toma se informar que está tomando (p_tomar) com motivo.
-- Aditiva: só cria funções. Grava na trilha_auditoria.
begin;

create or replace function public.assumir_operacao(p_operacao uuid, p_tomar boolean default false, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu uuid := current_pessoa_id();
  v_atual uuid;
begin
  if v_eu is null or current_papel() is distinct from 'gestor_rbr' then
    raise exception 'Só a equipe RBR assume operações.';
  end if;
  select assumida_por into v_atual from public.operacoes where id = p_operacao for update;
  if not found then raise exception 'Operação não encontrada.'; end if;
  if v_atual is not null and v_atual <> v_eu then
    if not coalesce(p_tomar, false) or length(trim(coalesce(p_motivo, ''))) < 5 then
      raise exception 'Esta operação já foi assumida por outra pessoa. Para tomar, informe o motivo.';
    end if;
  end if;
  update public.operacoes set assumida_por = v_eu, assumida_em = now() where id = p_operacao;
  insert into public.trilha_auditoria (tipo, operacao_id, ator_id, papel, origem_acao, motivo, antes, depois)
  values (case when v_atual is not null and v_atual <> v_eu then 'operacao_tomada' else 'operacao_assumida' end,
          p_operacao, v_eu, 'gestor_rbr', 'tela', nullif(trim(coalesce(p_motivo, '')), ''),
          jsonb_build_object('assumida_por', v_atual), jsonb_build_object('assumida_por', v_eu));
end $$;

create or replace function public.largar_operacao(p_operacao uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_papel() is distinct from 'gestor_rbr' then
    raise exception 'Só a equipe RBR mexe nisso.';
  end if;
  update public.operacoes set assumida_por = null, assumida_em = null
   where id = p_operacao and assumida_por = current_pessoa_id();
end $$;

revoke all on function public.assumir_operacao(uuid, boolean, text), public.largar_operacao(uuid) from public, anon;
grant execute on function public.assumir_operacao(uuid, boolean, text), public.largar_operacao(uuid) to authenticated;
commit;
