# Relatório do lote paralelo (2026-11-12)

Trabalho feito em cópia separada (`../rbr-motorista-paralelo`), sem tocar no branch da pasta original, na tela Fiscal, nas funções nspedagio/efrete/emitir/repom, no PR #65, em `vercel.json` ou em migrações existentes. Nenhuma migração aplicada, nenhuma função publicada, nenhum merge, nenhum fornecedor chamado, nenhum segredo escrito. Todos os PRs abertos.

## Fase A · Central de integrações, aba "Que usamos" · PR #67
- Rota `/central-integracoes` e item de menu, só leitura. **Não há papel "dono"** (só `gestor_rbr`), então fica atrás da flag `VITE_CENTRAL_INTEGRACOES` (desligada por padrão) e exige `gestor_rbr`. Sem acesso: "Página não encontrada" e sem menu.
- Dados: `efrete_ciot_pedidos`, `vpo_requisicoes`, `repom_requisicoes`, `parametros_fiscais`. Sem dado: "sem registro". Credencial: "ver no painel do Supabase" (nenhuma função nova, nenhum segredo lido).
- Testes: `gestor/test/centralIntegracoes.test.ts` (acesso, sem registro, erros em 24 h, ocultação de segredo); tsc sem erro; lint sem aviso novo.
- **Desvios**: print 1366x768 **não capturado** (a tela exige login e Playwright não foi rodado); `efrete_ciot_pedidos` não tem policy para gestor, então aparece "sem registro" (achado F08); BTG/Inter não têm integração no código; atrasos de tabela de validade/custo ficam "sem registro".

## Fase B · Desenho do painel do embarcador · PR #68
`docs/PAINEL-EMBARCADOR-DESENHO-2026-11-12.md`. Achados: o link de acompanhamento do cliente **não existe**; não há papel embarcador nem RLS por cliente. 9 decisões do Pedro listadas com recomendação.

## Fase C · Documentação do TMS (só `docs/tms/`)
- C1 · PR #69: README, CHANGELOG, visão geral, arquitetura, inventários de telas, funções e banco.
- C2 · PR #71: papéis, esteira, fiscal, integrações, regras, operação, segurança, decisões, glossário.
- C3 · PR #72: treinamento em 9 áreas, trilha por papel, avaliação.
- C4 · PR #73: revisão crítica (22 fatos, 6 suspeitas, TOP 15 e 6 lotes).
- Banco consultado só com leitura (listagens, `pg_policies`, `pg_proc`, `cron.job` sem comando, advisors).
- **Desvios**: o número do PR #70 não existe (ficou de outro PR). O relatório único fica neste arquivo, na branch da Fase A, para não gerar conflito entre PRs. Em C1, o campo de rollbacks da migração cita só `supabase/rollback/` (os de 20261030 estão em `docs/rollbacks/`; corrigido em 07).

## Dependem do Pedro
Flag `VITE_CENTRAL_INTEGRACOES`; decisões B4 (login externo, link mágico, app separado, revisão externa); virada de ambiente antes de 23/11 (F17).

## 5 achados mais graves
1. Nenhuma chamada à Focus tem timeout (F01).
2. Migrações 20261030 aplicadas fora do controle e duas pastas de migração (F03).
3. Funções publicadas sem fonte no repo, uma sem JWT (F04).
4. Efrete só homologação e NSPEDAGIO fixo em homologação; CIOT obrigatório no MDF-e em 23/11 (F17).
5. Poucos testes das funções críticas e 101 funções DEFINER abertas a `authenticated` sem revisão (F15, F06).
