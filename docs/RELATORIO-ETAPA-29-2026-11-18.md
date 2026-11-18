# Relatorio da etapa 29 (fechar o rollout, 18/11/2026)

## O que foi aplicado
- **Revoke de seguranca:** `revoke execute on function public.trg_fn_reboque_marca_e_reboque() from public, anon, authenticated` aplicado em producao (migracao `20261118050000_revoke_trg_reboque.sql`, registrada no historico). Verificacao: `anon` = false, `authenticated` = false; o gatilho `trg_reboque_marca_e_reboque` continua existindo. PR #91, merge `2a992f5`.
- **Flag 1:** `VITE_CADASTRO_POR_DOCUMENTOS = true` em Production (rbr-gestor). Deploy `rbr-gestor-4io6qhz2e-rbr4` (redeploy do ultimo build com o codigo das 4 partes), Ready em 45 s. Fumaca: `https://rbr-gestor.vercel.app` 200 e o bundle novo publicado (tem a tela "Novo cadastro por documentos").
- **Flag 2:** `VITE_FISCAL_V3 = true` em Production. Deploy `rbr-gestor-28qyoz8oz-rbr4`, Ready em 48 s. Fumaca: 200 e o bundle tem a esteira v3. Nenhum documento fiscal emitido, nenhum cadastro criado.
- Formato: as flags `VITE_` usam o valor `true` (o codigo compara com `'true'`); por isso `true` e nao `sim`.
- Deploys feitos nesta etapa: 2 (um por flag), ambos por `vercel redeploy` do ultimo deploy Ready (codigo de cd40e50); os merges de #88 a #91 so mudaram docs/SQL e a Vercel os cancelou pelo "ignored build step".

## Estado final das flags
| Flag | Estado |
|---|---|
| VITE_CADASTRO_POR_DOCUMENTOS | LIGADA (true) |
| VITE_FISCAL_V3 | LIGADA (true) |
| VITE_REPOM_CADASTRO_HABILITADO | DESLIGADA (nao definida): faltam a filial em `repom_config` e a resposta da Karen |

## PRs
- **Mergeado:** #91 (revoke).
- **Nao mergeados:** #82 (CONFLICTING; o conteudo ja esta na main pelo #86), #74 e #65 (CONFLICTING; #65 diz "nao mergear"), #80 (titulo diz "NAO MERGEAR ainda"), #83 e #81 (prospeccao, fora do rollout), #75, #73, #72, #71, #69, #68, #67, #39 (docs e outros assuntos fora do rollout desta semana), #1 (CONFLICTING).

## Como desligar rapido
Remover a variavel no painel (rbr-gestor, Settings, Environment Variables, Production) e `vercel redeploy` do deploy atual; ou `vercel rollback` para o deploy `rbr-gestor-3f82kpc1s-rbr4` (sem as flags).

## Roteiro de teste do Pedro
1. **Cadastro por documentos:** em Cadastros, "Novo cadastro por documentos": subir o CRLV do cavalo, o CRLV da carreta e a CNH de um motorista real; conferir que 25,5 t vira 25.500 kg e que nada e salvo sem voce confirmar.
2. **Fiscal v3:** abrir uma operacao real e navegar pela aba Fiscal SEM emitir; conferir o cartao manual, a esteira de 4 blocos e o pre-voo.
3. **Repom:** continua desligada ate a Karen responder e a filial entrar em `repom_config` (chave `filial_codigo`).

## Pendencias
Veiculos com peso em toneladas para o cadastro por documentos corrigir: MLN9A91, MRJ1B57, MKT6E78, DBB9C49, EFF2I58, JAG9B55 (nenhum dado foi alterado).
