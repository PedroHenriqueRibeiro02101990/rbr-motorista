# Progresso da noite (2026-10-28)

Leia primeiro. Atualizado ao fim de cada bloco. Nada foi mesclado, nada foi publicado em produção.

## Bloco 0: PR #30 (tela do CIOT)

### 0a. Layout (feito)
- Cartão novo `CartaoCiot.tsx` (4 estados), usado em dois lugares onde o CIOT da efrete já aparecia:
  a linha do tempo da operação (etapa CIOT, `OperacaoFluxo`) e a tela Fiscal (`Fiscal.tsx`).
- Regras sem React em `gestor/src/lib/ciotCartao.ts` (conferência, passos antes do CIOT, regra de cancelamento).
- A conferência lê a resposta da ação `previa` da função (os mesmos bloqueios que a emissão usa). Não há regra duplicada na tela.
- Antes do CIOT: "CT-e autorizado" e "Averbação feita" (dispensado = "não exigido"; sem a linha na operação de teste = "não exigido no teste").
- Cancelar: modal com motivo de 15+ caracteres; bloqueado com aviso se o MDF-e existir.
- Faixa "HOMOLOGAÇÃO: nenhum CIOT real" (fixa) enquanto a função informa ambiente homologação.

**Decisões / limites (conservadoras):**
- NÃO existe "aba Fiscal por caminhão" (Caminhão 1, S-xxxx-1): o app tem uma operação = um caminhão e não tem o conceito de serviço com N operações. Não reconstruí o fluxo (instrução do prompt). O encaixe mínimo foi o cartão nos dois lugares acima; o rótulo é "Caminhão 1 · placa". Isso vira trabalho do Bloco 2 (tipo de serviço).
- "Emitir novamente" após cancelar: NÃO há botão. A função recusa reemitir pedido cancelado ("use uma nova referência"). O cartão explica. Liberar nova referência exige decisão sua (regra, não só tela).
- Botões "Encerrar viagem" saiu do cartão (encerramento está fora do escopo da noite; entra no Bloco 4). A ação continua na função.
- Na tela Fiscal a lista de documentos carregada não inclui a averbação (`atm`): em operação de teste ela aparece "não exigido no teste". Operação real não passa na função em homologação de qualquer forma.
- A trava de servidor (412 sem `eh_teste` em homologação) não foi tocada.

### 0b. Preview e /demo-ciot (feito, falta você conferir o preview)
- Variáveis do escopo Preview, só para a branch `tela-ciot-homologacao-2026-10-28` (produção intocada): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (chave publicável, pública por desenho), `VITE_EFRETE_CIOT_HABILITADO=true`, `VITE_DEMO_CIOT=true`.
  O projeto rbr-gestor não tinha nenhuma variável VITE_* no Preview: provável causa do login quebrado.
- Rota `/demo-ciot`: `DemoCiot.tsx`, sem login, dados fictícios, faixa "DEMONSTRAÇÃO: dados fictícios", usa o mesmo cartão e não faz nenhuma chamada. Só monta quando `VITE_DEMO_CIOT=true`.
- **Depende de você:** Supabase Auth > URL Configuration: incluir `https://rbr-gestor-git-*-rbr4.vercel.app/**` em Redirect URLs (só afeta link de e-mail/recuperação de senha; login por senha não precisa). Não consegui alterar isso pelas ferramentas que tenho.

