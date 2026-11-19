# Relatório da madrugada: Radar de prospecção (19/11/2026)

Branch: `feat/radar-prospeccao-2026-11-19` (criada de `origin/main`, porque `main` está em uso por outro worktree: `rbr-motorista-repom`).
Protótipo copiado para `docs/prototipos/radar-v5.html`.

## BLOQUEIO GERAL: sem acesso ao Supabase nesta sessão
A sessão não tem nenhuma ferramenta de banco (o conector "claude.ai Supabase" existe na conta, mas não foi carregado aqui; não há `supabase` CLI nem `psql`, nem token no ambiente).
Consequências, valendo para todos os itens abaixo:
- **Nenhuma migração foi aplicada.** O SQL e o rollback estão prontos e revisados em `supabase/migrations/20261119-0100-radar-modulo.sql` e `supabase/rollback/rollback-20261119-0100-radar-modulo.sql`.
- **Nenhuma edge function foi publicada** (a publicação também exige acesso ao projeto). O código das `prospeccao-*` está corrigido no repositório.
- `get_advisors` não pôde ser rodado; a checagem de segurança foi feita por leitura do SQL (seção R12).
- As telas tratam tabela ausente com estado vazio claro ("o banco ainda não recebeu a migração do Radar").
- Não foi possível conferir o que está de fato aplicado (prompt cita só parte_a e parte_b). As migrações 1200 a 1410 em `supabase-migrations/` precisam estar aplicadas antes da do Radar.

## R0. Levantamento
- **PRs**: #81 (`feat/prospeccao`, aberto, primeira versão) e #83 (`feat/prospeccao-noite`, aberto, noite de 16/11: robôs por caixa, caixa de entrada, agente de IA, painel). Nenhum mesclado: `main` não tinha código de prospecção.
- **Aproveitado**: `git merge feat/prospeccao-noite` na minha branch (limpo, sem conflito). Isso traz 56 arquivos: 8 migrações (`supabase-migrations/20261116-*`), rollbacks, 5 edge functions (`prospeccao-enviar`, `-ler`, `-agente`, `-analista`, `-diagnostico-caixa`), regras puras em `_shared`, telas antigas em `gestor/src/components/prospeccao/` e `gestor/src/pages/Prospeccao.tsx`, `agendar-robos.sql`, `agendar-agente.sql`. O PR #83 precisa ser fechado como "substituído" quando o do Radar mesclar (ele contém os mesmos commits).
- **Stack do gestor**: Vite + React 19 + react-router 7 + Tailwind 4 + supabase-js; testes com `node --test` (TypeScript direto, sem biblioteca); lint `oxlint`; build `tsc -b && vite build`.
- **Flags**: lidas de `parametros_sistema` (`lerFlag` em `gestor/src/lib/prospeccaoDb.ts`). Usuário do Pedro: parâmetro `PROSPECCAO_ADMIN_PESSOA_ID` + função SQL `prospeccao_eh_pedro()`.
- **Tabelas existentes**: `prospeccao_pesos, _empresas, _contatos, _mensagens, _respostas, _bloqueio, _envio_diario, _estado, _rampa, _modelos, _jornada, _log, _destinos_teste, _caixas, _caixa_diagnostico, _conversas, _emails, _ia_uso, _relatorios, _experimentos, _avisos`.
- **Segredos**: nomes `PROSPECCAO_*` no Vault (valor PREENCHER). Não toquei.

