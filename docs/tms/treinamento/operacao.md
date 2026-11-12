# Treinamento · Operação

**Público:** papel `operacao` e gestor. **Pré-requisitos:** noções de esteira (03) e cadastros aprovados. Exercícios na **operação DEMO** (marcada `modo_demonstracao`); nunca em operação real.

## Sessão 1 · Fila e visão da operação (35 min)
**Objetivo:** achar o que fazer e ler a operação.
1. Início da operação mostra "Para assumir", "Devolvidas", "Em viagem", "Para finalizar".
2. **Serviços** (`/servicos`) lista o que anda, por etapa, com o próximo passo e quem faz. O botão **Assumir** da lista aparece desativado; o assumir real é pela tela da operação (RPC `assumir_operacao`, **a confirmar o botão**).
3. **Operações** (`/operacoes`): abra uma operação e percorra as abas **Resumo**, **NF-e e documentos fiscais**, **Motorista e veículo**, **Financeiro**, **Histórico**.
**Exercício (DEMO):** abra a operação DEMO e leia o histórico.
**Erros comuns:** procurar ação na aba errada.
**Sei fazer:** [ ] filtrar operações [ ] navegar as 5 abas.

## Sessão 2 · Alocar motorista e veículo (40 min)
1. Na aba **Motorista e veículo**, escolha motorista e cavalo (e reboques). O painel avisa CRLV, RNTRC, tara, eixos, UF de licenciamento e titular.
2. Ao alocar veículo e motorista a operação passa sozinha a **aguardando liberação fiscal**.
3. Só motorista com cadastro aprovado e termo aceito aloca (triggers `trg_operacao_exige_aprovados`, `trg_exigir_aceite_na_alocacao`).
**Exercício (DEMO):** aloque e veja a mudança de status.
**Erros comuns:** motorista suspenso ou com RNTRC vencido; CRLV sem tara.
**Sei fazer:** [ ] alocar [ ] ler os alertas.

## Sessão 3 · Acompanhar, entregar e finalizar (35 min)
1. Liberação para coleta é do gestor (docs conferidos, condição de pagamento).
2. Motorista avança carregando → em trânsito → entregue no app.
3. **Finalizar viagem** inicia a finalização; **Avisos** informa operação em finalização.
**Ainda não disponível:** link de acompanhamento do cliente e aviso por e-mail.
**Sei fazer:** [ ] acompanhar status [ ] finalizar.
