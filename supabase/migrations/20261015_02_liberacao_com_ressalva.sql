-- 20261015_02 — Liberar para coleta "mesmo assim", com motivo (Parte C, item C2.3, decisão do Pedro 2026-10-15)
--
-- Regra interna da RBR avisa em vez de travar. Na liberação (aguardando_liberacao_fiscal -> liberada_coleta) só duas
-- travas ganham "Seguir mesmo assim" com motivo obrigatório, gravado em auditoria_log ('liberacao_com_ressalva'):
--   1) condição de pagamento do motorista ainda não definida;
--   2) documento exigido que EXISTE (emitido, com número/chave ou arquivo enviado) mas ainda não foi conferido por nós.
-- Continua bloqueando sempre: documento exigido que nem existe (exigência SEFAZ/ANTT), bloqueio fiscal manual,
-- falta de veículo/motorista, aprovação de cadastro, aceite do termo, parceiro suspenso e agenciador sem contrato.
-- Depende de 20261014_01 (eh_gestor_ou_backend). Corpo de trg_fn_operacao_valida_transicao copiado do banco em
-- 2026-10-15; só o bloco de liberada_coleta mudou.

create or replace function public.trg_fn_operacao_valida_transicao()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_gestor boolean := eh_backend() or current_papel() = 'gestor_rbr';
  v_pendentes text;
  v_faltando text;
  v_nao_conferidos text;
  v_ressalva text;
  v_sem_condicao boolean;
