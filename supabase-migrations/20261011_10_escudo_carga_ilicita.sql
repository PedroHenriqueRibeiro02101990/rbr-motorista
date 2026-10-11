-- Tarefa 10 (11/10/2026): escudo contra carga ilícita. O contrato sozinho não protege: o sistema EXECUTA e REGISTRA a
-- diligência. Reaproveita o que já existe (auditoria_log, contratos do agenciador/prestador, aceites, documentacao_operacao,
-- operacao_nfes, posicoes_gps, operacao_checklist_fotos). incidentes_seguranca (LGPD) NÃO é usada: incidente de carga é outra coisa.
--   10.1 declaração por carga do agenciador (imutável, só gestor lê; sem ela a carga não vira operação)
--   10.2 alertas de conformidade por regras simples e editáveis (aviso; só bloqueia com bloquear_liberacao_com_alerta)
--   10.3 nível de confiança do agenciador (novo/verificado/restrito) com limite de valor por carga
--   10.4 retenção sob suspeita do pagamento ao prestador e da comissão do agenciador (liberar/prorrogar com motivo)
--   10.5 protocolo de incidente (suspende, congela, retém e guarda o dossiê)
--   10.6 exame toxicológico e consentimento para consulta de antecedentes (só o campo e o aceite)
--   10.7 contadores do painel de conformidade

insert into public.parametros_sistema (chave, valor, descricao) values (
  'conformidade',
  jsonb_build_object(
    'agenciador_novo_dias', 30,
    'agenciador_novo_cargas', 3,
    'limite_valor_agenciador_novo', 100000,
    'tolerancia_valor_nf_pct', 0.01,
    'limite_valor_por_nivel', jsonb_build_object('novo', 100000, 'verificado', null, 'restrito', 0),
    'bloquear_liberacao_com_alerta', false,
    'prazo_retencao_dias', 30,
    'dias_aviso_retencao', 3,
    'dias_aviso_toxicologico', 30
  ),
  'Escudo contra carga ilícita: regras dos alertas, limites por nível do agenciador e prazo de retenção sob apuração.'
) on conflict (chave) do nothing;

-- Textos das 4 declarações da cláusula 6.2 (a-d) do contrato do agenciador. PROVISÓRIOS: trocar pelo texto da minuta.
insert into public.parametros_sistema (chave, valor, descricao) values (
  'declaracao_carga_textos',
  jsonb_build_object(
    'minuta', true,
    'a', 'Declaro que a mercadoria é lícita e está acompanhada da nota fiscal informada.',
    'b', 'Declaro que conheço o embarcador e que os dados informados acima são verdadeiros.',
    'c', 'Declaro que não percebi nenhum indício de irregularidade na carga, na embalagem ou na negociação.',
    'd', 'Declaro que respondo pela veracidade destas informações e que avisarei a RBR de qualquer fato novo.'
  ),
  'Textos das declarações 6.2 (a, b, c, d) do contrato do agenciador. MINUTA: substituir pelo texto revisado pelo advogado.'
) on conflict (chave) do nothing;

-- ================================================================ 10.1 declaração por carga
create table if not exists public.declaracoes_carga (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references public.cotacoes(id),
  operacao_id uuid references public.operacoes(id),
  agenciador_id uuid not null references public.pessoas(id),
  embarcador_nome text not null,
  embarcador_documento text not null,
  mercadoria text not null,
  quantidade text not null,
  valor numeric(14,2) not null check (valor > 0),
  nf_numero text not null,
  nf_chave text not null,
  endereco_coleta text not null,
  endereco_entrega text not null,
  contato_entrega_nome text not null,
  contato_entrega_telefone text not null,
  declaracoes jsonb not null,
  versao_contrato integer,
  texto_declarado text not null,
  hash_texto text not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists declaracoes_carga_cotacao_idx on public.declaracoes_carga (cotacao_id);
create index if not exists declaracoes_carga_embarcador_idx on public.declaracoes_carga (embarcador_documento);

-- Imutável; a única mudança aceita é ligar a operação (de vazio para preenchido), feita pelo sistema.
create or replace function public.declaracao_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.operacao_id is null and new.operacao_id is not null
     and (to_jsonb(new) - 'operacao_id') = (to_jsonb(old) - 'operacao_id') then
    return new;
  end if;
  raise exception 'Registro imutável (declaracoes_carga): não pode ser alterado nem apagado.';
end;
$$;
drop trigger if exists trg_declaracao_imutavel on public.declaracoes_carga;
create trigger trg_declaracao_imutavel before update or delete on public.declaracoes_carga
  for each row execute function public.declaracao_imutavel();

alter table public.declaracoes_carga enable row level security;
drop policy if exists gestor_le on public.declaracoes_carga;
create policy gestor_le on public.declaracoes_carga for select to authenticated using ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select on public.declaracoes_carga to authenticated;
grant all on public.declaracoes_carga to service_role;

create or replace function public.declarar_carga(p_cotacao uuid, p_dados jsonb, p_user_agent text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c record;
  v_txt jsonb := coalesce((select valor from parametros_sistema where chave = 'declaracao_carga_textos'), '{}'::jsonb);
  v_campo text;
  v_texto text;
  v_hash text;
  v_id uuid;
  v_ip text := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1)), '');
