# Aplicar em producao (preparado em 18/11/2026; NADA foi aplicado)

Projeto: kwscmegsfbtvlnyxougt. **Nao use `supabase db push`**: o historico de migracoes do banco foi aplicado por outra via. Aplique uma a uma, na ordem, conferindo a verificacao de cada uma antes de seguir. Cada arquivo tem rollback em `supabase/rollback/`.

**ATUALIZADO em 18/11 (aplicado):** as 5 migracoes foram aplicadas em producao; a 0110 foi aplicada na versao reduzida (sem as faixas de tara e capacidade) e a 0100 teve um erro de sintaxe corrigido na RPC. Funcoes publicadas. Ver `docs/RELATORIO-ETAPA-28-2026-11-18.md`.

Resumo: 5 migracoes, nenhuma apaga dado. Todas usam `drop policy/constraint/trigger if exists` seguido de recriacao (padrao do projeto): isso troca regra de acesso/validacao, nao perde dado.

## 1. `20261118-0100-cadastro-por-documentos.sql`
- O que faz: colunas novas em veiculos e pessoas, bucket cadastro-documentos, tabela cadastro_auditoria e RPC confirmar_cadastro_por_documentos.
- Depende de: nada (primeira)
- ATENCAO (troca de regra, sem perda de dado): recria 2 politicas (cadastro_documentos_gestor, cadastro_auditoria_gestor), ambas novas: nao ha politica anterior a perder.

