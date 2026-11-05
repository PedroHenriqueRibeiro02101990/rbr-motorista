-- APLICADA em 2026-11-05 (projeto kwscmegsfbtvlnyxougt). ADITIVA. Rollback no fim.
alter table public.pessoas add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agenciador-logos', 'agenciador-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy agenciador_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agenciador-logos' and (storage.foldername(name))[1] = public.current_pessoa_id()::text);
create policy agenciador_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'agenciador-logos' and (storage.foldername(name))[1] = public.current_pessoa_id()::text);
create policy agenciador_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'agenciador-logos' and ((storage.foldername(name))[1] = public.current_pessoa_id()::text or public.current_papel() = 'gestor_rbr'));

create or replace view public.agenciador_cotacoes_v with (security_invoker = true) as
select id, cliente_id, agenciador_id, status, origem, tipo_cotacao, created_at, updated_at,
       cidade_origem, uf_origem, cidade_destino, uf_destino, nf_produto_predominante as produto, peso_bruto_kg,
       valor_total, prazo_recebimento, prazo_entrega, validade_dias, motivo_perda, motivo_perda_detalhe, perdida_em
from public.cotacoes;
grant select on public.agenciador_cotacoes_v to authenticated;

-- ROLLBACK:
-- drop view if exists public.agenciador_cotacoes_v;
-- drop policy if exists agenciador_logos_insert on storage.objects; drop policy if exists agenciador_logos_update on storage.objects; drop policy if exists agenciador_logos_delete on storage.objects;
-- delete from storage.buckets where id='agenciador-logos';
-- alter table public.pessoas drop column if exists logo_path;
