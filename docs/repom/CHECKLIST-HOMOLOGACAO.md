# Checklist de homologação Repom (cliente 9501 VPR e 9520 Frete)

Regra da Repom: toda integração é homologada com **ciclo completo de testes com evidências** antes de produção (VPR, pág. 4; Frete, seções 6 e 94).
Os cenários oficiais ficam no **Portal dos Testes Integrados** e são configurados pelo analista de integração da Repom: **pedir a lista a eles**
(D-F20). Abaixo estão os cenários que os manuais implicam; cada um precisa de evidência (request/response **sanitizados**: sem token, senha nem
CPF/CNPJ reais; mais print do portal Repom). Estado inicial de tudo: **não feito**. Em QA nada é gravado como produção e nada libera MDF-e em produção.

Evidência = arquivo em `docs/repom/evidencias/` (JSON sanitizado pode ser versionado; PDFs e prints com dados pessoais não). Sanitizar com `higienizar()` de `repomClient.ts`.

## A. VPR (cliente 9501, API v2.0)
| # | Cenário | Evidência | Status |
|---|---|---|---|
| A1 | Token da roteirização: obter, reusar do cache, renovar antes de vencer, 401 renova uma vez | log de chamadas (1 token em N consultas) | não feito |
| A2 | Token do vale-pedágio (usuario/senha), cache de 24 h | idem | não feito |
| A3 | Cadastro de rota por IBGE (sem 2 primeiros dígitos e sem zeros), ida; e ida e volta | request/response | não feito |
| A4 | Rota com paradas (até 23) e por CEP; origem igual ao destino rejeitada | request/response de erro | não feito |
| A5 | Consulta de rota por `codigoRoteiroCliente` (200, 204, 404) | response | não feito |
| A6 | Valor do pedágio com eixos e eixos suspensos (ida e volta) | response + conferência com o portal | não feito |
| A7 | Erros de rota nos formatos `isValid/errors` e 400 de validação | response | não feito |
| A8 | Consulta de TAG: ativa/apta, não localizada, bloqueada | response | não feito |
| A9 | Emissão do VPR (tração só; tração+carreta com soma de eixos; com documento CT-e) | response com `codigoViagem`, `idvpoAntt` + print do portal | não feito |
| A10 | Emissão repetida com o mesmo `processoCodigoCliente` (idempotência) | response | não feito |
| A11 | Erro de emissão `numeroErro` (ex.: 347 placa inválida) e erro de tipo de campo | response | não feito |
| A12 | Consulta do VPR por `codigoViagem` (200 e 205 não encontrada) | response | não feito |
| A13 | Cancelamento dentro do prazo e de viagem já cancelada (325) | response | não feito |
| A14 | Timeout/5xx na emissão: não reenviar sem conferir | log do nosso fluxo | não feito |

## B. Frete (cliente 9520, guia 3.0)
| # | Cenário | Evidência | Status |
|---|---|---|---|
| B1 | Token (User, Version, Password, Partner) | log | não feito |
| B2 | Contratado PF e PJ: cadastro, consulta por nome e documento, alteração, bloqueio/desbloqueio | request/response | não feito |
| B3 | Motorista: cadastro, consulta, alteração, bloqueio | request/response | não feito |
| B4 | Veículo tração e implemento: cadastro, consulta, alteração (eixos corretos) | request/response | não feito |
| B5 | Tipos de carga ANTT | response | não feito |
| B6 | Rota automática (aprovação pelo analista em QA) e consultas de rota | response | não feito |
| B7 | Validações: veículo, veículo por TAG, documento do prestador, cartão | response | não feito |
| B8 | Emissão só frete, frete+VPR e viagem digital (`CardNumber 0`) | `OperationKey` + consulta | não feito |
| B9 | Consulta por `OperationKey` com erro e com sucesso (assíncrono) | response | não feito |
| B10 | Consultas por `ShippingId`, `Identifier` e status de processamento | response | não feito |
| B11 | CIOT: emissão, CIOT em contingência (`CIOTInContingency`) e ocorrências | response | não feito |
| B12 | Movimentos, impostos, taxas, documento e saldo de frete após a emissão | response | não feito |
| B13 | Cancelamento (sem movimento) e interrupção (com consumo) | response | não feito |
| B14 | Bloqueio temporário do contrato | response | não feito |
| B15 | CIOT TAC-Agregado: primeira emissão, viagem seguinte com `ExistingContractId`, retificação, cancelamento, encerramento (parâmetro 156) | response | não feito |
| B16 | Praças do VPR do contrato (`TollList`) | response | não feito |
| B17 | Autorização de pagamento, consulta (ByBatchId/ByIdentifier/ByShippingId) e cancelamento (parâmetro 57) | response | não feito |
| B18 | Quitação com documentos (Delivered/Dismissed/Lost/Reshipping), comprovante, cancelamento e alteração de documento | response | não feito |
| B19 | Saldo do cliente | response | não feito (método sem especificação, D-F15) |
| B20 | Conciliação financeira e contábil e faturas (se a Repom calcular os impostos) | response | não feito (fora desta entrega) |

## C. Do nosso lado (condições para ligar)
| # | Condição | Status |
|---|---|---|
| C1 | `REPOM_AMBIENTE=qa` até a Repom aprovar; produção só com aprovação por escrito | não feito |
| C2 | Credenciais do 9520 no Vault pelo painel do Supabase (nunca no chat) | não feito |
| C3 | `REPOM_API_LIBERADA` e `REPOM_ROTEIRIZACAO_LIBERADA` = `sim` só durante o teste; depois voltar para `nao` | não feito |
| C4 | `REPOM_VALOR_MAXIMO_OPERACAO` (padrão 3000) e `REPOM_LIMITE_DIARIO` conferidos | não feito |
| C5 | IP fixo/whitelist, se a Repom exigir | não feito |
| C6 | Confirmação humana (nome e hora) em toda emissão e pagamento | implementado em código; teste manual não feito |
