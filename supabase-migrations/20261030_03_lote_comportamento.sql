-- Implantação do back: LOTE DE COMPORTAMENTO (autorizado pelo Pedro em 30/10/2026). Aplicar em UMA transação.
-- Cobre A01 papéis, A02 segregação, A03 ator, A04 status, A05 avanço em nome do motorista, A06 versões, A07 carteira,
-- B12 sem encerramento automático do MDF-e, C04 troca de carreta. C10 (dados da Portaria SUROC 22/2026) NÃO entra: faltam os
-- 272 coeficientes oficiais e não se inventam valores.
-- Gestores (papel gestor_rbr) NÃO mudam em nada: todas as políticas novas são ADITIVAS (somam-se às existentes).
-- Desvio consciente do documento (A06): o UNIQUE (operacao_id, tipo) de documentacao_operacao é MANTIDO, porque emitir-cte, emitir-mdfe,
-- emitir-nfse-intramunicipal e enviar-averbacao fazem upsert com onConflict "operacao_id,tipo". O histórico é guardado por gatilho.

-- ===== A01: papéis. Valores novos no enum e tabela de funções (uma pessoa pode ter mais de uma função).
alter type public.papel_pessoa add value if not exists 'comercial';
alter type public.papel_pessoa add value if not exists 'operacao';
alter type public.papel_pessoa add value if not exists 'fiscal';
alter type public.papel_pessoa add value if not exists 'financeiro';

