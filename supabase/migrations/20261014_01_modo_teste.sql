-- 20261014_01 — Modo teste oficial (cotacoes.eh_teste)
--
-- Circuito de teste em PRODUÇÃO (NF-e -> CT-e -> averbação -> MDF-e) com R$ 1,00, sem as travas de negócio
-- atrapalharem e sem nunca emitir em nome de terceiro.
--  1) Flag explícita em cotacoes/operacoes/pessoas/veiculos; só gestor_rbr liga/desliga; não muda com documento
--     fiscal emitido. Migra a marca de texto "[TESTE PRODUCAO" (a emitir-mdfe continua lendo a marca também).
--  2) Ao ligar: remetente, destinatário, tomador e cliente = RBR (parametros_fiscais ativo), NF R$ 1,00
--     (editável até R$ 5), frete R$ 1,00 (valor final), peso mínimo, sem pedágio.
--  3) Trava invertida: trava_teste_fiscal(operacao, tipo) — chamada pelas funções fiscais antes de falar com a Focus.
--  4) GR/CIOT/VPO/ATM (e rastreio/AET) dispensados só na operação de teste; margem e aprovação de cadastro não barram.
--  5) GR vira opcional (todas as operações); valida_margem SECURITY DEFINER (auditoria_log).
--  7) Financeiro: operação de teste não gera lançamentos (fin_sincronizar_operacao_interno).
--  8) Auditoria: quem ligou/desligou e cada mudança de status de documento fiscal da operação de teste.

-- ---------------------------------------------------------------------------------------------------------
-- 1) Colunas
-- ---------------------------------------------------------------------------------------------------------
alter table public.cotacoes  add column if not exists eh_teste boolean not null default false;
alter table public.operacoes add column if not exists eh_teste boolean not null default false;
alter table public.pessoas   add column if not exists eh_teste boolean not null default false;
alter table public.veiculos  add column if not exists eh_teste boolean not null default false;

comment on column public.cotacoes.eh_teste is
  'Operação de teste (documentos reais na SEFAZ, R$ 1,00). Só gestor_rbr liga/desliga; RBR nos dois lados; fora de financeiro/relatórios.';

-- Documento fiscal já emitido (ou enviado e aguardando) para a cotação? Bloqueia a troca do modo teste.
create or replace function public.cotacao_tem_documento_fiscal(p_cotacao_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from cotacoes where id = p_cotacao_id and nf_chave_acesso is not null)
      or exists (select 1 from documentacao_operacao d join operacoes o on o.id = d.operacao_id
                 where o.cotacao_id = p_cotacao_id and d.tipo in ('cte','mdfe','nfse')
                   and d.status in ('emitido','pendente')
                   and (d.referencia is not null or d.chave_acesso is not null));
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 2) + 3) Cotação: liga/desliga, preenche e trava (BEFORE; o "0" no nome faz rodar antes do cálculo de preço)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.trg_fn_cotacao_modo_teste()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_gestor boolean := eh_backend() or current_papel() = 'gestor_rbr';
  v_ligou boolean := new.eh_teste and (tg_op = 'INSERT' or not old.eh_teste);
  pf record;
  v_mun text;
  v_end jsonb;
  v_cnpj text;
  v_cliente uuid;