## R1. Pendências antigas do banco e dos robôs
- "where true" no gatilho de pesos e os 10 domínios públicos no bloqueio: **já estavam na migração `20261116-1200-prospeccao-ajustes.sql`** (feita na noite de 16/11) e há teste que confere a lista contra `PROVEDORES_GRATUITOS`. Nada novo a escrever; precisa apenas estar aplicada.
- Caixas: `prospeccao_caixas` **já existe** (migração 1350) com pedro@ = agente_1, comercial@ = agente_2, operacional@ = reserva inativa. Não recriei.
- **Revisão de `prospeccao-enviar` e `prospeccao-ler` contra as regras decididas** (lida no código, regra por regra):
  - janela seg a sex 7h às 18h em São Paulo, fora de feriado: `dentroDaJanelaEnvio` (OK, já coberto por teste);
  - intervalo aleatório 8 a 25 min: `intervaloEntreEnviosMin` + intervalo por caixa (OK);
  - rampa 10/15/20/30 com teto 100: semente `prospeccao_rampa` (1,10),(6,15),(11,20),(16,30) e `TETO_ABSOLUTO_DIA = 100` (OK);
  - texto puro (sem HTML, sem rastreador), Message-ID próprio reservado antes do SMTP, `List-Unsubscribe` (OK);
  - modo teste só para `prospeccao_destinos_teste` com `[TESTE]` no assunto: feito dentro de `enviarEmail` (OK);
  - leitor ignora e-mails não relacionados (`classificarRelevancia`); copia a caixa inteira só se `modo_caixa_completa` (OK);
  - paradas automáticas (3 devoluções/dia, 1 reclamação, >5% nos últimos 40 com mínimo de 20 envios, erro SMTP de bloqueio, aviso da Hostinger): `motivoParadaAutomatica` (OK).
  - **Faltava e foi corrigido**: (1) o leitor só conhecia 8 classes; agora conhece também `regiao`, `veiculos` e `seguro` (palavras-chave + lista da IA), com teste; cotação e preço ganham das novas classes e reclamação ganha de todas; (2) `PROSPECCAO_CAIXA_ESCOPO` (`tudo` sincroniza a caixa inteira; o padrão `prospeccao` não muda nada); (3) o leitor passa a espelhar cada e-mail em `prospeccao_caixa_mensagens` (melhor esforço, não derruba a leitura).
  - Classes novas caem no caminho padrão do leitor (viram "precisa de você" com rascunho). O envio de resposta automática dessas classes depende da config da Jornada e continua travado por `RESPOSTA_AUTOMATICA_LIBERADA = nao`.

## Itens

### R2. Módulo e navegação (concluído no código)
- Rota `/radar/*`, **fora** do `AppShell` (tela própria, com menu lateral próprio e botão "Voltar ao gestor"). `/prospeccao` redireciona para `/radar`. O item do menu do gestor agora é "Radar" (ou "Radar (em teste)").
- Menu em 3 grupos (Operação, Inteligência, Sistema) como no protótipo; badges: Aprovar = rascunhos (`prospeccao_mensagens` em rascunho), Caixa = não lidas da Entrada. Atualizam a cada 60 s.
- Visibilidade (`visibilidadeRadar`, testada): flag `PROSPECCAO_UI_LIBERADA = nao` → só o usuário do Pedro (`prospeccao_eh_pedro()`), com selo "Em teste: só você vê"; `sim` → todo `gestor_rbr`; outro papel nunca.
- Visual: o CSS do protótipo foi gerado por script (`radar.css`, tudo sob `.rdr`, tema claro) + `radar-extra.css`; fontes Archivo e JetBrains Mono adicionadas ao `index.html`. Celular (< 1000 px): menu vira grade de ícones no topo.
- Rodapé: "Modo teste / Envio desligado" lido das flags reais.
- **Ver com exemplos** (só com `ENVIO_LIBERADO` ≠ sim): carrega os dados do protótipo só na tela, com a faixa "Exemplo: nada disto está no banco"; nada é gravado.
- Arquivos: `gestor/src/radar/{RadarApp,ui,useRadarAcesso,exemplos}.ts(x)`, `App.tsx`, `AppShell.tsx`, `index.html`.

### R3. Aba Radar (concluído)
Hero com totais reais (empresas, prontas = faixa A com e-mail válido ainda sem contato, em sequência, respostas hoje, quentes, IA hoje x teto R$ 3); cartão "Agente trabalhando" com altura fixa, última atividade real do `prospeccao_log`, atualizando a cada 20 s (o projeto não usava realtime do Supabase nos robôs; usei o intervalo), "Agente desligado" com o motivo quando as chaves estão em não ou há parada; "Hoje" com a origem do limite (parâmetro, rampa ou teto 100); "Precisa de você" com atalhos; registro recente.

