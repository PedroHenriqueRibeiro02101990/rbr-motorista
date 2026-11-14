# Dúvidas para a Repom (o Pedro leva à Karen)

Numeração: **D-V** = API VPR (9501), **D-F** = guia Frete (9520). Entre parênteses, o que o código faz enquanto não responderem.

## VPR (9501)
- **D-V01** `numeroEixos` e `carretaNumeroEixos` têm "tamanho 1". Aceita 10 ou mais (ex.: tração 3 + carreta 6)? O exemplo soma 6. (código: aceita de 1 a 15, enviado como número)
- **D-V02** A consulta do VPR é POST ou GET? O texto diz POST; o curl não tem corpo. (código: GET, verbo configurável)
- **D-V03** Reenviar a emissão com o mesmo `processoCodigoCliente` devolve o vale já emitido, erro de duplicidade ou emite outro? Existe consulta por `processoCodigoCliente`? (código: nunca reenvia emissão incerta; fica "enviado" e vai à conferência manual)
- **D-V04** `roteiro.PercursoCodigo` é número ou texto (tabela diz string, exemplo manda número)? (código: número)
- **D-V05** `utilizaCarreta` aceita boolean ou só a string `"true"` do exemplo? É obrigatório com carreta? (código: boolean, só com carreta)
- **D-V06** Prazo de cancelamento do VPR: 3 h (manual VPR) ou 72 h (guia Frete/ANTT)? Muda por OSA? (código: não valida prazo; devolve o erro da Repom)
- **D-V07** `statusCarga` vem como texto ("Carregado") no exemplo e como 1/2/3 na tabela. Quais textos existem? (código: aceita os dois)
- **D-V08** O `TipoRoteiro` 1 "Roteiro Curto" é o "Curta (meio-termo)" do texto? A ordem é 2 rápido, 3 mais curto, 4 econômico? (código: 1 curta, 2 mais rápida, 3 mais curta, 4 econômica)
- **D-V09** No QA, o `client_id/client_secret` do 9501 (que temos de produção) funcionam? O QA do 9501 está configurado? Há CNPJ de embarcador e placas de teste? (código: ambiente padrão qa, sem chamada real)
- **D-V10** Há limite de chamadas por minuto/dia na roteirização? Cada consulta de pedágio é cobrada? (código: limite diário nosso, padrão 100)
- **D-V11** A API exige IP fixo/whitelist em produção?
- **D-V12** Em erro 500 ou timeout na emissão, como saber se o vale foi emitido? (código: ver D-V03)

