# Relatório da madrugada: Radar de prospecção (19/11/2026)

Branch: `feat/radar-prospeccao-2026-11-19` (criada de `origin/main`, porque `main` está em uso por outro worktree: `rbr-motorista-repom`).
Protótipo copiado para `docs/prototipos/radar-v5.html`.

## BLOQUEIO GERAL: sem acesso ao Supabase nesta sessão
A sessão não tem nenhuma ferramenta de banco (o conector "claude.ai Supabase" existe na conta, mas não foi carregado aqui; não há `supabase` CLI nem `psql`, nem token no ambiente).
Consequências, valendo para todos os itens abaixo:
- **Nenhuma migração foi aplicada.** O SQL e o rollback estão prontos e revisados em `supabase/migrations/20261119-0100-radar-modulo.sql` e `supabase/rollback/rollback-20261119-0100-radar-modulo.sql`.
- **Nenhuma edge function foi publicada** (a publicação também exige acesso ao projeto). O código das `prospeccao-*` está corrigido no repositório.
- `get_advisors` não pôde ser rodado; a checagem de segurança foi feita por leitura do SQL (seção R12).
- As telas tratam tabela ausente com estado vazio claro ("o banco ainda não recebeu a migração do Radar").
- Não foi possível conferir o que está de fato aplicado (prompt cita só parte_a e parte_b). As migrações 1200 a 1410 em `supabase-migrations/` precisam estar aplicadas antes da do Radar.

## R0. Levantamento
- **PRs**: #81 (`feat/prospeccao`, aberto, primeira versão) e #83 (`feat/prospeccao-noite`, aberto, noite de 16/11: robôs por caixa, caixa de entrada, agente de IA, painel). Nenhum mesclado: `main` não tinha código de prospecção.
- **Aproveitado**: `git merge feat/prospeccao-noite` na minha branch (limpo, sem conflito). Isso traz 56 arquivos: 8 migrações (`supabase-migrations/20261116-*`), rollbacks, 5 edge functions (`prospeccao-enviar`, `-ler`, `-agente`, `-analista`, `-diagnostico-caixa`), regras puras em `_shared`, telas antigas em `gestor/src/components/prospeccao/` e `gestor/src/pages/Prospeccao.tsx`, `agendar-robos.sql`, `agendar-agente.sql`. O PR #83 precisa ser fechado como "substituído" quando o do Radar mesclar (ele contém os mesmos commits).
- **Stack do gestor**: Vite + React 19 + react-router 7 + Tailwind 4 + supabase-js; testes com `node --test` (TypeScript direto, sem biblioteca); lint `oxlint`; build `tsc -b && vite build`.
- **Flags**: lidas de `parametros_sistema` (`lerFlag` em `gestor/src/lib/prospeccaoDb.ts`). Usuário do Pedro: parâmetro `PROSPECCAO_ADMIN_PESSOA_ID` + função SQL `prospeccao_eh_pedro()`.
- **Tabelas existentes**: `prospeccao_pesos, _empresas, _contatos, _mensagens, _respostas, _bloqueio, _envio_diario, _estado, _rampa, _modelos, _jornada, _log, _destinos_teste, _caixas, _caixa_diagnostico, _conversas, _emails, _ia_uso, _relatorios, _experimentos, _avisos`.
- **Segredos**: nomes `PROSPECCAO_*` no Vault (valor PREENCHER). Não toquei.

## R1. Pendências antigas do banco e dos robôs
- "where true" no gatilho de pesos e os 10 domínios públicos no bloqueio: **já estavam na migração `20261116-1200-prospeccao-ajustes.sql`** (feita na noite de 16/11) e há teste que confere a lista contra `PROVEDORES_GRATUITOS`. Nada novo a escrever; precisa apenas estar aplicada.
- Caixas: `prospeccao_caixas` **já existe** (migração 1350) com pedro@ = agente_1, comercial@ = agente_2, operacional@ = reserva inativa. Não recriei.
- Revisão de `prospeccao-enviar`/`-ler` contra as regras decididas: ver subseção abaixo (preenchida no item).

## Itens
(preenchidos conforme ficam prontos)
