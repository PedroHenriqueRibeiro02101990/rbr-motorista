-- Parte B (etapas 10 e 12b): uploads e leitura de CIOT/VPO na aba Fiscal. ADITIVA e idempotente. NAO APLICADA (so na etapa 28).
-- documentacao_operacao ja tem arquivo_path, arquivo_nome, arquivo_enviado_em, origem_acao, emitido_por e versao, e o enum
-- tipo_documento_fiscal ja tem 'ciot' e 'vpo' (conferido no banco em 18/11/2026): so faltam o hash do arquivo e o historico de trocas.
-- Rollback: supabase/rollback/rollback-20261118-0200-fiscal-uploads-manual.sql
alter table public.documentacao_operacao add column if not exists arquivo_hash text;
alter table public.documentacao_operacao add column if not exists arquivo_historico jsonb not null default '[]'::jsonb;
create index if not exists documentacao_operacao_hash_idx on public.documentacao_operacao (operacao_id, tipo, arquivo_hash) where arquivo_hash is not null;

-- Politicas minimas para o perfil de operacao/fiscal SE o login do Eduardo for papel 'operacao' (e nao gestor_rbr com funcao).
-- gestor_rbr ja tem acesso total pelas politicas existentes; estas NAO abrem nada para outros papeis.
drop policy if exists docop_escrita_funcoes on public.documentacao_operacao;
create policy docop_escrita_funcoes on public.documentacao_operacao for all to authenticated
  using ((select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa))
  with check ((select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa));
drop policy if exists eventos_fiscais_insert_funcoes on public.eventos_fiscais_operacao;
create policy eventos_fiscais_insert_funcoes on public.eventos_fiscais_operacao for insert to authenticated
  with check ((select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa));
drop policy if exists ciot_vpo_escrita_funcoes on public.operacao_ciot_vpo;
create policy ciot_vpo_escrita_funcoes on public.operacao_ciot_vpo for all to authenticated
  using ((select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa))
  with check ((select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa));
drop policy if exists operacao_documentos_funcoes on storage.objects;
create policy operacao_documentos_funcoes on storage.objects for all to authenticated
  using (bucket_id = 'operacao-documentos' and (select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa))
  with check (bucket_id = 'operacao-documentos' and (select current_papel()) in ('operacao'::papel_pessoa, 'fiscal'::papel_pessoa));

-- Confirmacao do CIOT lido do contrato: grava operacao_ciot_vpo e condicoes_pagamento_operacao NA MESMA transacao (idempotente por operacao).
create or replace function public.confirmar_ciot_vpo_manual(p_operacao uuid, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_papel papel_pessoa := (select current_papel()); v_ator uuid := (select current_pessoa_id()); v_id uuid;
begin
  if v_papel is null or v_papel not in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;
  if p_dados ? 'vpo_valor' and nullif(p_dados->>'vpo_valor', '') is not null and (p_dados->>'vpo_valor')::numeric <= 0 then
    raise exception 'Valor do vale-pedagio deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_dados ? 'ciot' and nullif(p_dados->>'ciot', '') is not null and (p_dados->>'ciot' !~ '^[0-9]{12}$') then
    raise exception 'CIOT deve ter 12 digitos (o verificador vai separado).' using errcode = '22023';
  end if;
  insert into operacao_ciot_vpo (operacao_id, origem) values (p_operacao, 'manual') on conflict do nothing;
  update operacao_ciot_vpo set
    vpo_idvpo = coalesce(nullif(p_dados->>'vpo_idvpo', ''), vpo_idvpo),
    vpo_valor = coalesce(nullif(p_dados->>'vpo_valor', '')::numeric, vpo_valor),
    vpo_cnpj_fornecedora = coalesce(nullif(p_dados->>'vpo_cnpj_fornecedora', ''), vpo_cnpj_fornecedora),
    vpo_categoria_combinacao = coalesce(nullif(p_dados->>'vpo_categoria_combinacao', ''), vpo_categoria_combinacao),
    ciot = coalesce(nullif(p_dados->>'ciot', ''), ciot),
    ciot_verificador = coalesce(nullif(p_dados->>'ciot_verificador', ''), ciot_verificador),
    ciot_origem = coalesce(nullif(p_dados->>'ciot_origem', ''), ciot_origem, 'rbr_repom'),
    ciot_status = case when nullif(p_dados->>'ciot', '') is not null then 'emitido' else ciot_status end,
    ciot_ambiente = case when nullif(p_dados->>'ciot', '') is not null then 'producao' else ciot_ambiente end,
    ciot_emitido_em = case when nullif(p_dados->>'ciot', '') is not null then coalesce(nullif(p_dados->>'ciot_emitido_em', '')::timestamptz, ciot_emitido_em, now()) else ciot_emitido_em end,
    ciot_cnpj_responsavel = coalesce(nullif(p_dados->>'ciot_cnpj_responsavel', ''), ciot_cnpj_responsavel),
    pagto_cnpj_ipef = coalesce(nullif(p_dados->>'pagto_cnpj_ipef', ''), pagto_cnpj_ipef),
    origem = 'manual', updated_at = now()
  where operacao_id = p_operacao returning id into v_id;
  -- o valor do CIOT da Repom prevalece no contrato (valor_total_contrato e valor_adiantamento)
  if nullif(p_dados->>'valor_total_contrato', '') is not null then
    update condicoes_pagamento_operacao set
      valor_total_contrato = (p_dados->>'valor_total_contrato')::numeric,
      valor_adiantamento = coalesce(nullif(p_dados->>'valor_adiantamento', '')::numeric, valor_adiantamento),
      updated_at = now()
    where operacao_id = p_operacao;
  end if;
  insert into eventos_fiscais_operacao (operacao_id, tipo_documento, evento, origem, ator_id, sucesso, mensagem, origem_acao)
    values (p_operacao, 'ciot', 'confirmacao', 'manual', v_ator, true, 'CIOT e vale-pedagio confirmados manualmente', 'manual');
  return jsonb_build_object('id', v_id);
end;
$$;
revoke all on function public.confirmar_ciot_vpo_manual(uuid, jsonb) from public, anon;
grant execute on function public.confirmar_ciot_vpo_manual(uuid, jsonb) to authenticated, service_role;

-- Categoria de combinacao veicular: a regra aceitava so 02..11; 9, 10 e mais de 10 eixos geram 12, 13 e 14. A nova regra e um superconjunto
-- da antiga (nenhum registro existente deixa de valer).
alter table public.operacao_ciot_vpo drop constraint if exists operacao_ciot_vpo_vpo_categoria_combinacao_check;
alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_vpo_categoria_combinacao_check
  check (vpo_categoria_combinacao is null or vpo_categoria_combinacao = any (array['02','04','06','07','08','10','11','12','13','14']));