create table public.funcoes_pessoa (
  pessoa_id uuid not null references public.pessoas(id),
  funcao text not null check (funcao in ('comercial','operacao','fiscal','financeiro')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.pessoas(id),
  primary key (pessoa_id, funcao)
);
alter table public.funcoes_pessoa enable row level security;
create policy funcoes_pessoa_gestor on public.funcoes_pessoa for all
  using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy funcoes_pessoa_propria on public.funcoes_pessoa for select
  using (pessoa_id = public.current_pessoa_id());

-- Compara por texto (papel::text) para não depender de o valor novo do enum já estar confirmado.
create function public.tem_funcao(p_funcao text) returns boolean
language sql stable security invoker set search_path = public as $$
  select coalesce((select p.papel::text = p_funcao from public.pessoas p where p.auth_user_id = auth.uid()), false)
      or exists (select 1 from public.funcoes_pessoa f join public.pessoas p on p.id = f.pessoa_id
                  where p.auth_user_id = auth.uid() and f.funcao = p_funcao and f.ativo);
$$;
revoke execute on function public.tem_funcao(text) from public, anon;
grant execute on function public.tem_funcao(text) to authenticated;

-- ===== A07: carteira individual de clientes.
alter table public.clientes add column vendedor_id uuid references public.pessoas(id);

create function public.trg_fn_cliente_carteira() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.vendedor_id is null and public.tem_funcao('comercial') then new.vendedor_id := public.current_pessoa_id(); end if;
    return new;
  end if;
  if new.vendedor_id is distinct from old.vendedor_id and not (coalesce(public.eh_backend(), false) or public.current_papel() = 'gestor_rbr') then
    raise exception 'Só o gestor transfere clientes de carteira (use a transferência com motivo).';
  end if;
  return new;
end $$;
revoke execute on function public.trg_fn_cliente_carteira() from public, anon, authenticated;
create trigger trg_cliente_carteira before insert or update of vendedor_id on public.clientes
  for each row execute function public.trg_fn_cliente_carteira();

create function public.transferir_carteira(p_cliente uuid, p_novo_vendedor uuid, p_motivo text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_antes uuid;
begin
  if public.current_papel() is distinct from 'gestor_rbr' then raise exception 'Só o gestor transfere a carteira.'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo da transferência.'; end if;
  select vendedor_id into v_antes from public.clientes where id = p_cliente;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  update public.clientes set vendedor_id = p_novo_vendedor where id = p_cliente;
  insert into public.trilha_auditoria (tipo, ator_id, papel, origem_acao, motivo, antes, depois)
  values ('transferencia_carteira', public.current_pessoa_id(), 'gestor_rbr', 'gestor', p_motivo,
          jsonb_build_object('cliente', p_cliente, 'vendedor', v_antes), jsonb_build_object('cliente', p_cliente, 'vendedor', p_novo_vendedor));
end $$;
revoke execute on function public.transferir_carteira(uuid, uuid, text) from public, anon;
grant execute on function public.transferir_carteira(uuid, uuid, text) to authenticated;

-- O gestor grava na trilha (a política de 20261030_01 só deixava ler).
create policy trilha_auditoria_gestor_grava on public.trilha_auditoria for insert
  with check (public.current_papel() = 'gestor_rbr');

-- Auxiliar da carteira: SECURITY DEFINER para a política de operacoes/cotacoes não ler clientes pelas políticas dele (evita recursão
-- entre as políticas de clientes e de operacoes).
create function public.cliente_na_minha_carteira(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clientes c
                  where c.id = p_cliente and c.vendedor_id = (select p.id from public.pessoas p where p.auth_user_id = auth.uid()));
$$;
revoke execute on function public.cliente_na_minha_carteira(uuid) from public, anon;
grant execute on function public.cliente_na_minha_carteira(uuid) to authenticated;

-- ===== Políticas aditivas por função (só leitura, exceto a carteira do comercial).
create policy op_select_funcoes on public.operacoes for select
  using (public.tem_funcao('operacao') or public.tem_funcao('fiscal') or public.tem_funcao('financeiro'));
create policy op_select_comercial on public.operacoes for select
  using (public.tem_funcao('comercial') and public.cliente_na_minha_carteira(cliente_id));
create policy docop_select_funcoes on public.documentacao_operacao for select
  using (public.tem_funcao('operacao') or public.tem_funcao('fiscal'));
create policy eventos_fiscais_select_funcoes on public.eventos_fiscais_operacao for select
  using (public.tem_funcao('operacao') or public.tem_funcao('fiscal'));
create policy lancamentos_select_financeiro on public.lancamentos_financeiros for select
  using (public.tem_funcao('financeiro'));
create policy faturas_select_financeiro on public.faturas for select
  using (public.tem_funcao('financeiro'));
create policy clientes_select_funcoes on public.clientes for select
  using (public.tem_funcao('operacao') or public.tem_funcao('fiscal') or public.tem_funcao('financeiro'));
create policy clientes_carteira_comercial on public.clientes for all
  using (public.tem_funcao('comercial') and vendedor_id = public.current_pessoa_id())
  with check (public.tem_funcao('comercial') and vendedor_id = public.current_pessoa_id());
create policy cotacoes_select_funcoes on public.cotacoes for select
  using (public.tem_funcao('operacao') or public.tem_funcao('fiscal'));
create policy cotacoes_carteira_comercial on public.cotacoes for all
  using (public.tem_funcao('comercial') and public.cliente_na_minha_carteira(cliente_id))
  with check (public.tem_funcao('comercial') and public.cliente_na_minha_carteira(cliente_id));

-- ===== A04: status novos da operação (só os rótulos; o fluxo atual continua valendo).
alter type public.status_operacao add value if not exists 'aguardando_assumir';
alter type public.status_operacao add value if not exists 'aguardando_aceite_motorista';
alter type public.status_operacao add value if not exists 'em_emissao';
alter type public.status_operacao add value if not exists 'devolvida_pelo_fiscal';
alter type public.status_operacao add value if not exists 'pausada_por_alteracao';
alter type public.status_operacao add value if not exists 'aguardando_liberacao_gestor';
alter type public.status_operacao add value if not exists 'ordem_liberada';
alter type public.status_operacao add value if not exists 'em_viagem';
alter type public.status_operacao add value if not exists 'finalizando';
alter type public.status_operacao add value if not exists 'finalizada';

-- ===== A03/A02: quem gerou e quem alocou a operação; quem alocou ou gerou não emite o fiscal dela (gestor é exceção).
alter table public.operacoes add column gerada_por uuid references public.pessoas(id);
alter table public.operacoes add column alocada_por uuid references public.pessoas(id);

create function public.trg_fn_operacao_ator() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.gerada_por := coalesce(new.gerada_por, public.current_pessoa_id()); end if;
  if new.pessoa_alocada_id is not null and (tg_op = 'INSERT' or new.pessoa_alocada_id is distinct from old.pessoa_alocada_id) then
    new.alocada_por := public.current_pessoa_id();
  end if;
  return new;
end $$;
revoke execute on function public.trg_fn_operacao_ator() from public, anon, authenticated;
create trigger trg_zz_operacao_ator before insert or update of pessoa_alocada_id on public.operacoes
  for each row execute function public.trg_fn_operacao_ator();

create function public.trg_fn_doc_segregacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_gerou uuid; v_alocou uuid;
begin
  if new.emitido_por is null or new.status not in ('pendente', 'emitido') then return new; end if;
  if tg_op = 'UPDATE' and new.emitido_por is not distinct from old.emitido_por and new.status is not distinct from old.status then return new; end if;
  if exists (select 1 from public.pessoas p where p.id = new.emitido_por and p.papel = 'gestor_rbr') then return new; end if;
  select gerada_por, alocada_por into v_gerou, v_alocou from public.operacoes where id = new.operacao_id;
  if new.emitido_por in (v_gerou, v_alocou) then
    raise exception 'Segregação de funções: quem gerou ou alocou o motorista desta operação não emite o fiscal dela. Peça a outra pessoa ou ao gestor.';
  end if;
  return new;
end $$;
revoke execute on function public.trg_fn_doc_segregacao() from public, anon, authenticated;
create trigger trg_doc_segregacao before insert or update on public.documentacao_operacao
  for each row execute function public.trg_fn_doc_segregacao();

-- ===== A06: versões dos documentos (a linha atual guarda a versão ativa; a anterior vai para o histórico).
alter table public.documentacao_operacao add column versao integer not null default 1;
create table public.documentacao_operacao_versoes (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null,
  operacao_id uuid not null,
  tipo text not null,
  versao integer not null,
  referencia text,
  chave_acesso text,
  numero_documento text,
  status text,
  payload_resposta jsonb,
  arquivado_em timestamptz not null default now()
);
create index documentacao_versoes_op_idx on public.documentacao_operacao_versoes (operacao_id, tipo, versao);
alter table public.documentacao_operacao_versoes enable row level security;
create policy docversoes_gestor on public.documentacao_operacao_versoes for select
  using (public.current_papel() = 'gestor_rbr');

create function public.trg_fn_doc_versoes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.chave_acesso is not null and (new.chave_acesso is distinct from old.chave_acesso or new.referencia is distinct from old.referencia) then
    insert into public.documentacao_operacao_versoes (documento_id, operacao_id, tipo, versao, referencia, chave_acesso, numero_documento, status, payload_resposta)
    values (old.id, old.operacao_id, old.tipo::text, old.versao, old.referencia, old.chave_acesso, old.numero_documento, old.status::text, old.payload_resposta);
    new.versao := old.versao + 1;
  end if;
  return new;
end $$;
revoke execute on function public.trg_fn_doc_versoes() from public, anon, authenticated;
create trigger trg_doc_versoes before update on public.documentacao_operacao
  for each row execute function public.trg_fn_doc_versoes();

-- ===== A05: a Operação avança em nome do motorista (liberada_coleta → carregando → em_transito → entregue), registrado na trilha.
create function public.avancar_em_nome_do_motorista(p_operacao uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_atual text;
begin
  if not (public.current_papel() = 'gestor_rbr' or public.tem_funcao('operacao')) then
    raise exception 'Só a Operação ou o gestor avança em nome do motorista.';
  end if;
  select status::text into v_atual from public.operacoes where id = p_operacao for update;
  if not found then raise exception 'Operação não encontrada.'; end if;
  if not ((v_atual = 'liberada_coleta' and p_status = 'carregando') or (v_atual = 'carregando' and p_status = 'em_transito') or (v_atual = 'em_transito' and p_status = 'entregue')) then
    raise exception 'Transição não permitida (% para %).', v_atual, p_status;
  end if;
  update public.operacoes set status = p_status::public.status_operacao where id = p_operacao;
  insert into public.trilha_auditoria (tipo, operacao_id, ator_id, papel, origem_acao, motivo, antes, depois)
  values ('avanco_em_nome_do_motorista', p_operacao, public.current_pessoa_id(), public.current_papel()::text, 'operacao', 'Avanço em nome do motorista',
          jsonb_build_object('status', v_atual), jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.avancar_em_nome_do_motorista(uuid, text) from public, anon;
grant execute on function public.avancar_em_nome_do_motorista(uuid, text) to authenticated;

-- ===== B12: o MDF-e deixa de ser encerrado automaticamente quando a operação vira 'entregue' (passa à finalização pela Operação).
-- A função trg_fn_encerrar_mdfe_na_entrega fica no banco (sem uso); só o gatilho sai.
drop trigger trg_encerrar_mdfe_na_entrega on public.operacoes;

-- ===== C04: trocar só a carreta (operacao_reboques) também manda refazer o CIOT, como já ocorre na troca da tração.
create function public.trg_fn_ciot_troca_carreta() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_op uuid := coalesce(new.operacao_id, old.operacao_id);
begin
  update public.operacao_ciot_vpo set ciot_status = 'refazer_troca_veiculo', updated_at = now()
   where operacao_id = v_op and ciot is not null and btrim(ciot) <> '' and ciot_status in ('emitido', 'pendente');
  if found then
    insert into public.auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
    values ('ciot_troca_carreta', 'operacoes', v_op, to_jsonb(old), to_jsonb(new), public.current_papel()::text, public.current_pessoa_id());
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.trg_fn_ciot_troca_carreta() from public, anon, authenticated;
create trigger trg_ciot_troca_carreta after insert or update or delete on public.operacao_reboques
  for each row execute function public.trg_fn_ciot_troca_carreta();