begin
  if (tg_op = 'INSERT' and new.eh_teste) or (tg_op = 'UPDATE' and new.eh_teste is distinct from old.eh_teste) then
    if not v_gestor then
      raise exception 'Só um gestor RBR liga ou desliga a operação de teste.';
    end if;
    if tg_op = 'UPDATE' and cotacao_tem_documento_fiscal(new.id) then
      raise exception 'Há documento fiscal emitido nesta cotação. Cancele (MDF-e, CT-e, NF-e) antes de mudar o modo teste.';
    end if;
    insert into auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
    values (current_pessoa_id(), current_papel()::text,
            case when new.eh_teste then 'modo_teste_ligado' else 'modo_teste_desligado' end,
            'cotacoes', new.id,
            case when tg_op = 'UPDATE' then jsonb_build_object('eh_teste', old.eh_teste) end,
            jsonb_build_object('eh_teste', new.eh_teste));
  end if;

  if not new.eh_teste then
    return new;
  end if;

  select * into pf from parametros_fiscais where ativo order by updated_at desc limit 1;
  if pf.cnpj is null then
    raise exception 'Modo teste: parametros_fiscais ativo sem CNPJ da RBR.';
  end if;
  v_cnpj := regexp_replace(pf.cnpj, '\D', '', 'g');

  if v_ligou then
    select cidade into v_mun from municipios_ibge where codigo_ibge = pf.endereco_codigo_municipio limit 1;
    v_end := jsonb_build_object(
      'logradouro', pf.endereco_logradouro, 'numero', pf.endereco_numero, 'bairro', pf.endereco_bairro,
      'cep', regexp_replace(coalesce(pf.endereco_cep, ''), '\D', '', 'g'), 'municipio', v_mun,
      'uf', pf.endereco_uf, 'telefone', regexp_replace(coalesce(pf.telefone_contato, ''), '\D', '', 'g'));

    select id into v_cliente from clientes
     where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj and deleted_at is null
     order by created_at limit 1;
    if v_cliente is null then
      insert into clientes (cnpj, razao_social, origem, cep, logradouro, numero_endereco, bairro, cidade, uf,
                            inscricao_estadual)
      values (v_cnpj, pf.razao_social, 'gestor', v_end->>'cep', pf.endereco_logradouro, pf.endereco_numero,
              pf.endereco_bairro, v_mun, pf.endereco_uf, pf.inscricao_estadual)
      returning id into v_cliente;
    end if;

    new.cliente_id := v_cliente;
    new.tomador_papel := 'remetente';
    new.nf_remetente_cnpj := v_cnpj;
    new.nf_remetente_razao_social := pf.razao_social;
    new.nf_remetente_ie := pf.inscricao_estadual;
    new.nf_remetente_endereco := v_end;
    new.nf_destinatario_cnpj := v_cnpj;
    new.nf_destinatario_razao_social := pf.razao_social;
    new.nf_destinatario_ie := pf.inscricao_estadual;
    new.nf_destinatario_endereco := v_end;
    if new.valor_nf is null or new.valor_nf <= 0 or new.valor_nf > 5 then new.valor_nf := 1.00; end if;
    if coalesce(new.peso_bruto_kg, 0) <= 0 then new.peso_bruto_kg := 1; end if;
    new.pedagio := 0;
    new.pedagio_pracas := null;
    new.preco_modo := 'valor_final';
    new.valor_total := 1.00;
  end if;

  -- Trava invertida no próprio dado: enquanto for teste, nada de terceiro e nada acima de R$ 5.
  if regexp_replace(coalesce(new.nf_remetente_cnpj, ''), '\D', '', 'g') <> v_cnpj
     or regexp_replace(coalesce(new.nf_destinatario_cnpj, ''), '\D', '', 'g') <> v_cnpj then
    raise exception 'Operação de teste: remetente e destinatário têm de ser a RBR (CNPJ %).', v_cnpj;
  end if;
  if coalesce(new.tomador_papel, 'remetente') not in ('remetente', 'destinatario') then
    raise exception 'Operação de teste: o tomador tem de ser a RBR (remetente ou destinatário).';
  end if;
  if new.valor_nf is null or new.valor_nf <= 0 or new.valor_nf > 5 then
    raise exception 'Operação de teste: valor da NF entre R$ 0,01 e R$ 5,00.';
  end if;
  if new.preco_modo is distinct from 'valor_final' or coalesce(new.valor_total, 0) <= 0 or new.valor_total > 5 then
    raise exception 'Operação de teste: frete em "valor final" entre R$ 0,01 e R$ 5,00.';
  end if;
  if coalesce(new.pedagio, 0) > 0 then
    raise exception 'Operação de teste: rota sem pedágio (pedágio = 0).';
  end if;
  return new;
end $$;

