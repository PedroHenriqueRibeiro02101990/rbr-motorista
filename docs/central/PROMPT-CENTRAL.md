MISSAO: construir a CENTRAL dentro do TMS (app gestor do repositorio rbr-motorista). E uma tela so do Pedro para ligar/desligar os robos, ver limites de uso, aprovar sugestoes e acompanhar listas e IA, mais a FILA DO SDR (quem liga) que o Pedro e o Jose Carlos usam.

O desenho aprovado esta no arquivo preview-painel-central-v8-2026-11-23.html (Pedro vai deixa-lo em docs/central/ do repositorio antes de voce comecar; se nao estiver la, PARE e peca). Ele e a ESPECIFICACAO VISUAL E DE COMPORTAMENTO. Os dados dele sao exemplos; os dados reais vem do banco.

========== REGRAS INVIOLAVEIS ==========
1. Trabalhe numa branch (feat/central-pedro). Abra PR. NAO faca merge, NAO publique em producao.
2. Migrations: escreva como arquivos em supabase-migrations/ e MOSTRE ao Pedro. So aplique no banco depois que ele escrever "pode aplicar" no chat. Nunca altere ou apague dados existentes de prospeccao_* ou leads.
3. NAO mude nenhuma flag de producao. Estado atual que deve continuar: PROSPECCAO_ENVIO_LIBERADO=nao, PROSPECCAO_LEITURA_LIBERADA=nao, PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA=nao, PROSPECCAO_APROVACAO_OBRIGATORIA=sim, PROSPECCAO_MODO_TESTE=sim, PROSPECCAO_UI_LIBERADA=nao, PROSPECCAO_LIMITE_DIARIO=10. A Central so MUDA essas flags quando o Pedro clica, com confirmacao.
4. Nunca coloque senha, token ou chave em codigo, chat, log ou banco em texto aberto. Segredos ficam no Vault/variaveis de ambiente. A Central NUNCA mostra valor de segredo, so "configurado / nao configurado".
5. Nao duplique o que o Radar ja faz. O Radar (prospeccao_*) continua dono de: caixas, conversas, aprovacao de mensagens, respostas da IA, jornada de e-mail. A Central e o painel de CONTROLE e CONFIGURACAO por cima dele. Antes de criar qualquer tabela ou tela, procure se ja existe equivalente e reutilize.
6. Quem ve e altera a Central: somente a pessoa em parametros_sistema.PROSPECCAO_ADMIN_PESSOA_ID (Pedro). Isso vale na tela E no banco (RLS), nao so no menu. A Fila do SDR e vista por Pedro e Jose Carlos.
7. Itens travados (REPOM consulta de tag, REPOM API, encerramento automatico de MDF-e): aparecem na Central como "travado" e NAO tem botao de ligar. Nao mexa em nada de fiscal/Repom.
8. Tudo que a Central alterar grava em auditoria_log (acao, antes, depois, ator) e em central_registro com botao DESFAZER.
9. Conversa com o Pedro em portugues simples, sem termos tecnicos soltos. Quando precisar de decisao dele, pergunte curto.

========== ANTES DE CODAR (leitura, nao escreva nada) ==========
Leia o codigo e o banco para confirmar o que ja existe: telas do Radar no app gestor; as tabelas prospeccao_base, prospeccao_empresas, prospeccao_contatos, prospeccao_modelos, prospeccao_jornada, prospeccao_pesos, prospeccao_respostas_config, prospeccao_sugestoes, prospeccao_experimentos, prospeccao_relatorios, prospeccao_caixas, prospeccao_conversas, prospeccao_emails, prospeccao_mensagens, prospeccao_respostas, prospeccao_bloqueio, prospeccao_buscas_salvas, prospeccao_ia_uso, prospeccao_rampa, prospeccao_envio_diario, prospeccao_estado, prospeccao_avisos, prospeccao_log; a tabela leads (CRM); parametros_sistema; auditoria_log; como o login e a permissao do gestor funcionam. Entregue ao Pedro um RESUMO de 15 linhas: o que sera reaproveitado, o que e novo, o que sera movido de menu. So siga depois do "ok" dele.

