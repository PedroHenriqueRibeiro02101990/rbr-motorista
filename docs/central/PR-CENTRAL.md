# PR: Central do TMS (robôs, lista de clientes, limites, jornada e Fila do SDR)

Branch `feat/central-pedro`. **Sem merge, sem push até o Pedro mandar.**

## O que mudou (em português simples)
- **Central** (`/central`, só o Pedro): resultados, lista de clientes com o botão "Enviar para a base do TMS", mesa de despacho (robôs com chave liga/desliga, pausar/retomar, sugestões da IA com aprovar/rejeitar), processos no PC com encerrar seguro, pré-voo do primeiro envio, limites de uso, jornada do e-mail (textos, intervalos, modo de resposta, ordem dos prefixos), registro de alterações com desfazer e janela "ao vivo".
- **Fila do SDR** (`/fila-sdr`, Pedro e José Carlos): assumir (o primeiro vence), devolver, concluir com resultado; o resultado atualiza a empresa e cria/atualiza **um** lead com origem `prospeccao`.
- Menu "Mais" do gestor ganha "Central" e "Fila do SDR" (em teste enquanto `CENTRAL_UI_LIBERADA` = nao).
- Nenhuma flag de produção foi mudada. Nenhum dado de `prospeccao_*` ou `leads` foi tocado.

## Migrations
| Arquivo | Estado |
|---|---|
| `20261124-0100-central-base.sql` | **já aplicada** (pelo Pedro, em outra janela) |
| `20261124-0200-central-f3-parametros.sql` (3 parâmetros: prefixos, marcas do pré-voo, metas) | **não aplicada** |
| `20261124-0300-central-sdr-funcoes.sql` (encher fila, listar fila, concluir ligação) | **não aplicada** |

Com 0200/0300 ausentes a tela não quebra: as opções que dependem delas avisam "só funciona depois da migration 0200" e a Fila do SDR mostra o erro de função inexistente.

## Testes
- **Front-end:** 306 testes do gestor passam (21 novos: limites, batimento, processos, pré-voo, pausar/retomar, prefixos, log sem segredo, fila). `tsc` e `vite build` passam.
- **Banco (cópia local em memória, Postgres 17.5, só dados fictícios, conexão nunca aponta para produção):** 73 verificações passam (uma é trivial e não conta) com as 3 migrations aplicadas na ordem, mais rollback e reaplicação de 0200 e 0300. Cobrem:
  - RLS: gestor comum, José Carlos e `operacao` não leem nada de `central_*`; Pedro lê; agente só lê robôs/comandos e só age pelas funções; `anon` não executa as funções novas.
  - Liga/desliga cria comando `pendente` com o nome do Pedro; robô travado e "responder sozinho" (bloqueado) não ligam; registro com desfazer funciona e não desfaz duas vezes.
  - Gatilho: só o Pedro altera chaves `CENTRAL_*` (e fica na auditoria).
  - Fila: contato bloqueado, empresa descadastrada, sem telefone e nota baixa não entram; empresa não duplica; máximo de novos por dia; corte em branco = só quem respondeu; dois assumindo o mesmo: só o primeiro vence (em sequência); concluir cria UM lead e atualiza o mesmo na segunda vez; sem interesse = repouso de 90 dias.
- **Segredos:** busca por chaves/tokens/senhas nos arquivos do PR: nada. A tela só conta se a senha da caixa existe, nunca lê o valor, e esconde senha/token do log ao vivo.
- Um bug real foi achado pelo teste do banco e corrigido antes de qualquer aplicação (ordenação da lista da fila em 0300).

## O que NÃO foi possível testar
Login real do Supabase (`auth.uid()` foi simulado), cofre (Vault), a API real com JWT, simultaneidade de verdade (duas conexões ao mesmo tempo), `get_advisors`, e a tela aberta num navegador com dados reais.

## Ficou duplicado (decidir)
Radar continua com Jornada, Relatórios da IA, Ajustes e o botão de importar em Buscar. A Central já cobre os textos, intervalos e modo de resposta (Jornada), sugestões (aprovar/rejeitar), chaves de produção, limites e a importação. **Falta na Central** (por isso nada foi escondido do Radar): o mapa visual da Jornada, criar "nova pergunta", relatório semanal completo (A/B, respostas por segmento), caixas de e-mail e rampa de envio, bloqueios e avisos dos Ajustes.