```sql
-- Cadastro por documentos (Parte A, etapas 1 e 5). ADITIVA e idempotente: so cria/estende, nada apagado, sem update em massa.
-- NAO APLICADA (so na etapa 28 do prompt mestre, com o Supabase CLI logado). Rollback: supabase/rollback/rollback-20261118-0100-cadastro-por-documentos.sql
-- Pesos sempre em KG. Toda coluna nova e opcional ou tem padrao seguro.

-- 1) veiculos: dados vindos do CRLV e vinculo padrao cavalo -> carreta
alter table public.veiculos add column if not exists crlv_extracao_id text;           -- path em documento_extracoes (chave natural da tabela)
alter table public.veiculos add column if not exists tipo_crlv text;                  -- especie/tipo: caminhao trator, semirreboque, reboque, caminhao
alter table public.veiculos add column if not exists pbt_kg integer;
alter table public.veiculos add column if not exists cmt_kg integer;
alter table public.veiculos add column if not exists chassi_crlv text;
alter table public.veiculos add column if not exists proprietario_documento text;     -- CPF/CNPJ (so digitos/letras)
alter table public.veiculos add column if not exists carreta_padrao_id uuid references public.veiculos(id) on delete set null;
alter table public.veiculos add column if not exists tara_origem text;                -- confirmada | derivada_crlv | aproximada_tabela

-- 2) pessoas: dados da CNH e origem do cadastro
alter table public.pessoas add column if not exists documento_origem text;            -- 'documentos' quando veio do cadastro por documentos
alter table public.pessoas add column if not exists cnh_extracao_id text;

-- 3) bucket privado dos documentos do cadastro (gestor_rbr, operacao e fiscal: equipe interna; Eduardo = operacao)
insert into storage.buckets (id, name, public) values ('cadastro-documentos', 'cadastro-documentos', false) on conflict (id) do nothing;
drop policy if exists cadastro_documentos_gestor on storage.objects;
create policy cadastro_documentos_gestor on storage.objects for all to authenticated
  using (bucket_id = 'cadastro-documentos' and (select current_papel()) in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa))
  with check (bucket_id = 'cadastro-documentos' and (select current_papel()) in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa));

-- 4) auditoria: quem confirmou, quando e de qual documento veio cada campo
create table if not exists public.cadastro_auditoria (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('pessoa', 'veiculo')),
  entidade_id uuid not null,
  campo text not null,
  valor_extraido text,
  valor_confirmado text,
  editado_manualmente boolean not null default false,
  confianca text check (confianca is null or confianca in ('alta', 'media', 'baixa')),
  documento_path text,
  documento_tipo text,
  confirmado_por uuid,
  confirmado_em timestamptz not null default now()
);
create index if not exists cadastro_auditoria_entidade_idx on public.cadastro_auditoria (entidade, entidade_id);
alter table public.cadastro_auditoria enable row level security;
drop policy if exists cadastro_auditoria_gestor on public.cadastro_auditoria;
create policy cadastro_auditoria_gestor on public.cadastro_auditoria for select to authenticated
  using ((select current_papel()) in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa));
grant select on public.cadastro_auditoria to authenticated;   -- escrita so pela funcao abaixo (security definer)

-- 5) Criacao vinculada em UMA transacao. p_payload:
-- { motorista?: {nome,cpf,cnh_numero_registro,cnh_categoria,cnh_validade,data_nascimento,cep,logradouro,numero_endereco,bairro,cidade,uf,rntrc_numero,...},
--   cavalo?: {placa,renavam,chassi,tipo_crlv,tipo_veiculo,quantidade_eixos,tara_kg,tara_origem,capacidade_carga,pbt_kg,cmt_kg,uf_licenciamento,crlv_exercicio,proprietario_documento,marca_modelo,ano,crlv_foto_url,crlv_extracao_id},
--   carreta?: {mesmos campos},
--   auditoria?: [{entidade:'motorista|cavalo|carreta',campo,valor_extraido,valor_confirmado,editado,confianca,documento_path,documento_tipo}],
--   manual?: ['tara_kg', ...] }
-- Regras: pessoa por CPF e veiculo por placa (sem duplicar); e_reboque pela especie do CRLV; carreta vinculada ao cavalo (carreta_padrao_id);
-- pesos em kg inteiro (recusa decimal); crlv_preenchido_manualmente=true se algum campo foi editado; campos de aprovacao NAO sao tocados.
create or replace function public.confirmar_cadastro_por_documentos(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ator uuid := (select current_pessoa_id());
  v_mot uuid; v_cav uuid; v_car uuid;
  m jsonb := p_payload->'motorista'; c jsonb := p_payload->'cavalo'; r jsonb := p_payload->'carreta';
  a jsonb; v_ent text; v_id uuid;
  v_manual boolean := coalesce(jsonb_array_length(p_payload->'manual'), 0) > 0;
  v jsonb;
  v_reb boolean;
begin
  if (select current_papel()) is null or (select current_papel()) not in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa) then
    raise exception 'Sem permissao para cadastrar por documentos.' using errcode = '42501';
  end if;

  -- pesos: kg inteiro (regra G1)
  foreach v in array array[c, r] loop
    if v is not null then
      if (v ? 'tara_kg') and v->>'tara_kg' is not null and (v->>'tara_kg')::numeric <> trunc((v->>'tara_kg')::numeric) then
        raise exception 'Tara e em kg. Voce quis dizer %?', trunc((v->>'tara_kg')::numeric * 1000) using errcode = '22023';
      end if;
      if v->>'capacidade_carga' is not null and (v->>'capacidade_carga')::numeric <> trunc((v->>'capacidade_carga')::numeric) then
        raise exception 'Capacidade e em kg. Voce quis dizer %?', trunc((v->>'capacidade_carga')::numeric * 1000) using errcode = '22023';
      end if;
    end if;
  end loop;

  if m is not null and nullif(m->>'cpf', '') is not null then
    select id into v_mot from pessoas where cpf = m->>'cpf' and deleted_at is null limit 1;
    if v_mot is null then
      insert into pessoas (nome, papel, cpf, documento_origem)
        values (m->>'nome', 'titular_motorista', m->>'cpf', 'documentos') returning id into v_mot;
    end if;
    update pessoas set
      nome = coalesce(nullif(m->>'nome', ''), nome),
      cnh_numero_registro = coalesce(nullif(m->>'cnh_numero_registro', ''), cnh_numero_registro),
      cnh_categoria = coalesce(nullif(m->>'cnh_categoria', ''), cnh_categoria),
      cnh_validade = coalesce(nullif(m->>'cnh_validade', '')::date, cnh_validade),
      data_nascimento = coalesce(nullif(m->>'data_nascimento', '')::date, data_nascimento),
      cep = coalesce(nullif(m->>'cep', ''), cep),
      logradouro = coalesce(nullif(m->>'logradouro', ''), logradouro),
      numero_endereco = coalesce(nullif(m->>'numero_endereco', ''), numero_endereco),
      complemento = coalesce(nullif(m->>'complemento', ''), complemento),
      bairro = coalesce(nullif(m->>'bairro', ''), bairro),
      cidade = coalesce(nullif(m->>'cidade', ''), cidade),
      uf = coalesce(nullif(m->>'uf', ''), uf),
      rntrc_numero = coalesce(nullif(m->>'rntrc_numero', ''), rntrc_numero),
      cnh_extraido_por_ia = true,
      cnh_preenchido_manualmente = cnh_preenchido_manualmente or v_manual,
      documento_origem = coalesce(documento_origem, 'documentos')
    where id = v_mot;
  end if;

  -- cavalo e carreta (mesma rotina)
  for i in 1..2 loop
    v := case i when 1 then c else r end;
    continue when v is null or nullif(v->>'placa', '') is null;
    v_reb := case
      when lower(coalesce(v->>'tipo_crlv', '')) ~ 'reboque' then true
      when lower(coalesce(v->>'tipo_crlv', '')) like '%trator%' then false
      else i = 2 end;
    select id into v_id from veiculos where placa = upper(v->>'placa') and deleted_at is null limit 1;
    if v_id is null then
      insert into veiculos (placa, renavam, titular_id)
        values (upper(v->>'placa'), coalesce(nullif(v->>'renavam', ''), 'PENDENTE-' || upper(v->>'placa')), coalesce(v_mot, v_ator))
        returning id into v_id;
    end if;
    update veiculos set
      renavam = coalesce(nullif(v->>'renavam', ''), renavam),
      chassi = coalesce(nullif(v->>'chassi', ''), chassi),
      tipo_crlv = coalesce(nullif(v->>'tipo_crlv', ''), tipo_crlv),
      tipo_veiculo = coalesce(nullif(v->>'tipo_veiculo', ''), tipo_veiculo),
      tipo_carroceria = coalesce(nullif(v->>'tipo_carroceria', ''), tipo_carroceria),
      quantidade_eixos = coalesce(nullif(v->>'quantidade_eixos', '')::int, quantidade_eixos),
      tara_kg = coalesce(nullif(v->>'tara_kg', '')::numeric, tara_kg),
      tara_origem = coalesce(nullif(v->>'tara_origem', ''), tara_origem),
      capacidade_carga = coalesce(nullif(v->>'capacidade_carga', '')::numeric, capacidade_carga),
      pbt_kg = coalesce(nullif(v->>'pbt_kg', '')::int, pbt_kg),
      cmt_kg = coalesce(nullif(v->>'cmt_kg', '')::int, cmt_kg),
      uf_licenciamento = coalesce(nullif(v->>'uf_licenciamento', ''), uf_licenciamento),
      crlv_exercicio = coalesce(nullif(v->>'crlv_exercicio', '')::int, crlv_exercicio),
      proprietario_documento = coalesce(nullif(v->>'proprietario_documento', ''), proprietario_documento),
      marca_modelo = coalesce(nullif(v->>'marca_modelo', ''), marca_modelo),
      ano = coalesce(nullif(v->>'ano', '')::int, ano),
      crlv_foto_url = coalesce(nullif(v->>'crlv_foto_url', ''), crlv_foto_url),
      crlv_extracao_id = coalesce(nullif(v->>'crlv_extracao_id', ''), crlv_extracao_id),
      crlv_extraido_por_ia = true,
      crlv_preenchido_manualmente = crlv_preenchido_manualmente or v_manual,
      e_reboque = v_reb
    where id = v_id;
    if i = 1 then v_cav := v_id; else v_car := v_id; end if;
  end loop;

  if v_cav is not null and v_car is not null then
    update veiculos set carreta_padrao_id = v_car where id = v_cav;
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_payload->'auditoria', '[]'::jsonb)) loop
    v_ent := a->>'entidade';
    insert into cadastro_auditoria (entidade, entidade_id, campo, valor_extraido, valor_confirmado, editado_manualmente, confianca, documento_path, documento_tipo, confirmado_por)
      select (case when v_ent = 'motorista' then 'pessoa' else 'veiculo' end),
              case v_ent when 'motorista' then v_mot when 'cavalo' then v_cav else v_car end,
              a->>'campo', a->>'valor_extraido', a->>'valor_confirmado', coalesce((a->>'editado')::boolean, false),
              nullif(a->>'confianca', ''), a->>'documento_path', a->>'documento_tipo', v_ator
      where case v_ent when 'motorista' then v_mot when 'cavalo' then v_cav else v_car end is not null;
  end loop;

  return jsonb_build_object('motorista_id', v_mot, 'cavalo_id', v_cav, 'carreta_id', v_car);
end;
$$;
revoke all on function public.confirmar_cadastro_por_documentos(jsonb) from public, anon;
grant execute on function public.confirmar_cadastro_por_documentos(jsonb) to authenticated, service_role;

```

