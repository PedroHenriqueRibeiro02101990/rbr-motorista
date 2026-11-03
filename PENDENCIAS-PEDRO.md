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

## Rodada 4: prints por papel contra os PNGs (nao testado no preview da Vercel)

Como foi feito: o preview da Vercel pede login da Vercel, entao os prints sairam do mesmo codigo da branch rodando local (vite), 1280x800, com as contas teste.operacao, teste.fiscal, teste.comercial e teste.financeiro. As senhas foram lidas so na memoria do script; nada foi gravado nem commitado. Prints ficam fora do repositorio (pasta temporaria). Nenhuma escrita no banco: so telas de leitura. Nao ha conta de teste de gestor, entao as telas so do gestor nao foram vistas.

### Bug achado e corrigido pelos prints
- A tela /fiscal abria em BRANCO (erro "opAbertaId before initialization"), introduzido por mim na fila do Fiscal. Corrigido no commit 8ae94e2. Os deploys anteriores da branch com essa tela estavam quebrados para o fiscal.

### Diferencas por tela (real x PNG)
Gerais, em todas as telas: o app tem barra de busca e sino no topo e, no rodape do menu, "Entrar com digital ou rosto" e "Sair" (existem no sistema, nao estao nos PNGs). Nomes das contas de teste aparecem como "TESTE". Os PNGs usam numeros e pessoas de exemplo; o banco de teste esta quase vazio, entao varias listas aparecem vazias. Mapa e real (OpenStreetMap), nao o desenho.

- Inicio Operacao (Inicio-Operacao): estrutura igual (4 numeros, mapa, Precisa de voce, Para completar). Falta o 4o cartao "Suas metas" (metas ainda nao definidas). Precisa de voce vazio por falta de dado. PARCIAL.
- Operacoes da operacao (Operacao-Fila): NAO IGUAL. /operacoes ainda e a tela antiga ("Operacoes", filtros, "O que fazer agora"). O desenho e a lista em Servicos com seletor Cotacao/Operacao/Fiscal, chips Para assumir/Minhas/Devolvidas/No fiscal e colunas Veiculo, Coleta, Gerada por, Esperando e botao Assumir. Nao corrigido (fila nova so existe no codigo de Servicos, nao nesta rota).
- Servicos da operacao (Operacao-Fila): mostra a lista geral com esteira e "Novos pedidos/Lista/Funil", nao o seletor Cotacao/Operacao/Fiscal nem os chips de fila. PARCIAL.
- Fiscal fila (Fiscal-Fila): estrutura diferente. Titulo "Fiscal" (desenho: "Servicos" com seletor), painel extra "O que fazer agora" com 60 pendencias, colunas Situacao/Coleta/Documentos (desenho: Gerou/Alocou, Coleta, Pre-voo), sem o botao trancado "outro emite". Aparece o erro "Nenhuma configuracao fiscal encontrada (parametros_fiscais)" para a conta fiscal de teste: conferir RLS ou dado. PARCIAL.
- Inicio Fiscal (Inicio-Fiscal): igual em estrutura (3 numeros, Prontas para emitir, Em emissao, mapa, metas). Metas sem definicao e "sem data de coleta" onde o desenho tem horarios. PARCIAL (quase igual).
- Inicio Comercial (Vendedor-Inicio): igual em estrutura. Meta do mes sem barra (sem meta definida), "Minhas operacoes" vazio, sem o trecho "Faltam R$ para a meta". PARCIAL (quase igual).
- Meus clientes (Meus-Clientes): igual em estrutura e textos; carteira vazia (a cotacao nao guarda vendedor). IGUAL na estrutura.
- Cotacao do comercial (Vendedor-Cotacao): /cotacao abre a lista "Cotacao & Funil" antiga. A tela do desenho (edicao com preco e qualidade) so aparece ao abrir uma cotacao; nao criei cotacao de teste para nao gravar no banco. NAO VERIFICADO.
- Financeiro: sem visual aprovado; nao comparado.
- Nao capturados (exigem dados ou acoes que gravam): cotacao por dentro, detalhe da operacao e cartoes, Gerar operacao, cancelar em passos, escolher motorista, lote, telas do gestor.

### Avisos do console (conta fiscal)
- 4 respostas 400 do banco ao abrir /fiscal e aviso React "duas criancas com a mesma key". Investigar na proxima rodada.