drop trigger if exists trg_cotacao_0_modo_teste on public.cotacoes;
create trigger trg_cotacao_0_modo_teste
  before insert or update on public.cotacoes
  for each row execute function public.trg_fn_cotacao_modo_teste();

-- Depois de ligar/desligar: espelha na operação (eh_teste e cliente RBR) e refaz a lista de documentos.
create or replace function public.trg_fn_cotacao_modo_teste_pos()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  if new.eh_teste is distinct from old.eh_teste then
    for r in select id from operacoes where cotacao_id = new.id loop
      update operacoes
         set eh_teste = new.eh_teste,
             cliente_id = case when new.eh_teste then new.cliente_id else cliente_id end
       where id = r.id;
      if not new.eh_teste then
        update documentacao_operacao set dispensa_motivo = null
         where operacao_id = r.id and dispensa_motivo = 'Operação de teste (eh_teste)';
      end if;
      perform gerar_documentos_exigidos(r.id);
      perform fin_sincronizar_operacao_interno(r.id);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists trg_cotacao_modo_teste_pos on public.cotacoes;
create trigger trg_cotacao_modo_teste_pos
  after update of eh_teste on public.cotacoes
  for each row execute function public.trg_fn_cotacao_modo_teste_pos();

-- Operação nova herda o flag da cotação ("0" no nome: roda antes de trg_operacao_exige_aprovados).
create or replace function public.trg_fn_operacao_herda_teste()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' or new.cotacao_id is distinct from old.cotacao_id then
    new.eh_teste := coalesce((select eh_teste from cotacoes where id = new.cotacao_id), false);
  elsif new.eh_teste is distinct from old.eh_teste and not eh_backend() then
    new.eh_teste := old.eh_teste;  -- só muda pela cotação
  end if;
  return new;
end $$;

drop trigger if exists trg_operacao_0_herda_teste on public.operacoes;
create trigger trg_operacao_0_herda_teste
  before insert or update on public.operacoes
  for each row execute function public.trg_fn_operacao_herda_teste();

-- pessoas/veiculos.eh_teste: só gestor_rbr.
create or replace function public.trg_fn_protege_eh_teste()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.eh_teste is distinct from old.eh_teste and not (eh_backend() or current_papel() = 'gestor_rbr') then
    raise exception 'Só um gestor RBR marca cadastro de teste.';
  end if;
  return new;
end $$;

drop trigger if exists trg_pessoa_protege_eh_teste on public.pessoas;
create trigger trg_pessoa_protege_eh_teste before update of eh_teste on public.pessoas
  for each row execute function public.trg_fn_protege_eh_teste();
drop trigger if exists trg_veiculo_protege_eh_teste on public.veiculos;
create trigger trg_veiculo_protege_eh_teste before update of eh_teste on public.veiculos
  for each row execute function public.trg_fn_protege_eh_teste();

