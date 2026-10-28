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
