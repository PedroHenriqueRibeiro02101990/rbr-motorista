-- Aplicada em 2026-10-01 (via execute_sql). IE em todos os cadastros + busca de município sem acento.
alter table public.clientes add column if not exists inscricao_estadual text, add column if not exists ie_situacao text, add column if not exists situacao_cadastral text;
alter table public.pessoas add column if not exists inscricao_estadual text;
alter table public.fornecedores add column if not exists inscricao_estadual text;
alter table public.prestadores_parceiros add column if not exists inscricao_estadual text;

create or replace function public.buscar_municipio(p_cidade text, p_uf text)
returns table(codigo_ibge text, cidade text)
language sql stable security definer set search_path = public, extensions as $$
  select m.codigo_ibge::text, m.cidade from municipios_ibge m
  where m.uf = upper(trim(p_uf)) and unaccent(lower(trim(m.cidade))) = unaccent(lower(trim(p_cidade))) limit 1
$$;
revoke all on function public.buscar_municipio(text, text) from public, anon;
grant execute on function public.buscar_municipio(text, text) to authenticated, service_role;
-- municipios_ibge: carregada com 5.571 municípios pela edge function consulta-cadastros (acao: sincronizar_municipios).
