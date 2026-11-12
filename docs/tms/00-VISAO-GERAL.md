# 00 · Visão geral

## O que é
TMS (sistema de gestão de transporte) da RBR: cotação, operação de frete, documentos fiscais (CT-e, MDF-e, CIOT, vale-pedágio, averbação), financeiro, cadastros e frota. Evidência: tabelas `cotacoes`, `operacoes`, `documentacao_operacao`, `lancamentos_financeiros` (banco) e telas do gestor.

## Apps (pastas do repositório)

| App | Pasta | Quem usa (papéis permitidos) | Evidência |
|---|---|---|---|
| Gestor | `gestor/` | gestor_rbr, comercial, operacao, fiscal, financeiro | `gestor/src/App.tsx` (`PAPEIS_DO_PAINEL`) |
| Motorista | `motorista/` | titular_motorista, condutor | `motorista/src/App.tsx:40` |
| Agenciador | `agenciador/` | agenciador | `agenciador/src/App.tsx:39` |
| Site institucional | **ainda não disponível no repositório**. `COMO-PUBLICAR.md` cita landing pages já publicadas à parte (a confirmar onde estão) | público | `COMO-PUBLICAR.md` |
| Compartilhado | `shared/` (auth, formatação, PDFs, tipos) | os três apps | pasta `shared/` |

Há também links públicos sem login: proposta `/p/<código>` (gestor) e as funções `conta-publica`, `receber-lead`.

## Ambientes
- Banco/funções: um único projeto Supabase "ERP RBR" (sa-east-1, Postgres 17), ref `kwscmegsfbtvlnyxougt` (`scripts/deploy-functions.js`). Não há projeto de homologação separado verificável: **homologação e produção dos fornecedores** são distinguidas por coluna `ambiente` (efrete, NSPEDAGIO, Repom, `parametros_fiscais`), não por projeto. A confirmar com o Pedro se existe segundo projeto.
- Front: Vercel, um projeto por app (`rbr-gestor`, `rbr-motorista`, `rbr-agenciador`, `COMO-PUBLICAR.md`). Previews por branch (URL `rbr-gestor-git-<branch>-…vercel.app` aparece no repo).
- Domínios próprios: **a confirmar** (só `*.vercel.app` consta no repo).

## Stack
React 19 + Vite + TypeScript + Tailwind (gestor/motorista/agenciador, `package.json`); Supabase (Postgres, Auth, Storage, Realtime, Vault, Edge Functions Deno); Vercel (front); Focus NFe (fiscal), efrete/NSTech (CIOT), NSPEDAGIO e Repom (vale-pedágio), AT&M/NSTech Averba (averbação), Gemini (IA). Detalhe em [05-INTEGRACOES](05-INTEGRACOES.md) (PR 2).