========== MODELO DE DADOS NOVO (so o que nao existe) ==========
Prefixo central_. RLS ligado em todas, politica unica por funcao (admin = PROSPECCAO_ADMIN_PESSOA_ID; sdr = admin + Jose Carlos).
- central_robos: id (garimpo_listas, tms, freellm, envio, leitura, resposta_auto, aprovacao, modo_teste...), nome, onde_roda ('pc'|'nuvem'), tipo ('servico'|'agendado'), hora, ligado, travado, ultimo_inicio, ultimo_fim, ultimo_resultado, flag_chave (quando o robo e uma flag de parametros_sistema), atualizado_em.
  Observacao: "Garimpo automatico" e "Central LISTAS" sao o MESMO pipeline: uma linha so (garimpo_listas).
- central_comandos: id, robo_id, comando ('ligar','desligar','rodar','pausar','retomar'), pedido_por, status ('pendente','executando','feito','erro'), resultado, criado_em, feito_em.
- central_heartbeat: maquina, ultimo_batimento, versao_agente, resumo_json. Alerta "atrasado" se passar de 5 min sem batimento.
- central_uso: servico (qev, verifalia, exa, tavily, serper, ia_gratis, claude_noite), periodo ('dia'|'mes'), referencia (data), usado, limite. Limites padrao: QEV 95/dia, Verifalia 24/dia, Exa 900/mes, Tavily 1000/mes, IA gratis 200/dia, Claude 2/noite. Serper sem chave ainda.
- central_registro: id, quando, quem, o_que, antes, depois, desfeito_em. Alimenta a secao Registro de alteracoes com DESFAZER.
- central_sdr_fila: id, empresa_id, contato_id, motivo ('respondeu','nota_alta'), nota, telefone, status ('na_fila','assumido','ligou','sem_resposta','pediu_cotacao','sem_interesse','telefone_errado','encerrado'), assumido_por, assumido_em, resultado_em, observacao, lead_id, criado_em. Indice unico por empresa_id enquanto status aberto (nao duplicar a mesma empresa na fila).
Parametros novos em parametros_sistema (valores iniciais seguros): CENTRAL_UI_LIBERADA=nao, CENTRAL_SDR_CORTE_NOTA=(proponha ao Pedro um valor depois de olhar a distribuicao de prospeccao_base.pontuacao), CENTRAL_SDR_MAX_DIA=10.

========== O AGENTE DO PC (ja existe, voce NAO escreve o agente) ==========
Existe um programa local (Agente RBR) que liga com o Windows e hoje obedece a um arquivo local. Nesta missao voce so deixa o BANCO e a TELA prontos para ele:
- O agente vai usar um login proprio e limitado (nunca a chave de servico). Crie, sob aprovacao do Pedro, o papel "agente" com permissao apenas para: ler/atualizar central_comandos, inserir central_heartbeat e central_uso, atualizar central_robos (ultimo_*), e chamar a funcao central_importar_base(jsonb) que insere/atualiza prospeccao_base (security definer, so colunas conhecidas, sem apagar nada).
- Documente em docs/central/AGENTE-CONTRATO.md o contrato que o agente deve seguir: ler comandos pendentes a cada 30 s, marcar executando/feito/erro, mandar batimento a cada 30 s, reportar uso por servico, e importar a base por RPC. Eu (Claude no chat do Pedro) ajusto o agente a esse contrato depois.