## Frete (9520)
- **D-F01** **CONFIRMADA POR TESTE REAL (14/11, produção):** base de produção `https://www.repom.com.br/Repom.Frete.Webapi` (segredo `REPOM_FRETE_URL_BASE`); o login fica em `{base}/Token` (segredo `REPOM_FRETE_URL_TOKEN`); outros caminhos (`/api/Token`) dão 404. Falta só a URL do QA do token do 9520, se for diferente. (código: as duas URLs continuam em segredo; sem elas responde "não configurado")
- **D-F02** **PARCIAL (14/11):** o `{base}/Token` é endpoint OAuth: JSON com `User`/`Password`/`Partner` responde 400 `{"error":"unsupported_grant_type"}`, ou seja, exige o campo `grant_type`. A Repom (Karen) disse "JSON - Body" com `User` (código do cliente), `Password` (senha da API) e `Partner` (CNPJ) e **não citou `Version`**. **Ainda a confirmar com a Repom:** o corpo é formulário OAuth padrão (`grant_type=password`, `username`, `password`, `partner`) ou JSON com `grant_type`? O campo `Version` existe? Validade do token? (código: formato configurável em `REPOM_FRETE_TOKEN_FORMATO` = `form` (padrão), `form_pascal` ou `json`; `Version` só é enviado se `REPOM_FRETE_VERSION` estiver preenchido; ações somente leitura `verificar_token` e `diagnosticar_token` descobrem o formato aceito sem gerar custo)
- **D-F03** O token Frete usa `Authorization: Bearer`? (código: sim)
- **D-F04** Nome exato do enum `VehicleCategory` para "Comercial Pesado" e do `Type` (o exemplo usa `CityDelivery`; a tabela lista por número). (código: repassa o texto informado)
- **D-F05** "Id da Operação" (`OperationIdentifier`): quem cadastra e como listamos (`GET /Operation` está na tabela e sem seção)? (código: não implementado)
- **D-F06** `VPROneWay`: true significa ida e volta ou só ida? O texto é contraditório. (código: repassa o que o chamador informa)
- **D-F07** `Taxes[].Type` aceita nome (`IRRF`) e número (1, 2, 3, 34)? Se a RBR calcula o imposto (efrete), enviar zero ou omitir? (código: omite quando não informado)
- **D-F08** `ProcessingShippingType` tem outros valores além de `OnlyFreight`?
- **D-F09** Lista completa de `Status` do contrato e como saber o resultado final da emissão assíncrona. (código: "Finished" = emitido; `Errors` não vazio = erro)
- **D-F10** `ShippingValidation/ByVehicles/{vehicles}`: como enviar várias placas (separador)? (código: uma placa por chamada)
- **D-F11** `PATCH /Shipping/AdvanceFreightBalanceByIdentifier`: qual o corpo (campo do valor)? (código: NÃO IMPLEMENTADO)
- **D-F12** Quitação: o caminho é `POST /Shipping/Payment` (texto) ou `POST /ShippingPayment` (tabela)? (código: `/ShippingPayment`, que combina com download e cancelamento)
- **D-F13** `PATCH /ShippingPayment/DocumentLost/{id}`: qual o corpo? (código: NÃO IMPLEMENTADO)
- **D-F14** Autorização de pagamento: `/Payment/Authorization` (texto) ou `/PaymentAuthorization` (tabela)? (código: `/PaymentAuthorization`)
- **D-F15** Saldo do cliente. **RESPONDIDA EM PARTE (Karen, 13/11):** o caminho é `GET {base do Relatório}/Balance/Financial/GetByDateInicialDateFinal/{AAAA-MM-DD}/{AAAA-MM-DD}`, informado fora da documentação (o guia só cita o nome). (código: implementado em `consultarSaldoCliente` e na ação `consultar_saldo`, devolve a resposta como vier). **Ainda falta:** formato da resposta (campos), se em produção vale a mesma rota e o mesmo host de Relatório, e o que o saldo representa (saldo disponível, a pagar, pré-pago?). Sem isso a RBR não deve usar o valor para decidir nada.
- **D-F16** CIOT TAC-Agregado: o que são `QuantityRate` e `PriceRate`? O quadro da página 89 é só figura. Habilitar o parâmetro 156 no 9520. (código: repassa o que o chamador informar)
- **D-F17** Prazos de cancelamento (CIOT 24 h, VPR 72 h, TAG 15 min): contam da emissão? Valem para a Repom ou só para a ANTT? (código: não valida; devolve o erro da Repom)
- **D-F18** A RBR emite CIOT pela efrete. Pode usar Repom Frete num contrato e efrete em outro sem conflito na ANTT? (código: Repom entra como fornecedor selecionável, sem trocar a efrete)
- **D-F19** O contrato do 9520 está configurado como só frete ou frete+VPR? (código: não assume)
- **D-F20** Quais são os cenários do Portal dos Testes Integrados (lista completa), o prazo de cada rodada e quem aprova a rota automática em QA?
- **D-F21** O QA gera cobrança de VPR/CIOT? Existe sandbox sem cobrança?
- **D-F22** Parâmetros 57 (autorização) e 58 (agenda) estão ligados no 9520? (código: o fluxo de pagamento exige a data de autorização quando informado)
- **D-F23** `Country` aceita `Brazil` e `55` indistintamente? (código: `Brazil`)
- **D-F24** Status da Repom: ainda NÃO sabemos a que cada status se refere (viagem/contrato, pagamento ou CIOT) nem qual é a lista completa dos status de processamento da emissão (só vimos `Finished`, `InTransit`, `CompletedAutomatically` e números como `Status: 1` em exemplos soltos). A Repom enviou em 13/11 só a lista de nomes (InTransit, Accountability, Cleared, Authorized, Paid, Interrupted, Cancelled, Locked; registrada em ESPECIFICACAO-FRETE.md), sem dizer a que cada um se refere. Pedimos a tabela de cada status por entidade (contrato, quitação, autorização de pagamento, CIOT, processamento da emissão) e quais são finais. (código: só `Finished` sem erros = emitido; `Errors` não vazio = erro; o resto = "processando"; **a ordem do fluxo entre emissão, CIOT e pagamento não foi presumida**)