### R4. Buscar clientes (concluído no código; banco pendente)
- Tabela `prospeccao_base` (28 colunas do CSV + `cnpj`, `restricao`, `importado_em`, `ja_na_lista`), RLS só `gestor_rbr` (somente leitura direta; escrita só pelas funções), índices pedidos; `prospeccao_buscas_salvas`.
- RPCs `security definer` (checam `gestor_rbr`, sem service_role no navegador): `radar_importar_base` (upsert por CNPJ, lotes de até 1000; conta novos/atualizados/ignorados), `radar_buscar_base` (paginada, 50 por página, ordenada por prioridade e distância), `radar_contagem_segmentos`, `radar_mandar_para_lista`.
- Importador no botão "Importar base da Receita": lê o CSV no navegador (`;`, BOM), blocos de 500, barra de progresso, aceita vários arquivos (`rbr-gigantes-validadas.csv` marca `gigante = sim` pelo nome), grava `prospeccao_base_importada` na `auditoria_log`. MEI, CNPJ inválido, repetido ou sem razão social são ignorados.
- Filtros iguais ao protótipo: raio até 150 km a partir de São Paulo capital (o único ponto de partida que a base tem), 18 segmentos com contagem real, porte (Gigantes desligado), só com e-mail, só domínio validado, só quem nunca recebeu, busca por nome/cidade/CNAE, buscas salvas, KPIs, seleção em massa com "Mandar para a lista", "Mandar para o agente" (já `qualificado`) e "Exportar" (CSV da seleção). Restrição (químico, fertilizante, medicamento, cosmético) aparece como chip, nunca exclui.
- Mandar para a lista: cria `prospeccao_empresas` + `prospeccao_contatos` com origem "base Receita importada em dd/mm/aaaa"; não duplica por CNPJ nem e-mail; respeita `prospeccao_bloqueio`.
- CHECK de segmentos ampliado para 18 (os 5 antigos continuam válidos).
- **Decisão que precisa do Pedro (nota das empresas da base):** a base da Receita não tem funcionários (20 pontos) nem vários outros critérios. `radar_criterios_da_base` preenche só o que tem dado real (segmento, e-mail de logística, porte, distância, CNPJ com mais de 3 anos, telefone, site) e **nada é inventado**; a nota máxima fica em 44 (faixa C), e o agente só escreve para faixa A e B. Ou seja, empresas mandadas da base **não gerarão rascunho** até haver enriquecimento ou uma regra nova (por exemplo usar a `prioridade` do script). Não mexi nos pesos nem na regra de faixa.
- Segmento do texto: o banco converte `segmento_rbr` em slug por palavras-chave (`radar_segmento_slug`); texto que não casa com nenhum dos 18 entra em "sem segmento" e não vai para a lista.

### R5. Empresas (concluído)
Etapas clicáveis com contagem real (Todas, Nova, Em sequência, Respondeu, Quente, Cliente, Repouso, Bloqueada); tabela com etapa em chip, toque atual (maior toque enviado), próxima ação (regra em `proximaAcaoEmpresa`) e nota; busca e filtro por segmento; gaveta com nota em anel, "por que a nota" (critérios x pesos reais), dados da Receita, contatos com validação, linha do tempo (mensagens, respostas), e ações: Abrir conversa, Mandar para o agente, Bloquear (confirmação), Converter em lead (mesmo caminho da tela antiga: cria lead com origem `prospeccao`). Status `cliente` adicionado ao CHECK. No celular a gaveta abre em tela cheia.

