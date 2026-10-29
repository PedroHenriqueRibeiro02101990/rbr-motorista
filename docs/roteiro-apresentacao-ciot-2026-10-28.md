# Roteiro da apresentação do CIOT à NSTech (homologação)

**Situação em 28/10:** a tela está pronta; o ciclo ao vivo depende da efrete. Hoje as chamadas de cadastro passaram, mas a emissão falhou nas 8 tentativas (códigos abaixo). Mesmo o teste antigo do passo 3, com dados fictícios, falhou igual: o problema está do lado da efrete, não nos nossos dados.

## Roteiro (10 passos)
1. Abra o preview do PR (gestor) e vá em `/demo-ciot` (sem login): faixa "DEMONSTRAÇÃO: dados fictícios".
2. Percorra os 4 estados: Antes de emitir, Emitido, Erro, Cancelado.
3. Em "Antes de emitir", clique em **Corrigir** (Pix) e emita: mostra a conferência dos dados e a regra "protocolo gravado antes de ler a resposta".
4. Em "Emitido": CIOT 12 + verificador, protocolo, data e hora, tabela de pagamentos; Consultar, Baixar PDF, Cancelar (motivo de 15+ caracteres).
5. Em "Erro": o texto original da efrete em fonte mono e "Tentar de novo" sem duplicar CIOT.
6. Entre como gestor no preview, abra a operação de teste **965ceb0d** (nome "TESTE CIOT"), etapa CIOT: faixa HOMOLOGAÇÃO, cartão e conferência (piso ANTT R$ 1.407,40 contra frete R$ 8.000).
7. Se a efrete estiver respondendo: Emitir > Consultar > Baixar PDF > Cancelar > Emitir novamente (precisa da função publicada).
8. Se não estiver: mostre o erro na tela (a mensagem aparece no cartão) e a tabela de evidências abaixo.
9. Mostre o histórico de 24/10: CIOT 560000596774 emitido pela tela da operação e encerrado.
10. Faça as perguntas da lista final.

## Evidências (horários em UTC)
| Quando | Etapa | Protocolo | CIOT | Resultado |
|---|---|---|---|---|
| 24/10 01:29 | Emitir (rotina do passo 3, ref RBR-HML-CIOT-0001) | 6126270 | 560000596706/4165 | ok (3 tentativas) |
| 24/10 01:31 | Cancelar | C16000000131656 | 560000596706 | ok |
| 24/10 11:29 | Emitir pela operação 93e6216d (função efrete-ciot-operacao) | 6126316 | **560000596774/2963** (último sucesso) | ok, 1 tentativa |
| 24/10 11:50 | Encerrar viagem | 6126325 | 560000596774 | ok |
| 28/10 13:05 | Emitir (op. 965ceb0d) | 6133655 | — | falhou: ANTT.Falha.Comunicacao |
| 28/10 13:2x | Emitir (2ª e 3ª) | 6133660, 6133675 | — | falhou: ANTT.Falha.Comunicacao |
| 28/10 13:3x | Cadastro do proprietário | 6133683 | — | falhou: ANTT.Falha.Comunicacao |
| 28/10 13:36 | Cadastros (proprietário, 2 veículos, motorista) | 6133885 a 6133891 | — | **ok** (a ANTT voltou) |
| 28/10 13:36 | Emitir (op. 965ceb0d) | 6133902 | — | falhou: APP.Nao.Categorizado (Erro interno) |
| 28/10 13:37 | Emitir com a rotina antiga e dados fictícios (RBR-HML-DIAG-0001) | 6133919 | — | falhou: mesmo erro interno |
| 28/10 13:53 | Emitir (op. 965ceb0d), 15 min depois | — | — | falhou: "SERVIÇOS INDISPONÍVEIS: Sistema iniciando" |
| 28/10 14:09 | Emitir (op. 965ceb0d), 15 min depois | 6134281 | — | falhou: APP.Nao.Categorizado |

Protocolos 6133914 (emissão na op. de teste com datas padrão) e 6133888 (ConsultarTipoCarga desabilitado) também estão registrados.

## Texto para mostrar a falha como evidência
"Na homologação, a emissão (AdicionarOperacaoTransporteV2) falhou hoje com ANTT.Falha.Comunicacao (protocolos 6133655, 6133660, 6133675; cadastro 6133683), depois com APP.Nao.Categorizado / Erro interno (6133902, 6133914, 6133919, 6134281) e uma vez com 'SERVIÇOS INDISPONÍVEIS: Sistema iniciando'. Os cadastros passaram no meio (6133885 a 6133891). Reproduzimos com os dados do passo 3 e o resultado foi o mesmo. Em 24/10 o mesmo código emitiu o CIOT 560000596774. Pedimos que verifiquem esses protocolos do lado de vocês."

## Perguntas para a NSTech
1. O link da homologação com a ANTT está estável hoje? O que significam `APP.Nao.Categorizado` e "Sistema iniciando" na emissão?
2. A produção depende da mesma ligação com a ANTT?
3. Limite real para cancelar o CIOT (24 h antes do início?) e prazo para encerrar (5 dias?).
4. Como abrir a conta de produção da RBR e receber as credenciais?
5. Produção exige IP fixo ou certificado?
6. Saldo/pré-pago e tarifa por CIOT.
7. Encerramento: versão 2 ou 3 do método?
8. Acentos: em 28/10 "Rua Fictícia" voltou correto ("RUA FICTÍCIA DE TESTE") com charset UTF-8. Podemos mandar acentos em nomes?

## Antes da reunião (Pedro)
- Publicar a função `efrete-ciot-operacao` (`supabase functions deploy efrete-ciot-operacao --project-ref kwscmegsfbtvlnyxougt`): traz a trava 412, o status com pagamentos e o "emitir novamente".
- Tentar o ciclo de novo no dia (o ambiente deles estava reiniciando). Se passar: Emitir, Consultar, PDF, Cancelar.
- Plano B: capturas em `docs/capturas/` (demo dos 4 estados e o modal de cancelamento).
