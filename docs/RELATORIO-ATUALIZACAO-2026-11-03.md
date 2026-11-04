# Relatório da atualização de 03/11/2026

Branch: `feat/atualizacao-2026-11-03` (criada em cima da `feat/front-aprovado`, com os 8 commits locais que já existiam).
Regra do dia: o Pedro emite documentos fiscais reais, então nada foi enviado, publicado ou aplicado. Tudo está em commits locais.

## Números
- Pushes: 0. Merges: 0. Deploys da Vercel: 0 (nada foi enviado).
- Funções publicadas no Supabase: 0. Migrações aplicadas: 0. Migrações aguardando o Pedro: nenhuma escrita ainda (B4 e B12 ficaram para depois).
- Registros criados em produção nesta etapa: nenhum. Nenhuma operação, cotação, cliente, motorista, veículo ou documento fiscal foi lido, alterado ou emitido. Só li o código publicado das funções (leitura).
- Testes: 179 passando (128 do gestor e 51 das funções), build e lint sem erros.

## Concluído
- A2. Repositório igual ao publicado, com diff conferido:
  - `emitir-cte` v22 para v24: CFOP 5932/6932 quando a prestação começa fora da UF da RBR (SP). Primeiro dígito: mesma UF = 5, UFs diferentes = 6. O CFOP da NF-e não define o do CT-e.
  - `emitir-mdfe` v21 para v26: UFs de percurso (`percursos[].uf_percurso`, caminho mais curto entre UFs limítrofes ou o `percurso_ufs` do VPO), pagamento só com o frete (o VPO sai do contrato e continua no grupo de vale-pedágio) e telefone do responsável técnico.
  - A versão publicada do `emitir-mdfe` ainda tem 3 textos antigos ("Repom"). O repositório mantém os textos novos (efrete e NSPEDÁGIO). Quando alguém publicar o repositório, só esses 3 textos mudam; a lógica é a mesma da v26.
  - O caminho no repositório é `supabase/functions/` (a pasta `supabase-functions/` do pedido foi movida antes, no PR #41).
- A3. Testes novos: CFOP (mesma UF, UFs diferentes, saída fora de SP), `ufsPercurso` (adjacentes = vazio; DF para SP = GO ou MG; percurso informado válido e inválido), pagamento com e sem VPO (parcelas + adiantamento = contrato; VPO fora dos componentes) e CIOT de 12 dígitos no MDF-e.
  - Observação: DF para SP com percurso `["GO"]` não é cadeia válida (GO não faz divisa com SP); cai em MG. `["GO","MG"]` é válido.
- A4. Evento "incluir condutor no MDF-e": regras extraídas para `eventos-fiscais/condutor.ts` (mesma regra de antes) e cobertas por teste.
- B1 (parcial). Aviso de sucesso ou erro, em português e sem código cru, ao cancelar MDF-e/CT-e, enviar carta de correção, incluir condutor e cancelar documento. O pop-up de condutor agora confirma o resultado.
- B2 (parcial). Título dos pop-ups de evento e de cancelamento mostra "OP-xxxx - Cliente - Origem/UF > Destino/UF".

## Parcial
- A1. Cotação por dentro: a moldura já é página (commit `718881d`), mas os cartões Cliente e carga, Rota e Prazo continuam sendo o formulário antigo. Não converti nesta etapa para não arriscar a gravação.
- B1/B2. Faltam o aviso e o título nos botões de emitir e encerrar (ficam em `OperacaoFluxo` e `ConferenciaEmissaoModal`, que lidam com a emissão real; deixei para uma rodada com revisão).

## Não feito (sem alteração)
B3 (Fiscal uma operação por vez), B4 (condutor e titular separados), B5 (cliente a partir da NF-e), B6 (peso, NCM, valor repetidos e alertas de divergência), B7 (pacote de dados da Repom), B8 (upload de PDF de VPO/CIOT), B9 (pacote do motorista), B10 (alertas antes de alocar), B11 (fila do dia com responsável), B12 (locais de entrega por cliente), B13 (perfis para Eduardo e José).

## Aguardando o Pedro
1. Liberar o push, o merge e a publicação de funções. Como ele emite hoje, a sugestão é fazer isso fora do horário de emissão, com o rollback pronto (produção atual `dpl_CtPQ5CNwwPTuL2KcUSEuiHAYgYDW`; anterior `dpl_FrtnbBDhFG4hN4kt14jMitq58fRq`).
2. B4 exige migração aditiva (colunas anuláveis `condutor_id` e `titular_id`) e mudança no `emitir-mdfe`, que emite documento real. Só com autorização e fora do horário de emissão.
3. B13: a fundação de papéis (A01 e A02) ainda não existe, então só a lista do que falta: perfis de emissão para Eduardo e José, com RLS própria, ainda a criar.
4. Conta de teste `teste.gestor@rbrcargo.invalid` criada antes (para apagar com a ordem do Pedro).

---

# Parte 2 (feat/atualizacao-parte-2)

## Situação da parte 1 (atualiza os números acima)
- Enviada e no ar: 1 push, PR #52, 1 merge (`866caa5` na main). Deploy de produção do rbr-gestor `dpl_4X2mM3ATFaac2LTcCkufwFfwnqtc`: READY (gestor.rbrcargo.com.br). Os outros projetos (rbr-motorista, rbr-agenciador) foram ignorados pela regra de build.
- Teste por papel em produção (só navegar, sem gravar): operação, fiscal, comercial e financeiro abriram 20 telas sem erro de página. O gestor NÃO foi testado em produção: o sistema de permissões negou o acesso porque a conta de gestor leria operações reais. Rollback pronto e não usado (produção anterior `dpl_CtPQ5CNwwPTuL2KcUSEuiHAYgYDW`).
- Funções publicadas na parte 1: nenhuma (o repositório só foi igualado ao que já estava publicado: emitir-cte v24 e emitir-mdfe v26).

## Concluído na parte 2
1. Avisos de sucesso e erro e título com OP, cliente e rota nos botões de emitir CT-e, emitir MDF-e e encerrar (Finalizar viagem). Só apresentação: a chamada, o corpo e a lógica das funções não mudaram. Teste manual com mocks não foi possível sem navegador autenticado em dados reais; build, lint e 128 testes do gestor passam.
3. B4, condutor e titular separados:
   - Migração ADITIVA aplicada: `operacoes.condutor_id` e `operacoes.titular_id` (anuláveis, índices parciais). SQL em `supabase/migrations/20261103-1200-operacoes-condutor-titular.sql`; rollback em `docs/rollbacks/20261103-1200-operacoes-condutor-titular.sql`. Advisors de segurança: nenhum alerta novo. Nenhuma linha foi alterada (sem preenchimento: sem os campos o sistema usa o motorista, como sempre).
   - `emitir-mdfe` v23 NO REPOSITÓRIO (não publicada): o MDF-e usa nome e CPF do condutor; o pagamento vai para o titular; se o condutor informado não existir, bloqueia com mensagem clara; condutor igual ao motorista e sem titular = nada muda. Regras em `condutorTitular.ts` com 8 testes (34 testes do MDF-e passando).
12. B12, locais de entrega por cliente: tabela nova `clientes_locais_entrega` (migração aditiva aplicada), RLS ligado e SEM política de propósito, sem regra de triangulação e sem tela. Rollback em `docs/rollbacks/20261103-1210-clientes-locais-entrega.sql`.
13. B13: só a lista abaixo; nada de RLS ou papéis foi alterado.

## Parcial / não feito
- Publicar `emitir-mdfe` v23: NÃO publiquei. Não há Deno aqui para rodar a função, e o teste de fumaça em homologação exigiria chamar a função em produção com operação real ou de teste. A sintaxe foi conferida com o compilador TypeScript e as regras têm testes, mas a função publicada continua a v26. Para publicar: `node scripts/deploy-functions.js emitir-mdfe` fora do horário de emissão, rodando a prévia (`previa: true`) numa operação de teste antes e voltando à v26 se falhar.
- CIOT usando o condutor (`efrete-ciot-operacao`) e a tela de alocação com campos Condutor e Titular: não feitos.
- B3 (Fiscal uma operação por vez), A1 (cartões Cliente e carga, Rota e Prazo), B5, B6, B7, B8, B9, B10, B11: não feitos nesta rodada.

## Migrações
- Aplicadas (aditivas): `operacoes_condutor_titular` e `clientes_locais_entrega`.
- Aguardando o Pedro: políticas de acesso (RLS) da tabela `clientes_locais_entrega` e qualquer preenchimento de `condutor_id`/`titular_id` em operações existentes.

## B13: o que falta para os perfis do Eduardo e do José emitirem
- Papéis novos ou funções de emissão para os dois (hoje só `gestor_rbr` emite CT-e e MDF-e).
- Políticas de acesso (RLS) por papel nas tabelas fiscais (documentacao_operacao, operacao_ciot_vpo, operacao_nfes) e nas funções emitir-cte, emitir-mdfe e eventos-fiscais, que hoje checam `papel = gestor_rbr`.
- Decidir se Eduardo e José também cancelam e encerram.
- Contas de login e convite pela tela Equipe (o convite hoje está desativado).
- Nada disso foi alterado.

## Números da parte 2 (final)
- Pushes: 2 nesta sessão (1 da parte 1, branch feat/atualizacao-2026-11-03; 1 da parte 2, branch feat/atualizacao-parte-2) mais 1 só de documentação [skip ci].
- Merges: 2 (PR #52, `866caa5`, e PR #53, `2a13989`). Deploys da Vercel de produção do rbr-gestor: 2 (`dpl_4X2mM3ATFaac2LTcCkufwFfwnqtc`, READY; `dpl_2rBYmBfE8M1yQ1qhJ42m5hAP82Yr`, READY).
- Funções publicadas: 0 (emitir-cte segue v24 e emitir-mdfe segue v26 no ar; a v23 do emitir-mdfe está só no repositório).
- Migrações aplicadas: 2 (aditivas). Aguardando o Pedro: políticas de acesso da tabela clientes_locais_entrega, preenchimento de condutor/titular em operações existentes e a publicação do emitir-mdfe v23.
- Rollback da produção do front: promover `dpl_4X2mM3ATFaac2LTcCkufwFfwnqtc` se o último deploy der problema (e, antes dele, `dpl_CtPQ5CNwwPTuL2KcUSEuiHAYgYDW`).

---

# Parte 3 (feat/atualizacao-parte-3)

## Item 0: conta de teste do gestor apagada
- Apagados só estes registros: a linha "TESTE gestor" em `pessoas`, a identidade e o usuário `teste.gestor@rbrcargo.invalid` em `auth.users` (com conferência de 1 usuário e 1 pessoa antes, dentro da mesma transação).
- Conferência depois: 0 linhas em `pessoas`, 0 em `auth.users`; as outras 4 contas de teste (operação, fiscal, comercial, financeiro) continuam. A primeira tentativa expirou sem confirmação (2 minutos); a segunda funcionou.
- A senha local (variável de ambiente `RBR_TESTE_GESTOR_SENHA`) também foi removida.
- Consequência: não há mais conta de gestor de teste, então a prévia do `emitir-mdfe` (que só aceita gestor) não pode ser rodada sem uma conta nova.

## Concluído
- Item 1: o PR #54 (só documentação) foi incorporado a esta branch e sobe junto no mesmo push.
- B10: alertas antes de alocar no painel "Escolhido" (CRLV vencido ou sem exercício, RNTRC do veículo inativo ou vencido, sem tara, sem eixos, sem UF de licenciamento, titular sem RNTRC de 8 dígitos, ativo e em dia). Regra pura em `lib/alertasAlocacao.ts`, 6 testes.
- Item 3 (parcial): campos Condutor e Titular/recebedor no detalhe da operação (`CondutorTitular.tsx`), gravando só `operacoes.condutor_id` e `titular_id`; em branco = tudo como antes. O MDF-e (v23 no repositório) já usa o condutor e paga ao titular.
- B7: pacote de dados da Repom no detalhe da operação, com botão Copiar campo a campo (placa, eixos, CPF, chaves da NF-e e do CT-e, peso, NCM, valor, adiantamento com aviso de 80%). Subcontratado em branco com aviso. Regras em `lib/dadosRepom.ts`, 3 testes.
- Testes: 137 do gestor passando; build e lint sem erros.

## Não feito
- B3 (Fiscal uma operação por vez), A1 (cartões Cliente e carga, Rota e Prazo), B5, B6, B8, B9, B11.
- CIOT usando o condutor (`efrete-ciot-operacao`): não alterei, porque emite CIOT real e não há como testar aqui sem Deno e sem conta de gestor.

## emitir-mdfe v23: NÃO publicado
- Diff v23 (repositório) x v26 (publicada, lida por leitura): o v23 mantém `percursos[].uf_percurso`, o pagamento sem o VPO e o telefone do responsável técnico. Só diferem o código do B4 e 3 textos (o repositório tem a redação nova de efrete e NSPEDÁGIO).
- Hora da checagem: 04/11 02:51 em Brasília, dentro da janela de 22h às 6h.
- Motivo de não publicar: a prévia (`previa: true`) é obrigatória antes e só roda com login de gestor; a conta de teste de gestor foi apagada por ordem do Pedro e eu não crio login em produção sem autorização. Sem a prévia, não há como garantir a volta automática.
- Para publicar: criar uma conta de gestor de teste (ou usar a do próprio Pedro), rodar a prévia numa operação de teste, depois `node scripts/deploy-functions.js emitir-mdfe`; se falhar, republicar a v26 (código no histórico do git e na pasta temporária do diff).

## Números da parte 3
- Funções publicadas: 0 (emitir-cte v24 e emitir-mdfe v26 seguem no ar). Migrações aplicadas nesta parte: 0. Aguardando o Pedro: as mesmas da parte 2.

---

# Parte 4: publicação do emitir-mdfe (04/11, madrugada)

- **Publicado:** `emitir-mdfe` v26 para **v27** (código v23 do repositório). Cada publicação do Supabase soma 1 à versão; o v23 é o nome interno do código. Hora: 03h Brasília, dentro da janela de 22h às 6h. Nenhuma outra função foi publicada (`emitir-cte` segue v24).
- **Conta de teste:** `teste.gestor@rbrcargo.invalid` criada só em `pessoas` e `auth.users` para a prévia e apagada em seguida: 0 linhas nas duas tabelas, 4 outras contas de teste intactas, senha local removida. A primeira tentativa de exclusão expirou (confirmação sem resposta em 2 minutos); a segunda funcionou.
- **Prévia antes de publicar (sem Deno):** rodei o código do repositório (v23) e o da versão publicada (v26) lado a lado, no computador, com o login do gestor de teste, na mesma operação de teste (`965ceb0d`). A prévia devolve antes de gravar ou de chamar a Focus, e o teste ainda bloqueava qualquer chamada a `focusnfe` (nenhuma tentativa). Resultado: payloads iguais, exceto o carimbo de hora (1 segundo) e a redação de um aviso (texto novo de efrete). Percurso `[]` (rota SP→SP), telefone do responsável técnico `1153977966` igual nas duas. A operação de teste não tem contrato de pagamento nem rota entre UFs não limítrofes, então percurso e pagamento sem VPO foram conferidos pelos testes automáticos (mesmo código da v26).
- **Condutor:** simulando em memória um condutor (sem gravar nada), o v23 colocou nome e CPF dele no MDF-e; a v26 não. Sem condutor informado, nada muda.
- **Depois de publicar:** a prévia na função publicada devolveu HTTP 200, `previa: true`, sem chamar a Focus, igual ao v23 local (a única diferença é um aviso que vem da trava real de operação de teste, que o teste local não tem).
- **Observação da publicação:** o CLI do Supabase pediu confirmação explícita (`--yes`) para publicar em produção em modo agente. Usei `--yes` uma única vez, no comando, com a autorização do Pedro para esta publicação; o `scripts/deploy-functions.js` não foi alterado e, rodando sem `--yes`, falha com essa mensagem.
- **Volta (rollback):** se precisar voltar à v26, republique o código da v26 (guardado fora do repositório em `C:\Users\Aline\AppData\Local\Temp\mdfe-v26`) com `npx supabase functions deploy emitir-mdfe --project-ref kwscmegsfbtvlnyxougt --yes`.
- **Não mexido:** CIOT (`efrete-ciot-operacao`) e as próximas partes (B3, A1, B5, B6, B8, B9, B11), para um único push depois.
- **Números:** pushes 0, merges 0, deploys da Vercel 0 nesta parte; funções publicadas 1; migrações 0.