-- ---------------------------------------------------------------------------------------------------------
-- 3) Trava invertida para as funções fiscais (só service_role chama)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.trava_teste_fiscal(p_operacao_id uuid, p_tipo text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c record;
  v_cli text;
  v_rbr text;
  v_teste boolean;
  b text[] := '{}';
begin
  select ct.*, o.cliente_id as op_cliente_id into c
    from operacoes o join cotacoes ct on ct.id = o.cotacao_id where o.id = p_operacao_id;
  if not found then
    return jsonb_build_object('teste', false, 'bloqueios', '[]'::jsonb);
  end if;
  v_teste := c.eh_teste or coalesce(c.observacoes, '') like '[TESTE PRODUCAO%';
  if not v_teste then
    return jsonb_build_object('teste', false, 'bloqueios', '[]'::jsonb);
  end if;

  select regexp_replace(cnpj, '\D', '', 'g') into v_rbr from parametros_fiscais where ativo order by updated_at desc limit 1;
  select regexp_replace(coalesce(cnpj, cpf, ''), '\D', '', 'g') into v_cli from clientes where id = c.op_cliente_id;

  if v_rbr is null then b := b || 'Modo teste: CNPJ da RBR não encontrado em parametros_fiscais.'; end if;
  if regexp_replace(coalesce(c.nf_remetente_cnpj, ''), '\D', '', 'g') is distinct from v_rbr
     or regexp_replace(coalesce(c.nf_destinatario_cnpj, ''), '\D', '', 'g') is distinct from v_rbr then
    b := b || 'Trava do modo teste: remetente E destinatário têm de ser a RBR. Nunca em nome de terceiro.';
  end if;
  if coalesce(v_cli, '') is distinct from v_rbr then
    b := b || 'Trava do modo teste: o cliente/contratante da operação tem de ser a RBR.';
  end if;
  if coalesce(c.tomador_papel, 'remetente') not in ('remetente', 'destinatario') then
    b := b || 'Trava do modo teste: tomador tem de ser a RBR.';
  end if;
  if c.valor_nf is null or c.valor_nf <= 0 or c.valor_nf > 5 then
    b := b || 'Trava do modo teste: valor da NF tem de estar entre R$ 0,01 e R$ 5,00.';
  end if;
  if p_tipo in ('cte', 'mdfe', 'atm') and (c.valor_total is null or c.valor_total <= 0 or c.valor_total > 5) then
    b := b || 'Trava do modo teste: frete do CT-e tem de estar entre R$ 0,01 e R$ 5,00.';
  end if;
  return jsonb_build_object('teste', true, 'bloqueios', to_jsonb(b));
end $$;

revoke all on function public.trava_teste_fiscal(uuid, text) from public, anon, authenticated;
grant execute on function public.trava_teste_fiscal(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 4) + 5a) Documentos exigidos: GR opcional para todos; dispensas só na operação de teste
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.gerar_documentos_exigidos(p_operacao_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  o record;
  c record;
  v_intramunicipal boolean;
  v_rastreio boolean;
  v_tipo tipo_documento_fiscal;
  v_exigido boolean;
  v_motivo text;
begin
  select * into o from operacoes where id = p_operacao_id;
  if not found then return; end if;
  select * into c from cotacoes where id = o.cotacao_id;

  v_intramunicipal := c.id is not null and c.uf_origem is not null and c.uf_origem = c.uf_destino
    and lower(unaccent_safe(coalesce(c.cidade_origem,''))) = lower(unaccent_safe(coalesce(c.cidade_destino,'')))
    and coalesce(c.cidade_origem,'') <> '';

  v_rastreio := o.carga_complexa_eixo1_perigosa or o.carga_complexa_eixo3_seguro_excedido
    or exists (select 1 from cotacao_custos_adicionais i join tipos_custo_adicional t on t.id = i.tipo_id
               where i.cotacao_id = o.cotacao_id and t.codigo = 'rastreamento_satelite');

  for v_tipo, v_exigido, v_motivo in
    select * from (values
      ('cte'::tipo_documento_fiscal,  not v_intramunicipal, case when v_intramunicipal then 'Frete dentro da mesma cidade: vai NFS-e, não CT-e' else 'Obrigatório em frete intermunicipal/interestadual' end),
      ('nfse'::tipo_documento_fiscal, v_intramunicipal,     case when v_intramunicipal then 'Frete dentro da mesma cidade (ISS)' else 'Só em frete dentro da mesma cidade' end),
      ('mdfe'::tipo_documento_fiscal, not v_intramunicipal, 'Manifesto que acompanha o CT-e na viagem'),
      ('ciot'::tipo_documento_fiscal, true,                 'Obrigatório em toda operação (Res. ANTT 6.078/2026)'),
      ('vpo'::tipo_documento_fiscal,  coalesce(c.pedagio, 0) > 0, case when coalesce(c.pedagio,0) > 0 then 'Rota com pedágio — vale-pedágio obrigatório (Lei 10.209/2001)' else 'Rota sem pedágio informado na cotação' end),
      -- 2026-10-14: GR não bloqueia mais a liberação (a pesquisa pode já ter sido feita); fica visível como opcional.
      ('gr'::tipo_documento_fiscal,   false,                'Opcional: registre a pesquisa de gerenciamento de risco se já foi feita'),
      ('atm'::tipo_documento_fiscal,  true,                 'Averbação do seguro da carga (RCTR-C)'),
      ('wialon'::tipo_documento_fiscal, v_rastreio,         case when v_rastreio then 'Carga perigosa, acima do teto do seguro ou rastreamento contratado na cotação' else 'Não exigido pra esta carga' end),
      ('aet'::tipo_documento_fiscal,  o.carga_complexa_eixo2_superdimensionada, case when o.carga_complexa_eixo2_superdimensionada then 'Carga superdimensionada/indivisível' else 'Não exigido pra esta carga' end)
    ) as t(tipo, exigido, motivo)
  loop
    insert into documentacao_operacao (operacao_id, tipo, status, exigido, motivo_exigencia)
    values (p_operacao_id, v_tipo, 'pendente', v_exigido, v_motivo)
    on conflict (operacao_id, tipo) do update
      set exigido = case when documentacao_operacao.dispensa_motivo is not null then false else excluded.exigido end,
          motivo_exigencia = excluded.motivo_exigencia;
  end loop;

  -- Operação de teste: GR, CIOT, VPO, averbação, rastreio e AET entram como dispensados (o documento pode ser
  -- emitido mesmo assim — a averbação faz parte do circuito — só não barra a liberação).
  if coalesce(c.eh_teste, false) then
    update documentacao_operacao
       set exigido = false, dispensa_motivo = 'Operação de teste (eh_teste)'
     where operacao_id = p_operacao_id and tipo in ('gr','ciot','vpo','atm','wialon','aet');
  end if;

  -- Documentos não exigidos e ainda sem arquivo não precisam ficar na lista (GR fica sempre, visível como opcional)
  delete from documentacao_operacao
  where operacao_id = p_operacao_id and not exigido and dispensa_motivo is null and tipo <> 'gr'
    and arquivo_path is null and numero_documento is null and status = 'pendente';
end; $function$;

-- GR das operações em aberto deixa de bloquear já.
update public.documentacao_operacao d
   set exigido = false, motivo_exigencia = 'Opcional: registre a pesquisa de gerenciamento de risco se já foi feita'
  from public.operacoes o
 where o.id = d.operacao_id and d.tipo = 'gr' and d.exigido
   and o.status in ('alocando_motorista','aguardando_liberacao_fiscal');

-- ---------------------------------------------------------------------------------------------------------
-- 4) Motorista/veículo de teste dispensam aprovação — só em operação de teste
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.trg_fn_operacao_exige_aprovados()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_st text; v_nome text; v_cad_teste boolean;
  v_op_teste boolean := coalesce(new.eh_teste, false)
    or coalesce((select eh_teste from public.cotacoes where id = new.cotacao_id), false);
