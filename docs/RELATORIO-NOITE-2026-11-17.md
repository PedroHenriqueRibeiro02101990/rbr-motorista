# Relatório da noite 16 para 17/11/2026 — Prospecção RBR Cargo

Branch: `feat/prospeccao-noite` (a partir de `feat/prospeccao`, PR #81). Se a sessão acabar, a próxima continua da primeira etapa não concluída abaixo.

## Andamento
| Etapa | Situação |
|---|---|
| 1 Migrações 1200 e 1300 | CONCLUÍDA |
| 2 Correções dos robôs (13 itens) | CONCLUÍDA (commit nesta branch; nada publicado) |
| 3 Diagnóstico da caixa e base de e-mail | pendente |
| 4 Caixa de entrada no TMS | pendente |
| 5 Agente de IA | pendente |
| 6 Painel de prospecção | pendente |
| 7 Testes e fechamento | pendente |

## Etapa 1 — Migrações
- Ordem: 1000 e 1100 (já estavam aplicadas) → **1200** (ajustes) → **1300** (modelos). Aplicadas na Etapa 1, depois de validar num bloco que termina em erro proposital (rollback). Rollbacks em `supabase/rollback/`.
- 1200 revisada: a lista de domínios públicos da constraint agora é idêntica à do código (inclui `globo.com`, `protonmail.com`, `gmail.com.br`, `hotmail.com.br`, `outlook.com.br`, `live.com.br`). Rollback da 1200 continua devolvendo ao estado da Parte A (decisão: rollback = estado anterior).
- 1300: `prospeccao_modelos.tipo` aceita também `resp_cotacao` e `resp_recusa_carga` (os 8 anteriores mantidos); os dois modelos novos nascem inativos ("A DEFINIR").
- Como verificar: `select tipo from prospeccao_modelos` (10 linhas) e `select pg_get_constraintdef(oid) from pg_constraint where conname='prospeccao_bloqueio_dominio_publico_ck'` (contém globo.com).
- Resultado conferido por consulta de leitura: 10 modelos, constraint com a lista nova, tabela de bloqueio vazia.

## Etapa 2 — Correções dos robôs (13 itens)
1. **Envio duplicado**: em modo real o `message_id` é reservado ANTES do SMTP (update condicional `message_id is null`); só são candidatas mensagens com `message_id` nulo. Se o update final falhar após o envio, tenta de novo e só registra (nunca reenvia). Erro sem certeza de não-entrega (ex.: timeout no meio) deixa o `message_id` gravado = "envio incerto, conferir" (aviso novo na Saúde do envio). Erro com resposta SMTP explícita ou EAUTH/EDNS libera o `message_id` para nova tentativa. Modo teste inalterado.
2. **MX**: `statusPorMx` — só "inválido" se NotFound/NXDOMAIN/ENOTFOUND/lista vazia; erro transitório não altera o contato, log `dns_indisponivel`, candidato pulado.
3. **Reclamação**: "processo" sozinho não conta mais; vale processar, processo judicial, ação judicial, procon, advogado, spam/abuso (palavra inteira) etc.
4. **Parada por taxa**: >5% só com 20+ envios na janela; abaixo vale só a regra das 3 devoluções permanentes no dia.
5. **Provedores gratuitos**: +hotmail.com.br, outlook.com.br, live.com.br, gmail.com.br; migration 1200 com a mesma lista (teste lê o arquivo SQL e compara).
6. **CPU**: `Intl.DateTimeFormat` criado uma vez; `horasUteisEntre` soma em blocos de 15 min alinhados ao relógio (resultado exato; teste compara com a versão minuto a minuto e mede 30 dias).
7. **Destinatário recusado (550/551/553/554 + texto)**: em modo real marca contato "devolvido", bloqueia só o e-mail, soma devolvidos, descarta pendentes da empresa e avalia parada. Em modo teste não se aplica (o destinatário é o de teste).
8. **Regex SMTP** com limites de palavra (`operate`/`separate` não param mais o envio).
9. **Aviso de abuso**: remetente `hostinger.com|.com.br|.io` (e subdomínios) E assunto de alerta; fatura/promoção não param.
10. **Respostas automáticas**: `resp_recebimento/agora_nao/indicacao` só saem com `PROSPECCAO_ENVIO_LIBERADO=sim` (e em modo teste só aos destinos de teste); `resp_sair` e alertas internos continuam sempre.
11. **Envio real exige "verificado"** (`mx_ok` e `catch_all` só em teste). **ATENÇÃO**: hoje nada na tela nem no robô grava "verificado" (a importação grava `sintaxe_ok`; o robô grava `mx_ok`). Ou seja, em modo real NENHUM envio sairá até existir um verificador de e-mail ou uma ação manual. Ver pendências.
12. **Agendamento**: leitura em `3-59/10 * * * *`, `<PROJECT_REF>` trocado por `kwscmegsfbtvlnyxougt`. NÃO aplicado.
13. **A/B novas** ordenadas por pontuação desc antes do limit.

Testes: `node --test supabase/functions/_shared/prospeccaoRegras.test.ts` = 33 testes (eram 22); `node --test gestor/test/prospeccao.test.ts` = 13; `tsc -b` do gestor limpo.

### Relatório somente leitura (R1–R3)
- **R1 — importação CSV**: `tipo_email` vem do prefixo do e-mail (logistica, compras, expedicao, comercial, vendas, contato, sac → `generico`; qualquer outro → `pessoal`). `validacao_status` nasce `sintaxe_ok` (ou `invalido` se a sintaxe falhar). O `site` vem da coluna `site` do CSV (opcional). Consequência: com site vazio o robô só envia para contato `generico`; `pessoal` só para classe A com domínio igual ao do site, o que nunca acontece sem site. E, com a regra nova, em modo real só `verificado` envia.
- **R2 — critérios**: `criterios` (jsonb) é preenchido só na gaveta da empresa (Empresas → detalhe): 14 réguas de 0 a 1, passo 0,1, mais funcionários e a penalidade de risco; nada é preenchido automaticamente na importação. Classe A ≥ 70, B ≥ 50, C abaixo; funcionários < 50 força C (funcionários vazio NÃO força C); penalidade rebaixa uma classe. Empresa só com dados da Receita (segmento pelo CNAE = 12, > 3 anos de CNPJ = 4, capital/porte = 6, telefone = 3, e-mail de logística = 10, sem funcionários = 0): **no máximo 35 pontos, classe C**. Para chegar a B faltam 15 (ex.: funcionários 0,8 = 16) e para A faltam 35 (funcionários 1,0 = 20 + vende B2B 8 + site 3 + vagas 4...), ou seja, o número de funcionários e sinais B2B/logística precisam ser preenchidos à mão ou por enriquecimento.
- **R3 — Saúde do envio**: sim. Mostra faixa vermelha "PARADO AUTOMATICAMENTE: <motivo>" (`parada_motivo`) e religar exige trocar a chave para SIM digitando LIGAR (só o usuário do Pedro); o banco limpa o motivo ao religar. Nesta etapa foi acrescentado o aviso "Envio incerto, conferir".

## Decisões tomadas sozinho
- Deno não está instalado neste PC: os testes "Deno" são arquivos `.test.ts` rodados com `node --test` (já era o padrão do repositório).

## O que depende do Pedro
(ver final do relatório)
