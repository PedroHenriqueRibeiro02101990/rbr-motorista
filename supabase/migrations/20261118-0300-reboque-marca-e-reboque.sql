-- Parte C etapa 21c: ao vincular um veiculo em operacao_reboques, marca veiculos.e_reboque = true (erro de 17/11: a carreta estava com
-- e_reboque=false e sem vinculo). Gatilho SO para vinculos NOVOS: nenhum cadastro existente e alterado por esta migracao.
-- ADITIVA e idempotente. NAO APLICADA (so na etapa 28). Rollback: supabase/rollback/rollback-20261118-0300-reboque-marca-e-reboque.sql
create or replace function public.trg_fn_reboque_marca_e_reboque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.veiculos set e_reboque = true where id = new.veiculo_id and e_reboque is distinct from true;
  return new;
end;
$$;
drop trigger if exists trg_reboque_marca_e_reboque on public.operacao_reboques;
create trigger trg_reboque_marca_e_reboque after insert on public.operacao_reboques
  for each row execute function public.trg_fn_reboque_marca_e_reboque();
