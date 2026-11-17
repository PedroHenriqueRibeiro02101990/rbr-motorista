# Relatório da noite 16 para 17/11/2026 — Prospecção RBR Cargo

Branch: `feat/prospeccao-noite` (a partir de `feat/prospeccao`, PR #81). Se a sessão acabar, a próxima continua da primeira etapa não concluída abaixo.

## Andamento
| Etapa | Situação |
|---|---|
| 1 Migrações 1200 e 1300 | CONCLUÍDA |
| 2 Correções dos robôs (13 itens) | em andamento |
| 3 Diagnóstico da caixa e base de e-mail | pendente |
| 4 Caixa de entrada no TMS | pendente |
| 5 Agente de IA | pendente |
| 6 Painel de prospecção | pendente |
| 7 Testes e fechamento | pendente |

## Etapa 1 — Migrações
- Ordem: 1000 e 1100 (já estavam aplicadas) → **1200** (ajustes) → **1300** (modelos). Aplicadas na Etapa 1, depois de validar num bloco que termina em erro proposital (rollback). Rollbacks em `supabase/rollback/`.
- 1200 revisada: a lista de domínios públicos da constraint agora é idêntica à do código (inclui `globo.com`, `protonmail.com`, `gmail.com.br`, `hotmail.com.br`, `outlook.com.br`, `live.com.br`). Rollback da 1200 continua devolvendo ao estado da Parte A (decisão: rollback = estado anterior).
- 1300: `prospeccao_modelos.tipo` aceita também `resp_cotacao` e `resp_recusa_carga` (os 8 anteriores mantidos); os dois modelos novos nascem inativos ("A DEFINIR").
- Como verificar: `select tipo from prospeccao_modelos` (10 linhas) e `select pg_get_constraintdef(oid) from pg_constraint where conname='prospeccao_bloqueio_dominio_publico_ck'` (contém globo.com).
- Resultado conferido por consulta de leitura: 10 modelos, constraint com a lista nova, tabela de bloqueio vazia.

## Decisões tomadas sozinho
- Deno não está instalado neste PC: os testes "Deno" são arquivos `.test.ts` rodados com `node --test` (já era o padrão do repositório).

## O que depende do Pedro
(ver final do relatório)
