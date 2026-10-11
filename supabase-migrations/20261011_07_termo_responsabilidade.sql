-- Tarefa 7 (11/10/2026): termo de responsabilidade do motorista/parceiro, com aceite cláusula por cláusula.
-- Os TEXTOS FINAIS serão definidos por advogado: ficam em tabela (termos_contrato + cláusulas), com versão.
-- A versão 1 entra como RASCUNHO, marcada "minuta para revisão jurídica"; só vale depois que o gestor PUBLICAR.
-- Enquanto não houver versão publicada, nada é exigido (para não travar o cadastro de quem já existe).
-- Evidência do aceite em aceites_termo: imutável (sem update/delete), só o gestor lê; grava hash SHA-256 do texto,
-- cada cláusula (true/false), data/hora UTC, IP e user-agent.
-- Sem aceite da versão publicada: o cadastro não é aprovado e o parceiro não é alocado em carga.
-- Contratos já existentes no banco (contratos_aceite) não são mexidos: aquela tabela guarda aceites antigos sem cláusulas.

create table if not exists public.termos_contrato (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('prestador', 'agenciador')),
  versao integer not null check (versao > 0),
  titulo text not null,
  texto text not null,
  minuta boolean not null default true,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'arquivado')),
  publicado_em timestamptz,
  publicado_por uuid references public.pessoas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, versao)
);
create unique index if not exists termos_contrato_um_publicado on public.termos_contrato (tipo) where status = 'publicado';

create table if not exists public.termos_contrato_clausulas (
  id uuid primary key default gen_random_uuid(),
  termo_id uuid not null references public.termos_contrato(id) on delete cascade,
  ordem integer not null,
  codigo text not null,
  texto text not null,
  unique (termo_id, codigo)
);

create table if not exists public.aceites_termo (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id),
  termo_id uuid not null references public.termos_contrato(id),
  tipo text not null,
  versao_termo integer not null,
  hash_texto text not null,
  texto_aceito text not null,
  clausulas jsonb not null,
  aceito_em timestamptz not null default now(),
  ip text,
  user_agent text
);
create index if not exists aceites_termo_pessoa_idx on public.aceites_termo (pessoa_id, tipo, versao_termo);

-- Texto publicado não muda; cláusulas de versão publicada não mudam; aceite nunca muda nem é apagado.
create or replace function public.bloquear_alteracao_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Registro imutável (%): não pode ser alterado nem apagado.', tg_table_name;
end;
$$;
drop trigger if exists trg_aceites_imutaveis on public.aceites_termo;
create trigger trg_aceites_imutaveis before update or delete on public.aceites_termo
  for each row execute function public.bloquear_alteracao_imutavel();

create or replace function public.proteger_termo_publicado()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'termos_contrato' then
    if tg_op = 'DELETE' then
      if old.status <> 'rascunho' then raise exception 'Versão publicada/arquivada não pode ser apagada.'; end if;
      return old;
    end if;
    if old.status <> 'rascunho' and (new.texto is distinct from old.texto or new.titulo is distinct from old.titulo or new.versao is distinct from old.versao or new.tipo is distinct from old.tipo) then
      raise exception 'O texto de uma versão publicada não muda: crie uma nova versão.';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if exists (select 1 from termos_contrato t where t.id = coalesce(new.termo_id, old.termo_id) and t.status <> 'rascunho') then
    raise exception 'As cláusulas de uma versão publicada não mudam: crie uma nova versão.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_proteger_termo on public.termos_contrato;
create trigger trg_proteger_termo before update or delete on public.termos_contrato
  for each row execute function public.proteger_termo_publicado();
drop trigger if exists trg_proteger_termo on public.termos_contrato_clausulas;
create trigger trg_proteger_termo before insert or update or delete on public.termos_contrato_clausulas
  for each row execute function public.proteger_termo_publicado();

alter table public.termos_contrato enable row level security;
alter table public.termos_contrato_clausulas enable row level security;
alter table public.aceites_termo enable row level security;
drop policy if exists gestor_acesso_total on public.termos_contrato;
create policy gestor_acesso_total on public.termos_contrato for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
drop policy if exists gestor_acesso_total on public.termos_contrato_clausulas;
create policy gestor_acesso_total on public.termos_contrato_clausulas for all to authenticated
  using ((select current_papel()) = 'gestor_rbr'::papel_pessoa) with check ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
-- aceites: só o gestor lê; ninguém grava direto (só pela função aceitar_termo)
drop policy if exists gestor_le on public.aceites_termo;
create policy gestor_le on public.aceites_termo for select to authenticated using ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select, insert, update, delete on public.termos_contrato, public.termos_contrato_clausulas to authenticated;
grant select on public.aceites_termo to authenticated;
grant all on public.termos_contrato, public.termos_contrato_clausulas, public.aceites_termo to service_role;

