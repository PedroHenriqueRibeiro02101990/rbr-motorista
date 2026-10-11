-- 20261011_13: restringe as funções novas das migrations _01 a _12 (privilégio padrão do Supabase dava EXECUTE ao
-- authenticated em toda função criada no schema public).
-- (1) Funções que nenhum app nem edge function chama direto: só service_role. Elas continuam funcionando porque quem as
--     chama são funções SECURITY DEFINER (rodam como dono) ou gatilhos (gatilho não confere EXECUTE ao disparar).
--     Exceção: brl_txt continua com authenticated porque a view v_alertas_ciot (security_invoker) usa; só formata número.
-- (2) Funções que os apps chamam e não conferiam quem chama: checagem no começo. Gestor pode tudo; agenciador/motorista só a
--     própria pessoa ou as próprias operações; o resto dá erro. Quando a chamada vem de dentro de um gatilho
--     (pg_trigger_depth() > 0) a checagem não se aplica: o gatilho roda no lugar do sistema.
-- (3) recalcular_documento_operacao: só gestor ou backend (e os gatilhos de origem/destino).

-- ---------------------------------------------------------------- auxiliar
create or replace function public.pode_ver_operacao(p_operacao uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_papel()::text, '') = 'gestor_rbr'
      or eh_backend()
      or (current_pessoa_id() is not null and exists (
            select 1 from operacoes o
             where o.id = p_operacao
               and current_pessoa_id() in (o.agenciador_id, o.pessoa_alocada_id, titular_da_operacao(o.id))))
$$;

-- ---------------------------------------------------------------- (2) chamadas pelos apps: checagem