### 0c. Ciclo e acentos: NÃO executado (bloqueado, 1ª falha inesperada)
- Operação de teste criada (única): **965ceb0d-6097-43f5-b3c2-25a31c0e4e97** (cotação c073079b-e348-4969-a788-7590ad9bf035, observação "TESTE CIOT ..."), `eh_teste = true`, 1 NF-e fictícia (chave com DV válido, CNPJ da RBR como remetente e destinatário), condição de pagamento R$ 8.000 (adiantamento R$ 3.000), cavalo RQW4D58, motorista e cliente RBR só por FK. Nenhuma linha existente foi alterada.
- A função (publicada) respondeu à prévia, 200, ambiente homologação. Nada foi enviado à efrete (a prévia só lê o banco).
- **Bloqueio 1:** o reboque RRD5B39 (único semirreboque de teste) está `aguardando_documentos`; o banco recusa por gatilho (`trg_fn_reboque_exige_aprovado`): "Reboque RRD5B39 ainda não está aprovado". Aprovar exigiria UPDATE em linha existente (proibido).
- **Bloqueio 2:** sem reboque, o piso da ANTT falha: "Sem coeficiente da ANTT para tabela B, Carga Geral, 3 eixos" (tabela B começa em 4 eixos; 3 eixos só existe na A/C, que exigem composição).
- Não contornei nenhuma das duas travas (conservador). Resultado: **ciclo (emitir, consultar, PDF, cancelar, emitir de novo) e teste de acentos: não rodados. Nenhum CIOT, protocolo ou chamada à efrete.**
- **Decisão sua:** (a) autorizar aprovar o semirreboque de teste RRD5B39 (UPDATE de `aprovacao_status` numa linha eh_teste) e então eu insiro o reboque nesta operação e rodo o ciclo; ou (b) cadastrar um semirreboque de teste novo já aprovado.
- Limpeza (não executada, com rollback): `docs/sql/limpeza-operacao-teste-ciot-2026-10-28.sql`.