-- Texto do termo pronto para a pessoa (a Tarefa 9 troca esta função para preencher os campos {{...}} do contrato).
create or replace function public.renderizar_termo(p_termo uuid, p_pessoa uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.texto from termos_contrato t where t.id = p_termo
$$;
revoke all on function public.renderizar_termo(uuid, uuid) from public, anon;
grant execute on function public.renderizar_termo(uuid, uuid) to service_role;

-- Texto usado no hash: texto renderizado + cláusulas, numa forma fixa.
create or replace function public.texto_para_hash(p_termo uuid, p_pessoa uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select renderizar_termo(p_termo, p_pessoa) || E'\n\n' ||
         coalesce(string_agg(c.codigo || ') ' || c.texto, E'\n' order by c.ordem), '')
  from termos_contrato_clausulas c where c.termo_id = p_termo
$$;
revoke all on function public.texto_para_hash(uuid, uuid) from public, anon;
grant execute on function public.texto_para_hash(uuid, uuid) to service_role;

create or replace function public.termo_publicado(p_tipo text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select id from termos_contrato where tipo = p_tipo and status = 'publicado' $$;
revoke all on function public.termo_publicado(text) from public, anon;
grant execute on function public.termo_publicado(text) to authenticated, service_role;

-- true quando não há versão publicada OU a pessoa já aceitou a versão publicada.
create or replace function public.aceite_vigente(p_pessoa uuid, p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select termo_publicado(p_tipo) is null
      or exists (select 1 from aceites_termo a where a.pessoa_id = p_pessoa and a.termo_id = termo_publicado(p_tipo))
$$;
revoke all on function public.aceite_vigente(uuid, text) from public, anon;
grant execute on function public.aceite_vigente(uuid, text) to authenticated, service_role;

-- Para o app: termo publicado que a pessoa logada ainda não aceitou (null se está em dia).
create or replace function public.meu_termo_pendente(p_tipo text default 'prestador')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pessoa uuid := current_pessoa_id();
  v_termo uuid := termo_publicado(p_tipo);
  t record;
begin
  if v_pessoa is null or v_termo is null or aceite_vigente(v_pessoa, p_tipo) then
    return null;
  end if;
  select * into t from termos_contrato where id = v_termo;
  return jsonb_build_object(
    'termo_id', t.id, 'tipo', t.tipo, 'versao', t.versao, 'titulo', t.titulo, 'minuta', t.minuta,
    'texto', renderizar_termo(t.id, v_pessoa),
    'clausulas', (select coalesce(jsonb_agg(jsonb_build_object('codigo', c.codigo, 'texto', c.texto) order by c.ordem), '[]'::jsonb)
                    from termos_contrato_clausulas c where c.termo_id = t.id),
    'ja_aceitou_versao_anterior', exists (select 1 from aceites_termo a where a.pessoa_id = v_pessoa and a.tipo = p_tipo)
  );
end;
$$;
revoke all on function public.meu_termo_pendente(text) from public, anon;
grant execute on function public.meu_termo_pendente(text) to authenticated;

-- Registro do aceite (a única forma de gravar em aceites_termo). Exige TODAS as cláusulas marcadas.
create or replace function public.aceitar_termo(p_termo uuid, p_clausulas jsonb, p_user_agent text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pessoa uuid := current_pessoa_id();
  t record;
  v_faltando text;
  v_texto text;
  v_ip text;
  v_id uuid;
  v_em timestamptz;
begin
  if v_pessoa is null then
    raise exception 'Faça login para aceitar o termo.';
  end if;
  select * into t from termos_contrato where id = p_termo;
  if t.id is null or t.status <> 'publicado' then
    raise exception 'Esta versão não está mais valendo. Recarregue a tela.';
  end if;
  select string_agg(c.codigo, ', ' order by c.ordem) into v_faltando
    from termos_contrato_clausulas c
   where c.termo_id = p_termo and coalesce((p_clausulas->>c.codigo)::boolean, false) is not true;
  if v_faltando is not null then
    raise exception 'Marque "Li e aceito" em cada cláusula (faltam: %).', v_faltando;
  end if;
  v_texto := texto_para_hash(p_termo, v_pessoa);
  v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1)), '');
  insert into aceites_termo (pessoa_id, termo_id, tipo, versao_termo, hash_texto, texto_aceito, clausulas, ip, user_agent)
  values (v_pessoa, p_termo, t.tipo, t.versao, encode(sha256(convert_to(v_texto, 'UTF8')), 'hex'), v_texto,
          (select jsonb_object_agg(c.codigo, true) from termos_contrato_clausulas c where c.termo_id = p_termo),
          v_ip, left(p_user_agent, 500))
  returning id, aceito_em into v_id, v_em;
  return jsonb_build_object('aceite_id', v_id, 'aceito_em', v_em, 'hash', encode(sha256(convert_to(v_texto, 'UTF8')), 'hex'), 'ip', v_ip);
end;
$$;
revoke all on function public.aceitar_termo(uuid, jsonb, text) from public, anon;
grant execute on function public.aceitar_termo(uuid, jsonb, text) to authenticated;

-- Publicar: arquiva a versão anterior do mesmo tipo e passa a exigir novo aceite no próximo acesso.
create or replace function public.publicar_termo(p_termo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa and not eh_backend() then
    raise exception 'Só o gestor da RBR publica termos e contratos.';
  end if;
  select * into t from termos_contrato where id = p_termo for update;
  if t.id is null or t.status <> 'rascunho' then
    raise exception 'Só um rascunho pode ser publicado.';
  end if;
  if not exists (select 1 from termos_contrato_clausulas where termo_id = p_termo) then
    raise exception 'A versão não tem cláusulas para aceite.';
  end if;
  update termos_contrato set status = 'arquivado' where tipo = t.tipo and status = 'publicado';
  update termos_contrato set status = 'publicado', publicado_em = now(), publicado_por = current_pessoa_id() where id = p_termo;
end;
$$;
revoke all on function public.publicar_termo(uuid) from public, anon;
grant execute on function public.publicar_termo(uuid) to authenticated, service_role;

-- Trava 1: cadastro de titular sem aceite da versão publicada não fica aprovado.
create or replace function public.exigir_aceite_na_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_termo uuid := termo_publicado('prestador');
begin
  if new.papel = 'titular_motorista' and new.aprovacao_status = 'aprovado' and not aceite_vigente(new.id, 'prestador') then
    new.aprovacao_status := 'aguardando_documentos';
    new.aprovacao_motivo := format('Falta aceitar o termo/contrato (versão %s) no app.', (select versao from termos_contrato where id = v_termo));
  end if;
  return new;
end;
$$;
revoke all on function public.exigir_aceite_na_aprovacao() from public, anon;
drop trigger if exists trg_exigir_aceite_na_aprovacao on public.pessoas;
create trigger trg_exigir_aceite_na_aprovacao before insert or update of aprovacao_status on public.pessoas
  for each row execute function public.exigir_aceite_na_aprovacao();

-- Trava 2: sem aceite do parceiro (titular do veículo/motorista), não aloca em carga.
create or replace function public.exigir_aceite_na_alocacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titular uuid;
begin
  if new.pessoa_alocada_id is null and new.veiculo_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.pessoa_alocada_id is not distinct from old.pessoa_alocada_id and new.veiculo_id is not distinct from old.veiculo_id then
    return new;
  end if;
  v_titular := coalesce((select titular_id from veiculos where id = new.veiculo_id),
                        (select coalesce(titular_id, id) from pessoas where id = new.pessoa_alocada_id));
  if v_titular is not null and not aceite_vigente(v_titular, 'prestador') then
    raise exception 'O parceiro ainda não aceitou o termo/contrato da versão em vigor: sem aceite, não é alocado em carga.';
  end if;
  return new;
end;
$$;
revoke all on function public.exigir_aceite_na_alocacao() from public, anon;
drop trigger if exists trg_exigir_aceite_na_alocacao on public.operacoes;
create trigger trg_exigir_aceite_na_alocacao before insert or update of pessoa_alocada_id, veiculo_id on public.operacoes
  for each row execute function public.exigir_aceite_na_alocacao();

-- Versão 1 (rascunho, minuta) com as 7 cláusulas críticas, cada uma com "Li e aceito" separado.
do $seed$
declare
  v_id uuid;
begin
  if exists (select 1 from termos_contrato where tipo = 'prestador') then
    return;
  end if;
  insert into termos_contrato (tipo, versao, titulo, texto, minuta)
  values ('prestador', 1, 'Termo de responsabilidade do motorista/parceiro',
$t$MINUTA PARA REVISÃO JURÍDICA — texto provisório, não é a versão final.

Este termo registra os compromissos do motorista/parceiro que presta serviço de transporte para a RBR Cargo. Leia cada cláusula e marque "Li e aceito" em cada uma, separadamente.$t$, true)
  returning id into v_id;
  insert into termos_contrato_clausulas (termo_id, ordem, codigo, texto) values
    (v_id, 1, '1', 'Declaro que não transportarei mercadoria ilícita, droga, arma, contrabando ou produto sem nota fiscal.'),
    (v_id, 2, '2', 'Autorizo a conferência da carga, do lacre e dos documentos no embarque e em qualquer ponto da viagem.'),
    (v_id, 3, '3', 'Me comprometo a recusar carga que pareça irregular e a avisar a RBR.'),
    (v_id, 4, '4', 'Aceito o rastreamento e a consulta de gerenciamento de risco (GR).'),
    (v_id, 5, '5', 'Respondo pelos danos e indenizo a RBR em caso de falsidade ou de carga ilícita.'),
    (v_id, 6, '6', 'Autorizo a RBR a colaborar com as autoridades.'),
    (v_id, 7, '7', 'É proibido subcontratar a viagem a terceiros.');
end;
$seed$;