Verificacao (somente leitura):
```sql
select (select count(*) from information_schema.columns where table_schema='public' and table_name='veiculos' and column_name in ('carreta_padrao_id','tipo_crlv','pbt_kg','cmt_kg','tara_origem','proprietario_documento','crlv_extracao_id')) as colunas_veiculos_esperado_7, to_regclass('public.cadastro_auditoria') as tabela_auditoria, (select count(*) from storage.buckets where id='cadastro-documentos') as bucket_esperado_1, (select count(*) from pg_proc where proname='confirmar_cadastro_por_documentos') as rpc_esperado_1;
```

## 2. `20261118-0110-padronizacao-pesos-valores.sql`
- O que faz: CHECK ... NOT VALID de faixa de tara/capacidade e valores nao negativos (so gravacoes novas; dados antigos intactos).
- Depende de: 0100 (usa veiculos.tara_origem)

```sql
-- Padronizacao de pesos e valores (Parte A, etapa 7b-d). ADITIVA: CHECK ... NOT VALID valida so gravacoes NOVAS; registros antigos
-- permanecem como estao.
-- VERSAO REDUZIDA (18/11/2026): as faixas de tara (1000 a 30000) e de capacidade (1000 a 80000) foram REMOVIDAS. 9 veiculos ja cadastrados
-- violam as faixas (Fiorinos com 600 kg, que e correto, e 6 com peso em toneladas) e o CHECK tambem vale em UPDATE: quebraria qualquer
-- atualizacao dessas linhas, inclusive o gatilho da migracao 0300. A faixa segue valendo na tela (CampoPeso) e no emissor (resolverTara). Sem update, sem delete. NAO APLICADA (so na etapa 28).
-- Rollback: supabase/rollback/rollback-20261118-0110-padronizacao-pesos-valores.sql
-- Colunas de valor em reais que ja sao numeric (confirmado em shared/database.types.ts): nada a converter; so garantimos >= 0.
-- Nenhuma coluna de valor em texto foi encontrada nas tabelas fiscais (operacao_ciot_vpo, condicoes_pagamento_operacao).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'veiculos_tara_origem_chk') then
    alter table public.veiculos add constraint veiculos_tara_origem_chk check (tara_origem is null or tara_origem in ('confirmada', 'derivada_crlv', 'aproximada_tabela')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operacao_ciot_vpo_vpo_valor_nao_negativo_chk') then
    alter table public.operacao_ciot_vpo add constraint operacao_ciot_vpo_vpo_valor_nao_negativo_chk check (vpo_valor is null or vpo_valor >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condicoes_pagto_valor_contrato_nao_negativo_chk') then
    alter table public.condicoes_pagamento_operacao add constraint condicoes_pagto_valor_contrato_nao_negativo_chk check (valor_total_contrato >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'condicoes_pagto_valor_adiantamento_nao_negativo_chk') then
    alter table public.condicoes_pagamento_operacao add constraint condicoes_pagto_valor_adiantamento_nao_negativo_chk check (valor_adiantamento is null or valor_adiantamento >= 0) not valid;
  end if;
end $$;

```