### Proximo passo sugerido (aguarda sua ordem)
- Trazer a fila de Operacao-Fila para a rota que a operacao usa (hoje /operacoes) ou apontar o menu para Servicos com o seletor Cotacao/Operacao/Fiscal.
- Alinhar colunas da fila do Fiscal ao desenho (Gerou/Alocou, Pre-voo, "outro emite").

## Rodada 5: ordem "so local" e portao do merge

### So local (NAO enviado ao GitHub, por ordem sua de economizar deploys)
- 7020a17 pendencias da Operacao recolhidas
- a5d9206 fila da Operacao no visual aprovado (Servicos, seletor Cotacao/Operacao/Fiscal, chips, colunas Cliente e rota/Veiculo/Coleta/Gerada por/Esperando, Assumir)
- 17981d0 fila do Fiscal no visual aprovado (Servicos, chips, Gerou/alocou, Pre-voo; painel de parametros so aparece em /fiscal?parametros=1)
- (este arquivo e commitado so local junto com eles)
Quando voce liberar: um unico `git push origin feat/front-aprovado`, depois o merge. Build limpo, lint sem erros, 128 testes passando, nenhum arquivo de migracao nem de banco no diff contra a main.

### Portao do merge: NAO atendido, entao NAO fiz merge nem producao
Voce autorizou o merge so se todas as telas ficarem iguais aos PNGs. Hoje nao estao:
- Telas do gestor (Inicio, Servicos, Funil, Cotacao por dentro, Equipe, Fiscal por dentro etc.) nao foram vistas no navegador: nao existe conta de teste de gestor. Nao posso afirmar que estao iguais.
- Cotacao por dentro (Vendedor-Cotacao), detalhe da operacao, Gerar operacao, cancelar, lote e escolher motorista: exigem dados ou acoes que gravam no banco; nao verificadas no navegador.
- Inicio da operacao: falta o cartao "Suas metas" (metas sem definicao: deveria aparecer desativado). Fila da Operacao e do Fiscal ainda sem as colunas/filtros que dependem de banco (Gerada por, Gerou/alocou, Minhas, Aguardando alteracao, Cancelamentos): ficam desativados como voce mandou.
- Tela sem dados no banco de teste nao conta como diferente (sua regra). Contei so estrutura e textos.
Para fechar o portao: criar uma conta de teste de gestor (mudanca no banco, so com sua ordem) ou voce conferir o preview das telas do gestor e me dizer se estao iguais.

### Rollback pronto (producao)
- Producao atual: dpl_CtPQ5CNwwPTuL2KcUSEuiHAYgYDW (commit 792859f, READY, candidato a rollback).
- Anterior: dpl_FrtnbBDhFG4hN4kt14jMitq58fRq (commit c90f1d5, READY, candidato a rollback).
- Se o front quebrar apos o merge: promover o deploy de producao anterior ao merge (o 792859f acima) no painel da Vercel ou com `request_rollback`. Nada disso foi usado.
- Depois do merge: confirmar deploy de producao READY e testar por papel (operacao, fiscal, comercial, financeiro) sem gravar nada e sem tocar nas contas de teste.

## Rodada 6: conta de gestor de teste e prints do gestor (merge NAO feito)

### Conta criada (para voce apagar depois)
- Login: teste.gestor@rbrcargo.invalid, papel gestor_rbr, nome "TESTE gestor", CPF ficticio 91000000005. Criada no banco de producao com sua ordem, copiando o formato das outras contas de teste. A senha e aleatoria e existe SO na variavel de ambiente do Windows RBR_TESTE_GESTOR_SENHA (nao esta em arquivo nem no git). O cadastro por e-mail recusa o dominio .invalid, por isso a conta foi inserida direto nas tabelas auth.users, auth.identities e pessoas.
- Para apagar (so com sua ordem): remover a linha de pessoas com esse e-mail, depois as linhas de auth.identities e auth.users desse usuario, e `reg delete HKCU\Environment /v RBR_TESTE_GESTOR_SENHA`.
- Nos prints so naveguei e fotografei: nao cliquei em emitir, cancelar, pagar, enviar, salvar nem assumir. Cliquei apenas em Funil (troca de visao) e abri a primeira cotacao e a primeira operacao para ver o painel.