========== TELA CENTRAL (seguir o preview v7; as secoes abaixo viram a MESA DE DESPACHO, ROTA, LIMITES etc. da v7) ==========
1. FAZER AGORA: lista curta de acoes que dependem do Pedro, cada uma com botao de resolver, adiar (snooze) ou ver mais. Origem: sugestoes pendentes, robos com erro, limites perto do fim, batimento atrasado, importacoes prontas.
2. RESULTADOS: cartoes de KPI com veredito contra a meta, funil (base > validados > enviados > respostas > quentes) com o gargalo destacado, projecao de capacidade (dias para esgotar a base com os limites atuais).
3. ROBOS: um cartao por robo com chave liga/desliga de um clique, onde roda (PC/nuvem), ultimo resultado, proxima execucao. Ligar/desligar robo do PC = grava um comando em central_comandos. Robo que e flag de parametros_sistema = atualiza a flag. Para flags de producao (envio, leitura, resposta automatica, aprovacao, modo teste) exigir janela de confirmacao com o EFEITO escrito em portugues simples e registrar em central_registro. Itens travados sem botao.
4. LIMITES DE USO: barra por servico (usado/limite do dia ou mes), limite editavel, aviso quando passar de 80%, projecao de quando acaba.
5. JORNADA DO E-MAIL: reaproveitar prospeccao_jornada, prospeccao_modelos e prospeccao_respostas_config (mostrar e editar AQUI, remover a duplicata do menu do Radar so depois do ok do Pedro). Mostrar prioridade de e-mail por prefixo (contato@ e prioridade 1/fallback; setor como compras@, suprimentos@, logistica@ sobem), regra de descoberta por resposta (se a empresa responde indicando outro e-mail do MESMO dominio, cadastrar sozinho em prospeccao_contatos e registrar; ambiguo vai so para o Pedro), regra de descadastro automatico.
6. RESUMO DO DIA E SUGESTOES: ler prospeccao_sugestoes e prospeccao_relatorios. Cada sugestao so pede APROVAR ou REJEITAR; aprovar aplica a mudanca (e grava no registro com desfazer). Sem pergunta aberta.
7. REGISTRO DE ALTERACOES: central_registro com DESFAZER por linha.
8. EXECUCOES MANUAIS: botoes "rodar agora" para LISTAS e TMS (viram comandos) e log ao vivo das ultimas linhas.
========== DONO UNICO (nada duplicado entre Central e Radar) ==========
Cada funcao tem UM dono. Onde o Radar ja e dono, a Central so mostra um link. Onde a Central passa a ser dona, o Radar mostra so o status e um link para a Central.
RADAR continua dono de: Radar (visao do agente e do dia), Buscar clientes (escolher quais empresas entram na lista), Empresas, Aprovar envios, Caixa de e-mail, respostas e conversas, Mini curso.
CENTRAL passa a ser dona de: ligar/desligar robos e chaves de producao (antes em Ajustes do Radar), limites de uso e do dia, importar a lista para a base do TMS (antes em Buscar clientes), Jornada do e-mail (regras, prioridade, descartes e textos), Relatorios da IA e sugestoes, Fila do SDR, registro de alteracoes.
No Radar: o banner "Importe a base da Receita em Buscar clientes" passa a apontar para a Central (botao "Enviar para a base do TMS"). O cartao "Agente desligado... nos Ajustes" passa a dizer "Ligue na Central" com link. Numeros de respostas, leads quentes e gasto de IA do dia ficam SO no Radar; a Central nao repete (o quarto numero da Central e Leads na fila do SDR).
Dentro da Central tambem nao repetir: cada limite aparece em UM lugar (servicos na secao Limites; o cartao do robo so tem o que e dele); rodar um robo so pelo cartao dele; sugestao so na Mesa; funil so na Rota.