begin
  if tg_op = 'UPDATE' and new.status = 'alocando_motorista' and old.status = 'alocando_motorista'
     and new.veiculo_id is not null and new.pessoa_alocada_id is not null then
    new.status := 'aguardando_liberacao_fiscal';
  end if;

  if tg_op = 'UPDATE' and not v_gestor then
    new.coleta_em := old.coleta_em; new.entregue_em := old.entregue_em; new.fechamento_motivo := old.fechamento_motivo;
  end if;

  if tg_op = 'INSERT' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'carregando' then new.coleta_em := coalesce(new.coleta_em, now()); end if;
  if new.status = 'entregue' then new.entregue_em := coalesce(new.entregue_em, now()); end if;

  if not v_gestor then
    if not (
      (old.status = 'liberada_coleta' and new.status = 'carregando') or
      (old.status = 'carregando' and new.status = 'em_transito') or
      (old.status = 'em_transito' and new.status = 'entregue')
    ) then
      raise exception 'Mudança de status não permitida (% → %). Só a RBR libera a carga; o motorista avança a partir de "Liberada para coleta".', old.status, new.status;
    end if;
    return new;
  end if;

  if new.status = 'cancelada' then
    if coalesce(trim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.';
    end if;
    new.cancelada_em := now();
    new.cancelada_por := current_pessoa_id();
    return new;
  end if;

  if new.status = 'liberada_coleta' then
    if new.bloqueio_fiscal then
      raise exception 'Operação com bloqueio fiscal ativo não pode ser liberada. Motivo: %', new.bloqueio_fiscal_motivo;
    end if;
    if new.veiculo_id is null or new.pessoa_alocada_id is null then
      raise exception 'Aloque veículo e motorista antes de liberar para coleta.';
    end if;
    -- Motivo da liberação com ressalva: só vale para gestor e só pela RPC liberar_operacao_com_ressalva.
    v_ressalva := nullif(trim(coalesce(current_setting('rbr.liberacao_ressalva', true), '')), '');
    select
      string_agg(rotulo, ', '),
      string_agg(rotulo, ', ') filter (where not existe),
      string_agg(rotulo, ', ') filter (where existe)
      into v_pendentes, v_faltando, v_nao_conferidos
    from (
      select case d.tipo when 'cte' then 'CT-e' when 'mdfe' then 'MDF-e' when 'ciot' then 'CIOT' when 'vpo' then 'Vale-pedágio'
                         when 'gr' then 'Pesquisa GR' when 'atm' then 'Averbação' when 'wialon' then 'Rastreamento'
                         when 'aet' then 'AET' when 'nfse' then 'NFS-e' else d.tipo::text end as rotulo,
             (d.status = 'emitido' or d.arquivo_path is not null or d.numero_documento is not null
              or d.chave_acesso is not null) as existe
        from documentacao_operacao d
       where d.operacao_id = new.id and d.exigido and d.conferencia_status not in ('ok','aceito_manual')
    ) p;
    v_sem_condicao := not exists (select 1 from condicoes_pagamento_operacao where operacao_id = new.id);

    if v_ressalva is null then
      if v_pendentes is not null then
        raise exception 'Documentos ainda não conferidos: %.', v_pendentes;
      end if;
      if v_sem_condicao then
        raise exception 'Defina a condição de pagamento do motorista antes de liberar.';
      end if;
    else
      if v_faltando is not null then
        raise exception 'Documentos exigidos que ainda não existem (exigência fiscal/ANTT — não dá para liberar com ressalva): %.', v_faltando;
      end if;
      if v_nao_conferidos is not null or v_sem_condicao then
        insert into auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_depois)
        values (current_pessoa_id(), current_papel()::text, 'liberacao_com_ressalva', 'operacoes', new.id,
                jsonb_build_object('motivo', v_ressalva,
                                   'documentos_nao_conferidos', v_nao_conferidos,
                                   'sem_condicao_pagamento', v_sem_condicao));
      end if;
    end if;

    if old.status is distinct from 'liberada_coleta' then
      new.liberada_em := now();
      new.liberada_por := current_pessoa_id();
    end if;
  end if;

  if new.status in ('carregando','em_transito','entregue','fechada') and new.liberada_em is null then
    raise exception 'A operação precisa ser liberada para coleta antes de avançar.';
  end if;

  if new.status = 'fechada' then
    if old.status <> 'entregue' then
      raise exception 'Só dá para fechar uma operação entregue.';
    end if;
    select string_agg(lf.descricao || ' (R$ ' || to_char(lf.valor - lf.valor_pago - lf.desconto, 'FM999G999G990D00') || ')', '; ')
      into v_pendentes
    from lancamentos_financeiros lf where lf.operacao_id = new.id and lf.status in ('previsto','aberto');
    if v_pendentes is not null and coalesce(trim(new.fechamento_motivo),'') = '' then
      raise exception 'Ainda há valores em aberto nesta operação: %. Quite no Financeiro ou informe um motivo para fechar mesmo assim.', v_pendentes;
    end if;
    new.finalizada_em := now();
  end if;

  if new.status in ('alocando_motorista','aguardando_liberacao_fiscal','liberada_coleta') then new.coleta_em := null; end if;
  if new.status in ('alocando_motorista','aguardando_liberacao_fiscal','liberada_coleta','carregando','em_transito') then new.entregue_em := null; end if;
  if new.status <> 'fechada' then new.fechamento_motivo := null; if old.status = 'fechada' then new.finalizada_em := null; end if; end if;

  if old.status = 'cancelada' then
    new.motivo_cancelamento := null;
    new.cancelada_em := null;
    new.cancelada_por := null;
  end if;
  return new;
end; $function$;

-- Gestor: "Seguir mesmo assim" na liberação, com motivo. O motivo vale só dentro desta transação.
create or replace function public.liberar_operacao_com_ressalva(p_operacao uuid, p_motivo text)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not eh_gestor_ou_backend() then
    raise exception 'Só um gestor RBR libera com ressalva.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Informe o motivo para seguir mesmo assim (mínimo 10 caracteres).';
  end if;
  perform set_config('rbr.liberacao_ressalva', trim(p_motivo), true);
  update operacoes set status = 'liberada_coleta'
   where id = p_operacao and status = 'aguardando_liberacao_fiscal';
  if not found then
    perform set_config('rbr.liberacao_ressalva', '', true);
    raise exception 'A operação não está aguardando liberação.';
  end if;
  perform set_config('rbr.liberacao_ressalva', '', true);
end $$;

revoke all on function public.liberar_operacao_com_ressalva(uuid, text) from public, anon;
grant execute on function public.liberar_operacao_com_ressalva(uuid, text) to authenticated, service_role;
