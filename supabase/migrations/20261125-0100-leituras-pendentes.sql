-- Fila de leitura de FOTO/scan pela IA gratuita (FreeLLM no PC, via Agente RBR) - 25/11/2026.
-- NAO APLICADA: gerar o arquivo e avisar. A edge function extrair-documento (service role) grava e le a fila; o Agente nunca acessa a tabela
-- direto: ele fala com a funcao pelo login proprio (papel agente_central). Por isso: RLS ligada e NENHUMA policy (anon/authenticated nao veem nada).
-- Guarda o texto extraido do PDF (quando a leitura sem IA ficou parcial) so ate o resultado chegar; depois o texto e apagado.
create table if not exists public.leituras_pendentes (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null check (bucket in ('cadastro-documentos','operacao-documentos')),
  path          text not null,
  mime          text not null default 'image/jpeg',
  tipo          text,                      -- tipo escolhido na tela ou reconhecido pelo texto; null = o agente classifica
  tipo_automatico boolean not null default false,
  texto         text,                      -- texto do PDF (leitura parcial); apagado ao concluir
  status        text not null default 'pendente' check (status in ('pendente','lendo','ok','erro')),
  campos        jsonb,                     -- resultado cru do agente (so enquanto nao normalizado)
  normalizado   jsonb,                     -- resultado ja normalizado pelo sistema (validacoes existentes)
  provedor      text,                      -- qual modelo do FreeLLM leu (X-Routed-Via), sem chave
  tentativas    int  not null default 0,
  erro          text,
  solicitante   uuid references public.pessoas(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists leituras_pendentes_status_idx on public.leituras_pendentes (status, criado_em);
alter table public.leituras_pendentes enable row level security;
revoke all on public.leituras_pendentes from anon, authenticated;
comment on table public.leituras_pendentes is 'Fila de leitura de foto/scan pelo FreeLLM (Agente RBR). So a edge function extrair-documento (service role) acessa.';