-- gestor (prévia em Pagamento ao motorista); também usada pelo gatilho trg_aplicar_retencao_inss
create or replace function public.calcular_retencao_inss(p_operacao uuid, p_frete numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par jsonb := coalesce((select valor from parametros_sistema where chave = 'retencoes_parceiro'), '{}'::jsonb);
  v_aliq numeric := coalesce((v_par->>'inss_aliquota_retencao')::numeric, 0.11);
  v_pct_base numeric := coalesce((v_par->>'inss_base_frete')::numeric, 0.20);
  v_teto numeric := nullif(v_par->>'inss_teto_salario_contribuicao', '')::numeric;
  v_parceiro uuid := titular_da_operacao(p_operacao);
  p record;
  v_comp date;
  v_base numeric := 0;
  v_base_outras numeric := 0;
  v_retido numeric := 0;
  v_aplica boolean := false;
  v_motivo text;
  v_avisos jsonb := '[]'::jsonb;
  v_frete numeric := round(coalesce(p_frete, 0), 2);
begin
  if not pode_ver_operacao(p_operacao) and pg_trigger_depth() = 0 then
    raise exception 'Sem permissão para esta operação.';
  end if;
  select date_trunc('month', coalesce(o.entregue_em, now()))::date into v_comp from operacoes o where o.id = p_operacao;
  v_comp := coalesce(v_comp, date_trunc('month', now())::date);

  if not coalesce((v_par->>'irrf_ativo')::boolean, false) then
    v_avisos := v_avisos || to_jsonb('IRRF a confirmar (não calculado).'::text);
  end if;
  if not coalesce((v_par->>'sest_senat_ativo')::boolean, false) then
    v_avisos := v_avisos || to_jsonb('SEST/SENAT desligado (a confirmar com o contador).'::text);
  end if;

  select * into p from pessoas where id = v_parceiro;
  if v_parceiro is null or p.id is null then
    v_motivo := 'Parceiro ainda não identificado (aloque veículo e motorista). Retenção não calculada.';
  elsif p.tipo_parceiro is null then
    v_motivo := 'Tipo do parceiro não informado no cadastro (TAC, MEI ou ETC). Classifique para calcular a retenção.';
    v_avisos := v_avisos || to_jsonb('Sem o tipo do parceiro a RBR pode deixar de reter INSS devido.'::text);
  elsif p.tipo_parceiro = 'tac_pf' and p.opcao_inss_direto and p.data_comunicacao_inss_direto is not null then
    v_motivo := format('Dispensa: o parceiro comunicou em %s que recolhe o INSS por conta própria.', to_char(p.data_comunicacao_inss_direto, 'DD/MM/YYYY'));
  elsif p.tipo_parceiro = 'tac_pf' then
    v_aplica := true;
    v_motivo := format('TAC pessoa física: retenção de %s%% sobre %s%% do frete bruto (o VPO não entra).',
                       trim_scale(v_aliq * 100), trim_scale(v_pct_base * 100));
    if p.opcao_inss_direto then
      v_avisos := v_avisos || to_jsonb('O parceiro marcou que recolhe direto, mas falta a data da comunicação: a retenção continua.'::text);
    end if;
  elsif p.tipo_parceiro = 'mei_caminhoneiro' then
    v_motivo := 'MEI Caminhoneiro: sem retenção por padrão (regra a confirmar com o contador).';
  else
    v_motivo := 'ETC (pessoa jurídica): sem retenção por padrão (regra a confirmar com o contador).';
  end if;

  if v_aplica then
    v_base := round(v_frete * v_pct_base, 2);
    if v_teto is null then
      v_avisos := v_avisos || to_jsonb('Teto do salário de contribuição não configurado: retenção calculada sem limite.'::text);
    else
      select coalesce(sum(c.inss_base), 0) into v_base_outras
        from condicoes_pagamento_operacao c
       where c.parceiro_id = v_parceiro and c.inss_competencia = v_comp and c.operacao_id <> p_operacao and c.retencao_aplica;
      if v_base > greatest(v_teto - v_base_outras, 0) then
        v_base := greatest(v_teto - v_base_outras, 0);
        v_avisos := v_avisos || to_jsonb(format('Base limitada pelo teto do mês (R$ %s; já usado em outras operações: R$ %s).',
                                                brl_txt(v_teto), brl_txt(v_base_outras))::text);
      end if;
    end if;
    v_retido := round(v_base * v_aliq, 2);
  end if;

  return jsonb_build_object(
    'parceiro_id', v_parceiro,
    'frete_bruto', v_frete,
    'aplica', v_aplica,
    'aliquota', case when v_aplica then v_aliq end,
    'base', case when v_aplica then v_base end,
    'inss_retido', v_retido,
    'valor_liquido', v_frete - v_retido,
    'motivo', v_motivo,
    'avisos', v_avisos,
    'competencia', v_comp,
    'vencimento_recolhimento', (v_comp + interval '1 month' + interval '19 days')::date
  );
end;
$$;

-- gestor (Motoristas sugeridos); também usada pelo gatilho trg_regras_prazo_ciot
create or replace function public.checar_piso_operacao(p_operacao uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not pode_ver_operacao(p_operacao) and pg_trigger_depth() = 0 then
    raise exception 'Sem permissão para esta operação.';
  end if;
  return (
    select jsonb_build_object(
      'piso', o.piso_minimo_valor,
      'frete', c.valor_total_contrato,
      'abaixo', o.piso_minimo_valor is not null and c.valor_total_contrato is not null and c.valor_total_contrato < o.piso_minimo_valor
    )
    from operacoes o
    left join condicoes_pagamento_operacao c on c.operacao_id = o.id
    where o.id = p_operacao
  );
end;
$$;

-- gestor (bloco CIOT); também usada pelos gatilhos trg_validar_ciot_origem e trg_regras_prazo_ciot
create or replace function public.ciot_origem_esperada(p_operacao uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not pode_ver_operacao(p_operacao) and pg_trigger_depth() = 0 then
    raise exception 'Sem permissão para esta operação.';
  end if;
  return (
    select case p.classificacao_ciot
             when 'tac' then 'rbr_repom'
             when 'etc_equiparada_tac' then 'rbr_repom'
             when 'etc_ciot_proprio' then 'parceiro'
           end
    from pessoas p
    where p.id = titular_da_operacao(p_operacao)
  );
end;
$$;

-- só gestor (Conformidade > Termos e contratos); publicar_termo já confere o gestor antes de chamar
create or replace function public.campos_pendentes_termo(p_termo uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_papel()::text, '') <> 'gestor_rbr' and not eh_backend() then
    raise exception 'Só o gestor da RBR vê os campos pendentes do contrato.';
  end if;
  return (
    with t as (select tipo, texto from termos_contrato where id = p_termo),
    usados as (select distinct m[1] as chave from t, regexp_matches(t.texto, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') as m)
    select coalesce(array_agg(u.chave order by u.chave), '{}')
    from usados u, t
    where u.chave <> all (chaves_do_cadastro(t.tipo))
      and not exists (select 1 from contrato_config c where c.tipo = t.tipo and c.chave = u.chave and nullif(btrim(c.valor), '') is not null)
  );
end;
$$;

-- gestor e agenciador (aviso do documento na pré-cotação/cotação)
create or replace function public.detectar_documento_por_cidades(p_cidade_origem text, p_uf_origem text, p_destinos jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_papel()::text, '') not in ('gestor_rbr', 'agenciador') and not eh_backend() then
    raise exception 'Sem permissão.';
  end if;
  return detectar_documento_cliente(
    ibge_municipio(p_cidade_origem, p_uf_origem),
    coalesce((select array_agg(ibge_municipio(d->>'cidade', d->>'uf')) from jsonb_array_elements(coalesce(p_destinos, '[]'::jsonb)) d), '{}')
  );
end;
$$;

-- gestor e agenciador (formulário da declaração da carga)
create or replace function public.textos_declaracao_carga()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_papel()::text, '') not in ('gestor_rbr', 'agenciador') and not eh_backend() then
    raise exception 'Sem permissão.';
  end if;
  return coalesce((select valor from parametros_sistema where chave = 'declaracao_carga_textos'), '{}'::jsonb);
end;
$$;

-- só gestor (Conformidade > Alertas); antes, sem operação em andamento, devolvia vazio sem conferir quem chamou
create or replace function public.alertas_conformidade_abertos()
returns table (operacao_id uuid, codigo text, titulo text, detalhe text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_papel()::text, '') <> 'gestor_rbr' and not eh_backend() then
    raise exception 'Só o gestor vê os alertas de conformidade.';
  end if;
  return query
    select o.id, a.codigo, a.titulo, a.detalhe
    from operacoes o, lateral alertas_conformidade_operacao(o.id) a
    where o.status not in ('entregue', 'fechada', 'cancelada') and o.deleted_at is null and not a.revisado;
end;
$$;

-- ---------------------------------------------------------------- (3) só gestor, backend ou gatilho
create or replace function public.recalcular_documento_operacao(p_operacao uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := documento_da_operacao(p_operacao);
  o record;
begin
  if coalesce(current_papel()::text, '') <> 'gestor_rbr' and not eh_backend() and pg_trigger_depth() = 0 then
    raise exception 'Só o gestor ou o sistema recalcula o documento da operação.';
  end if;
  select id, tipo_documento_cliente, tipo_documento_detectado_em into o from operacoes where id = p_operacao;
  if o.id is null then
    return;
  end if;
  if o.tipo_documento_detectado_em is not null and o.tipo_documento_cliente is distinct from (r->>'tipo') then
    update operacoes set tipo_documento_cliente = r->>'tipo', tipo_documento_aviso = r->>'aviso', tipo_documento_detectado_em = now(), tipo_documento_mudou_em = now()
     where id = p_operacao;
    insert into auditoria_log (acao, entidade, entidade_id, dado_antes, dado_depois, papel, pessoa_id_ator)
    values ('documento_cliente_mudou', 'operacoes', p_operacao, jsonb_build_object('tipo', o.tipo_documento_cliente), r,
            current_papel()::text, current_pessoa_id());
  else
    update operacoes set tipo_documento_cliente = r->>'tipo', tipo_documento_aviso = r->>'aviso', tipo_documento_detectado_em = coalesce(tipo_documento_detectado_em, now())
     where id = p_operacao and (tipo_documento_cliente is distinct from r->>'tipo' or tipo_documento_aviso is distinct from r->>'aviso' or tipo_documento_detectado_em is null);
  end if;
end;
$$;

-- ---------------------------------------------------------------- (1) sem chamada direta pelos apps: só service_role

revoke execute on function public.aceite_vigente(uuid, text) from authenticated, anon, public;
grant execute on function public.aceite_vigente(uuid, text) to service_role;

revoke execute on function public.agenciador_pode_operar(uuid) from authenticated, anon, public;
grant execute on function public.agenciador_pode_operar(uuid) to service_role;

revoke execute on function public.campos_do_cadastro(text, uuid) from authenticated, anon, public;
grant execute on function public.campos_do_cadastro(text, uuid) to service_role;

revoke execute on function public.chave_nfe_valida(text) from authenticated, anon, public;
grant execute on function public.chave_nfe_valida(text) to service_role;

revoke execute on function public.chaves_do_cadastro(text) from authenticated, anon, public;
grant execute on function public.chaves_do_cadastro(text) to service_role;

revoke execute on function public.contrato_agenciador_em_vigor() from authenticated, anon, public;
grant execute on function public.contrato_agenciador_em_vigor() to service_role;

revoke execute on function public.detectar_documento_cliente(text, text[]) from authenticated, anon, public;
grant execute on function public.detectar_documento_cliente(text, text[]) to service_role;

revoke execute on function public.documento_da_operacao(uuid) from authenticated, anon, public;
grant execute on function public.documento_da_operacao(uuid) to service_role;

revoke execute on function public.ibge_municipio(text, text) from authenticated, anon, public;
grant execute on function public.ibge_municipio(text, text) to service_role;

revoke execute on function public.mudar_status_contrato(uuid, text, text) from authenticated, anon, public;
grant execute on function public.mudar_status_contrato(uuid, text, text) to service_role;

revoke execute on function public.pode_ver_operacao(uuid) from authenticated, anon, public;
grant execute on function public.pode_ver_operacao(uuid) to service_role;

revoke execute on function public.recalcular_documento_operacao(uuid) from authenticated, anon, public;
grant execute on function public.recalcular_documento_operacao(uuid) to service_role;

revoke execute on function public.renderizar_termo(uuid, uuid) from authenticated, anon, public;
grant execute on function public.renderizar_termo(uuid, uuid) to service_role;

revoke execute on function public.somar_dias_uteis(date, integer) from authenticated, anon, public;
grant execute on function public.somar_dias_uteis(date, integer) to service_role;

revoke execute on function public.termo_publicado(text) from authenticated, anon, public;
grant execute on function public.termo_publicado(text) to service_role;

revoke execute on function public.texto_para_hash(uuid, uuid) from authenticated, anon, public;
grant execute on function public.texto_para_hash(uuid, uuid) to service_role;

revoke execute on function public.titular_da_operacao(uuid) from authenticated, anon, public;
grant execute on function public.titular_da_operacao(uuid) to service_role;

-- funções de gatilho: ninguém chama direto (o disparo do gatilho não confere EXECUTE)

revoke execute on function public.aplicar_retencao_inss() from authenticated, anon, public;

revoke execute on function public.bloquear_alteracao_imutavel() from authenticated, anon, public;

revoke execute on function public.ciot_troca_veiculo() from authenticated, anon, public;

revoke execute on function public.contrato_agenciador_nova_versao() from authenticated, anon, public;

revoke execute on function public.declaracao_imutavel() from authenticated, anon, public;

revoke execute on function public.doc_cliente_ao_mudar_cotacao() from authenticated, anon, public;

revoke execute on function public.doc_cliente_ao_mudar_operacao() from authenticated, anon, public;

revoke execute on function public.exigir_aceite_na_alocacao() from authenticated, anon, public;

revoke execute on function public.exigir_aceite_na_aprovacao() from authenticated, anon, public;

revoke execute on function public.ligar_declaracao_operacao() from authenticated, anon, public;

revoke execute on function public.preencher_ibge_cotacao() from authenticated, anon, public;

revoke execute on function public.preencher_ibge_cotacao_destino() from authenticated, anon, public;

revoke execute on function public.proteger_campos_conformidade() from authenticated, anon, public;

revoke execute on function public.proteger_campos_parceiro() from authenticated, anon, public;

revoke execute on function public.proteger_status_contrato() from authenticated, anon, public;

revoke execute on function public.proteger_termo_publicado() from authenticated, anon, public;

revoke execute on function public.regras_prazo_ciot() from authenticated, anon, public;

revoke execute on function public.trava_conformidade_operacao() from authenticated, anon, public;

revoke execute on function public.trava_contrato_cotacao() from authenticated, anon, public;

revoke execute on function public.trava_contrato_operacao() from authenticated, anon, public;

revoke execute on function public.trava_pagamento_retido() from authenticated, anon, public;

revoke execute on function public.trava_suspenso_alocacao() from authenticated, anon, public;

revoke execute on function public.validar_ciot_origem() from authenticated, anon, public;

-- ---------------------------------------------------------------- (2) continuam com authenticated (checagem acima)

revoke execute on function public.alertas_conformidade_abertos() from anon, public;
grant execute on function public.alertas_conformidade_abertos() to authenticated, service_role;

revoke execute on function public.calcular_retencao_inss(uuid, numeric) from anon, public;
grant execute on function public.calcular_retencao_inss(uuid, numeric) to authenticated, service_role;

revoke execute on function public.campos_pendentes_termo(uuid) from anon, public;
grant execute on function public.campos_pendentes_termo(uuid) to authenticated, service_role;

revoke execute on function public.checar_piso_operacao(uuid) from anon, public;
grant execute on function public.checar_piso_operacao(uuid) to authenticated, service_role;

revoke execute on function public.ciot_origem_esperada(uuid) from anon, public;
grant execute on function public.ciot_origem_esperada(uuid) to authenticated, service_role;

revoke execute on function public.detectar_documento_por_cidades(text, text, jsonb) from anon, public;
grant execute on function public.detectar_documento_por_cidades(text, text, jsonb) to authenticated, service_role;

revoke execute on function public.textos_declaracao_carga() from anon, public;
grant execute on function public.textos_declaracao_carga() to authenticated, service_role;

-- brl_txt: usada pela view v_alertas_ciot (security_invoker); só formata número, não lê tabela
revoke execute on function public.brl_txt(numeric) from anon, public;
grant execute on function public.brl_txt(numeric) to authenticated, service_role;