### Feito nesta rodada (so local, ainda sem push)
- Cartao "Suas metas" desativado no Inicio da operacao (5b2b8e4).
- Inicio do gestor: troquei Coletas/Entregas hoje por "Margem do mes" (media ponderada das cotacoes convertidas no mes, so leitura) e dois cartoes de meta desativados (80447b7).
- Build limpo e lint sem erros apos cada commit. Nenhum arquivo de migracao no diff.

### Telas do gestor: divergencias que bloqueiam o merge
- Cotacao por dentro (Cotacao-Formal, Margem): o desenho e uma pagina com cartoes Cliente e carga / Rota / Prazo de pagamento e o painel Preco ao lado. O app abre um painel sobreposto "Editar cotacao" com o formulario antigo; o cartao de Preco e o "Para enviar a cotacao" ja estao iguais, mas a coluna da esquerda NAO. Reescrever o formulario (cerca de 4.900 linhas) fica fora do que cabe sem risco de quebrar a gravacao. NAO IGUAL.
- Cadastros > Equipe (Equipe-Funcoes): o desenho tem so as abas Clientes/Motoristas/Veiculos/Equipe e a coluna "Autonomia de preco"; o app tem mais abas (Aprovacoes, Agenciadores, Fornecedores, Transportadoras, Gestao de contatos), o painel "O que fazer agora" e nao tem a coluna de autonomia. NAO IGUAL (as abas extras sao funcoes reais).
- Inicio do gestor (Inicio-Gestor): agora com margem e metas desativadas, mas ainda tem o seletor Geral/Comercial/Operacao/Fiscal/Financeiro e "Resumo do dia com IA", e faltam o selo de contagem no sino e o texto "Voce ve a empresa toda e as metas de cada area". PARCIAL.
- Funil (Funil): cartoes com o mesmo conteudo, mas o desenho limita 2 cartoes por coluna com "+ N cotacoes", avatar do vendedor (sem dado) e colunas mais largas. PARCIAL.
- Servicos do gestor (Servicos.png): o PNG mostra o painel lateral do Fiscal (Homologacao, esteira, Vale-pedagio), nao a lista; a lista do app segue o Gestor-Equipe. NAO VERIFICADO contra um painel igual.
- Detalhe da operacao (Operacao-Servico): painel com abas e os cartoes novos (Motorista e veiculo, Carga, GR e aceites) presentes; o desenho e uma pagina em 3 colunas com a faixa "Para ir ao fiscal" de 11 itens e rodape com Salvar/Pedir alteracao/Pronta para o fiscal. NAO IGUAL.
- Nao capturados por exigirem dado ou acao que grava: Gerar operacao, cancelar, escolher motorista, lote, proposta, aceite, aprovacao de preco.

### Decisao
Como telas verificaveis divergem (cotacao por dentro, equipe, detalhe da operacao), NAO fiz push nem merge, e nada foi para producao. Rollback segue pronto (producao atual dpl_CtPQ5CNwwPTuL2KcUSEuiHAYgYDW, commit 792859f; anterior dpl_FrtnbBDhFG4hN4kt14jMitq58fRq).
Commits so locais agora: a5d9206, 7020a17, 17981d0, 5b2b8e4, 80447b7 e os de documentacao.

## Rodada 7: cotacao por dentro como pagina (so local)
- A cotacao aberta deixou de ser um painel sobreposto com fundo desfocado: agora e uma pagina ao lado do menu (PainelSobreposto com a opcao `pagina`, usada so na Cotacao). O formulario, os botoes e toda a gravacao ficaram exatamente como estavam; so mudou a moldura (sem escurecer o fundo, sem cartao flutuante).
- Verificado no navegador so com uma cotacao ja convertida (leitura): o cartao de Preco e o "Para enviar a cotacao" aparecem ao lado do menu. A coluna da esquerda desse caso e o resumo de conversao; NAO conferi uma cotacao em rascunho/enviada (exigiria criar uma). Os cartoes Cliente e carga / Rota / Prazo de pagamento do desenho continuam sendo o formulario antigo, nao cartoes novos. Segue PARCIAL.
- Build limpo, lint sem erros, 128 testes passando. Nada de push, merge, deploy, migracao ou mudanca de banco; emitir-cte e emitir-mdfe intocados.
- Backup do banco: nao existe script no repositorio (so scripts/deploy-functions.js). Nada foi criado. Docs citam um dump manual de 30/10 e plano sem PITR.
