-- Modo de demonstração da aba Fiscal. Aditiva. JÁ APLICADA em 11/11/2026.
alter table public.operacoes add column if not exists modo_demonstracao boolean not null default false;
comment on column public.operacoes.modo_demonstracao is 'Marca a operação de demonstração (só vale com eh_teste = true e ambiente fiscal de homologação): a aba Fiscal mostra só CIOT e vale-pedágio.';
update public.operacoes set modo_demonstracao = true where id = '70cdfc53-2911-43d4-adb0-98e12d3cbd3d' and eh_teste = true;
