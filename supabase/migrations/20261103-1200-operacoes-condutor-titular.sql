-- B4 (03/11/2026): condutor (quem dirige: MDF-e e CIOT) e titular/recebedor (dono do veiculo e quem recebe) separados na operacao.
-- ADITIVA: duas colunas anulaveis. Nao preenche nada: sem condutor_id o sistema usa o motorista da operacao; sem titular_id usa o
-- titular do veiculo (ou o motorista), como ja era. Nao mexe em RLS, papeis nem dados.
alter table public.operacoes add column if not exists condutor_id uuid null references public.pessoas(id);
alter table public.operacoes add column if not exists titular_id uuid null references public.pessoas(id);
comment on column public.operacoes.condutor_id is 'Quem dirige (vai no MDF-e e no CIOT). Nulo = usa pessoa_alocada_id.';
comment on column public.operacoes.titular_id is 'Titular/recebedor: dono do veiculo e quem recebe o pagamento. Nulo = titular do veiculo ou o motorista.';
create index if not exists operacoes_condutor_id_idx on public.operacoes (condutor_id) where condutor_id is not null;
create index if not exists operacoes_titular_id_idx on public.operacoes (titular_id) where titular_id is not null;
