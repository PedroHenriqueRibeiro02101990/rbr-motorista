# Painel do embarcador: desenho (Fase B, somente desenho)

Nenhum código de acesso, nenhuma migração de acesso. Este documento só propõe; a decisão de segurança é do Pedro (seção B4).
Marcação: **[verificado]** conferido no código ou no banco em 2026-11-12; **[a confirmar]** suposição.

## O que existe hoje (base verificada)

| Item | Situação | Evidência |
|---|---|---|
| Link público de aceite `/p/<código>` | Existe. Código de 32 hex, sem login, só mostra origem, destino, valor, validade; limite de tentativas por IP | `supabase/functions/proposta-publica/index.ts`, `supabase-migrations/20261030_07_link_proposta.sql`, tabela `tentativas_acesso_publico` |
| Link de acompanhamento da viagem para o cliente | **Ainda não disponível.** A própria tela diz que o aviso por e-mail e o link não existem | `gestor/src/components/operacao/LiberarCaminhaoInfo.tsx` |
| Papel de cliente/embarcador | **Não existe.** Enum `papel_pessoa`: titular_motorista, condutor, agenciador, gestor_rbr, prestador_parceiro, comercial, operacao, fiscal, financeiro | consulta ao banco |
| Login de gente de fora | Só motorista/agenciador, criado pela função `acesso-app` (link de definir senha) | `supabase/functions/acesso-app/index.ts` |
| Operação ligada ao cliente | `operacoes.cliente_id`; comprovante em `operacoes.comprovante_entrega_path` | colunas de `operacoes` |
| Documentos fiscais | `documentacao_operacao` (CT-e, MDF-e); há download via função `baixar-documento-fiscal` (verify_jwt) | lista de funções publicadas |
| RLS por cliente | **Não existe.** As policies de `operacoes` são por gestor, função interna, agenciador, motorista, titular | `pg_policies` |

Consequência: o corte 1 do painel **não pode** reaproveitar o RLS atual; precisa de papel e policies novos, e é aí que mora o risco.

## B1. Telas do primeiro corte

Regra geral para todas: o embarcador vê somente operações com `cliente_id` igual ao dele. Nunca aparecem: custo interno, margem, `lucro_pct`, valor do frete do motorista, CIOT (número e valores), vale-pedágio (valores), spread/comissão de agenciador, GR, apólice, dados de pagamento ao motorista, `modo_demonstracao`, `eh_teste`.

| Tela | Quem vê o quê | Dados que aparecem | NUNCA aparecem |
|---|---|---|---|
| 1. Pedido de cotação | Usuário do cliente cria; a RBR (comercial) recebe como pré-cotação | Origem, destino, carga, peso, datas desejadas, contato | Piso ANTT, margem, preços de motorista |
| 2. Acompanhamento da viagem | Usuário do cliente, só das suas operações; reaproveita o conceito de link de acompanhamento (**ainda precisa ser criado**) e o padrão de código do `/p/<código>` | Status simplificado (coletando, em trânsito, entregue), previsão, última posição aproximada, placa e primeiro nome do motorista | CPF, telefone e endereço do motorista, nome do proprietário, valores de CIOT/vale, posição exata histórica (`posicoes_gps`) |
| 3. Aprovar proposta | Quem recebeu o convite; reaproveita `/p/<código>` e `proposta-publica` (ver, aceitar) | Origem, destino, valor total ao cliente, validade, aceite com nome e cargo | CNPJ de terceiros, margem, custos, dados de motorista |
| 4. Baixar documentos | Usuário do cliente | CT-e (PDF/XML), MDF-e (PDF), comprovante de entrega | Documentos de motorista (CNH, CRLV), CIOT, vale, apólice, GR, NF-e de outros clientes |

## B2. Modelo de acesso proposto