begin
  select * into c from cotacoes where id = p_cotacao;
  if c.id is null or c.agenciador_id is distinct from current_pessoa_id() then
    raise exception 'Cotação não encontrada.';
  end if;
  if not agenciador_pode_operar(c.agenciador_id) then
    raise exception 'Contrato pendente: sem contrato validado não há carga fechada.';
  end if;
  foreach v_campo in array array['embarcador_nome', 'embarcador_documento', 'mercadoria', 'quantidade', 'valor', 'nf_numero', 'nf_chave',
                                 'endereco_coleta', 'endereco_entrega', 'contato_entrega_nome', 'contato_entrega_telefone'] loop
    if nullif(btrim(coalesce(p_dados->>v_campo, '')), '') is null then
      raise exception 'Preencha todos os campos da declaração (falta: %).', v_campo;
    end if;
  end loop;
  if length(so_digitos(p_dados->>'nf_chave')) <> 44 then
    raise exception 'A chave da NF-e tem 44 dígitos.';
  end if;
  if not (coalesce((p_dados->'declaracoes'->>'a')::boolean, false) and coalesce((p_dados->'declaracoes'->>'b')::boolean, false)
      and coalesce((p_dados->'declaracoes'->>'c')::boolean, false) and coalesce((p_dados->'declaracoes'->>'d')::boolean, false)) then
    raise exception 'Marque as 4 declarações (a, b, c, d).';
  end if;
  v_texto := format(E'Declaração de carga (cláusula 6 do contrato do agenciador, versão %s)\nEmbarcador: %s (%s)\nMercadoria: %s\nQuantidade: %s\nValor: R$ %s\nNF-e: %s, chave %s\nColeta: %s\nEntrega: %s\nContato de quem entrega: %s, %s\n(a) %s\n(b) %s\n(c) %s\n(d) %s',
    coalesce((select versao from termos_contrato where id = termo_publicado('agenciador'))::text, '-'),
    btrim(p_dados->>'embarcador_nome'), so_digitos(p_dados->>'embarcador_documento'), btrim(p_dados->>'mercadoria'), btrim(p_dados->>'quantidade'),
    brl_txt((p_dados->>'valor')::numeric), btrim(p_dados->>'nf_numero'), so_digitos(p_dados->>'nf_chave'),
    btrim(p_dados->>'endereco_coleta'), btrim(p_dados->>'endereco_entrega'), btrim(p_dados->>'contato_entrega_nome'), btrim(p_dados->>'contato_entrega_telefone'),
    v_txt->>'a', v_txt->>'b', v_txt->>'c', v_txt->>'d');
  v_hash := encode(sha256(convert_to(v_texto, 'UTF8')), 'hex');
  insert into declaracoes_carga (cotacao_id, agenciador_id, embarcador_nome, embarcador_documento, mercadoria, quantidade, valor, nf_numero, nf_chave,
                                 endereco_coleta, endereco_entrega, contato_entrega_nome, contato_entrega_telefone, declaracoes, versao_contrato,
                                 texto_declarado, hash_texto, ip, user_agent)
  values (p_cotacao, c.agenciador_id, btrim(p_dados->>'embarcador_nome'), so_digitos(p_dados->>'embarcador_documento'), btrim(p_dados->>'mercadoria'),
          btrim(p_dados->>'quantidade'), (p_dados->>'valor')::numeric, btrim(p_dados->>'nf_numero'), so_digitos(p_dados->>'nf_chave'),
          btrim(p_dados->>'endereco_coleta'), btrim(p_dados->>'endereco_entrega'), btrim(p_dados->>'contato_entrega_nome'), btrim(p_dados->>'contato_entrega_telefone'),
          jsonb_build_object('a', true, 'b', true, 'c', true, 'd', true),
          (select versao from termos_contrato where id = termo_publicado('agenciador')), v_texto, v_hash, v_ip, left(p_user_agent, 500))
  returning id into v_id;
  return jsonb_build_object('declaracao_id', v_id, 'hash', v_hash);
end;
$$;
revoke all on function public.declarar_carga(uuid, jsonb, text) from public, anon;
grant execute on function public.declarar_carga(uuid, jsonb, text) to authenticated;

create or replace function public.carga_declarada(p_cotacao uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from declaracoes_carga d join cotacoes c on c.id = d.cotacao_id
                  where d.cotacao_id = p_cotacao and (c.agenciador_id = current_pessoa_id() or (select current_papel()) = 'gestor_rbr'::papel_pessoa))
$$;
revoke all on function public.carga_declarada(uuid) from public, anon;
grant execute on function public.carga_declarada(uuid) to authenticated;

-- Para o app do agenciador mostrar os textos atuais das declarações.
create or replace function public.textos_declaracao_carga()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select valor from parametros_sistema where chave = 'declaracao_carga_textos'), '{}'::jsonb)
$$;
revoke all on function public.textos_declaracao_carga() from public, anon;
grant execute on function public.textos_declaracao_carga() to authenticated;

-- Trava da cotação do agenciador: contrato validado (Tarefa 8) E declaração da carga.
create or replace function public.trava_contrato_cotacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'convertida' and (tg_op = 'INSERT' or old.status is distinct from 'convertida') and new.agenciador_id is not null then
    if not agenciador_pode_operar(new.agenciador_id) then
      raise exception 'Contrato pendente: agenciador sem contrato validado (ou suspenso) não fecha carga.';
    end if;
    if not exists (select 1 from declaracoes_carga d where d.cotacao_id = new.id) then
      raise exception 'Falta a declaração da carga (cláusula 6 do contrato): sem ela a carga não vira operação.';
    end if;
  end if;
  return new;
