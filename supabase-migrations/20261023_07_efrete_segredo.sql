-- 20261023_07 — Integração efrete (NSTech), passo 2: leitura dos segredos EFRETE_* do Vault, só no servidor.
-- public.efrete_segredo(p_nome) devolve UM segredo pelo nome e só aceita nomes que começam com EFRETE_.
-- Executável somente por service_role (Edge Functions). Mesmo padrão de get_gemini_api_key / get_focus_nfe_token.
-- Também cria EFRETE_TESTE_CHAMADA_INTERNA: valor aleatório gerado aqui dentro (ninguém vê), usado pelo próprio banco
-- (net.http_post) para chamar a Edge Function efrete-homologacao-teste sem sessão de gestor. Remover depois do teste
-- se não for usado (rollback abaixo apaga).
-- Rollback: supabase/rollback/rollback-20261023_07_efrete_segredo.sql
create or replace function public.efrete_segredo(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_nome is null or p_nome !~ '^EFRETE_[A-Z0-9_]+$' then
    raise exception 'Segredo não permitido: só nomes EFRETE_*';
  end if;
  return (select s.decrypted_secret from vault.decrypted_secrets s where s.name = p_nome limit 1);
end;
$$;
comment on function public.efrete_segredo(text) is 'Lê um segredo EFRETE_* do Vault. Somente service_role (Edge Functions da integração efrete).';
revoke all on function public.efrete_segredo(text) from public, anon, authenticated;
grant execute on function public.efrete_segredo(text) to service_role;

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'EFRETE_TESTE_CHAMADA_INTERNA',
  'Chave interna para o banco chamar a Edge Function efrete-homologacao-teste (gerada no banco, ninguém vê).'
)
where not exists (select 1 from vault.secrets where name = 'EFRETE_TESTE_CHAMADA_INTERNA');