========== MUDANCAS DA V6 (valem acima de tudo) ==========
J. LISTA DE CLIENTES (nova secao, logo abaixo dos KPIs). Pedro NAO quer abrir arquivo nem pasta por fora: tudo se ve e se faz dentro da Central.
 - Cartoes: Contatos achados (destaque, numero grande: e-mails achados e em quantas empresas), Do setor certo, Gerais, Empresas com contato, Telefones validos, Na base do TMS, Esperando envio. Sites achados e o funil ficam SO na Rota (nao repetir). Todos vem de consultas ao banco (prospeccao_base, prospeccao_empresas, prospeccao_contatos), nunca de arquivo.
 - UM BOTAO "Enviar para a base do TMS": abre confirmacao em portugues (quantas empresas e contatos, "nao apaga nada, nao envia e-mail, nao liga robo de envio"), grava um comando 'importar_base' em central_comandos; o agente le o arquivo gerado pela LISTAS no PC e envia em lotes de 5000 pela funcao central_importar_base(jsonb) (upsert por chave da empresa, sem duplicar, sem apagar). A tela mostra progresso por lote, resultado final (enviadas, repetidas, erros) e grava em central_registro com DESFAZER do lote (remove so as linhas daquele lote, identificado por um campo lote_importacao). Marcar o item "Base importada" do pre-voo automaticamente quando prospeccao_base tiver linhas.
 - Chave "Enviar sozinho quando a LISTAS terminar" (desligada por padrao): quando ligada, a conclusao da LISTAS cria o comando importar_base.
 - Aviso na Mesa de despacho ("N empresas da lista ainda nao estao na base do TMS") com botao que dispara o mesmo envio.
 - Tabela de contatos dentro da tela: colunas Empresa, Cidade, Segmento, E-mail achado, Tipo (setor certo/geral), Verificacao (valido/pendente/invalido), Telefone, Nota, Situacao (na lista/na base). Busca e filtros (contato, verificacao, situacao), paginacao no servidor (8 a 25 por pagina), clicar na linha mostra de onde veio o e-mail (pagina do site, data e verificador).
 - Remover da Central qualquer botao "abrir pasta" ou "abrir arquivo". A secao Execucoes manuais vira "Fila do TMS e ao vivo": passos da LISTAS, fila de tarefas do Claude e janela ao vivo, SEM botoes de rodar (rodar um robo e so pelo cartao dele na Mesa; "Rodar de novo" e "Testar agora" ficam em Ajustes do cartao).