begin
  if new.pessoa_alocada_id is not null and (tg_op = 'INSERT' or new.pessoa_alocada_id is distinct from old.pessoa_alocada_id) then
    select aprovacao_status, nome, eh_teste into v_st, v_nome, v_cad_teste from public.pessoas where id = new.pessoa_alocada_id;
    if v_cad_teste and not v_op_teste then
      raise exception 'Motorista % é cadastro de TESTE e só pode ir em operação de teste.', v_nome;
    end if;
    if v_st is distinct from 'aprovado' and not (v_cad_teste and v_op_teste) then
      raise exception 'Motorista % ainda não está aprovado (situação: %). Veja em Cadastros → Pendências.', v_nome, coalesce(v_st,'?');
    end if;
  end if;
  if new.veiculo_id is not null and (tg_op = 'INSERT' or new.veiculo_id is distinct from old.veiculo_id) then
    select aprovacao_status, placa, eh_teste into v_st, v_nome, v_cad_teste from public.veiculos where id = new.veiculo_id;
    if v_cad_teste and not v_op_teste then
      raise exception 'Veículo % é cadastro de TESTE e só pode ir em operação de teste.', v_nome;
    end if;
    if v_st is distinct from 'aprovado' and not (v_cad_teste and v_op_teste) then
      raise exception 'Veículo % ainda não está aprovado (situação: %). Veja em Cadastros → Pendências.', v_nome, coalesce(v_st,'?');
    end if;
  end if;
  return new;
