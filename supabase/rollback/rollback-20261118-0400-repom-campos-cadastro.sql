drop function if exists public.complementar_motorista_por_documentos(text, jsonb);
drop table if exists public.repom_config;
drop table if exists public.tipos_carga_antt;
alter table public.operacoes drop constraint if exists operacoes_tipo_carga_antt_chk, drop column if exists tipo_carga_antt;
alter table public.pessoas drop constraint if exists pessoas_genero_chk, drop constraint if exists pessoas_numero_dependentes_chk,
  drop column if exists rg_numero, drop column if exists rg_orgao_emissor, drop column if exists rg_uf, drop column if exists genero,
  drop column if exists numero_dependentes, drop column if exists optante_simples_nacional;
