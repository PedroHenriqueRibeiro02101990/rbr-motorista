# Relatório: preparação da demonstração NSTech (sexta 13/11, 14h)

## O que ficou pronto
- **VPO que aguenta a demora.** A função corta a espera em 95 s e marca a linha como "em processamento" (não devolve mais 502). A tela consulta o recibo a cada 15 s por até 5 min ("Comprando o vale-pedágio, isso pode levar alguns minutos"); depois disso mostra "Não confirmado. Consulte de novo", com botão que só consulta. Cancelamento: mesma lógica, e "recibo não localizado" vale como cancelado (limpa vpo_idvpo e vpo_valor). Compra duplicada bloqueada na função e no banco (índice parcial). Migração aditiva aplicada, com rollback.
- **Dado da operação 965ceb0d** limpo (vale antigo removido de operacao_ciot_vpo).
- **CIOT:** o status real passa a ser gravado em documentacao_operacao (emitido, cancelado, erro); CIOT cancelado não aparece mais como "feito" na linha do tempo; mensagens em português simples ("Falta o PIX do motorista...").
- **Testes novos:** vpoAndamento.test.ts (compra que demora e conclui, compra que nunca conclui, cancelamento que demora, bloqueio de duplicada) e vpoAcompanhar.test.ts; suíte do gestor verde.
- **Cartão do VPO em operação de teste:** botão para usar a placa GYI1732 e CNPJs já preenchidos.

## O que NÃO ficou pronto
- **Semirreboque RRD5B39 não está na DEMO.** O sistema só aceita reboque aprovado e ele está "aguardando documentos". Sem ele a prévia do CIOT falha (piso ANTT, 3 eixos). **Ação do Pedro:** aprovar o RRD5B39 em Cadastros e anexar na aba Motorista e veículo (ou rodar o insert que está em supabase-migrations/20261111-1100-demo-nstech-operacao.sql).
- **Ensaio da compra e cancelamento do VPO:** a compra real em homologação não foi confirmada, então não rodou. Fazer pela tela.
- **Não existe campo "apelido".** A DEMO se identifica pelo endereço e pela observação "DEMO NSTech" na cotação.
- Duas linhas de teste (simulação e consulta de tag) ficaram no registro de passos da DEMO.

## Para publicar (Claude)
1. `supabase/functions/nspedagio-vpo/index.ts` (usa `_shared/vpoAndamento.ts` e `_shared/nspedagioClient.ts`)
2. `supabase/functions/efrete-ciot-operacao/index.ts` (usa `_shared/ciotEfrete.ts`)
Além disso: definir `VITE_NSPEDAGIO_HABILITADO=true` no Vercel de produção do rbr-gestor (sem isso o cartão do VPO não aparece) e refazer o deploy.

## Operação DEMO NSTech
`/operacoes?op=70cdfc53-2911-43d4-adb0-98e12d3cbd3d` (cavalo RQW4D58, frete R$ 8.000, adiantamento R$ 3.000, início previsto 20/11).

Roteiro de cliques: abrir o endereço > aba "NF-e e documentos fiscais" > cartão CIOT: conferir a prévia > Emitir (confirmar) > ver o número > Baixar PDF > Cancelar (motivo com 15+ caracteres). Cartão do VPO: Dados da rota > "Usar a placa de teste" > Consultar tag > Simular > Comprar (confirmar; aguardar até ~3 min) > Reemitir recibo > Cancelar vale (motivo).

## Ensaio (CIOT, mesmos caminhos da tela, homologação, 11/11, operação 965ceb0d, função antiga)
| Passo | Hora (UTC) | Tempo | Resultado |
|---|---|---|---|
| Prévia | 15:59:13 | <1 s | ok, piso R$ 1.407,40 |
| Emitir | 15:59:44 | 6,5 s | CIOT 560000618605/2267, protocolo 6180309 |
| PDF | 16:00:02 | ~1 s | 47.013 bytes |
| Consultar | 16:00:02 | ~1 s | encontrado |
| Cancelar | 16:01:10 | 2,5 s | protocolo C16000000131814 |
| Consultar tag GYI1732 / Simular SP-BH | 16:01:34 | <1 s | ConectCar e Veloe ativos; 585,68 km, 5 eixos R$ 140,64 |

## Riscos na apresentação ao vivo
- Compra e cancelamento do vale levam cerca de 3 min no NSPEDAGIO; ter o que falar durante a espera.
- NSPEDAGIO só em dia útil, 9h às 18h.
- Se o recibo nunca aparecer, a compra fica bloqueada até o recibo existir (de propósito); não comprar de novo.
- Reboque pendente de aprovação e flag do VPO no Vercel (acima).
- O ensaio do CIOT rodou na função antiga; o espelho em documentacao_operacao só vale após publicar.
