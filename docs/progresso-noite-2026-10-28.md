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