### R6. Aprovar envios (concluído)
Faixa explicativa; lista dos rascunhos com risco; e-mail montado (De, Para, Assunto, Quando, corpo, "por que esta empresa", checagens sem preço, sem prazo, fora do bloqueio). **Regra de risco** (`riscoEnvio`): baixo quando faixa A + e-mail de setor + até 100 km + segmento que já teve envio + sem restrição; **médio** se qualquer um falhar (cada motivo aparece em "Atenção"). Ações: Aprovar (recusa contato inválido/devolvido/pendente, bloqueado, faixa C e texto com preço ou prazo), Editar (assunto/corpo, sem HTML), Pular, Desfazer (só enquanto sem `message_id`), "Aprovar os de baixo risco". Tudo em `auditoria_log`. **Pedir outra versão fica desabilitado com o motivo** (sem chave de IA, teto do dia, ou "será ligada junto com o agente de IA"): não há função de reescrita acionável pela tela; o agente de IA atual roda por agendamento. Nada envia daqui.

### R7. Caixa de e-mail (concluído, com 3 limites)
Três painéis (pastas, lista, leitura; no celular lista e leitura em telas separadas com Voltar). Pastas Entrada, Quentes (entrada com etiqueta `quente`), Rascunhos, Enviados, Arquivados, Spam, Lixeira; filtro por caixa e etiqueta; busca, Não lidas, Com estrela, Com anexo; estrela clicável; conversa inteira em ordem (por empresa ou assunto); faixa de lead quente com Assumir e Converter em lead; "Sugestão do agente" (de `prospeccao_respostas.rascunho_resposta`) com Usar e editar / Dispensar; Responder, Responder a todos, Encaminhar, Arquivar, Marcar como não lida, Etiqueta, Excluir; janela Escrever com modelos e "Rascunho do agente".
- Tabelas `prospeccao_caixa_mensagens` e `prospeccao_caixa_acoes` (fila de ações para o IMAP: a tela grava, **o robô ainda não consome essa fila**), bucket privado `prospeccao-anexos` com RLS. O robô de leitura agora espelha cada e-mail em `prospeccao_caixa_mensagens`.
- `PROSPECCAO_CAIXA_ESCOPO` criado com valor `prospeccao`; `tudo` sincroniza a caixa inteira. Não mudei.
- **Envio manual**: a tela grava a resposta na fila que o `prospeccao-enviar` já tinha (`prospeccao_emails`, saída aprovada), e o robô já obedece MODO_TESTE (só destinos de teste com `[TESTE]`, assinatura da caixa) e só envia com ENVIO_LIBERADO = sim. Com envio desligado o botão mostra "Envio desligado nos Ajustes" e a mensagem vira rascunho. Decisão: **não gravei em `prospeccao_mensagens`** (o pedido era gravar lá quando for de uma empresa) porque aquela tabela é a fila dos toques frios (índice único por contato e toque, e o robô pega tudo que está aprovado ali): uma resposta manual poderia ser reenviada como toque. O registro da empresa fica em `prospeccao_emails`, ligado à conversa.
- **Limites**: (1) anexos recebidos: o leitor só guarda nome e tamanho, então "Baixar" avisa que o arquivo não foi guardado (falta o robô subir o arquivo ao bucket); (2) anexar e agendar na resposta ficam desabilitados com explicação; (3) Cco não existe (o robô só envia Cc).

### R8. Jornada (concluído)
Mapa em SVG com as linhas calculadas pela posição real das caixas (recalcula ao rolar, redimensionar e trocar de caixa), cores (quente dourado, automática verde, para tudo vermelho, espera tracejado). Painel: frases do cliente editáveis, resposta sugerida editável (`prospeccao_modelos`, variáveis validadas `{nome} {empresa} {cidade} {segmento_frase} {veiculo}`), "O agente pode", "Depois disso". Travas fixas na tela **e no banco** (CHECK em `prospeccao_respostas_config`): cotação e preço nunca sozinhos, reclamação nunca respondida, sair sempre automático, pergunta nova só rascunho. "Responder sozinho" só vale com RESPOSTA_AUTOMATICA_LIBERADA = sim (a tela avisa). "Nova pergunta" cria classe personalizada em rascunho. Banco: tipos novos de modelo (`resp_preco`, `resp_regiao`, `resp_veiculos`, `resp_seguro`, `resp_custom_*`), `prospeccao_respostas_config` com os 9 padrões do protótipo, classes `regiao`, `veiculos`, `seguro` e `custom_*` aceitas em `prospeccao_respostas.classificacao`. O texto salvo ativa o modelo (`ativo = true`). Classe nova só é classificada por palavras-chave e pela lista da IA; **o robô ainda não lê `prospeccao_respostas_config`** (as travas valem na tela e no banco; o robô já só responde sozinho `sair` e, com a flag, `agora_nao`/indicação).

