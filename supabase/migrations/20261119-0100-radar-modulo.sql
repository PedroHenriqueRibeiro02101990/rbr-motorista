-- Radar (prospeccao ativa) 19/11/2026: base da Receita, buscas salvas, caixa de e-mail, jornada, sugestoes e curso. ADITIVA.
-- Depende de 20261116-1000 .. 20261116-1410 (prospeccao_*, em supabase-migrations/). Rollback: supabase/rollback/rollback-20261119-0100-radar-modulo.sql
-- STATUS: NAO APLICADA NO BANCO (a sessao da madrugada nao tinha ferramenta de acesso ao Supabase). Aplicar inteira, uma vez.
set local lock_timeout = '8s';

-- ---------------------------------------------------------------------------------------------------------
-- R4: segmentos (18) e R5: status 'cliente'
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_empresas drop constraint if exists prospeccao_empresas_segmento_check;
alter table public.prospeccao_empresas add constraint prospeccao_empresas_segmento_check check (segmento in (
  'alimentos','bebidas','plasticos','metalurgia','maquinas',
  'estruturas_galpoes','eventos_shows','papel_embalagens','atacadistas','autopecas','moveis_colchoes','eletro_eletronicos',
  'locacao_maquinas','maquinas_agricolas','reciclagem_sucata','pneus_borracha','ceramica','cimento'));
alter table public.prospeccao_empresas drop constraint if exists prospeccao_empresas_status_check;
alter table public.prospeccao_empresas add constraint prospeccao_empresas_status_check check (status in
  ('novo','qualificado','em_aprovacao','em_contato','respondeu','quente','cliente','descartado','descadastrado','repouso'));

-- ---------------------------------------------------------------------------------------------------------
-- R4: staging da base da Receita
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_base (
  cnpj text primary key check (cnpj ~ '^[0-9]{14}$'),
  prioridade text, cnpj_formatado text, razao_social text not null, nome_fantasia text, segmento_rbr text, cnae_principal text, cnae_descricao text,
  porte text, capital_social numeric, matriz_filial text, gigante boolean not null default false, data_inicio text,
  logradouro text, numero text, complemento text, bairro text, municipio text, uf text, cep text, distancia_km numeric,
  telefone1 text, telefone2 text, email text, dominio_email text, dominio_valido boolean not null default false, tem_site boolean not null default false,
  motivo text, origem text,
  restricao text check (restricao is null or restricao in ('quimico','fertilizante','medicamento','cosmetico')),
  importado_em timestamptz not null default now(),
  ja_na_lista boolean not null default false
);
create index prospeccao_base_segmento_idx on public.prospeccao_base (segmento_rbr);
create index prospeccao_base_municipio_idx on public.prospeccao_base (municipio);
create index prospeccao_base_distancia_idx on public.prospeccao_base (distancia_km);
create index prospeccao_base_porte_idx on public.prospeccao_base (porte);
create index prospeccao_base_dominio_idx on public.prospeccao_base (dominio_valido);
comment on table public.prospeccao_base is 'Radar: staging da base da Receita (rbr-validadas.csv). Busca e importacao so por RPC security definer (gestor_rbr).';

create table public.prospeccao_buscas_salvas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  filtros jsonb not null default '{}'::jsonb,
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------
-- R7: caixa de e-mail (cliente completo) e fila de acoes para o IMAP
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_caixa_mensagens (
  id uuid primary key default gen_random_uuid(),
  caixa text not null check (caixa ~ '^[a-z0-9._-]+@rbrcargo\.com\.br$'),
  pasta text not null default 'entrada' check (pasta in ('entrada','quentes','rascunhos','enviados','arquivados','spam','lixeira')),
  uid_imap bigint, message_id text, in_reply_to text, "references" text,
  de text not null default '', para text not null default '', cc text, assunto text not null default '', corpo_texto text,
  recebido_em timestamptz not null default now(),
  lida boolean not null default false, estrela boolean not null default false,
  etiquetas text[] not null default '{}', anexos jsonb not null default '[]'::jsonb,
  empresa_id uuid references public.prospeccao_empresas(id) on delete set null,
  resposta_id uuid references public.prospeccao_respostas(id) on delete set null,
  direcao text not null default 'entrada' check (direcao in ('entrada','saida')),
  criado_em timestamptz not null default now()
);
create unique index prospeccao_caixa_msg_uid_uq on public.prospeccao_caixa_mensagens (caixa, uid_imap) where uid_imap is not null and direcao = 'entrada';
create unique index prospeccao_caixa_msg_mid_uq on public.prospeccao_caixa_mensagens (caixa, message_id) where message_id is not null;
create index prospeccao_caixa_msg_pasta_idx on public.prospeccao_caixa_mensagens (pasta, recebido_em desc);
create index prospeccao_caixa_msg_empresa_idx on public.prospeccao_caixa_mensagens (empresa_id);

