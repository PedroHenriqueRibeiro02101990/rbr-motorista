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