### R9. Relatórios da IA (concluído)
Números reais da semana (enviados, respostas %, quentes, cotações pedidas, devoluções %, gasto de IA), resposta por segmento, testes A/B (de `prospeccao_experimentos`, com envios por variante), sugestões (`prospeccao_sugestoes`) com Aplicar/Recusar e histórico (auditoria + sugestões decididas). Estado vazio explica que aparece depois dos primeiros envios. **Aplicar registra a decisão**; nenhuma mudança automática de texto é feita a partir de `mudanca` nesta versão (o analista de IA já tem o próprio caminho nas `prospeccao_relatorios`).

### R10. Ajustes (concluído)
Chaves com Sim/Não (só o Pedro; ligar envio, leitura ou resposta automática exige digitar LIGAR; tirar modo teste ou aprovação obrigatória pede confirmação com aviso; o gatilho do banco grava a auditoria), caixas com estado (ativa, desligada, senha faltando), ritmo (dias e janela fixos, intervalo 8 a 25 min, limite por dia, rampa editável com teto 100, teto de IA), assinatura por caixa, as 4 regras de parada com a última parada e o motivo, quem recebe os avisos (texto: vem do código, não editável), destinos de teste, lista de bloqueio (e-mail, domínio ou CNPJ; remover com confirmação; automáticos sem botão). A antiga "Saúde do envio" foi absorvida; o bloco recolhido "Senhas e diagnóstico das caixas" reaproveita `Caixas` e `IaCusto` (cadastro das senhas no cofre e chave de IA). Bloquear por CNPJ bloqueia os e-mails da empresa e marca a empresa como `descartado`.

### R11. Mini curso (concluído)
7 lições com teste de uma pergunta, progresso por usuário em `prospeccao_curso_progresso`. Ajustei o texto da lição 3 ao sistema real (faixa B começa em 50, não 45) e a lição 2 (só São Paulo como ponto de partida).

### R12. Testes, revisão e entrega
- **Testes** (todos passando): `gestor/test/radar.test.ts` (17 testes: filtros da busca com raio, segmentos, porte, MEI fora e gigantes desligados; importador com duplicados, linhas ruins, blocos de 500; etapas; aprovação sem contato inválido/bloqueado; envio manual com MODO_TESTE e ENVIO_LIBERADO; travas da jornada; visibilidade; Ajustes; curso; "quando sai") e 1 teste novo em `supabase/functions/_shared/prospeccaoRegras.test.ts` (classes regiao, veiculos, seguro). Suíte completa: 573 testes, 0 falhas. **Não há teste automatizado de RLS** (exigiria banco): a revisão abaixo é por leitura.
- **Segurança das tabelas novas (por leitura, sem `get_advisors`)**: RLS ligado em todas, políticas só para `gestor_rbr`, `anon` sem `grant`; `prospeccao_base` só tem política de leitura (escrita só pelas funções); funções `security definer` com `set search_path`, checam `gestor_rbr`, sem acesso para `anon`; progresso do curso só do próprio usuário; bucket privado. **Rodar `get_advisors` depois de aplicar a migração.**
- **Conferência visual** (Playwright local com Supabase simulado e build com `VITE_DEMO_RADAR=true`; a rota de demonstração só existe nesse build): as 9 abas em 1440 px e 390 px, modo exemplos, sem erro de página e **sem rolagem horizontal**. Diferenças que sobraram em relação ao protótipo: frases-exemplo da Jornada aparecem em campos editáveis (o protótipo mostra texto); o cartão do agente mostra o último registro real, sem a animação de digitação; sem tema escuro; contagens de segmento do modo exemplos são das 12 empresas de exemplo.
- Build (`tsc -b && vite build`), `oxlint` (só avisos antigos do projeto) e todos os testes passam localmente.

