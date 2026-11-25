# Contrato do Agente RBR com a Central

Este arquivo diz o que o Agente do PC deve fazer para conversar com a Central. O agente **não é escrito aqui**; só o banco e a tela. Migration: `supabase/migrations/20261124-0100-central-base.sql` (não aplicada até o Pedro escrever "pode aplicar").

## 1. Login do agente (nunca a chave de serviço)
- O agente entra com um usuário próprio do Supabase Auth (e-mail + senha). A senha fica só no PC, em arquivo protegido ou no cofre do Windows. **Nunca em código, log, chat ou banco.**
- Esse usuário tem uma linha em `pessoas` com o papel próprio **`agente_central`** (criado pela migration; nenhuma política existente o menciona, então ele não lê nem altera nada fora das funções `central_*`). **Não usar `operacao`**: esse papel lê e altera operações, documentos fiscais e CIOT/VPO. O id dessa pessoa vai em `parametros_sistema.CENTRAL_AGENTE_PESSOA_ID` (só o Pedro grava). Se o id for de uma pessoa que não tenha o papel `agente_central`, o banco recusa (falha fechado).
- O agente **não** acessa nenhuma tabela `prospeccao_*` nem `leads` diretamente. Só o que está abaixo.

## 2. O que o agente pode fazer (e só isso)
| Ação | Como | Observação |
|---|---|---|
| Ler robôs | `select` em `central_robos` | Para saber horário, onde roda e se é travado/bloqueado |
| Ler comandos | `select` em `central_comandos` (`status = 'pendente'`) | A cada 30 s |
| Andamento do comando | `rpc central_comando_atualizar(p_id, p_status, p_resultado, p_progresso)` | `p_status` ∈ `executando`, `feito`, `erro`. Depois de `feito`/`erro` não volta |
| Batimento | `rpc central_batimento(p_maquina, p_versao, p_resumo)` | A cada 30 s. Alerta "atrasado" se passar de 5 min |
| Uso por serviço | `rpc central_registrar_uso(p_servico, p_periodo, p_referencia, p_usado)` | Serviços: `qev, verifalia, exa, tavily, serper, ia_gratis, claude_noite`. Só o "usado"; o limite é do Pedro |
| Resultado do robô | `rpc central_robo_resultado(p_robo, p_inicio, p_fim, p_resultado)` | Atualiza só `ultimo_*` |
| Importar a base | `rpc central_importar_base(p_linhas, p_lote)` | Até 5000 linhas por chamada; upsert por CNPJ; **nunca apaga** |

Qualquer outra coisa é recusada pelo banco.

## 3. Ciclo de trabalho
1. **A cada 30 s**: `central_batimento`; depois ler comandos `pendente`, em ordem de `criado_em`.
2. Para cada comando: marcar `executando` → executar → marcar `feito` (ou `erro` com o motivo em `p_resultado`, sem segredo).
3. **A cada 60 s**: listar os processos (seção 5) e mandar em `resumo_json.processos` no mesmo batimento.
4. Ao fim de cada execução de robô: `central_robo_resultado`.
5. Uso: reportar por serviço sempre que mudar (no máximo a cada 60 s por serviço). Dia: `referencia` = data; mês: primeiro dia do mês.

## 4. Comandos
| `comando` | Significado | `parametros` |
|---|---|---|
| `ligar`, `desligar`, `pausar`, `retomar`, `rodar` | Para robôs do PC (`onde_roda = 'pc'`). Robô-flag e robô travado/bloqueado nunca chegam aqui (o banco recusa) | — |
| `importar_base` | Enviar a base gerada pela LISTAS | `{lote, total_empresas, total_contatos}` |
| `encerrar_processo` | Encerrar um processo da RBR | `{pid, inicio}` (obrigatórios) |

### importar_base
- Ler o arquivo gerado pela LISTAS no PC e enviar em **lotes de 5000** por `central_importar_base(linhas, lote)`, usando o **mesmo** `lote` do comando em todas as chamadas.
- Depois de cada lote, `central_comando_atualizar(id, 'executando', null, {lotes_total, lotes_feitos, enviadas, repetidas, erros})`. As contagens vêm do retorno (`novos`, `repetidos`, `ignorados`).
- Ao fim: `feito` com o resumo. Erro de rede: tentar de novo o mesmo lote (é seguro repetir: não duplica).
- Só existe um `importar_base` aberto por vez.

### encerrar_processo (segurança)
O agente só executa se **todas** as condições forem verdadeiras; senão marca `erro` com o motivo e não encerra nada:
1. o `pid` ainda existe;
2. o horário de início do processo bate com `parametros.inicio`;
3. o caminho do executável/script está dentro de `D:\RBR\Sistema`;
4. não é o próprio agente nem programa fora da RBR.

Proibido `taskkill` por nome genérico. Encerrar sempre por pid verificado.

## 5. Lista de processos em `resumo_json`
```json
{
  "processos": [
    { "pid": 1234, "nome": "python.exe", "arquivo": "D:\\RBR\\Sistema\\garimpo\\rodar.py",
      "inicio": "2026-11-24T08:00:00-03:00", "memoria_mb": 180, "dono": "garimpo_listas" }
  ]
}
```
- Junto com `processos`, mandar `lista` (o que a LISTAS gerou, para a tela mostrar o botão "Enviar para a base do TMS"): `"lista": { "empresas": 12000, "contatos": 9000, "gerada_em": "2026-11-24T03:00:00-03:00" }`. Sem isso a tela diz que o agente ainda não informou o tamanho da lista e o botão fica desligado.
- Para a seção "Fila do TMS e ao vivo" (só leitura na tela), também no `resumo_json`: `"passos": [{"nome","estado":"feito|rodando|espera","detalhe"}]` (passos da LISTAS), `"fila_tms": [{"titulo","estado"}]` (tarefas do Claude) e `"log": ["última linha", ...]` (até 40 linhas, **sem segredo**; a tela ainda esconde senha/token/chave por garantia).
- Comandos `pausar` e `retomar` (robôs do PC, `onde_roda = 'pc'`): pausar para depois do passo atual; retomar continua. A tela considera pausado o robô cujo último pedido foi `pausar`.
- Listar só processos cujo caminho esteja em `D:\RBR\Sistema` (ou scripts da lista branca: garimpo, freellm, listas, radar, agente).
- `dono` = id do robô da Central que o agente iniciou, ou `"sem dono"`.
- Não gravar linha de comando completa (pode ter segredo); só o caminho do arquivo.
- O próprio agente aparece na lista e é tratado como "Protegido" pela tela.

## 6. Regras gerais
- Nenhum segredo em log, comando, resultado ou `resumo_json`.
- O agente nunca liga flags de produção (envio, leitura, resposta automática): isso é só do Pedro, pela tela.
- Se a Central estiver fora do ar, o agente continua com o último estado seguro e tenta de novo; não inventa comando.