- **Entrada**: convite por e-mail com link único de uso único (expira em 48 h) que leva a definir senha; recomendação final é **link mágico + senha opcional** no corte 1 (cliente de logística raramente guarda senha). Quem convida: só gestor.
- **Papel**: novo valor `embarcador` em `papel_pessoa` e claim no JWT; usuário vinculado a **um** `cliente_id` por tabela nova `embarcador_usuarios (user_id, cliente_id, ativo)` [a confirmar o desenho exato].
- **RLS por `cliente_id`**: policies SELECT dedicadas e mínimas em `operacoes`, `documentacao_operacao`, pré-cotações e cotações; nada de `for all`; sem INSERT/UPDATE exceto pedido de cotação.
- **Limites**: tentativas de login e de código limitadas por IP e por usuário (reaproveitar `tentativas_acesso_publico`); sessão curta (ex.: 8 h) com renovação; bloqueio imediato ao desativar o usuário.
- **Auditoria**: cada download e cada aceite grava linha em `auditoria_log` (usuário, cliente, documento, data, IP). Download de documento por URL assinada curta (ex.: 60 s), nunca bucket público.
- **Tela só consome views**: o painel lê **views restritas** (colunas permitidas), não as tabelas, para que uma coluna nova sensível nunca vaze por acidente.

### Riscos de vazamento entre clientes e barreira no banco

| Risco | Barreira no banco (não só na tela) |
|---|---|
| Cliente A troca o id na URL/consulta e vê operação do B | Policy SELECT com `cliente_id in (select cliente_id from embarcador_usuarios where user_id = auth.uid() and ativo)` |
| Coluna sensível (margem, custo) lida via API | Painel só acessa views com colunas permitidas; sem GRANT nas tabelas base ao papel |
| Documento fiscal de outro cliente baixado | Função de download valida operação pertence ao cliente do JWT e grava auditoria; URL assinada curta |
| Código `/p/<código>` adivinhado | 128 bits + limite por IP (já existe) + resposta igual para inexistente (já existe) |
| Usuário desativado continua com sessão | Policy checa `ativo`; função revoga sessões ao desativar |
| Usuário vinculado a dois clientes por erro | `unique (user_id)` em `embarcador_usuarios` |
| Função com chave de serviço devolvendo dado demais | Funções do painel devolvem lista fixa de campos, testada com teste de contrato |
| Posição GPS exata expõe rota de carga | Painel mostra só cidade/UF aproximada; `posicoes_gps` sem grant ao papel |
| Comprovante com dados pessoais de terceiros | Mostrar só o comprovante da própria entrega; revisão LGPD [a confirmar] |

## B3. Reaproveitado e a criar

**Reaproveitado**: `proposta-publica` e `propostas_publicas`, `gerar_link_proposta`, `tentativas_acesso_publico`, `acesso-app` (padrão de convite), `auditoria_log`, `baixar-documento-fiscal` (padrão, não a função em si), `operacoes.cliente_id`, `comprovante_entrega_path`, padrão visual RBR do gestor.

**A criar**: papel `embarcador`, tabela `embarcador_usuarios`, views restritas, policies SELECT, função de convite, função de download com auditoria, link de acompanhamento (hoje inexistente), novo app ou rota isolada (recomendo **app separado** `embarcador/`, para não misturar bundle e permissões com o gestor), testes de isolamento entre clientes.

**PRs pequenos, em ordem**
1. Papel, `embarcador_usuarios`, views restritas e policies, com testes de isolamento (SQL aditivo + rollback). Sem tela.
2. Função de convite e login (link mágico), limite de tentativas, expiração de sessão.
3. App `embarcador/` com casca, login e lista de operações do cliente.
4. Acompanhamento da viagem (status simplificado + previsão).
5. Aprovar proposta dentro do painel (reaproveita `proposta-publica`).
6. Download de documentos com URL assinada e auditoria.
7. Pedido de cotação.
8. Revisão de segurança independente e teste de penetração de isolamento antes de abrir a qualquer cliente.

Tamanho: PRs 1 e 2 são os maiores (risco); 3 a 7 são médios/pequenos.

## B4. Decisões que dependem do Pedro

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Abrir login a gente de fora agora ou só link por proposta? | Seguir só com `/p/<código>` até os PRs 1 e 2 estarem revisados |
| 2 | Link mágico ou senha? | Link mágico, senha opcional |
| 3 | App separado ou rota no gestor? | App separado |
| 4 | Um usuário por cliente ou vários? | Vários usuários, cada um em **um** cliente |
| 5 | Mostrar posição no mapa? | Só cidade/UF aproximada no corte 1 |
| 6 | Cliente pode pedir cotação sozinho? | Sim, como pré-cotação que a RBR aprova; nunca cria operação |
| 7 | Quem cadastra e desativa usuários do cliente? | Só gestor RBR |
| 8 | Retenção dos logs de download | Alinhar com a política de retenção LGPD existente |
| 9 | Revisão externa de segurança antes do primeiro cliente real? | Sim |