end;
$$;

-- Liga a declaração à primeira operação criada da cotação.
create or replace function public.ligar_declaracao_operacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cotacao_id is not null then
    update declaracoes_carga set operacao_id = new.id where cotacao_id = new.cotacao_id and operacao_id is null;
  end if;
  return null;
end;
$$;
revoke all on function public.ligar_declaracao_operacao() from public, anon;
drop trigger if exists trg_ligar_declaracao_operacao on public.operacoes;
create trigger trg_ligar_declaracao_operacao after insert on public.operacoes
  for each row execute function public.ligar_declaracao_operacao();

-- ================================================================ 10.3 nível de confiança do agenciador
alter table public.pessoas add column if not exists nivel_confianca text not null default 'novo';
alter table public.pessoas drop constraint if exists pessoas_nivel_confianca_chk;
alter table public.pessoas add constraint pessoas_nivel_confianca_chk check (nivel_confianca in ('novo', 'verificado', 'restrito'));

-- ================================================================ 10.5 / 10.6 colunas de suspensão e verificação
alter table public.pessoas
  add column if not exists suspenso_em timestamptz,
  add column if not exists suspensao_motivo text,
  add column if not exists validade_exame_toxicologico date,
  add column if not exists consentimento_consulta_antecedentes boolean not null default false,
  add column if not exists consentimento_antecedentes_em timestamptz;
alter table public.operacoes
  add column if not exists congelada_em timestamptz,
  add column if not exists congelada_motivo text;

-- Nível e suspensão: só o gestor. Consentimento: só a própria pessoa (pela função registrar_consentimento_antecedentes).
create or replace function public.proteger_campos_conformidade()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_gestor boolean := coalesce(current_papel()::text, '') = 'gestor_rbr' or eh_backend();
begin
  if tg_op = 'UPDATE' then
    if not v_gestor and (new.nivel_confianca is distinct from old.nivel_confianca or new.suspenso_em is distinct from old.suspenso_em
                         or new.suspensao_motivo is distinct from old.suspensao_motivo) then
      raise exception 'Só o gestor da RBR altera o nível de confiança e a suspensão.';
    end if;
    if (new.consentimento_consulta_antecedentes is distinct from old.consentimento_consulta_antecedentes
        or new.consentimento_antecedentes_em is distinct from old.consentimento_antecedentes_em)
       and coalesce(current_setting('rbr.consentimento_rpc', true), '') <> '1' and not eh_backend() then
      raise exception 'O consentimento para consulta de antecedentes é dado pela própria pessoa, no app.';
    end if;
  elsif not v_gestor and (new.nivel_confianca <> 'novo' or new.suspenso_em is not null or new.consentimento_consulta_antecedentes) then
    raise exception 'Cadastro novo começa com nível "novo", sem suspensão e sem consentimento.';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_campos_conformidade() from public, anon;
drop trigger if exists trg_proteger_campos_conformidade on public.pessoas;
create trigger trg_proteger_campos_conformidade before insert or update on public.pessoas
  for each row execute function public.proteger_campos_conformidade();

