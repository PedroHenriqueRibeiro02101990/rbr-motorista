-- Tarefa 9 (11/10/2026): o termo curto da Tarefa 7 vira o CONTRATO COMPLETO de prestação de serviço de transporte
-- (15 cláusulas + anexo), aceito eletronicamente nos dois lados, com PDF guardado em bucket privado.
-- O texto vem de claude/contrato-prestador-motorista-minuta-2026-10-11.md, importado pela tela (Conformidade >
-- Termos e contratos > Importar minuta): o texto inteiro vira o contrato (campos {{...}} preservados) e a tabela do fim
-- (11 cláusulas do anexo) vira as 11 caixas "Li e aceito". Até a importação, a versão fica bloqueada para publicação.
-- Fase 1: assinatura eletrônica simples/automática com trilha de evidências. SEM ICP-Brasil (e-CNPJ).

-- Versão 1 do prestador passa a ser o contrato (só se ainda é rascunho e ninguém aceitou).
do $v1$
declare
  v_id uuid;
begin
  select id into v_id from termos_contrato where tipo = 'prestador' and versao = 1 and status = 'rascunho'
     and not exists (select 1 from aceites_termo a where a.termo_id = termos_contrato.id);
  if v_id is null or (select texto from termos_contrato where id = v_id) like '%[IMPORTAR%' then
    return;
  end if;
  update termos_contrato set titulo = 'Contrato de prestação de serviço de transporte', minuta = true, texto =
$t$MINUTA PARA REVISÃO JURÍDICA

[IMPORTAR] Este é um espaço reservado. Importe o texto de claude/contrato-prestador-motorista-minuta-2026-10-11.md em
Conformidade > Termos e contratos > Importar minuta: o texto vira o contrato e a tabela do fim vira as 11 caixas "Li e aceito".
As 7 cláusulas abaixo são as provisórias do termo curto (Tarefa 7) e serão substituídas na importação.

Campos da minuta: {{prestador_nome}} {{prestador_documento}} {{prestador_tipo}} {{prestador_rntrc}} {{prazo_pagamento_dias_uteis}}
{{marco_do_prazo}} {{dia_envio_nfse}} {{prazo_atualizacao_cadastro}} {{prazo_bo_horas}} {{aviso_previo_dias}} {{multa_contratual}}
{{ajuste_multa_juridico}} {{observacao_irrf_iss}} {{canal_denuncia}} {{prazo_retencao_dias}} {{contato_encarregado}} {{representante_rbr}} {{foro}}$t$
  where id = v_id;
end;
$v1$;

-- PDF do contrato aceito: um por aceite, imutável. Caminho: contratos/prestador/<pessoa_id>/<aceite_id>.pdf
create table if not exists public.aceites_termo_pdf (
  aceite_id uuid primary key references public.aceites_termo(id),
  pdf_path text not null,
  hash_pdf text not null check (hash_pdf ~ '^[0-9a-f]{64}$'),
  gerado_por uuid references public.pessoas(id),
  created_at timestamptz not null default now()
);
drop trigger if exists trg_aceites_pdf_imutaveis on public.aceites_termo_pdf;
create trigger trg_aceites_pdf_imutaveis before update or delete on public.aceites_termo_pdf
  for each row execute function public.bloquear_alteracao_imutavel();
alter table public.aceites_termo_pdf enable row level security;
drop policy if exists gestor_le on public.aceites_termo_pdf;
create policy gestor_le on public.aceites_termo_pdf for select to authenticated using ((select current_papel()) = 'gestor_rbr'::papel_pessoa);
grant select on public.aceites_termo_pdf to authenticated;
grant all on public.aceites_termo_pdf to service_role;

-- Dados para montar o PDF (dono do aceite ou gestor): texto aceito (já com os campos preenchidos), assinaturas e comprovação.
create or replace function public.dados_pdf_aceite(p_aceite uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  t record;
  p record;
begin
  select * into a from aceites_termo where id = p_aceite;
  if a.id is null or (a.pessoa_id is distinct from current_pessoa_id() and (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa) then
    raise exception 'Aceite não encontrado.';
  end if;
  select * into t from termos_contrato where id = a.termo_id;
  select * into p from pessoas where id = a.pessoa_id;
  return jsonb_build_object(
    'aceite_id', a.id, 'pessoa_id', a.pessoa_id, 'titulo', t.titulo, 'versao', a.versao_termo, 'minuta', t.minuta,
    'texto', a.texto_aceito, 'hash', a.hash_texto, 'aceito_em', a.aceito_em, 'ip', a.ip, 'user_agent', a.user_agent,
    'prestador_nome', p.nome, 'prestador_documento', coalesce(nullif(p.cnpj, ''), p.cpf),
    'representante_rbr', (select valor from contrato_config where tipo = t.tipo and chave = 'representante_rbr'),
    'clausulas', (select coalesce(jsonb_agg(jsonb_build_object('codigo', c.codigo, 'texto', c.texto) order by c.ordem), '[]'::jsonb)
                    from termos_contrato_clausulas c where c.termo_id = t.id and coalesce((a.clausulas->>c.codigo)::boolean, false)),
    'pdf_path', (select pdf_path from aceites_termo_pdf where aceite_id = a.id)
  );
end;
$$;
revoke all on function public.dados_pdf_aceite(uuid) from public, anon;
grant execute on function public.dados_pdf_aceite(uuid) to authenticated;

create or replace function public.registrar_pdf_aceite(p_aceite uuid, p_path text, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  select * into a from aceites_termo where id = p_aceite;
  if a.id is null or (a.pessoa_id is distinct from current_pessoa_id() and (select current_papel()) is distinct from 'gestor_rbr'::papel_pessoa) then
    raise exception 'Aceite não encontrado.';
  end if;
  if p_path not like 'prestador/' || a.pessoa_id::text || '/%' then
    raise exception 'Caminho do PDF fora da pasta do prestador.';
  end if;
  insert into aceites_termo_pdf (aceite_id, pdf_path, hash_pdf, gerado_por) values (p_aceite, p_path, lower(p_hash), current_pessoa_id())
  on conflict (aceite_id) do nothing;
end;
$$;
revoke all on function public.registrar_pdf_aceite(uuid, text, text) from public, anon;
grant execute on function public.registrar_pdf_aceite(uuid, text, text) to authenticated;

-- Para o app do motorista: os contratos que ele aceitou (download do PDF).
create or replace function public.meus_contratos()
returns table (aceite_id uuid, titulo text, versao integer, aceito_em timestamptz, pdf_path text, vigente boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, t.titulo, a.versao_termo, a.aceito_em, f.pdf_path, t.status = 'publicado'
  from aceites_termo a
  join termos_contrato t on t.id = a.termo_id
  left join aceites_termo_pdf f on f.aceite_id = a.id
  where a.pessoa_id = current_pessoa_id()
  order by a.aceito_em desc
$$;
revoke all on function public.meus_contratos() from public, anon;
grant execute on function public.meus_contratos() to authenticated;
