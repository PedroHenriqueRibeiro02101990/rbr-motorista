# Repom (roteirização de pedágio / VPR) — relatório (2026-11-06)

Tudo nasce **desligado** e em **QA**. Nenhuma chamada real à Repom foi feita (testes só com mock). Nenhuma edge function publicada.

## Pronto
- `supabase/functions/_shared/repomClient.ts`: adaptador único (token OAuth2 cacheado em memória e renovado em 401, timeout, erros em português simples, URLs por ambiente `REPOM_AMBIENTE` qa|prd, padrão qa), normalização de IBGE (1801012 → 1012; 3550308 → 50308), montagem de `/Api/Rota` e `/Api/Roteiro`, higienização de segredos.
- `repomPedagio.ts`: fluxo normaliza → cache → cadastra rota + consulta valor → grava cache. Cache por `chave_hash` da rota e por eixos; validade 30 dias.
- Migração aditiva `supabase-migrations/20261106-1000-repom-base.sql` (**aplicada**): `repom_segredo(nome)` (só `REPOM_*`, só service_role), `repom_rotas`, `repom_pedagios`, `repom_requisicoes`. RLS: só `gestor_rbr` lê; escrita só service_role; agenciador não lê nada. Rollback: `supabase/rollback/rollback-20261106-1000-repom-base.sql`.
- Edge functions (código em `supabase/functions/`, **não publicadas**): `repom-pedagio-rota` e `repom-status`. Auth: gestor ou agenciador logados, ou chave interna (`REPOM_CHAMADA_INTERNA`) para o motor de preço; 10 consultas/usuário/minuto; linha em `repom_requisicoes` gravada antes de interpretar a resposta; erro da Repom nunca quebra a cotação.
- Front: botão "Calcular pedágio automático" (`shared/CalcularPedagioRepom.tsx`) nas cotações do gestor e do agenciador. Mostra valor, rodovias e data; o usuário aceita ("Usar este valor") ou mantém o manual; faixa "Repom em teste" enquanto o ambiente não for prd. Flag `VITE_REPOM_ROTEIRIZACAO_HABILITADO` (desligada); no servidor, `REPOM_ROTEIRIZACAO_HABILITADO = sim` no Vault.
- `repomVpoClient.ts`: token do Vale-Pedágio e consulta de TAG por placa, **não ligado a nada**; NSPEDAGIO segue padrão.
- `repomFrete.ts`: tipos e esqueleto do Repom Frete (9520), tudo NÃO IMPLEMENTADO.

## Decisões tomadas sem perguntar
1. Código das funções em `supabase/functions/` (pasta que o repo já usa), não em `supabase-functions/`; nada faz deploy automático.
2. O botão usa a cotação **já salva** (lê `ibge_origem`, `ibge_destino`, `eixos` no servidor, com o acesso do próprio usuário). Cotação nova pede para salvar antes.
3. Aceitar o valor preenche só `cotacoes.pedagio`; `pedagio_pracas` não é preenchido (a resposta não traz praças).
4. IBGE: tira os 2 primeiros dígitos e **todos** os zeros à esquerda (5300108 → 108).
5. Segredos extras no Vault: `REPOM_ROTEIRIZACAO_HABILITADO`, `REPOM_AMBIENTE`, `REPOM_CHAMADA_INTERNA` (os `REPOM_VPR_*` já existem).
6. Tipo de rota padrão "mais rápida".

## NÃO IMPLEMENTADO / a confirmar
- Manual da Repom **não está em docs/**. Marcados "CONFIRMAR" no código: forma do token (login/senha como client_id/secret), nomes dos campos de tipo de rota e tipo de veículo, campo de distância, caminho e corpo da consulta de TAG.
- VPR: emitir e cancelar (TODO, sem manual). Campos obrigatórios de `POST /Shipping` (Repom Frete): não encontrados.
- Repom Frete (9520): sem segredo no Vault, só tipos e esqueleto.
- Motor de preço chamando a função com a chave interna: só o contrato existe; nada ligado.

## Depende do Pedro / Repom
- Ambiente QA da Repom e homologação com evidências; aprovação da rota pelo analista.
- Limites e custo por consulta; IP fixo (se exigido) para as chamadas da Edge Function.
- Criar os segredos extras acima e publicar as funções (o Claude publica após revisar).