Verificacao (somente leitura):
```sql
select conname, convalidated from pg_constraint where conname in ('veiculos_tara_kg_faixa_chk','veiculos_capacidade_carga_faixa_chk','veiculos_tara_origem_chk','operacao_ciot_vpo_vpo_valor_nao_negativo_chk','condicoes_pagto_valor_contrato_nao_negativo_chk','condicoes_pagto_valor_adiantamento_nao_negativo_chk') order by 1; -- esperado (versao reduzida): 4 linhas, convalidated = false
```

## 3. `20261118-0200-fiscal-uploads-manual.sql`
- O que faz: arquivo_hash e arquivo_historico em documentacao_operacao, politicas para operacao/fiscal, RPC confirmar_ciot_vpo_manual e categoria de combinacao aceitando 12, 13 e 14.
- Depende de: nada (independente da 0100)
- ATENCAO (troca de regra, sem perda de dado): troca a regra operacao_ciot_vpo_vpo_categoria_combinacao_check por uma que aceita tambem 12, 13 e 14 (superconjunto da anterior: nenhuma linha existente deixa de valer); recria 4 politicas novas. Durante o drop+add a tabela fica sem essa regra por instantes.

```sql
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

```

Verificacao (somente leitura):
```sql
select (select count(*) from information_schema.columns where table_name='documentacao_operacao' and column_name in ('arquivo_hash','arquivo_historico')) as colunas_esperado_2, (select count(*) from pg_proc where proname='confirmar_ciot_vpo_manual') as rpc_esperado_1, (select pg_get_constraintdef(oid) from pg_constraint where conname='operacao_ciot_vpo_vpo_categoria_combinacao_check') as regra_categoria_deve_conter_14;
```