end $function$;

-- ---------------------------------------------------------------------------------------------------------
-- 4) + 5b) Margem: teste não registra/barra; SECURITY DEFINER para gravar auditoria_log
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.trg_fn_cotacao_valida_margem()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  margem_min numeric;
  margem_max numeric;
  tolerancia constant numeric := 0.0005;
begin
  if coalesce(new.eh_teste, false) then return new; end if;
  select (valor)::numeric into margem_min from parametros_sistema where chave = 'margem_cotacao_min';
  select (valor)::numeric into margem_max from parametros_sistema where chave = 'margem_cotacao_max';

  if new.margem_ajustada is not null
     and (new.margem_ajustada < margem_min - tolerancia or new.margem_ajustada > margem_max + tolerancia)
     and (tg_op = 'INSERT' or new.margem_ajustada is distinct from old.margem_ajustada) then
    insert into auditoria_log (pessoa_id_ator, acao, entidade, entidade_id, dado_depois)
    values (current_pessoa_id(), 'margem_fora_da_faixa_destravada', 'cotacoes', new.id,
            jsonb_build_object('margem_ajustada', new.margem_ajustada, 'faixa_min', margem_min, 'faixa_max', margem_max));
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------------------------------------
-- 7) Financeiro: operação de teste não gera lançamento (a função original vira _base)
-- ---------------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'fin_sincronizar_operacao_interno_base') then
    alter function public.fin_sincronizar_operacao_interno(uuid) rename to fin_sincronizar_operacao_interno_base;
  end if;
end $$;

create or replace function public.fin_sincronizar_operacao_interno(p_op uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce((select eh_teste from operacoes where id = p_op), false) then
    -- Nada de contas a pagar/receber, comissão ou giro para teste: limpa o que ainda não foi pago.
    delete from lancamentos_financeiros
     where operacao_id = p_op and status in ('previsto','aberto') and coalesce(valor_pago, 0) = 0;
    return;
  end if;
  perform fin_sincronizar_operacao_interno_base(p_op);
end $$;

revoke all on function public.fin_sincronizar_operacao_interno(uuid) from public, anon, authenticated;
revoke all on function public.fin_sincronizar_operacao_interno_base(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 8) Auditoria dos documentos fiscais da operação de teste
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.trg_fn_doc_teste_auditoria()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if (tg_op = 'INSERT' or new.status is distinct from old.status)
     and new.tipo in ('cte','mdfe','nfse','atm')
     and coalesce((select eh_teste from operacoes where id = new.operacao_id), false) then
    insert into auditoria_log (pessoa_id_ator, papel, acao, entidade, entidade_id, dado_antes, dado_depois)
    values (current_pessoa_id(), current_papel()::text, 'teste_documento_' || new.status::text,
            'documentacao_operacao', new.id,
            case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) end,
            jsonb_build_object('operacao_id', new.operacao_id, 'tipo', new.tipo, 'status', new.status,
                               'chave_acesso', new.chave_acesso, 'numero', new.numero_documento,
                               'ambiente', new.ambiente));
  end if;
  return null;
end $$;

drop trigger if exists trg_doc_teste_auditoria on public.documentacao_operacao;
create trigger trg_doc_teste_auditoria
  after insert or update on public.documentacao_operacao
  for each row execute function public.trg_fn_doc_teste_auditoria();

-- ---------------------------------------------------------------------------------------------------------
-- Migração da marca de texto "[TESTE PRODUCAO" para o flag (a emitir-mdfe aceita os dois até a troca).
-- Roda como backend (eh_backend() = true), então passa pela checagem de gestor; o preenchimento automático
-- coloca RBR nos dois lados, NF R$ 1,00 e frete R$ 1,00.
-- ---------------------------------------------------------------------------------------------------------
update public.cotacoes set eh_teste = true
 where not eh_teste and coalesce(observacoes, '') like '[TESTE PRODUCAO%'
   and not public.cotacao_tem_documento_fiscal(id);