K. COMO MEXER NESTE PAINEL (nova secao no fim, recolhida): lista do que Pedro muda sozinho na tela (ligar/desligar, horarios, limites, metas, ordem de preferencia, nota minima do SDR, aprovar sugestoes, enviar a lista) e do que precisa pedir (nova secao, cartao, coluna, texto, cor, filtro, robo); mapa de onde fica cada coisa; e um gerador de PEDIDO DE ALTERACAO (escolhe secao e tipo, escreve o que quer, botao Gerar e Copiar) que monta o texto com as regras fixas (mostrar antes e depois, nao mudar flag de producao, migrations so com "pode aplicar", PR sem merge).
========== MUDANCAS DA V5 (valem acima das descricoes 1 a 8) ==========
A. Identidade RBR: topo azul-marinho #12173D com wordmark (RBR em dourado #B8863B, CARGO menor em branco), faixa dourada embaixo, botoes primarios azul #1E2761 (dourado no tema escuro). Menu fixo com atalhos para as secoes e contador de pendencias. Tema claro/escuro.
B. Tira de KPIs no topo (4 cartoes com veredito, vs media de 7 dias, mini-grafico, por que, o que fazer, meta editavel).
C. MESA DE DESPACHO substitui FAZER AGORA + ROBOS: 4 colunas: Precisa de voce (avisos + sugestoes, com Adiar 1 dia) | Rodando agora | Ligados e agendados | Desligados e travados. O cartao do robo muda de coluna sozinho ao ligar/desligar/rodar. Cada cartao: chave, onde roda (PC/Nuvem), Rodar agora/Pausar, e Ajustes (horario, limites do robo, efeito de ligar/desligar, nome da chave). Robos Repom/MDF-e aparecem travados, sem chave. Garimpo e LISTAS sao UM so cartao ("Garimpo e listas").
D. PRE-VOO DO PRIMEIRO ENVIO (novo): checklist de 7 itens (base importada, textos ativos, diagnostico das caixas, senhas no Vault, SPF/DKIM/DMARC, descadastrar@, travas ligadas) + as duas travas (aprovacao e modo teste). Os robos de enviar e ler NAO ligam enquanto o checklist nao estiver completo; responder sozinho so liga com enviar e ler ligados. Ligar o envio sempre pede confirmacao com o efeito. No sistema real cada item e verificado sozinho (consultas ao banco), nao marcado na mao.
E. ROTA (substitui o funil): estrada de 8 paradas (Base, Site achado, E-mail no site, Setor certo, Verificado, Contatado, Respondeu, Contato certo). Cada trecho colorido pela conversao contra o esperado (verde, dourado, vermelho); o gargalo leva a etiqueta; clicar numa parada mostra por que e o que fazer. Projecao (slider das N% melhores) fica abaixo.
F. LIMITES em medidores semicirculares (usado/limite, restante, limite editavel, bloquear servico). Servico sem chave aparece desabilitado.
G. FILA DO SDR (nova, ver regra SDR deste prompt): lista unica, botao Assumir com escolha Pedro ou Jose Carlos (lead quente sugere Jose Carlos), Devolver, Concluir, Sem interesse; nota minima e maximo por dia editaveis; lead quente sem dono vira aviso urgente na mesa.
H. Jornada do e-mail e Registro de alteracoes (com desfazer) continuam como na v4, recolhidos por padrao, junto com Fila do TMS e ao vivo.
I. Acessibilidade: foco visivel dourado, chaves com aria-label, respeitar prefers-reduced-motion, funcionar no celular sem rolagem lateral.
Seguir visual, textos e comportamento do preview v7 (secoes recolhiveis, severidade, verde/amarelo/vermelho so para estado). Funcionar no celular.

========== FILA DO SDR (quem liga) ==========
Decisao do Pedro: quem liga e o Pedro OU o Jose Carlos. Os pre-vendedores entram em janeiro; deixe a visibilidade por PAPEL para liberar a fila a eles depois sem refazer.
- Fila UNICA com botao ASSUMIR. Quem assume primeiro fica com o contato; o outro ve "assumido por X". Lead quente: Jose Carlos primeiro, Pedro em copia (como ja e no fluxo).
- ENTRA na fila: (a) quem respondeu o e-mail, de qualquer jeito, inclusive "fale com fulano"; (b) empresa com telefone valido e nota >= CENTRAL_SDR_CORTE_NOTA que ainda nao respondeu, limitado a CENTRAL_SDR_MAX_DIA novos por dia.
- NAO entra: quem so abriu o e-mail; pedidos de cotacao que chegam por site ou anuncio (ja tem fluxo no CRM em leads: nao duplicar).
- Cada cartao mostra: empresa, cargo/contato se houver, telefone, motivo de estar na fila, resumo da conversa (resumo_ia), nota e proxima acao sugerida.
- Resultado da ligacao (atendeu, sem resposta, pediu cotacao, sem interesse, telefone errado) atualiza prospeccao_empresas.status e cria/atualiza UM lead em leads (origem 'prospeccao'; se prospeccao_empresas.lead_id ja existe, atualiza esse, nunca cria outro).
- Opt-out e prospeccao_bloqueio sempre vencem: contato bloqueado nunca entra na fila.

