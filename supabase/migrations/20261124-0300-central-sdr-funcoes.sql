-- Central F4 (24/11/2026): funcoes da Fila do SDR (encher a fila, listar com os dados da empresa, concluir a ligacao).
-- ADITIVA: so cria funcoes novas. Depende de 20261124-0100-central-base (central_sdr_fila, central_eh_sdr/admin) e do CHECK leads_origem_check ja aceitar 'prospeccao'.
-- Rollback: supabase/rollback/rollback-20261124-0300-central-sdr-funcoes.sql
-- STATUS: NAO APLICADA. So aplicar quando o Pedro escrever "pode aplicar".
-- Regras (prompt do Pedro): entra quem respondeu (qualquer jeito) e quem tem telefone + nota >= CENTRAL_SDR_CORTE_NOTA (ate CENTRAL_SDR_MAX_DIA novos por dia);
-- nao entra quem so abriu o e-mail; contato bloqueado / descadastrado nunca entra (o gatilho da fila tambem recusa); resultado da ligacao atualiza a empresa e cria/atualiza UM lead.
set local lock_timeout = '8s';

-- 1) Encher a fila. Idempotente (o indice unico impede duplicar a empresa aberta). Pode ser chamada por quem enxerga a fila.
create or replace function public.central_sdr_encher() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_corte numeric; v_max int; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_resp int := 0; v_nota int := 0; v_ja_hoje int; r record;
begin
  if not public.central_eh_sdr() then raise exception 'Sem permissao.'; end if;
  select case when jsonb_typeof(valor) = 'number' then (valor #>> '{}')::numeric when jsonb_typeof(valor) = 'string' and (valor #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then (valor #>> '{}')::numeric end
    into v_corte from public.parametros_sistema where chave = 'CENTRAL_SDR_CORTE_NOTA';
  select coalesce(case when jsonb_typeof(valor) = 'number' then (valor #>> '{}')::int end, 10)
    into v_max from public.parametros_sistema where chave = 'CENTRAL_SDR_MAX_DIA';
  v_max := coalesce(v_max, 10);

  -- (a) quem respondeu, de qualquer jeito (inclusive "fale com fulano"), e ainda nao tem linha na fila depois da resposta
  for r in
    select distinct on (e.id) e.id as empresa_id, e.telefone, e.pontuacao, c.id as contato_id
      from public.prospeccao_respostas pr
      join public.prospeccao_empresas e on e.id = pr.empresa_id
      left join public.prospeccao_contatos c on c.empresa_id = e.id and lower(c.email) = lower(pr.de_email)
     where e.status not in ('descadastrado', 'descartado')
       and not exists (select 1 from public.central_sdr_fila f where f.empresa_id = e.id and (f.status in ('na_fila','assumido') or f.criado_em >= pr.recebido_em))
     order by e.id, pr.recebido_em desc
  loop
    begin
      insert into public.central_sdr_fila (empresa_id, contato_id, motivo, nota, telefone) values (r.empresa_id, r.contato_id, 'respondeu', r.pontuacao, nullif(btrim(coalesce(r.telefone, '')), ''));
      v_resp := v_resp + 1;
    exception when others then null;   -- bloqueado/descadastrado ou corrida: o banco vence, a empresa nao entra
    end;
  end loop;

  -- (b) nota alta com telefone, que ainda nao respondeu e nunca esteve na fila; limite de novos por dia
  if v_corte is not null then
    select count(*) into v_ja_hoje from public.central_sdr_fila where motivo = 'nota_alta' and (criado_em at time zone 'America/Sao_Paulo')::date = v_hoje;
    for r in
      select e.id as empresa_id, e.telefone, e.pontuacao
        from public.prospeccao_empresas e
       where e.pontuacao >= v_corte and nullif(btrim(coalesce(e.telefone, '')), '') is not null
         and e.status in ('novo', 'qualificado', 'em_aprovacao', 'em_contato')
         and not exists (select 1 from public.prospeccao_respostas pr where pr.empresa_id = e.id)
         and not exists (select 1 from public.central_sdr_fila f where f.empresa_id = e.id)
       order by e.pontuacao desc, e.id
       limit greatest(0, v_max - v_ja_hoje)
    loop
      begin
        insert into public.central_sdr_fila (empresa_id, motivo, nota, telefone) values (r.empresa_id, 'nota_alta', r.pontuacao, r.telefone);
        v_nota := v_nota + 1;
      exception when others then null;
      end;
    end loop;
  end if;
  return jsonb_build_object('entraram_por_resposta', v_resp, 'entraram_por_nota', v_nota, 'corte_definido', v_corte is not null);
end $$;

-- 2) Lista da fila com tudo que o cartao mostra (empresa, contato, telefone, motivo, resumo da conversa, nota, quem assumiu). Abertas + as 30 ultimas concluidas.
create or replace function public.central_sdr_lista() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.central_eh_sdr() then raise exception 'Sem permissao.'; end if;
  return coalesce((
    select jsonb_agg(x order by x.ord, x.criado_em)
      from (
        select case when f.status in ('na_fila','assumido') then 0 else 1 end as ord, f.criado_em,
               jsonb_build_object(
                 'id', f.id, 'status', f.status, 'motivo', f.motivo, 'nota', f.nota, 'telefone', f.telefone, 'observacao', f.observacao,
                 'criado_em', f.criado_em, 'assumido_por', f.assumido_por, 'assumido_por_nome', p.nome, 'resultado_em', f.resultado_em, 'lead_id', f.lead_id,
                 'empresa_id', e.id, 'empresa', coalesce(e.nome_fantasia, e.razao_social), 'cidade', e.cidade, 'uf', e.uf, 'segmento', e.segmento,
                 'contato_nome', c.nome, 'contato_cargo', c.cargo, 'contato_email', c.email,
                 'resumo', (select cv.resumo_ia from public.prospeccao_conversas cv where cv.empresa_id = e.id and cv.resumo_ia is not null order by cv.ultima_mensagem_em desc nulls last limit 1),
                 'quente', exists (select 1 from public.prospeccao_respostas pr where pr.empresa_id = e.id and pr.classificacao in ('cotacao', 'preco_prazo'))
               ) as x
          from public.central_sdr_fila f
          join public.prospeccao_empresas e on e.id = f.empresa_id
          left join public.prospeccao_contatos c on c.id = f.contato_id
          left join public.pessoas p on p.id = f.assumido_por
         where f.status in ('na_fila','assumido') or f.id in (select id from public.central_sdr_fila where status not in ('na_fila','assumido') order by resultado_em desc nulls last limit 30)
      ) t
  ), '[]'::jsonb);
end $$;

-- 3) Concluir a ligacao. p_resultado: ligou (atendeu) | sem_resposta | pediu_cotacao | sem_interesse | telefone_errado.
create or replace function public.central_sdr_concluir(p_id uuid, p_resultado text, p_obs text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.central_sdr_fila; e public.prospeccao_empresas; c public.prospeccao_contatos;
  v_lead uuid; v_eu uuid := public.current_pessoa_id(); v_obs text := nullif(left(btrim(coalesce(p_obs, '')), 1000), '');
begin
  if not public.central_eh_sdr() then raise exception 'Sem permissao.'; end if;
  if p_resultado not in ('ligou', 'sem_resposta', 'pediu_cotacao', 'sem_interesse', 'telefone_errado') then raise exception 'Resultado invalido.'; end if;
  select * into f from public.central_sdr_fila where id = p_id for update;
  if not found then raise exception 'Contato nao encontrado na fila.'; end if;
  if f.status <> 'assumido' then raise exception 'So da para concluir um contato assumido.'; end if;
  if f.assumido_por is distinct from v_eu and not public.central_eh_admin() then raise exception 'So quem assumiu (ou o Pedro) conclui.'; end if;
  select * into e from public.prospeccao_empresas where id = f.empresa_id for update;
  select * into c from public.prospeccao_contatos where id = f.contato_id;

  -- empresa
  if p_resultado = 'ligou' and e.status in ('novo', 'qualificado', 'em_aprovacao', 'respondeu') then
    update public.prospeccao_empresas set status = 'em_contato' where id = e.id;
  elsif p_resultado = 'pediu_cotacao' and e.status not in ('cliente', 'descadastrado') then
    update public.prospeccao_empresas set status = 'quente' where id = e.id;
  elsif p_resultado = 'sem_interesse' and e.status not in ('cliente', 'descadastrado') then
    update public.prospeccao_empresas set status = 'repouso', repouso_ate = current_date + 90 where id = e.id;
  end if;

  -- UM lead: se a empresa ja tem, atualiza esse; senao cria. So para quem atendeu ou pediu cotacao.
  if p_resultado in ('ligou', 'pediu_cotacao') then
    v_lead := e.lead_id;
    if v_lead is null then
      insert into public.leads (nome, empresa, cnpj, tipo_pessoa, whatsapp, email, origem, status, mensagem, responsavel_id, proxima_acao)
      values (coalesce(nullif(btrim(c.nome), ''), coalesce(e.nome_fantasia, e.razao_social)), e.razao_social, e.cnpj, 'PJ', coalesce(f.telefone, e.telefone), c.email, 'prospeccao',
              case when p_resultado = 'pediu_cotacao' then 'novo' else 'em_contato' end, v_obs, f.assumido_por,
              case when p_resultado = 'pediu_cotacao' then 'Fazer a cotacao pedida na ligacao' else 'Retomar o contato' end)
      returning id into v_lead;
      update public.prospeccao_empresas set lead_id = v_lead where id = e.id;
    else
      update public.leads set atualizado_em = now(),
             status = case when p_resultado = 'pediu_cotacao' and status in ('novo', 'em_contato') then 'qualificado' else status end,
             mensagem = case when v_obs is null then mensagem else left(coalesce(mensagem || E'\n', '') || v_obs, 2000) end,
             proxima_acao = case when p_resultado = 'pediu_cotacao' then 'Fazer a cotacao pedida na ligacao' else proxima_acao end
       where id = v_lead;
    end if;
  end if;

  update public.central_sdr_fila set status = p_resultado, resultado_em = now(), observacao = v_obs, lead_id = coalesce(v_lead, lead_id) where id = f.id;
  insert into public.auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
  values (v_eu, public.current_papel()::text, 'central_sdr_concluido', 'central_sdr_fila', f.id, jsonb_build_object('status', f.status), jsonb_build_object('status', p_resultado, 'lead_id', v_lead));
  return jsonb_build_object('ok', true, 'lead_id', v_lead);
end $$;

revoke all on function public.central_sdr_encher(), public.central_sdr_lista(), public.central_sdr_concluir(uuid, text, text) from public, anon;
grant execute on function public.central_sdr_encher(), public.central_sdr_lista(), public.central_sdr_concluir(uuid, text, text) to authenticated;