create or replace function public.registrar_consentimento_antecedentes(p_aceito boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pessoa uuid := current_pessoa_id();
begin
  if v_pessoa is null then
    raise exception 'Faça login.';
  end if;
  perform set_config('rbr.consentimento_rpc', '1', true);
  update pessoas set consentimento_consulta_antecedentes = p_aceito, consentimento_antecedentes_em = case when p_aceito then now() end where id = v_pessoa;
  perform set_config('rbr.consentimento_rpc', '', true);
  insert into auditoria_log (acao, entidade, entidade_id, dado_depois, papel, pessoa_id_ator)
  values ('consentimento_antecedentes', 'pessoas', v_pessoa::text, jsonb_build_object('aceito', p_aceito), current_papel()::text, v_pessoa);
end;
$$;
revoke all on function public.registrar_consentimento_antecedentes(boolean) from public, anon;
grant execute on function public.registrar_consentimento_antecedentes(boolean) to authenticated;

-- ================================================================ 10.2 alertas de conformidade
create or replace function public.chave_nfe_valida(p text)
returns boolean language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  soma int := 0;
  peso int := 2;
  i int;
  dv int;
begin
  if length(d) <> 44 then
    return false;
  end if;
  for i in reverse 43..1 loop
    soma := soma + substr(d, i, 1)::int * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  dv := 11 - (soma % 11);
  if dv >= 10 then
    dv := 0;
  end if;
  return dv = substr(d, 44, 1)::int;
end;
$$;

create table if not exists public.alertas_conformidade_revisoes (
  operacao_id uuid not null references public.operacoes(id),
  codigo text not null,
  observacao text not null,
  revisado_por uuid references public.pessoas(id),
  revisado_em timestamptz not null default now(),
  primary key (operacao_id, codigo)
);
alter table public.alertas_conformidade_revisoes enable row level security;
drop policy if exists gestor_acesso_total on public.alertas_conformidade_revisoes;
create policy gestor_acesso_total on public.alertas_conformidade_revisoes for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select, insert, update, delete on public.alertas_conformidade_revisoes to authenticated;
grant all on public.alertas_conformidade_revisoes to service_role;

create or replace function public.alertas_conformidade_operacao(p_operacao uuid)
returns table (codigo text, titulo text, detalhe text, revisado boolean, revisado_obs text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_par jsonb := coalesce((select valor from parametros_sistema where chave = 'conformidade'), '{}'::jsonb);
  o record;
  c record;
  dc record;
  ag record;
  v_valor numeric;
  v_nf numeric;
  v_limite numeric;
  v_chave text;
  v_cargas int;
  v_alertas jsonb := '[]'::jsonb;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor vê os alertas de conformidade.';
  end if;
  select * into o from operacoes where id = p_operacao;
  if o.id is null then
    return;
  end if;
  select * into c from cotacoes where id = o.cotacao_id;
  select * into dc from declaracoes_carga where cotacao_id = o.cotacao_id order by created_at desc limit 1;
  select * into ag from pessoas where id = o.agenciador_id;
  v_nf := coalesce((select sum(valor) from operacao_nfes where operacao_id = o.id), c.valor_nf, o.valor_declarado_nfe);
  v_valor := coalesce(dc.valor, v_nf);

  -- valor da NF diferente do valor declarado
  if dc.id is not null and v_nf is not null and abs(v_nf - dc.valor) > dc.valor * coalesce((v_par->>'tolerancia_valor_nf_pct')::numeric, 0.01) then
    v_alertas := v_alertas || jsonb_build_object('codigo', 'nf_valor_divergente', 'titulo', 'Valor da NF diferente do declarado',
      'detalhe', format('NF R$ %s x declarado R$ %s.', brl_txt(v_nf), brl_txt(dc.valor)));
  end if;
  -- agenciador novo com carga acima do limite
  if ag.id is not null then
    select count(*) into v_cargas from operacoes x where x.agenciador_id = ag.id and x.id <> o.id and x.status <> 'cancelada';
    if (ag.created_at > now() - make_interval(days => coalesce((v_par->>'agenciador_novo_dias')::int, 30))
        or v_cargas < coalesce((v_par->>'agenciador_novo_cargas')::int, 3))
       and v_valor > coalesce((v_par->>'limite_valor_agenciador_novo')::numeric, 100000) then
      v_alertas := v_alertas || jsonb_build_object('codigo', 'agenciador_novo_valor_alto', 'titulo', 'Agenciador novo com carga de valor alto',
        'detalhe', format('%s carga(s) anteriores; carga de R$ %s.', v_cargas, brl_txt(v_valor)));
    end if;
    -- limite por nível de confiança (10.3)
    v_limite := nullif(v_par->'limite_valor_por_nivel'->>coalesce(ag.nivel_confianca, 'novo'), '')::numeric;
    if v_limite is not null and v_valor > v_limite then
      v_alertas := v_alertas || jsonb_build_object('codigo', 'acima_limite_nivel', 'titulo', 'Acima do limite do nível do agenciador',
        'detalhe', format('Nível %s: limite R$ %s por carga; carga de R$ %s.', coalesce(ag.nivel_confianca, 'novo'), brl_txt(v_limite), brl_txt(v_valor)));
    end if;
  end if;
  -- embarcador novo / envolvido em incidente
  if dc.id is not null then
    if not exists (select 1 from declaracoes_carga x where x.embarcador_documento = dc.embarcador_documento and x.cotacao_id <> dc.cotacao_id)
       and not exists (select 1 from cotacoes x where so_digitos(x.nf_remetente_cnpj) = dc.embarcador_documento and x.id <> dc.cotacao_id) then
      v_alertas := v_alertas || jsonb_build_object('codigo', 'embarcador_novo', 'titulo', 'Embarcador novo',
        'detalhe', format('%s (%s) nunca embarcou com a RBR.', dc.embarcador_nome, dc.embarcador_documento));
    end if;
  end if;
  -- chave de NF inválida ou já usada em outra operação
  for v_chave in
    select distinct so_digitos(k) from (
      select chave_acesso as k from operacao_nfes where operacao_id = o.id
      union all select c.nf_chave_acesso union all select dc.nf_chave
    ) s where nullif(so_digitos(k), '') is not null
  loop
    if not chave_nfe_valida(v_chave) then
      v_alertas := v_alertas || jsonb_build_object('codigo', 'nf_chave_invalida', 'titulo', 'Chave de NF-e inválida',
        'detalhe', format('Chave %s não confere (44 dígitos e dígito verificador).', v_chave));
    end if;
    if exists (select 1 from operacao_nfes n where so_digitos(n.chave_acesso) = v_chave and n.operacao_id <> o.id)
       or exists (select 1 from operacoes x join cotacoes y on y.id = x.cotacao_id
                   where so_digitos(y.nf_chave_acesso) = v_chave and x.id <> o.id and x.cotacao_id is distinct from o.cotacao_id) then
      v_alertas := v_alertas || jsonb_build_object('codigo', 'nf_chave_repetida', 'titulo', 'NF-e já usada em outra operação',
        'detalhe', format('A chave %s aparece em outra operação.', v_chave));
    end if;
  end loop;
  -- origem/destino fora do padrão do cliente (cliente com histórico e rota nunca feita)
  if c.id is not null and o.cliente_id is not null and c.ibge_origem is not null and c.ibge_destino is not null
     and exists (select 1 from operacoes x where x.cliente_id = o.cliente_id and x.id <> o.id and x.status <> 'cancelada')
     and not exists (select 1 from operacoes x join cotacoes y on y.id = x.cotacao_id
                      where x.cliente_id = o.cliente_id and x.id <> o.id and x.status <> 'cancelada'
                        and y.ibge_origem = c.ibge_origem and y.ibge_destino = c.ibge_destino) then
    v_alertas := v_alertas || jsonb_build_object('codigo', 'rota_fora_padrao', 'titulo', 'Origem/destino fora do padrão do cliente',
      'detalhe', format('%s/%s -> %s/%s nunca foi feito para este cliente.', c.cidade_origem, c.uf_origem, c.cidade_destino, c.uf_destino));
  end if;
  -- prestador ou agenciador suspenso
  if exists (select 1 from pessoas p where p.id in (titular_da_operacao(o.id), o.pessoa_alocada_id) and p.suspenso_em is not null) then
    v_alertas := v_alertas || jsonb_build_object('codigo', 'prestador_suspenso', 'titulo', 'Prestador suspenso', 'detalhe', 'O motorista/parceiro alocado está suspenso.');
  end if;

  return query
    select a->>'codigo', a->>'titulo', a->>'detalhe', r.operacao_id is not null, r.observacao
      from jsonb_array_elements(v_alertas) a
      left join alertas_conformidade_revisoes r on r.operacao_id = o.id and r.codigo = a->>'codigo';
end;
$$;
revoke all on function public.alertas_conformidade_operacao(uuid) from public, anon;
grant execute on function public.alertas_conformidade_operacao(uuid) to authenticated, service_role;

create or replace function public.revisar_alerta_conformidade(p_operacao uuid, p_codigo text, p_observacao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then
    raise exception 'Só o gestor revisa alertas.';
  end if;
  if nullif(btrim(p_observacao), '') is null then
    raise exception 'Escreva o que foi conferido.';
  end if;
  insert into alertas_conformidade_revisoes (operacao_id, codigo, observacao, revisado_por) values (p_operacao, p_codigo, btrim(p_observacao), current_pessoa_id())
  on conflict (operacao_id, codigo) do update set observacao = excluded.observacao, revisado_por = excluded.revisado_por, revisado_em = now();
end;
$$;
revoke all on function public.revisar_alerta_conformidade(uuid, text, text) from public, anon;
grant execute on function public.revisar_alerta_conformidade(uuid, text, text) to authenticated;

-- Alertas abertos (não revisados) das operações em andamento.
create or replace function public.alertas_conformidade_abertos()
returns table (operacao_id uuid, codigo text, titulo text, detalhe text)
language sql stable security definer set search_path = public as $$
  select o.id, a.codigo, a.titulo, a.detalhe
  from operacoes o, lateral alertas_conformidade_operacao(o.id) a
  where o.status not in ('entregue', 'fechada', 'cancelada') and o.deleted_at is null and not a.revisado
$$;
revoke all on function public.alertas_conformidade_abertos() from public, anon;
grant execute on function public.alertas_conformidade_abertos() to authenticated, service_role;

-- Liberação para coleta: só bloqueia se o parâmetro estiver ligado; operação congelada nunca anda.
create or replace function public.trava_conformidade_operacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_bloquear boolean := coalesce((select (valor->>'bloquear_liberacao_com_alerta')::boolean from parametros_sistema where chave = 'conformidade'), false);
  v_abertos text;
begin
  if old.congelada_em is not null and coalesce(current_setting('rbr.incidente_rpc', true), '') <> '1'
     and (new.status is distinct from old.status or new.pessoa_alocada_id is distinct from old.pessoa_alocada_id or new.veiculo_id is distinct from old.veiculo_id) then
    raise exception 'Operação congelada por incidente: nada muda até o gestor descongelar.';
  end if;
  if v_bloquear and new.status = 'liberada_coleta' and old.status is distinct from 'liberada_coleta' then
    select string_agg(a.titulo, '; ') into v_abertos from alertas_conformidade_operacao(new.id) a where not a.revisado;
    if v_abertos is not null then
      raise exception 'Revisar antes de liberar: %', v_abertos;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.trava_conformidade_operacao() from public, anon;
drop trigger if exists trg_trava_conformidade_operacao on public.operacoes;
create trigger trg_trava_conformidade_operacao before update on public.operacoes
  for each row execute function public.trava_conformidade_operacao();

-- Suspenso não é alocado.
create or replace function public.trava_suspenso_alocacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titular uuid;
begin
  if new.pessoa_alocada_id is null and new.veiculo_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.pessoa_alocada_id is not distinct from old.pessoa_alocada_id and new.veiculo_id is not distinct from old.veiculo_id then
    return new;
  end if;
  v_titular := coalesce((select titular_id from veiculos where id = new.veiculo_id), (select coalesce(titular_id, id) from pessoas where id = new.pessoa_alocada_id));
  if exists (select 1 from pessoas where id in (v_titular, new.pessoa_alocada_id) and suspenso_em is not null) then
    raise exception 'Motorista/parceiro suspenso: não é alocado em carga.';
  end if;
  return new;
end;
$$;
revoke all on function public.trava_suspenso_alocacao() from public, anon;
drop trigger if exists trg_trava_suspenso_alocacao on public.operacoes;
create trigger trg_trava_suspenso_alocacao before insert or update of pessoa_alocada_id, veiculo_id on public.operacoes
  for each row execute function public.trava_suspenso_alocacao();

-- ================================================================ 10.4 retenção sob apuração
create table if not exists public.retencoes_apuracao (
  id uuid primary key default gen_random_uuid(),
  alvo text not null check (alvo in ('pagamento_prestador', 'comissao_agenciador')),
  operacao_id uuid references public.operacoes(id),
  comissao_id uuid references public.comissoes_agenciador(id),
  pessoa_id uuid not null references public.pessoas(id),
  status text not null default 'retido_apuracao' check (status in ('retido_apuracao', 'liberado')),
  motivo text not null,
  data_limite date not null,
  incidente_id uuid,
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  check ((alvo = 'pagamento_prestador' and operacao_id is not null) or (alvo = 'comissao_agenciador' and comissao_id is not null))
);
create index if not exists retencoes_apuracao_ativas_idx on public.retencoes_apuracao (status, data_limite);

create table if not exists public.retencoes_eventos (
  id uuid primary key default gen_random_uuid(),
  retencao_id uuid not null references public.retencoes_apuracao(id),
  acao text not null check (acao in ('reter', 'prorrogar', 'liberar')),
  motivo text not null,
  data_limite date,
  por uuid references public.pessoas(id),
  em timestamptz not null default now()
);
drop trigger if exists trg_retencoes_eventos_imutaveis on public.retencoes_eventos;
create trigger trg_retencoes_eventos_imutaveis before update or delete on public.retencoes_eventos
  for each row execute function public.bloquear_alteracao_imutavel();

alter table public.retencoes_apuracao enable row level security;
alter table public.retencoes_eventos enable row level security;
drop policy if exists gestor_le on public.retencoes_apuracao;
create policy gestor_le on public.retencoes_apuracao for select to authenticated using ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
drop policy if exists gestor_le on public.retencoes_eventos;
create policy gestor_le on public.retencoes_eventos for select to authenticated using ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select on public.retencoes_apuracao, public.retencoes_eventos to authenticated;
grant all on public.retencoes_apuracao, public.retencoes_eventos to service_role;

create or replace function public.reter_para_apuracao(p_alvo text, p_operacao uuid, p_comissao uuid, p_motivo text, p_incidente uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_dias int := coalesce((select (valor->>'prazo_retencao_dias')::int from parametros_sistema where chave = 'conformidade'), 30);
  v_pessoa uuid;
  v_id uuid;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor retém pagamentos.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da retenção.';
  end if;
  v_pessoa := case p_alvo when 'pagamento_prestador' then titular_da_operacao(p_operacao)
                          else (select agenciador_id from comissoes_agenciador where id = p_comissao) end;
  if v_pessoa is null then
    raise exception 'Não achei quem recebe este pagamento.';
  end if;
  select id into v_id from retencoes_apuracao
   where status = 'retido_apuracao' and alvo = p_alvo and operacao_id is not distinct from p_operacao and comissao_id is not distinct from p_comissao;
  if v_id is not null then
    return v_id;
  end if;
  insert into retencoes_apuracao (alvo, operacao_id, comissao_id, pessoa_id, motivo, data_limite, incidente_id, criado_por)
  values (p_alvo, case when p_alvo = 'pagamento_prestador' then p_operacao end, case when p_alvo = 'comissao_agenciador' then p_comissao end,
          v_pessoa, btrim(p_motivo), current_date + v_dias, p_incidente, current_pessoa_id())
  returning id into v_id;
  insert into retencoes_eventos (retencao_id, acao, motivo, data_limite, por) values (v_id, 'reter', btrim(p_motivo), current_date + v_dias, current_pessoa_id());
  return v_id;
end;
$$;
revoke all on function public.reter_para_apuracao(text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.reter_para_apuracao(text, uuid, uuid, text, uuid) to authenticated, service_role;

create or replace function public.prorrogar_retencao(p_retencao uuid, p_dias integer, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_nova date;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then raise exception 'Só o gestor prorroga retenções.'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da prorrogação.'; end if;
  if coalesce(p_dias, 0) < 1 then raise exception 'Informe quantos dias prorrogar.'; end if;
  update retencoes_apuracao set data_limite = greatest(data_limite, current_date) + p_dias
   where id = p_retencao and status = 'retido_apuracao' returning data_limite into v_nova;
  if v_nova is null then raise exception 'Retenção não encontrada ou já liberada.'; end if;
  insert into retencoes_eventos (retencao_id, acao, motivo, data_limite, por) values (p_retencao, 'prorrogar', btrim(p_motivo), v_nova, current_pessoa_id());
end;
$$;
revoke all on function public.prorrogar_retencao(uuid, integer, text) from public, anon;
grant execute on function public.prorrogar_retencao(uuid, integer, text) to authenticated;

create or replace function public.liberar_retencao(p_retencao uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then raise exception 'Só o gestor libera retenções.'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da liberação.'; end if;
  update retencoes_apuracao set status = 'liberado' where id = p_retencao and status = 'retido_apuracao';
  if not found then raise exception 'Retenção não encontrada ou já liberada.'; end if;
  insert into retencoes_eventos (retencao_id, acao, motivo, por) values (p_retencao, 'liberar', btrim(p_motivo), current_pessoa_id());
end;
$$;
revoke all on function public.liberar_retencao(uuid, text) from public, anon;
grant execute on function public.liberar_retencao(uuid, text) to authenticated;

-- O dinheiro não sai enquanto retido: frete (lançamentos e pagamentos_motorista) e comissão.
create or replace function public.trava_pagamento_retido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'lancamentos_financeiros' then
    if new.tipo = 'despesa' and new.operacao_id is not null
       and (new.status = 'pago' and old.status is distinct from 'pago' or new.valor_pago > old.valor_pago)
       and exists (select 1 from retencoes_apuracao r where r.alvo = 'pagamento_prestador' and r.status = 'retido_apuracao'
                    and r.operacao_id = new.operacao_id and (new.pessoa_id is null or new.pessoa_id = r.pessoa_id)) then
      raise exception 'Pagamento retido para apuração (retido_apuracao): libere a retenção em Conformidade antes de pagar.';
    end if;
  elsif tg_table_name = 'pagamentos_motorista' then
    if new.status = 'pago' and old.status is distinct from 'pago'
       and exists (select 1 from retencoes_apuracao r where r.alvo = 'pagamento_prestador' and r.status = 'retido_apuracao' and r.operacao_id = new.operacao_id) then
      raise exception 'Pagamento retido para apuração (retido_apuracao): libere a retenção em Conformidade antes de pagar.';
    end if;
  elsif tg_table_name = 'comissoes_agenciador' then
    if new.status = 'creditado' and old.status is distinct from 'creditado'
       and exists (select 1 from retencoes_apuracao r where r.alvo = 'comissao_agenciador' and r.status = 'retido_apuracao' and r.comissao_id = new.id) then
      raise exception 'Comissão retida para apuração (retido_apuracao): libere a retenção em Conformidade antes de creditar.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.trava_pagamento_retido() from public, anon;
drop trigger if exists trg_trava_pagamento_retido on public.lancamentos_financeiros;
create trigger trg_trava_pagamento_retido before update on public.lancamentos_financeiros for each row execute function public.trava_pagamento_retido();
drop trigger if exists trg_trava_pagamento_retido on public.pagamentos_motorista;
create trigger trg_trava_pagamento_retido before update on public.pagamentos_motorista for each row execute function public.trava_pagamento_retido();
drop trigger if exists trg_trava_pagamento_retido on public.comissoes_agenciador;
create trigger trg_trava_pagamento_retido before update on public.comissoes_agenciador for each row execute function public.trava_pagamento_retido();

-- ================================================================ 10.5 incidente
create table if not exists public.incidentes_carga (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id),
  descricao text not null,
  status text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  prestador_id uuid references public.pessoas(id),
  agenciador_id uuid references public.pessoas(id),
  embarcador_documento text,
  registrado_por uuid references public.pessoas(id),
  registrado_em timestamptz not null default now(),
  dossie_path text,
  dossie_hash text,
  dossie_gerado_em timestamptz,
  dossie_gerado_por uuid references public.pessoas(id),
  encerrado_em timestamptz,
  encerrado_por uuid references public.pessoas(id),
  encerramento_motivo text
);
alter table public.incidentes_carga enable row level security;
drop policy if exists gestor_le on public.incidentes_carga;
create policy gestor_le on public.incidentes_carga for select to authenticated using ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select on public.incidentes_carga to authenticated;
grant all on public.incidentes_carga to service_role;
alter table public.retencoes_apuracao drop constraint if exists retencoes_apuracao_incidente_fk;
alter table public.retencoes_apuracao add constraint retencoes_apuracao_incidente_fk foreign key (incidente_id) references public.incidentes_carga(id);

insert into storage.buckets (id, name, public) values ('dossies', 'dossies', false) on conflict (id) do nothing;
drop policy if exists dossies_gestor on storage.objects;
create policy dossies_gestor on storage.objects for all to authenticated
  using (bucket_id = 'dossies' and (select current_papel()) = 'gestor_rbr'::papel_pessoa)
  with check (bucket_id = 'dossies' and (select current_papel()) = 'gestor_rbr'::papel_pessoa);

create or replace function public.registrar_incidente_carga(p_operacao uuid, p_descricao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_prestador uuid;
  v_emb text;
  v_id uuid;
  v_com uuid;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then
    raise exception 'Só o gestor registra incidentes.';
  end if;
  if nullif(btrim(p_descricao), '') is null then
    raise exception 'Descreva o incidente.';
  end if;
  select * into o from operacoes where id = p_operacao for update;
  if o.id is null then
    raise exception 'Operação não encontrada.';
  end if;
  v_prestador := titular_da_operacao(p_operacao);
  select embarcador_documento into v_emb from declaracoes_carga where cotacao_id = o.cotacao_id order by created_at desc limit 1;
  insert into incidentes_carga (operacao_id, descricao, prestador_id, agenciador_id, embarcador_documento, registrado_por)
  values (p_operacao, btrim(p_descricao), v_prestador, o.agenciador_id, coalesce(v_emb, (select so_digitos(nf_remetente_cnpj) from cotacoes where id = o.cotacao_id)), current_pessoa_id())
  returning id into v_id;
  -- suspende prestador (titular e motorista alocado) e agenciador
  update pessoas set suspenso_em = now(), suspensao_motivo = format('Incidente de carga %s', left(v_id::text, 8))
   where id in (v_prestador, o.pessoa_alocada_id) and suspenso_em is null;
  if o.agenciador_id is not null then
    perform mudar_status_contrato(o.agenciador_id, 'suspenso', format('Incidente de carga %s', left(v_id::text, 8)));
  end if;
  -- congela a operação
  perform set_config('rbr.incidente_rpc', '1', true);
  update operacoes set congelada_em = now(), congelada_motivo = format('Incidente de carga %s', left(v_id::text, 8)) where id = p_operacao;
  perform set_config('rbr.incidente_rpc', '', true);
  -- retém pagamento ao prestador e as comissões em aberto do agenciador
  if v_prestador is not null then
    perform reter_para_apuracao('pagamento_prestador', p_operacao, null, format('Incidente de carga %s', left(v_id::text, 8)), v_id);
  end if;
  for v_com in select id from comissoes_agenciador where agenciador_id = o.agenciador_id and status = 'pendente' loop
    perform reter_para_apuracao('comissao_agenciador', null, v_com, format('Incidente de carga %s', left(v_id::text, 8)), v_id);
  end loop;
  insert into auditoria_log (acao, entidade, entidade_id, dado_depois, papel, pessoa_id_ator)
  values ('incidente_carga_registrado', 'operacoes', p_operacao::text,
          jsonb_build_object('incidente_id', v_id, 'descricao', btrim(p_descricao), 'prestador', v_prestador, 'agenciador', o.agenciador_id, 'embarcador', v_emb),
          current_papel()::text, current_pessoa_id());
  return v_id;
end;
$$;
revoke all on function public.registrar_incidente_carga(uuid, text) from public, anon;
grant execute on function public.registrar_incidente_carga(uuid, text) to authenticated;

create or replace function public.registrar_dossie_incidente(p_incidente uuid, p_path text, p_hash text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then raise exception 'Só o gestor gera o dossiê.'; end if;
  update incidentes_carga set dossie_path = p_path, dossie_hash = lower(p_hash), dossie_gerado_em = now(), dossie_gerado_por = current_pessoa_id() where id = p_incidente;
  insert into auditoria_log (acao, entidade, entidade_id, dado_depois, papel, pessoa_id_ator)
  values ('dossie_incidente_gerado', 'incidentes_carga', p_incidente::text, jsonb_build_object('path', p_path, 'hash', lower(p_hash)), current_papel()::text, current_pessoa_id());
end;
$$;
revoke all on function public.registrar_dossie_incidente(uuid, text, text) from public, anon;
grant execute on function public.registrar_dossie_incidente(uuid, text, text) to authenticated;

-- Encerrar o incidente: descongela a operação (suspensões e retenções seguem até o gestor liberar uma a uma).
create or replace function public.encerrar_incidente_carga(p_incidente uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_op uuid;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then raise exception 'Só o gestor encerra incidentes.'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo do encerramento.'; end if;
  update incidentes_carga set status = 'encerrado', encerrado_em = now(), encerrado_por = current_pessoa_id(), encerramento_motivo = btrim(p_motivo)
   where id = p_incidente and status = 'aberto' returning operacao_id into v_op;
  if v_op is null then raise exception 'Incidente não encontrado ou já encerrado.'; end if;
  perform set_config('rbr.incidente_rpc', '1', true);
  update operacoes set congelada_em = null, congelada_motivo = null where id = v_op;
  perform set_config('rbr.incidente_rpc', '', true);
  insert into auditoria_log (acao, entidade, entidade_id, dado_depois, papel, pessoa_id_ator)
  values ('incidente_carga_encerrado', 'incidentes_carga', p_incidente::text, jsonb_build_object('motivo', btrim(p_motivo)), current_papel()::text, current_pessoa_id());
end;
$$;
revoke all on function public.encerrar_incidente_carga(uuid, text) from public, anon;
grant execute on function public.encerrar_incidente_carga(uuid, text) to authenticated;

create or replace function public.reativar_prestador(p_pessoa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa then raise exception 'Só o gestor reativa.'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da reativação.'; end if;
  update pessoas set suspenso_em = null, suspensao_motivo = null where id = p_pessoa;
  insert into auditoria_log (acao, entidade, entidade_id, dado_depois, papel, pessoa_id_ator)
  values ('prestador_reativado', 'pessoas', p_pessoa::text, jsonb_build_object('motivo', btrim(p_motivo)), current_papel()::text, current_pessoa_id());
end;
$$;
revoke all on function public.reativar_prestador(uuid, text) from public, anon;
grant execute on function public.reativar_prestador(uuid, text) to authenticated;

-- ================================================================ 10.7 painel
create or replace function public.painel_conformidade()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par jsonb := coalesce((select valor from parametros_sistema where chave = 'conformidade'), '{}'::jsonb);
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor vê o painel de conformidade.';
  end if;
  return jsonb_build_object(
    'contratos_a_validar', (select count(*) from contratos_agenciador where status = 'enviado'),
    'agenciadores_sem_contrato', (select count(*) from pessoas where papel = 'agenciador' and deleted_at is null and status_contrato_agenciador not in ('validado', 'suspenso')),
    'alertas_abertos', (select count(*) from alertas_conformidade_abertos()),
    'retencoes_vencendo', (select count(*) from retencoes_apuracao where status = 'retido_apuracao'
                             and data_limite <= current_date + coalesce((v_par->>'dias_aviso_retencao')::int, 3)),
    'retencoes_ativas', (select count(*) from retencoes_apuracao where status = 'retido_apuracao'),
    'incidentes_abertos', (select count(*) from incidentes_carga where status = 'aberto'),
    'toxicologicos_vencendo', (select count(*) from pessoas where deleted_at is null and validade_exame_toxicologico is not null
                                 and upper(coalesce(cnh_categoria, '')) ~ '[CDE]'
                                 and validade_exame_toxicologico <= current_date + coalesce((v_par->>'dias_aviso_toxicologico')::int, 30))
  );
end;
$$;
revoke all on function public.painel_conformidade() from public, anon;
grant execute on function public.painel_conformidade() to authenticated, service_role;