create table public.prospeccao_caixa_acoes (
  id bigint generated always as identity primary key,
  mensagem_id uuid not null references public.prospeccao_caixa_mensagens(id) on delete cascade,
  acao text not null check (acao in ('mover','marcar_lida','marcar_nao_lida','estrela','excluir')),
  destino text,
  status text not null default 'pendente' check (status in ('pendente','feita','falhou')),
  erro text,
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  feita_em timestamptz
);
create index prospeccao_caixa_acoes_pend_idx on public.prospeccao_caixa_acoes (criado_em) where status = 'pendente';

insert into public.parametros_sistema (chave, valor, descricao) values
  ('PROSPECCAO_CAIXA_ESCOPO', '"prospeccao"'::jsonb, 'Radar: o que o robo de leitura sincroniza. "prospeccao" = so conversas ligadas a um message_id nosso, ao alias de descadastro e a avisos de devolucao; "tudo" = caixa inteira. NAO mudar para "tudo" sem decidir.')
on conflict (chave) do nothing;

-- Anexos: bucket privado (so gestor_rbr le/escreve)
insert into storage.buckets (id, name, public) values ('prospeccao-anexos', 'prospeccao-anexos', false) on conflict (id) do nothing;
create policy prospeccao_anexos_sel on storage.objects for select to authenticated using (bucket_id = 'prospeccao-anexos' and public.current_papel() = 'gestor_rbr');
create policy prospeccao_anexos_ins on storage.objects for insert to authenticated with check (bucket_id = 'prospeccao-anexos' and public.current_papel() = 'gestor_rbr');

-- ---------------------------------------------------------------------------------------------------------
-- R8: jornada (tipos de modelo, classes de resposta, configuracao por classe)
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_modelos drop constraint if exists prospeccao_modelos_tipo_check;
alter table public.prospeccao_modelos add constraint prospeccao_modelos_tipo_check check (tipo in
  ('toque1','toque2','toque3','toque4','resp_sair','resp_agora_nao','resp_indicacao','resp_recebimento','resp_cotacao','resp_recusa_carga',
   'resp_preco','resp_regiao','resp_veiculos','resp_seguro') or tipo ~ '^resp_custom_[a-z0-9_]{1,40}$');

alter table public.prospeccao_respostas drop constraint if exists prospeccao_respostas_classificacao_check;
alter table public.prospeccao_respostas add constraint prospeccao_respostas_classificacao_check check (
  classificacao in ('cotacao','preco_prazo','nao_sou_eu','agora_nao','fora_do_escritorio','sair','reclamacao','outro','regiao','veiculos','seguro')
  or classificacao ~ '^custom_[a-z0-9_]{1,40}$');