========== MUDANCAS DA V8 (valem acima de tudo) ==========
L) PROCESSOS NO PC (nova secao, logo abaixo da Mesa de despacho; ver o cartao "Processos no PC" da v8). Objetivo: Pedro ver tudo da RBR que esta rodando no PC, inclusive .bat/Python em segundo plano que a Central nao iniciou.
 - Agente: a cada 60 s lista os processos do Windows cujo caminho esteja dentro de D:\RBR\Sistema (ou cujo script seja de uma lista branca em configuracao: garimpo, freellm, listas, radar, agente). Grava em central_heartbeat.resumo_json o campo "processos": [{pid, nome, arquivo, inicio (timestamp), memoria_mb, dono}]. dono = nome do robo da Central que o iniciou (o agente sabe porque iniciou) ou "sem dono" se nenhum robo da Central o iniciou.
 - Tela: tabela com Processo, Comecou, Rodando ha, Quem iniciou, botao Encerrar. Mais de 24 h rodando aparece em destaque. Contador "N sem dono" no cabecalho. O proprio agente aparece como "Protegido" (sem botao).
 - Encerrar: confirmacao em portugues (aviso de lote pela metade) e grava um comando 'encerrar_processo' em central_comandos com o pid e o inicio do processo. SEGURANCA: o agente so executa se o pid ainda existir E o horario de inicio bater E o caminho estiver dentro de D:\RBR\Sistema; senao recusa e registra o motivo. Nunca encerra o proprio agente nem programas fora da RBR. Nada de taskkill por nome generico.
 - Registro: cada encerramento entra em central_registro (quem pediu, processo, hora), sem desfazer.
 - Permissao: so o admin (Pedro) ve a secao e cria o comando. RLS igual as outras tabelas da Central.
 - Menu: aba "Processos" ao lado de Despacho, ou dentro da propria Mesa; siga a v8.

========== MENUS ==========
- Grupo "Central" no menu lateral do gestor, abaixo de Inteligencia, atras da flag CENTRAL_UI_LIBERADA (inicia 'nao'): Central (so Pedro) e Fila do SDR (Pedro e Jose Carlos).
- REMOCAO DOS DUPLICADOS (fase F6, so depois do Pedro confirmar que a Central cobre tudo): esconder do menu do Radar, SEM apagar codigo nem dados, Jornada, Relatorios da IA e Ajustes (antes, mover para a Central o que for exclusivo deles), e tirar de Buscar clientes o botao de importar a base. Antes de esconder, mostre ao Pedro uma lista item a item do que existia e onde passou a ficar. Se faltar algo na Central, NAO esconda.

========== FASES (entregue uma por vez, pare e mostre ao Pedro entre elas) ==========
F0 leitura + resumo de 15 linhas.  F1 migrations (arquivos, sem aplicar) + RLS + AGENTE-CONTRATO.md.  F2 depois do "pode aplicar": tela Central (KPIs, Lista de clientes com o botao de envio e a tabela, Mesa de despacho, Limites, Registro).  F3 secoes 5, 6, 8 + comandos.  F4 Fila do SDR.  F5 testes e PR.  F6 depois do ok do Pedro: remover os duplicados do Radar (secao MENUS).

========== TESTES (obrigatorio antes do PR) ==========
- RLS: usuario comum e Jose Carlos NAO conseguem ler central_* nem a tela; Jose Carlos consegue ler/assumir central_sdr_fila; agente so faz o que o papel permite. Mostre as consultas e os resultados.
- Liga/desliga cria comando e o registro tem DESFAZER funcionando.
- Flag de producao pede confirmacao e nao muda sem ela.
- Duas pessoas assumindo o mesmo contato: so a primeira vence.
- Contato bloqueado nao entra na fila; empresa duplicada nao entra duas vezes.
- Nenhum segredo aparece na tela, no log ou no PR.
- Tela abre no celular e no computador sem erro no console.

========== ENTREGA ==========
PR com: resumo em portugues simples do que mudou, lista de migrations (nao aplicadas ate o ok), capturas de tela, resultado dos testes, e a lista do que ficou duplicado para decidir. Termine com: "Pedro, falta voce dizer: (1) pode aplicar as migrations? (2) quer remover os menus duplicados do Radar?".