## Bloco 1: Base (Fase 0): [PR #31](https://github.com/PedroHenriqueRibeiro02101990/rbr-motorista/pull/31) (draft)
Verifiquei antes de escrever: quase tudo já existe.
- Data de nascimento (`pessoas.data_nascimento`) e comprovante de residência (`comprovante_residencia_url/_data`): já no cadastro do motorista (`Cadastros.tsx`). Nada a fazer.
- Lista de NF-e: já existe (`NfesCliente`, `operacao_nfes`).
- Piso ANTT antes de emitir: já é item da conferência do cartão do CIOT (PR #30), vindo da função; bloqueia abaixo do piso com mensagem.
- **Faltava:** tela das datas previstas (`operacoes.coleta_prevista/entrega_prevista`, colunas já existiam). Feito no PR #31: campos na etapa de viagem, validação e 7 testes. Sem migração.

## Bloco 2: Cadeia Cotação → Operação → Fiscal: NÃO implementado
Só levantei o que existe (leitura do código da main), para você priorizar:
- Já existe: tipo de serviço `carga_unica | veiculos_juntos | varias_entregas` (`TipoCotacao.tsx`); N operações ligadas por `grupo_saida_id`; `tomador_papel` na cotação; CFOP 5353/6353 calculado em `emitir-cte/cte.ts`; carta de correção e eventos (`EventoFiscalModal`, `eventos-fiscais`); ZIP no dossiê (`fflate`).
- Não encontrei: "ida e volta"; CFOP 5357 (sem IE) e a conferência do tomador com IE; outra empresa como expedidor/recebedor no CT-e (há menção em `cte.ts`, não confirmei o fluxo todo); NFS-e no lugar do CT-e na mesma cidade (o tipo `nfse` existe; a regra automática eu não validei); parceiro ETC emitindo o próprio CT-e/MDF-e com upload de XML; arrastar notas (XML/PDF/foto/ZIP/chave) com distribuição por caminhão; barras de peso e seguro.
- Por que parei: cada caso mexe em cotação, operação e CT-e ao mesmo tempo e várias peças exigem coluna nova (migração "NÃO APLICADA") e decisão de regra fiscal sua. Sem você acordado, o risco de errar regra fiscal é maior que o ganho.

## Bloco 3: Orquestração e pré-voo: NÃO implementado
- Feito dentro do PR #30 (sem ser a orquestração completa): o CIOT só libera com CT-e e averbação ok ou "não exigido"; o cancelamento do CIOT fica bloqueado com MDF-e existente; rota/notas travadas depois do CT-e **não** foi feito.
- Não implementei os prazos "cancela até 24 h antes do início / encerra em 5 dias": é regra da efrete que eu não confirmei, e travar errado a tela pode impedir um cancelamento legítimo na demonstração. Registrado no checklist de produção como "depende da NSTech".

## Bloco 4: Pagamento e encerramento: NÃO implementado
- Nada de Pix, nenhuma flag nova. A função já tem `encerrar`; tirei o botão do cartão (fora do escopo).

## Bloco 5: [PR #32](https://github.com/PedroHenriqueRibeiro02101990/rbr-motorista/pull/32) (draft): `docs/checklist-producao.md`.

## Tabela de PRs
| Bloco | PR | Testes / checagem | Status |
|---|---|---|---|
| 0 (cartão, preview, /demo-ciot) | [#30](https://github.com/PedroHenriqueRibeiro02101990/rbr-motorista/pull/30) | `tsc -b` sem erro; `node --test` do gestor: 32 de 32 (7 novos em `ciotCartao`); `vite build` com `VITE_DEMO_CIOT=true` ok; `oxlint` só avisos (padrão já existente no repo, nenhum erro) | draft, **ciclo 0c pendente** |
| 1 (datas previstas) | [#31](https://github.com/PedroHenriqueRibeiro02101990/rbr-motorista/pull/31) | `tsc -b` sem erro; `node --test`: 31 de 31 (6 novos) | draft |
| 5 (checklist) | [#32](https://github.com/PedroHenriqueRibeiro02101990/rbr-motorista/pull/32) | só documento | draft |

## Riscos que vi
- Não vi o cartão renderizado num navegador (sem navegador nesta sessão); só `tsc`, testes da lógica e `vite build`. Confira o `/demo-ciot` primeiro: se o visual estiver fora do padrão, é ajuste de classe, a lógica está coberta.
- O preview de #30 depende do login Supabase nas variáveis novas; se ainda falhar, é a URL de redirect do Auth (item "depende de você" acima).
- A operação de teste 965ceb0d foi escrita na base real (autorizado) e está sem reboque; ficou fora de qualquer fluxo da efrete.
- A conferência agrupa os bloqueios da função por texto (regex). Se a função mudar uma mensagem, ela cai em "Outros pontos" em vez de sumir (coberto por teste).

## Roteiro de 10 linhas para a manhã
1. Abra `https://rbr-gestor-git-tela-ciot-homologacao-2026-10-28-rbr4.vercel.app/demo-ciot` (sem login): percorra os 4 estados; em "Antes de emitir" clique em Corrigir ao lado do Pix e depois em Emitir.
2. Em Emitido: Consultar, Baixar PDF, Cancelar (o botão só habilita com 15+ caracteres).
3. Confira a faixa "DEMONSTRAÇÃO: dados fictícios" e o visual contra o padrão do painel.
4. Abra a raiz do preview e faça login como gestor_rbr. Se não entrar, veja o item de Redirect URLs do Auth.
5. Abra a operação 965ceb0d (TESTE CIOT) > etapa CIOT: a conferência deve mostrar o piso da ANTT como pendência (sem reboque).
6. Decida o item 0c (aprovar o semirreboque de teste RRD5B39 ou cadastrar outro): com isso eu rodo o ciclo e o teste de acentos.
7. Leia o PR #31 (datas previstas) e o checklist do PR #32.
8. Só depois do merge do #30, publicar a função `efrete-ciot-operacao` (tabela de pagamentos e ambiente dependem dela).
9. Limpeza da operação de teste, se quiser: `docs/sql/limpeza-operacao-teste-ciot-2026-10-28.sql` (não executada).
10. Blocos 2, 3 e 4: precisam de decisões suas (prioridade fiscal, prazos da efrete); veja as seções acima.