create table public.prospeccao_respostas_config (
  classe text primary key check (classe ~ '^[a-z0-9_]{2,50}$'),
  titulo text not null, subtitulo text,
  modo text not null default 'rascunho' check (modo in ('rascunho','sozinho','nunca')),
  exemplos text[] not null default '{}',
  travado boolean not null default false,
  personalizada boolean not null default false,
  depois text,
  atualizado_em timestamptz not null default now(),
  -- travas: cotacao e preco nunca vao sozinhos; reclamacao nunca e respondida; sair e sempre automatico
  check (not (classe in ('cotacao','preco_prazo') and modo = 'sozinho')),
  check (not (classe = 'reclamacao' and modo <> 'nunca')),
  check (not (classe = 'sair' and modo <> 'sozinho')),
  check (not (personalizada and modo = 'sozinho'))
);
insert into public.prospeccao_respostas_config (classe, titulo, subtitulo, modo, exemplos, travado, depois) values
  ('cotacao','Pediu cotação','vai para vocês dois','rascunho',array['Conseguem cotar uma carga para Curitiba?','Qual o valor de SP para BH?','Preciso de uma carreta sábado'],true,'Lead quente: avisa Pedro e José Carlos. Se ninguém assumir em 1 dia útil, sobe para o Pedro.'),
  ('preco_prazo','Quanto custa?','nunca passa preço','rascunho',array['Qual o preço do frete?','Vocês cobram por km?'],true,'Vira pedido de cotação quando vierem os dados.'),
  ('regiao','Atende minha região?','resposta fixa','rascunho',array['Vocês atendem o Nordeste?','Fazem Sul?'],false,'Puxa para os dados da cotação.'),
  ('veiculos','Que veículos vocês têm?','resposta fixa','rascunho',array['Tem carreta sider?','Fazem com munck?'],false,'Puxa para os dados da cotação.'),
  ('seguro','Tem seguro?','resposta fixa','rascunho',array['A carga vai segurada?','Qual a cobertura?'],false,'Puxa para os dados da cotação.'),
  ('agora_nao','Agora não / já temos transportadora','agradece e volta em 90 dias','rascunho',array['Já temos transportadora fixa','No momento não precisamos'],false,'Repouso de 90 dias e volta ao toque 1.'),
  ('nao_sou_eu','Indicou outra pessoa','cria o contato novo','rascunho',array['Quem cuida disso é o Marcos, do PCP'],false,'Cria o contato indicado e agenda o toque 1 para o dia seguinte.'),
  ('sair','Pediu para sair','bloqueia na hora','sozinho',array['Não enviem mais e-mails','Remover da lista'],true,'Bloqueia e-mail e domínio para sempre.'),
  ('reclamacao','Reclamação','para tudo','nunca',array['Isso é spam','Vou denunciar'],true,'Para todo o envio até o Pedro religar.')
on conflict (classe) do nothing;

insert into public.prospeccao_modelos (tipo, assunto, corpo, ativo) values
  ('resp_preco','Re: valor do frete','Depende da rota e da carga, {nome}. Me passa origem, destino, peso e o tipo de veículo que eu te mando o valor certinho ainda hoje.',false),
  ('resp_regiao','Re: região de atendimento','Atendemos sim, {nome}: saímos de SP para todo o Brasil, com rotas mais fortes para Sul, Sudeste e Centro-Oeste. Qual a rota de vocês?',false),
  ('resp_veiculos','Re: veículos','Trabalhamos com truck, carreta (baú, sider, graneleiro, aberta), prancha e munck, com motoristas parceiros homologados. Qual é a carga?',false),
  ('resp_seguro','Re: seguro','Temos sim: seguro RCTR-C em todas as viagens, com averbação de cada carga. Para mercadoria de alto valor ajustamos a cobertura na cotação.',false)
on conflict (tipo) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- R9 e R11: sugestoes da IA e progresso do curso
-- ---------------------------------------------------------------------------------------------------------
create table public.prospeccao_sugestoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null, motivo text not null, mudanca jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente','aplicada','recusada','revertida')),
  decidido_por uuid references public.pessoas(id), decidido_em timestamptz, criado_em timestamptz not null default now()
);
create table public.prospeccao_curso_progresso (
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  licao int not null check (licao between 0 and 20),
  concluida_em timestamptz not null default now(),
  primary key (pessoa_id, licao)
);