## 4. `20261118-0300-reboque-marca-e-reboque.sql`
- O que faz: gatilho que marca veiculos.e_reboque=true ao vincular em operacao_reboques (so vinculos novos).
- Depende de: nada
- ATENCAO (troca de regra, sem perda de dado): recria o gatilho trg_reboque_marca_e_reboque (novo).

```sql
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

```

Verificacao (somente leitura):
```sql
select tgname from pg_trigger where tgname='trg_reboque_marca_e_reboque'; -- esperado: 1 linha
```

## 5. `20261118-0400-repom-campos-cadastro.sql`
- O que faz: colunas RG/genero/dependentes/Simples/tipo de carga ANTT, tabelas tipos_carga_antt (com os 8 codigos) e repom_config, RPC complementar_motorista_por_documentos.
- Depende de: nada (independente)
- ATENCAO (troca de regra, sem perda de dado): recria 3 politicas novas (tipos_carga_antt e repom_config).

```sql
-- Parte D etapa 26: campos que faltam no cadastro para a Repom. ADITIVA e idempotente; colunas opcionais, sem valor inventado.
-- NAO APLICADA (so na etapa 28). Rollback: supabase/rollback/rollback-20261118-0400-repom-campos-cadastro.sql
-- Previsao de entrega da operacao: ja existe operacoes.entrega_prevista (reaproveitada; nada novo).
alter table public.pessoas add column if not exists rg_numero text;
alter table public.pessoas add column if not exists rg_orgao_emissor text;
alter table public.pessoas add column if not exists rg_uf text;
alter table public.pessoas add column if not exists genero text;
alter table public.pessoas add column if not exists numero_dependentes integer;
alter table public.pessoas add column if not exists optante_simples_nacional boolean;   -- prestador
alter table public.operacoes add column if not exists tipo_carga_antt smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pessoas_genero_chk') then
    alter table public.pessoas add constraint pessoas_genero_chk check (genero is null or genero in ('M', 'F')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pessoas_numero_dependentes_chk') then
    alter table public.pessoas add constraint pessoas_numero_dependentes_chk check (numero_dependentes is null or numero_dependentes between 0 and 30) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operacoes_tipo_carga_antt_chk') then
    alter table public.operacoes add constraint operacoes_tipo_carga_antt_chk check (tipo_carga_antt is null or tipo_carga_antt between 1 and 8) not valid;
  end if;
end $$;

-- Lista editavel dos tipos de carga ANTT (codigos 1 a 8 do guia da Repom, docs/repom/ESPECIFICACAO-FRETE.md secao 5).
create table if not exists public.tipos_carga_antt (codigo smallint primary key check (codigo between 1 and 8), descricao text not null);
insert into public.tipos_carga_antt (codigo, descricao) values
  (1, 'Granel solido'), (2, 'Granel liquido'), (3, 'Frigorificada'), (4, 'Conteinerizada'), (5, 'Carga Geral'), (6, 'Neogranel'),
  (7, 'Perigosa (granel solido)'), (8, 'Perigosa (granel liquido)')
on conflict (codigo) do nothing;
alter table public.tipos_carga_antt enable row level security;
drop policy if exists tipos_carga_antt_leitura on public.tipos_carga_antt;
create policy tipos_carga_antt_leitura on public.tipos_carga_antt for select to authenticated using (true);
drop policy if exists tipos_carga_antt_gestor on public.tipos_carga_antt;
create policy tipos_carga_antt_gestor on public.tipos_carga_antt for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);

-- Configuracao da Repom (codigo da filial da RBR na Repom, editavel; sem valor padrao inventado).
create table if not exists public.repom_config (chave text primary key, valor text not null, atualizado_em timestamptz not null default now());
alter table public.repom_config enable row level security;
drop policy if exists repom_config_gestor on public.repom_config;
create policy repom_config_gestor on public.repom_config for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);

-- Complemento do motorista lido dos documentos (RG e genero CONFIRMADOS pela pessoa); a RPC principal da Parte A nao muda.
create or replace function public.complementar_motorista_por_documentos(p_cpf text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select current_papel()) is null or (select current_papel()) not in ('gestor_rbr'::papel_pessoa, 'operacao'::papel_pessoa, 'fiscal'::papel_pessoa) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;
  update pessoas set
    rg_numero = coalesce(nullif(p_dados->>'rg_numero', ''), rg_numero),
    rg_orgao_emissor = coalesce(nullif(p_dados->>'rg_orgao_emissor', ''), rg_orgao_emissor),
    rg_uf = coalesce(nullif(p_dados->>'rg_uf', ''), rg_uf),
    genero = coalesce(nullif(p_dados->>'genero', ''), genero),
    numero_dependentes = coalesce(nullif(p_dados->>'numero_dependentes', '')::int, numero_dependentes)
  where cpf = p_cpf and deleted_at is null;
end;
$$;
revoke all on function public.complementar_motorista_por_documentos(text, jsonb) from public, anon;
grant execute on function public.complementar_motorista_por_documentos(text, jsonb) to authenticated, service_role;

```