## Migrações
| Arquivo | Rollback | Aplicada? |
|---|---|---|
| `supabase/migrations/20261119-0100-radar-modulo.sql` | `supabase/rollback/rollback-20261119-0100-radar-modulo.sql` | **NÃO** (sem acesso ao Supabase) |

Ordem: antes dela precisam estar aplicadas `supabase-migrations/20261116-1000` até `20261116-1410` (parte A, B, ajustes, tipos de modelo, caixas, IA, permissões). Todas as alterações de CHECK são mais amplas que as atuais; nenhuma apaga dados. O SQL não foi executado em banco nenhum nesta noite: **pode ter erro de sintaxe ou de nome que só aparece ao aplicar** (aplicar primeiro, ver o resultado, e só então usar a tela).

## Funções publicadas
**Nenhuma** (sem acesso ao projeto). Alterada no repositório e a publicar quando o Pedro quiser: `prospeccao-ler` (novas classes, escopo da caixa, espelho na caixa). Publicar só depois da migração (o espelho grava em `prospeccao_caixa_mensagens`; sem a tabela só registra aviso no log, não derruba a leitura).

## Flags (todas como estavam)
UI_LIBERADA = nao, ENVIO_LIBERADO = nao, LEITURA_LIBERADA = nao, RESPOSTA_AUTOMATICA_LIBERADA = nao, APROVACAO_OBRIGATORIA = sim, MODO_TESTE = sim. Única adição: `PROSPECCAO_CAIXA_ESCOPO = "prospeccao"` (na migração, não aplicada). Nenhum valor foi alterado. Agendamento pg_cron: **não criado**; o SQL pronto está em `docs/prospeccao/agendar-robos.sql` (e `agendar-agente.sql`).

## Decisões e desvios (resumo)
1. Branch criada de `origin/main` (a `main` local está em outro worktree); PR #83 trazido por merge.
2. Estado local anterior guardado: `git stash push -u -m "antes-radar-2026-11-19"` (3 itens não rastreados da branch fiscal: `docs/PROMPT-CODE-PARALELO-2026-11-12.md`, `docs/design/`, `supabase-migrations/20261112-1300-documentacao-versoes.sql`). Recupere com `git stash list` e `git stash pop` se precisar.
3. A pasta `C:\Users\Aline\Desktop\receita-2026-11` não foi tocada; a base da Receita não foi importada.
4. Nota das empresas da base (ver R4) e resposta manual fora de `prospeccao_mensagens` (ver R7).

## Passo a passo para o Pedro de manhã
0. **Aplicar a migração** `supabase/migrations/20261119-0100-radar-modulo.sql` (e conferir que 1000 a 1410 de `supabase-migrations/` já estão aplicadas). Rodar `get_advisors`.
1. Em **Buscar clientes**, "Importar base da Receita" com `rbr-validadas.csv` (depois `rbr-gigantes-validadas.csv`, se quiser).
2. Em **Ajustes**, bloco "Senhas e diagnóstico das caixas": cadastrar as senhas das caixas no cofre e `PROSPECCAO_CRON_CHAVE`.
3. Em **Ajustes**, cadastrar os destinos de teste.
4. Rodar o SQL de agendamento (`docs/prospeccao/agendar-robos.sql`) e publicar `prospeccao-ler` atualizado.
5. Ligar leitura e envio em modo teste (digitando LIGAR) e conferir a caixa de teste.

## Precisa de decisão do Pedro
- Como as empresas da base entram no agente, já que a nota delas só chega a 44 (R4).
- Se o robô deve passar a ler `prospeccao_respostas_config` (modo "sozinho" por classe) e consumir `prospeccao_caixa_acoes` (mover e arquivar na caixa real).
- Fechar o PR #83 e o #81 quando o do Radar for mesclado (os commits deles já estão aqui).