-- ---------------------------------------------------------------------------------------------------------
-- RLS: so gestor_rbr; anon sem acesso
-- ---------------------------------------------------------------------------------------------------------
alter table public.prospeccao_base enable row level security;
alter table public.prospeccao_buscas_salvas enable row level security;
alter table public.prospeccao_caixa_mensagens enable row level security;
alter table public.prospeccao_caixa_acoes enable row level security;
alter table public.prospeccao_respostas_config enable row level security;
alter table public.prospeccao_sugestoes enable row level security;
alter table public.prospeccao_curso_progresso enable row level security;
create policy prospeccao_base_gestor on public.prospeccao_base for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_buscas_gestor on public.prospeccao_buscas_salvas for all to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_caixa_msg_gestor on public.prospeccao_caixa_mensagens for all to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_caixa_acoes_gestor on public.prospeccao_caixa_acoes for all to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_resp_config_sel on public.prospeccao_respostas_config for select to authenticated using (public.current_papel() = 'gestor_rbr');
create policy prospeccao_resp_config_upd on public.prospeccao_respostas_config for update to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_resp_config_ins on public.prospeccao_respostas_config for insert to authenticated with check (public.current_papel() = 'gestor_rbr' and personalizada and modo = 'rascunho');
create policy prospeccao_sugestoes_gestor on public.prospeccao_sugestoes for all to authenticated using (public.current_papel() = 'gestor_rbr') with check (public.current_papel() = 'gestor_rbr');
create policy prospeccao_curso_proprio on public.prospeccao_curso_progresso for all to authenticated
  using (public.current_papel() = 'gestor_rbr' and pessoa_id = public.current_pessoa_id()) with check (public.current_papel() = 'gestor_rbr' and pessoa_id = public.current_pessoa_id());
revoke all on public.prospeccao_base, public.prospeccao_buscas_salvas, public.prospeccao_caixa_mensagens, public.prospeccao_caixa_acoes,
  public.prospeccao_respostas_config, public.prospeccao_sugestoes, public.prospeccao_curso_progresso from anon;