Verificacao (somente leitura):
```sql
select (select count(*) from information_schema.columns where table_name='pessoas' and column_name in ('rg_numero','rg_orgao_emissor','rg_uf','genero','numero_dependentes','optante_simples_nacional')) as colunas_pessoas_esperado_6, (select count(*) from public.tipos_carga_antt) as tipos_esperado_8, to_regclass('public.repom_config') as tabela_config;
```

## Funcoes (nao rodar agora)
Anote o hash atual de cada uma antes de publicar (`git log -1 --format=%h -- <pasta>`), para poder republicar a versao anterior.
| Funcao | Pasta | Comando |
|---|---|---|
| extrair-documento | `supabase/functions/extrair-documento` (inclui `cadastro.ts` e `_shared/extracao-documentos.ts`) | `npx supabase functions deploy extrair-documento --project-ref kwscmegsfbtvlnyxougt` |
| emitir-mdfe | `supabase/functions/emitir-mdfe` (usa `_shared/`) | `npx supabase functions deploy emitir-mdfe --project-ref kwscmegsfbtvlnyxougt` |

Publicar so DEPOIS das 5 migracoes (o emissor le colunas novas de forma defensiva, mas a categoria 12 a 14 e o gatilho dependem da migracao 3 e 4).

## Flags (todas DESLIGADAS hoje; variaveis de build da Vercel do projeto gestor)
| Flag | Valor atual | O que liga |
|---|---|---|
| VITE_CADASTRO_POR_DOCUMENTOS | desligada (nao definida) | botao Novo cadastro por documentos e lista Cadastros para corrigir |
| VITE_FISCAL_V3 | desligada (nao definida) | aba Fiscal v3: cartao manual, esteira de 4 blocos, pre-voo |
| VITE_REPOM_CADASTRO_HABILITADO | desligada (nao definida) | mostra o botao (ainda desligado) e o que falta para a Repom |

