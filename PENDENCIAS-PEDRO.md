# Pendências para o Pedro (front aprovado)

Branch: feat/front-aprovado (nunca main). Decisões e dúvidas anotadas aqui; nada trava a execução.

## Decisões que dependem de você
- Pedido de aprovação de preço (visual Aprovacao-Preco): não existe tabela nem regra no banco. A tela aparece desativada ("ainda não disponível"). Para ligar, é preciso criar a tabela de pedidos e mensagens (migração aditiva, com a sua autorização).
- Vendedor da cotação: a cotação não guarda quem é o vendedor. Colunas, filtros "Minhas/Equipe/Por vendedor" e avatares ficam desativados.
- Autonomia de preço (Novo/Intermediário/Sênior): sem dado; elemento desativado "ainda não disponível".
- Selo "Homologação · nenhum documento real": não foi posto, seria falso (operação de teste emite documento real na SEFAZ).
- Faixas de margem 29% e 32% do desenho valem só para a cor; a faixa de gravação do banco continua 26%–40%.
- Contato de quem recebe a carga: a cotação não guarda nome/e-mail/WhatsApp de aviso; campos desativados.

- Prazos de desfazer (visual Fiscal-Desfazer): MDF-e 24h, CIOT 24h antes da saída, vale-pedágio 15 dias, CT-e 7 dias etc. entraram só como texto de consulta, copiados do desenho. Conferir com a regra fiscal oficial antes de virarem trava.
- Cancelar operação inteira (visual Operacao-Cancelar): a tela existente foi mantida; o desenho prevê passo a passo com "pode cancelar / cancela e confere" e "o que mais acontece". Falta decidir se vira lógica nova.

## Resumo final do front aprovado (branch feat/front-aprovado, sem merge e sem mexer em producao)

Previa: https://rbr-gestor-git-feat-front-aprovado-rbr4.vercel.app (pede login da Vercel). Nada foi aberto no navegador (playwright nao esta instalado aqui): so `npm run build`, lint e 128 testes.

### Telas feitas (apresentacao nova, logica intacta)
Menu lateral por funcao (gestor, operacao, fiscal, comercial) e barra superior com busca, sino com painel e avatar; Inicio do gestor (com fila de liberar ordem), da operacao, do fiscal e do comercial; Servicos (lista, funil, novos pedidos, margem, esteira, para onde vai o dinheiro); Cotacao (passos, preco, validade, historico, quem recebe, pronto para enviar, visao do vendedor sem margem); Operacoes (fila em tabela, assumir, esteira e resumo, devolvida, liberar caminhao, ocorrencia em rota, finalizar); Alocar motorista (tabela); Fiscal (fila, esteira de emissao, o que deu errado, desfazer e prazos, troca de motorista e veiculo); Saude fiscal; Central de avisos (com regras de quem recebe); Busca (com niveis); Aceite do cliente no celular; Equipe, Convidar pessoa e painel da pessoa; Meus clientes; Relatorio comercial; Alteracoes depois do aceite; Jornada da operacao; barra de baixo do vendedor no celular.

### Telas parciais ou com elementos desativados ("ainda nao disponivel")
Aprovacao de preco (pedido e conversa), Enviar proposta por e-mail e PDF da proposta, Novos pedidos por canal, autonomia de preco, convite de funcionario e SMTP, link de acompanhamento do cliente (Cliente.png), avisos por e-mail ao embarcador, pedido de alteracao, canal no relatorio, colunas de vendedor.
Nao refeitas por dentro: Operacao-Servico (cartoes Motorista e veiculo / GR e aceites / Coleta e contatos / Carga), Gerar operacao com checklist 7 de 8 (Checklist-Operacao), Operacao-Lote, Cancelar operacao inteira em passos, tela Escolher motorista com "Escolher e Enviar frete", Gestor-Equipe (painel Equipe no mes).

### Decisoes que dependem de voce
Ver a lista acima, mais: (1) quer criar as tabelas de pedido de aprovacao de preco, pedidos por canal e vendedor da cotacao? (2) confirmar os prazos de desfazer antes de virarem trava; (3) a margem em numero ainda aparece no formulario antigo da cotacao para qualquer funcao; so o cartao novo respeita a visao do vendedor (RLS do banco continua sendo a regra de dados).

### Verificacao do deploy (Vercel)
Ultimo deploy do gestor com codigo novo: commit e37e24e, estado READY (rbr-gestor-ez79fr5jv-rbr4.vercel.app). O commit 54bdd39 so mudou documentacao, entao a Vercel nao gerou deploy novo para ele (CANCELED e esperado). O deploy 864e49d deu ERROR (tipo do papel comercial) e foi corrigido em e3c13fa, que ficou READY. Link da branch: https://rbr-gestor-git-feat-front-aprovado-rbr4.vercel.app (pede login da Vercel).

## Rodada 3 (passos 1 a 4)

### Feito
- Passo 1: o vendedor nao ve custo, lucro nem margem em numero no formulario da cotacao (frete, imposto, giro, resumo, margem por destino, lista, "pronto para enviar", janela de converter). Ele ve so a qualidade do preco (Bom, Medio, No limite). Gestor continua vendo tudo.
- Passo 2: cartoes da operacao (Motorista e veiculo, GR e aceites, Carga) e Gerar operacao com o painel "Antes de gerar" (8 itens). O painel so informa: a conversao nao trava por ele.
- Passo 3: Cancelar operacao em passos (mesma logica, nova apresentacao), Escolher motorista com "Escolher" e "Enviar frete ao motorista" (usa o mesmo aviso por WhatsApp de antes), painel "Equipe no mes", Lote de viagens (/operacoes/lote/:cotacaoId, com link no detalhe da operacao).
- Ultimo deploy do gestor: commit 3a51d00, READY (rbr-gestor-gn7swz5in-rbr4.vercel.app). Link da branch: https://rbr-gestor-git-feat-front-aprovado-rbr4.vercel.app (pede login da Vercel).

### Travou (Passo 4, prints com playwright)
- Playwright e Chromium foram instalados fora do repositorio (pasta temporaria) e o app local subiu. Para entrar com as contas teste.papel@rbrcargo.invalid era preciso ler o arquivo docs-privado/contas-teste.txt, e o sistema de permissoes negou essa leitura. Nao contornei. Nenhum print foi tirado e nenhuma tela foi comparada com os PNGs no navegador.
- Para destravar: voce libera a leitura desse arquivo para o comando de teste, ou roda `! npx playwright test` com as senhas por variavel de ambiente (sem gravar em arquivo).

### Ainda desativado (falta dado)
- Gerar operacao: contato na coleta, quem recebe, janela de coleta, aceite do cliente, exigencias e agendamento no destino nao sao guardados na cotacao. Aparecem como pendentes "ainda nao disponivel".
- Cartao da operacao: botao Trocar (a troca fica no painel do Fiscal) e aceite do contrato por operacao.
- Equipe no mes: valor, margem e meta por vendedor, e Transferir cotacao (a cotacao nao guarda o vendedor).
- Lote: "Alocar varios motoristas" e "Assumir o lote" (hoje cada viagem e assumida na sua operacao).
- Escolher motorista: filtros Disponiveis, Perto da coleta e Com rastreador, "Cadastrar motorista agora" e "Convidar por link".

### Decisoes suas
- Quer que o checklist "Antes de gerar" passe a travar o botao pelos itens obrigatorios (como no desenho)? Isso exige guardar contatos, janelas e aceite na cotacao (mudanca no banco, so com sua ordem).
- Progresso do Lote: hoje conta documentos exigidos ja cumpridos. Confirmar se e essa a regra do "11 itens".