-- ---------------------------------------------------------------------------------------------------------
-- RPCs (security definer, checam gestor_rbr; o navegador nunca usa service_role)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.radar_restricao_cnae(p_cnae text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when regexp_replace(coalesce(p_cnae,''), '\D', '', 'g') like '2013%' then 'fertilizante'
    when regexp_replace(coalesce(p_cnae,''), '\D', '', 'g') like '2063%' then 'cosmetico'
    when regexp_replace(coalesce(p_cnae,''), '\D', '', 'g') like '21%' then 'medicamento'
    when regexp_replace(coalesce(p_cnae,''), '\D', '', 'g') like '20%' then 'quimico'
    else null end;
$$;

create or replace function public.radar_segmento_slug(p_txt text) returns text
language sql immutable set search_path = public, pg_temp as $$
  with t as (select lower(translate(coalesce(p_txt,''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) s)
  select case
    when s ~ 'estrutura|galpo' then 'estruturas_galpoes'
    when s ~ 'evento|show' then 'eventos_shows'
    when s ~ 'papel|embalagem' then 'papel_embalagens'
    when s ~ 'atacad' then 'atacadistas'
    when s ~ 'autopeca|auto peca' then 'autopecas'
    when s ~ 'movel|moveis|colchoe' then 'moveis_colchoes'
    when s ~ 'eletrodomestic|eletronic' then 'eletro_eletronicos'
    when s ~ 'locacao' then 'locacao_maquinas'
    when s ~ 'agricola' then 'maquinas_agricolas'
    when s ~ 'recicla|sucata' then 'reciclagem_sucata'
    when s ~ 'pneu|borracha' then 'pneus_borracha'
    when s ~ 'ceramic' then 'ceramica'
    when s ~ 'cimento' then 'cimento'
    when s ~ 'aliment' then 'alimentos'
    when s ~ 'bebida' then 'bebidas'
    when s ~ 'plastic' then 'plasticos'
    when s ~ 'metalurg' then 'metalurgia'
    when s ~ 'maquina' then 'maquinas'
    else null end from t;
$$;

create or replace function public.radar_importar_base(p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; v_cnpj text; v_novo boolean; v_n int := 0; v_u int := 0; v_i int := 0;
begin
  if public.current_papel() is distinct from 'gestor_rbr' then raise exception 'Sem permissao.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 1000 then raise exception 'Lote invalido (maximo 1000 linhas).'; end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    v_cnpj := regexp_replace(coalesce(r->>'cnpj', r->>'cnpj_formatado', ''), '\D', '', 'g');
    if v_cnpj !~ '^[0-9]{14}$' or coalesce(btrim(r->>'razao_social'), '') = '' or upper(coalesce(r->>'porte','')) = 'MEI' then v_i := v_i + 1; continue; end if;
    insert into public.prospeccao_base as b (cnpj, prioridade, cnpj_formatado, razao_social, nome_fantasia, segmento_rbr, cnae_principal, cnae_descricao, porte, capital_social,
      matriz_filial, gigante, data_inicio, logradouro, numero, complemento, bairro, municipio, uf, cep, distancia_km, telefone1, telefone2, email, dominio_email,
      dominio_valido, tem_site, motivo, origem, restricao, importado_em)
    values (v_cnpj, r->>'prioridade', r->>'cnpj_formatado', btrim(r->>'razao_social'), nullif(r->>'nome_fantasia',''), r->>'segmento_rbr', r->>'cnae_principal', r->>'cnae_descricao',
      r->>'porte', nullif(replace(coalesce(r->>'capital_social',''), ',', '.'), '')::numeric, r->>'matriz_filial', lower(coalesce(r->>'gigante','')) in ('sim','true','1','s'),
      r->>'data_inicio', r->>'logradouro', r->>'numero', r->>'complemento', r->>'bairro', r->>'municipio', upper(r->>'uf'), r->>'cep',
      nullif(replace(coalesce(r->>'distancia_km',''), ',', '.'), '')::numeric, r->>'telefone1', r->>'telefone2', lower(nullif(btrim(r->>'email'),'')), lower(nullif(r->>'dominio_email','')),
      lower(coalesce(r->>'dominio_valido','')) in ('sim','true','1','s'), lower(coalesce(r->>'tem_site','')) in ('sim','true','1','s'), r->>'motivo', r->>'origem',
      public.radar_restricao_cnae(r->>'cnae_principal'), now())
    on conflict (cnpj) do update set prioridade = excluded.prioridade, cnpj_formatado = excluded.cnpj_formatado, razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia,
      segmento_rbr = excluded.segmento_rbr, cnae_principal = excluded.cnae_principal, cnae_descricao = excluded.cnae_descricao, porte = excluded.porte, capital_social = excluded.capital_social,
      matriz_filial = excluded.matriz_filial, gigante = excluded.gigante, data_inicio = excluded.data_inicio, logradouro = excluded.logradouro, numero = excluded.numero,
      complemento = excluded.complemento, bairro = excluded.bairro, municipio = excluded.municipio, uf = excluded.uf, cep = excluded.cep, distancia_km = excluded.distancia_km,
      telefone1 = excluded.telefone1, telefone2 = excluded.telefone2, email = excluded.email, dominio_email = excluded.dominio_email, dominio_valido = excluded.dominio_valido,
      tem_site = excluded.tem_site, motivo = excluded.motivo, origem = excluded.origem, restricao = excluded.restricao, importado_em = now()
    returning (xmax = 0) into v_novo;
    if v_novo then v_n := v_n + 1; else v_u := v_u + 1; end if;
  end loop;
  -- marca quem ja esta na lista de Empresas
  update public.prospeccao_base b set ja_na_lista = true
   where not b.ja_na_lista and exists (select 1 from public.prospeccao_empresas e where e.cnpj = b.cnpj)
     and b.cnpj in (select regexp_replace(coalesce(x->>'cnpj', x->>'cnpj_formatado', ''), '\D', '', 'g') from jsonb_array_elements(p_linhas) x);
  return jsonb_build_object('novos', v_n, 'atualizados', v_u, 'ignorados', v_i);
end $$;

-- Filtros: {raio, segmentos[], portes[], gigantes, so_email, so_validado, so_nova, q, pagina, tamanho}
create or replace function public.radar_buscar_base(p_filtros jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_raio numeric := coalesce((f->>'raio')::numeric, 150);
  v_segs text[] := coalesce(array(select jsonb_array_elements_text(f->'segmentos')), '{}');
  v_portes text[] := coalesce(array(select jsonb_array_elements_text(f->'portes')), '{}');
  v_gig boolean := coalesce((f->>'gigantes')::boolean, false);
  v_q text := lower(coalesce(f->>'q',''));
  v_pag int := greatest(coalesce((f->>'pagina')::int, 1), 1);
  v_tam int := least(greatest(coalesce((f->>'tamanho')::int, 50), 1), 200);
  v_res jsonb;
begin
  if public.current_papel() is distinct from 'gestor_rbr' then raise exception 'Sem permissao.'; end if;
  with base as (
    select b.* from public.prospeccao_base b
     where upper(coalesce(b.porte,'')) <> 'MEI'
       and (b.distancia_km is null or b.distancia_km <= v_raio)
       and (cardinality(v_segs) = 0 or b.segmento_rbr = any(v_segs))
       and (v_gig or b.gigante = false)
       and (cardinality(v_portes) = 0 or b.porte = any(v_portes) or (b.gigante and v_gig))
       and (not coalesce((f->>'so_email')::boolean, false) or b.email is not null)
       and (not coalesce((f->>'so_validado')::boolean, false) or b.dominio_valido)
       and (not coalesce((f->>'so_nova')::boolean, false) or not b.ja_na_lista)
       and (v_q = '' or lower(coalesce(b.razao_social,'') || ' ' || coalesce(b.nome_fantasia,'') || ' ' || coalesce(b.municipio,'') || ' ' || coalesce(b.cnae_descricao,'')) like '%' || v_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'com_dominio', (select count(*) from base where dominio_valido),
    'prontas', (select count(*) from base where dominio_valido and email is not null and not ja_na_lista),
    'km_medio', (select coalesce(round(avg(distancia_km)), 0) from base),
    'linhas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select cnpj, razao_social, nome_fantasia, segmento_rbr, porte, municipio, uf, distancia_km, email, dominio_valido, prioridade, restricao, ja_na_lista, gigante
          from base order by prioridade nulls last, distancia_km nulls last, razao_social offset (v_pag - 1) * v_tam limit v_tam) x), '[]'::jsonb))
  into v_res;
  return v_res;
end $$;

create or replace function public.radar_contagem_segmentos() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.current_papel() is distinct from 'gestor_rbr' then raise exception 'Sem permissao.'; end if;
  return coalesce((select jsonb_object_agg(segmento_rbr, n) from (select segmento_rbr, count(*) n from public.prospeccao_base
    where segmento_rbr is not null and upper(coalesce(porte,'')) <> 'MEI' group by segmento_rbr) t), '{}'::jsonb);
end $$;

-- Criterios da pontuacao que a base da Receita permite preencher COM DADO REAL (os demais ficam sem valor: nada e inventado).
-- Com so estes, a nota maxima e 44 (faixa C); funcionarios (20 pontos) e os outros criterios dependem de enriquecimento. Ver relatorio.
create or replace function public.radar_criterios_da_base(b public.prospeccao_base) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare v_ini date; v_crit jsonb := '{}'::jsonb;
begin
  v_ini := case when b.data_inicio ~ '^\d{4}-\d{2}-\d{2}' then substr(b.data_inicio, 1, 10)::date
                when b.data_inicio ~ '^\d{2}/\d{2}/\d{4}' then to_date(substr(b.data_inicio, 1, 10), 'DD/MM/YYYY') else null end;
  v_crit := jsonb_build_object('segmento_cnae', 1);
  if b.email is not null then
    v_crit := v_crit || jsonb_build_object('email_logistica', case when split_part(b.email, '@', 1) ~ '^(logistica|expedicao|transportes|compras|operacao)' then 1 when split_part(b.email, '@', 1) ~ '^(comercial|vendas|contato)' then 0.5 else 0.3 end);
  end if;
  v_crit := v_crit || jsonb_build_object('capital_porte', case upper(coalesce(b.porte, '')) when 'DEMAIS' then 1 when 'EPP' then 0.6 when 'ME' then 0.3 else 0 end);
  if b.distancia_km is not null then v_crit := v_crit || jsonb_build_object('perto_rodovia', case when b.distancia_km <= 60 then 1 when b.distancia_km <= 100 then 0.5 else 0 end); end if;
  if v_ini is not null then v_crit := v_crit || jsonb_build_object('cnpj_3_anos', case when v_ini <= (current_date - interval '3 years') then 1 else 0 end); end if;
  if coalesce(b.telefone1, '') <> '' then v_crit := v_crit || jsonb_build_object('telefone_whatsapp', 1); end if;
  if b.tem_site then v_crit := v_crit || jsonb_build_object('site_ativo', 1); end if;
  return v_crit;
end $$;

create or replace function public.radar_mandar_para_lista(p_cnpjs text[], p_qualificado boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.prospeccao_base%rowtype; v_emp uuid; v_seg text; v_novas int := 0; v_ja int := 0; v_bloq int := 0; v_sem int := 0; v_orig text;
begin
  if public.current_papel() is distinct from 'gestor_rbr' then raise exception 'Sem permissao.'; end if;
  if coalesce(cardinality(p_cnpjs), 0) > 500 then raise exception 'Maximo de 500 empresas por vez.'; end if;
  for b in select * from public.prospeccao_base where cnpj = any(p_cnpjs) loop
    v_seg := public.radar_segmento_slug(b.segmento_rbr);
    v_orig := 'base Receita importada em ' || to_char(b.importado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
    if v_seg is null then v_sem := v_sem + 1; continue; end if;
    if b.email is not null and public.prospeccao_contato_bloqueado(b.email) then v_bloq := v_bloq + 1; continue; end if;
    select id into v_emp from public.prospeccao_empresas where cnpj = b.cnpj;
    if v_emp is null and b.email is not null and exists (select 1 from public.prospeccao_contatos c where lower(c.email) = b.email) then v_ja := v_ja + 1; continue; end if;
    if v_emp is null then
      insert into public.prospeccao_empresas (razao_social, nome_fantasia, cnpj, cnae, segmento, cidade, uf, telefone, site, criterios, origem_contato, status)
      values (b.razao_social, b.nome_fantasia, b.cnpj, b.cnae_principal, v_seg, b.municipio, b.uf, b.telefone1, null, public.radar_criterios_da_base(b), v_orig, case when p_qualificado then 'qualificado' else 'novo' end)
      returning id into v_emp;
      v_novas := v_novas + 1;
    else
      v_ja := v_ja + 1;
      if p_qualificado then update public.prospeccao_empresas set status = 'qualificado' where id = v_emp and status = 'novo'; end if;
    end if;
    if b.email is not null then
      insert into public.prospeccao_contatos (empresa_id, email, tipo_email, validacao_status, origem_contato)
      values (v_emp, b.email,
              case when split_part(b.email, '@', 1) ~ '^(contato|comercial|vendas|compras|logistica|expedicao|transportes|operacao|atendimento|faleconosco|sac|financeiro|adm|administrativo|info)$' then 'generico' else 'pessoal' end,
              case when b.dominio_valido then 'mx_ok' else 'sintaxe_ok' end, v_orig)
      on conflict (empresa_id, lower(email)) do nothing;
    end if;
    update public.prospeccao_base set ja_na_lista = true where cnpj = b.cnpj;
  end loop;
  perform public.prospeccao_auditar('prospeccao_base_para_lista', jsonb_build_object('novas', v_novas, 'ja_existiam', v_ja, 'bloqueadas', v_bloq, 'sem_segmento', v_sem, 'qualificado', p_qualificado));
  return jsonb_build_object('novas', v_novas, 'ja_existiam', v_ja, 'bloqueadas', v_bloq, 'sem_segmento', v_sem);
end $$;

revoke all on function public.radar_importar_base(jsonb), public.radar_buscar_base(jsonb), public.radar_contagem_segmentos(), public.radar_mandar_para_lista(text[], boolean) from public, anon;
grant execute on function public.radar_importar_base(jsonb), public.radar_buscar_base(jsonb), public.radar_contagem_segmentos(), public.radar_mandar_para_lista(text[], boolean) to authenticated;
revoke all on function public.radar_restricao_cnae(text), public.radar_segmento_slug(text), public.radar_criterios_da_base(public.prospeccao_base) from public, anon;
grant execute on function public.radar_restricao_cnae(text), public.radar_segmento_slug(text), public.radar_criterios_da_base(public.prospeccao_base) to authenticated;