Ordem sugerida (uma por vez, com novo deploy do gestor a cada uma):
1. **VITE_CADASTRO_POR_DOCUMENTOS** — antes: migracoes 1 e 2 aplicadas, funcao extrair-documento publicada, PDFs sinteticos de teste. Testar: soltar CRLV de cavalo e de carreta e uma CNH, conferir os campos e a tara (25,5 t vira 25.500 kg com confirmacao), confirmar e ver o cadastro vinculado.
2. **VITE_FISCAL_V3** — antes: migracoes 3 e 4, funcoes extrair-documento e emitir-mdfe publicadas. Testar numa operacao real SEM emitir: abrir a aba Fiscal, ver so o cartao manual, subir um PDF de CIOT e um VPR, conferir a leitura, e conferir o pre-voo; operacao DEMO deve ficar igual.
3. **VITE_REPOM_CADASTRO_HABILITADO** — antes: migracao 5, filial Repom em repom_config (chave filial_codigo) e retorno da Karen sobre as pendencias. Testar: so o bloco "o que falta para a Repom"; o botao segue desabilitado.

## Nomes das migracoes (padrao AAAAMMDDHHMMSS_nome.sql)
Nenhuma foi renomeada. As 5 desta lista fogem do padrao (usam AAAAMMDD-HHMM-nome.sql, como as de 03/11), e tambem fogem as antigas de `supabase/migrations`:
- `20261014_01_modo_teste.sql` — foge do padrao
- `20261015_01_aviso_regra_rbr.sql` — foge do padrao
- `20261015_02_liberacao_com_ressalva.sql` — foge do padrao
- `20261015_03_revoga_funcoes_modo_teste.sql` — foge do padrao
- `20261103-1200-operacoes-condutor-titular.sql` — foge do padrao
- `20261103-1210-clientes-locais-entrega.sql` — foge do padrao
- `20261118-0100-cadastro-por-documentos.sql` — foge do padrao
- `20261118-0110-padronizacao-pesos-valores.sql` — foge do padrao
- `20261118-0200-fiscal-uploads-manual.sql` — foge do padrao
- `20261118-0300-reboque-marca-e-reboque.sql` — foge do padrao
- `20261118-0400-repom-campos-cadastro.sql` — foge do padrao

Como as migracoes serao aplicadas uma a uma pelo assistente (nao por `db push`), o nome so importa para o historico; se for registrar no historico do Supabase, usar a versao de 14 digitos (ex.: 20261118010000).
