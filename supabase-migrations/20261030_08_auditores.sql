-- G04/G05/G07: auditores em SQL puro, agendados no pg_cron. Só LEEM operações, documentos e lançamentos e só ESCREVEM em
-- saude_fiscal_achados e disjuntor_fiscal. Não emitem, não cancelam, não mexem em dinheiro. Aditiva.
begin;

-- G05 · Auditor de segregação: quem gerou ou alocou a operação não emite o documento (gestor é exceção).
create or replace function public.auditar_segregacao()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.saude_fiscal_achados set resolvido_em = now() where robo = 'auditor_segregacao' and resolvido_em is null;
  insert into public.saude_fiscal_achados (robo, operacao_id, gravidade, mensagem)
  select distinct 'auditor_segregacao', o.id, 'vermelho',
         'Segregação de funções: o documento ' || upper(d.tipo::text) || ' foi emitido por quem ' ||
         case when d.emitido_por = o.gerada_por then 'gerou' else 'alocou' end || ' a operação.'
    from public.documentacao_operacao d
    join public.operacoes o on o.id = d.operacao_id
    join public.pessoas p on p.id = d.emitido_por
   where d.emitido_por is not null
     and (d.emitido_por = o.gerada_por or d.emitido_por = o.alocada_por)
     and p.papel::text <> 'gestor_rbr'
     and coalesce(o.eh_teste, false) = false
     and o.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- G04 · Auditor de dinheiro: o que o financeiro vai receber de uma cotação tem que bater com o valor da cotação (centavos não contam).
-- Só avisa (amarelo): conferir antes de cobrar. Cotação com mais de uma operação soma tudo da cotação.
create or replace function public.auditar_dinheiro()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.saude_fiscal_achados set resolvido_em = now() where robo = 'auditor_dinheiro' and resolvido_em is null;
  insert into public.saude_fiscal_achados (robo, operacao_id, gravidade, mensagem)
  select 'auditor_dinheiro', x.operacao_id, 'amarelo',
         'Valor do financeiro (R$ ' || to_char(x.receber, 'FM999G999G990D00') || ') diferente da cotação (R$ ' || to_char(x.valor_total, 'FM999G999G990D00') || ').'
    from (
      select (array_agg(o.id))[1] as operacao_id, q.id as cotacao_id, q.valor_total, sum(l.valor) as receber
        from public.lancamentos_financeiros l
        join public.operacoes o on o.id = l.operacao_id
        join public.cotacoes q on q.id = o.cotacao_id
       where l.tipo = 'receber' and l.status <> 'cancelado' and o.deleted_at is null and coalesce(o.eh_teste, false) = false
         and q.valor_total is not null
       group by q.id, q.valor_total
    ) x
   where abs(x.receber - x.valor_total) * 100 > 1;
  get diagnostics n = row_count;
  return n;
end $$;

-- G07 · Disjuntor: achado grave de segregação abre o disjuntor (a tela Saúde fiscal mostra e chama o gestor). Só o gestor reabre,
-- pela função reabrir_disjuntor. Esta função nunca fecha sozinha um disjuntor que o gestor não reabriu.
create or replace function public.atualizar_disjuntor()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  graves integer;
  v_aberto boolean;
begin
  select count(*) into graves from public.saude_fiscal_achados
   where robo = 'auditor_segregacao' and resolvido_em is null and gravidade = 'vermelho';
  select aberto into v_aberto from public.disjuntor_fiscal where id = true;
  if graves > 0 and coalesce(v_aberto, false) = false then
    insert into public.disjuntor_fiscal (id, aberto, motivo, aberto_em, reaberto_por, reaberto_em)
    values (true, true, graves || ' achado(s) grave(s) de segregação de funções.', now(), null, null)
    on conflict (id) do update set aberto = true, motivo = excluded.motivo, aberto_em = now(), reaberto_por = null, reaberto_em = null
      where public.disjuntor_fiscal.reaberto_em is null or public.disjuntor_fiscal.reaberto_em < now() - interval '1 day';
    insert into public.notificacoes (pessoa_id, tipo, referencia_id, canal, status_entrega, conteudo)
    select p.id, 'disjuntor', null, 'push'::public.canal_notificacao, 'pendente'::public.status_entrega_notificacao,
           'Disjuntor fiscal aberto: ' || graves || ' achado(s) grave(s). Veja a tela Saúde fiscal.'
      from public.pessoas p where p.papel::text = 'gestor_rbr';
  end if;
  return coalesce((select aberto from public.disjuntor_fiscal where id = true), false);
end $$;

create or replace function public.reabrir_disjuntor(p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_papel() is distinct from 'gestor_rbr' then
    raise exception 'Só um gestor reabre o disjuntor.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explique o motivo (pelo menos 10 letras).';
  end if;
  update public.disjuntor_fiscal set aberto = false, reaberto_por = current_pessoa_id(), reaberto_em = now() where id = true;
  insert into public.trilha_auditoria (tipo, ator_id, papel, origem_acao, motivo)
  values ('disjuntor_reaberto', current_pessoa_id(), 'gestor_rbr', 'tela', trim(p_motivo));
end $$;

revoke all on function public.auditar_segregacao(), public.auditar_dinheiro(), public.atualizar_disjuntor() from public, anon, authenticated;
revoke all on function public.reabrir_disjuntor(text) from public, anon;
grant execute on function public.reabrir_disjuntor(text) to authenticated;

-- Agendamento: a cada 30 minutos (mesmo ritmo do reconciliador).
select cron.schedule('auditor-segregacao-30min', '*/30 * * * *', 'select public.auditar_segregacao(); select public.atualizar_disjuntor();');
select cron.schedule('auditor-dinheiro-30min', '5,35 * * * *', 'select public.auditar_dinheiro();');

commit;
