# Relatório: fechamento da Parte B (fornecedor por operação) — PR #65 — 12/11/2026

Nada neste arquivo é segredo. Nada foi aplicado no banco, publicado ou emitido. PR #65 segue aberto, sem merge, com a flag `VITE_SELETOR_FORNECEDOR` desligada.

## Observação sobre o prompt
O texto recebido veio cortado: chegaram os itens 2 a 7 (o item 2 sem o começo) e o item 1 só em parte ("Se o PR das abas VPO e CIOT ..."). O PR #65 já estava atualizado com a `main` (`d700e1a`), e não há outro PR aberto das abas VPO/CIOT; por isso nada precisou ser reaproveitado ou refeito do item 1. Se o item 1 pedia outra coisa, o Pedro me diz.

## B5 completo (esteira e pré-voo)
- Hook `useFornecedoresOperacao` (lê catálogo e escolha; devolve `null` com a flag desligada, em operação de demonstração ou se a leitura falhar).
- Esteira (etapas Vale-pedágio e CIOT) e pré-voo mostram o fornecedor de cada etapa: "VPO: NSPEDAGIO (padrão)", "CIOT: efrete (padrão)"; com escolha feita sem "(padrão)"; documento emitido: "· emitido por NSTech". Cancelamento, reemissão, consulta e recibo continuam usando o fornecedor gravado (função `fornecedorEfetivo`, testada), e o seletor fica bloqueado depois de emitir.
- Ajuste: o nome do fornecedor `nstech` no catálogo ficou curto (`NSTech`), para caber nas etapas.

## Demonstração (item 3)
- Operação com `eh_teste` e `modo_demonstracao`: fornecedor fixo nstech, seletor não aparece, esteira e pré-voo iguais a hoje, com a flag ligada ou desligada. Confirmado em teste de tela (Playwright, componente real) e em teste unitário. A função do banco também recusa troca em demo.

## Prints (item 4)
Gerados com flag ligada, 1366x768, dados de exemplo e rede do Supabase simulada (nada em produção, nada real). Script: `gestor/e2e/prova-seletor-fornecedor.cjs`.
- `docs/captura-fornecedor-seletor.png`: seletor com nstech marcado e "padrão, sem escolha feita" (a opção Repom aparece desabilitada "em implantação" na lista; a prova de tela confere isso nas opções).
- `docs/captura-fornecedor-seletor-esteira.png`: esteira com o fornecedor de cada etapa.
- `docs/captura-fornecedor-bloqueado.png` e `-bloqueado-esteira.png`: depois de emitir, seletor bloqueado ("cancele antes de trocar a empresa") e "emitido por NSTech".
- `docs/captura-fornecedor-demo.png`: demonstração com a flag ligada, sem nada novo.
Para ver ao vivo: `VITE_SELETOR_FORNECEDOR=true VITE_EFRETE_CIOT_HABILITADO=true VITE_NSPEDAGIO_HABILITADO=true npx vite build`, `npx vite preview --port 4173 --strictPort` e `node e2e/prova-seletor-fornecedor.cjs` (`FLAG=desligada` para o build sem a flag).

## Testes (item 5)
- Front: 189 passam (novos: demo ignora o seletor, flag desligada/ligada, papel sem permissão vê mas não troca, texto de fornecedor por etapa).
- Backend: 114 passam (novos: fornecedor de origem no cancelar, erro claro sem rede, revisão do SQL).
- Prova de tela com a flag ligada (11 verificações) e desligada (6): todas OK.
- Compilação (tsc) e build: OK.

## Revisão do SQL `supabase-migrations/20261112-1100-fornecedores-fiscais.sql` (item 6)
- Só aditivo: tabela nova, 4 colunas novas (`add column if not exists`), 2 funções novas; nenhum `drop`, `delete`, `truncate` nem `update` de dado existente (conferido em teste de texto).
- RLS ligado **e forçado** na tabela nova (`enable` + `force row level security`). Havia só o `enable`: **corrigido** (`force` adicionado).
- Leitura só para gestor. Havia gestor e fiscal: **corrigido** para `gestor_rbr` apenas, como pedido. Consequência: um usuário só do Fiscal não lê o catálogo, então não vê o seletor (a função de troca no banco continua aceitando Fiscal e gestor). Se o Fiscal precisar ver, é uma linha de policy a mais: decisão do Pedro.
- Escrita só `service_role`: nenhuma policy de escrita; `revoke insert, update, delete` para `authenticated`; `revoke all` para `anon`. As funções de troca são `security definer`.
- Rollback incluso (`supabase/rollback/rollback-20261112-1100-fornecedores-fiscais.sql`), conferido em texto: desfaz as 2 funções, as 4 colunas e a tabela.
- Valores iniciais: `nstech` (ciot e vpo, ativo, disponível, padrão nos dois) e `repom` (ciot e vpo, ativo, **não** disponível, não padrão). Corretos.
- Lembrete (já era assim): a linha de `operacao_ciot_vpo` criada pela escolha passa pelo gatilho `trg_validar_ciot_origem`, que preenche `ciot_origem` com o valor esperado, como em qualquer outra criação dessa linha.
- Não apliquei.

## Passo a passo do Pedro depois de sexta (13/11), com o rollback de cada passo
1. **Revisar e mergear o PR #65** (o front só muda com a flag ligada). Rollback: reverter o merge (`git revert`).
2. **Aplicar a migração** `20261112-1100-fornecedores-fiscais.sql` (SQL editor do Supabase ou `apply_migration`). Conferir: `select id, disponivel_emissao, padrao_ciot, padrao_vpo from fornecedores_fiscais;` deve mostrar nstech (true, true, true) e repom (false, false, false). Rollback: rodar `supabase/rollback/rollback-20261112-1100-fornecedores-fiscais.sql`.
3. **Publicar as duas funções** (guarda de fornecedor): `npx supabase functions deploy nspedagio-vpo --project-ref kwscmegsfbtvlnyxougt --yes` e o mesmo para `efrete-ciot-operacao`. Versões antes: `nspedagio-vpo` v10 e `efrete-ciot-operacao` v7. Rollback: republicar essas versões a partir do commit `d700e1a` da `main`. Fazer **depois** do passo 2 (a guarda funciona sem a tabela, mas é melhor ter o catálogo).
4. **Ligar a flag no Vercel** (projeto `rbr-gestor`, Production): variável `VITE_SELETOR_FORNECEDOR=true` e novo deploy. Rollback: remover a variável (ou `false`) e refazer o deploy.
5. **Conferir** com usuário gestor numa operação de teste que **não** seja DEMO: seletor nos dois cartões da aba Fiscal, nstech marcado, Repom "em implantação"; esteira e pré-voo com "(padrão)"; depois de emitir, seletor bloqueado. Conferir a DEMO (OP-d755): nada novo. Pedir a um usuário do Fiscal para testar a troca (lembrar da observação sobre a leitura do catálogo).
