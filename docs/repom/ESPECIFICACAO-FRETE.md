# Especificação — API Repom Frete 3.0 (RESTful) — cliente 9520

Fonte: `GUIA-API-REPOM-FRETE-3.0.pdf` ("Guia de Integração API RESTful 3.0", setembro/2023, 159 páginas). Lido inteiro como texto.
**Limite da leitura:** as figuras (prints do Postman do token, tela do portal de testes, quadro da página 89 do CIOT TAC-Agregado) são
imagens e não foram lidas; o que depende delas está em `DUVIDAS-PARA-REPOM.md`. O guia **não** traz: URL de produção da API Frete,
host do IdentityServer do 9520 (diz "{{host_IdentityServer}} fornecido pela equipe de Integração"), formato do corpo do token
(JSON ou formulário), enums completos de status, nem o detalhe do saldo do cliente. Isso não foi inventado.

## Convenções
- Host QA (único que o guia cita): `https://qa.repom.com.br/Repom.Frete.WebAPI/` (o guia grafa `Webapi`/`WebAPI`/`webapi`; é o mesmo).
  Relatórios: `https://qa.repom.com.br/Repom.Relatorio.WebAPI/` (versão 1.0). **PRD: não consta.**
- Versão da API por query `?x-api-version=`: 2.4 (RouteRequestAutomatic), 3.0 (Shipping), 3 / 3.0 (CIOTAggregate). Adiantamento flexível exige emissão a partir da 2.3.
- Tipos nas tabelas: A alfanumérico, N numérico, D data (`2000-08-20T19:28:12.474Z`), B booleano. Países aceitam `Brazil` ou o código `55` (o guia usa os dois).
- Resposta padrão: `{"Response":{"StatusCode":200},"Result":...}` ou `{"StatusCode":201,"Message":""}`; erro: `{"StatusCode":400},"Errors":[{"Message":"repomfrete: ...","ErrorCode":113}]`. Alguns métodos devolvem só `[{"Message","ErrorCode"}]`; alterações (PUT) devolvem **204** sem corpo.
- Ordem exigida antes de emitir contrato: cadastrar **veículo, contratado, motorista e rota** (todos individualmente, um por chamada).
- Pontos que **não** são configuráveis por API: se o contrato é "frete" ou "frete + vale-pedágio" (configurado no cadastro do cliente em homologação), parâmetro 57 (autorização de pagamento), 58 (agenda de pagamento), 156 (CIOT TAC-Agregado).

## 1. Token — `POST /Token` (tabela "POST/Auth")
Parâmetros: `User` (código do cliente na Repom, enviado pela Integração), `Version` (versão utilizada), `Password`, `Partner` (CNPJ do cliente
cadastrado na Repom). Resposta: `access_token` (guardar para as demais chamadas; JWT). Endpoint na figura 2 aparece como `connect/token`.
**Ambíguo:** host, formato do corpo, validade. → DUVIDAS (D-F01..D-F03).

## 2. Contratado (Hired) — cadastro por PF ou PJ
`POST /Hired` (síncrono; sucesso `{"StatusCode":201,"Message":""}`). Cadastro junto à ANTT; um por chamada; antes da emissão.
PJ costuma ser o dono do cartão e o motorista (PF) vira outro cadastro; se o próprio motorista é o contratado, mesmo CPF nos dois.
| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `Country` | A | sim | |
| `HiredType` | A | sim | `Person` (1) ou `Company` (2) |
| `NationalId` | N | sim | CPF/CNPJ sem pontuação |
| `Email` | A | não | |
| `Phones[]` | lista | sim | `AreaCode` N sim; `Number` N sim (sem traço); `Preferential` B sim; `TypeId` A sim: `Fixed`,`Cell`,`Residential`,`Message` |
| `BrazilianSettings.RNTRC` | N | sim | RNTRC válido na ANTT |
| `BrazilianSettings.HiredPessoaFisica` | obj | se PF | `INSS` N (obrigatório se PF), `RG` A |
| `BrazilianSettings.HiredPessoaJuridica` | obj | se PJ | `InscricaoEstadual`, `InscricaoMunicipal` (N, opcionais), `NomeFantasia` A, `OptanteSimplesNacional` B **sim** |
| `Address` | obj | não | `Street`, `Number`, `Complement`, `Neighborhood` (A), `ZipCode` N |
| `CompanyInformation.CompanyName` | A | se PJ | razão social |
| `HiredPersonalInformation` | obj | se PF | `Name` A sim; `BirthDate` D sim; `LegalDependents` N sim (só PF, abatimento do imposto); `Gender` A `Uninformed`/`Male`/`Female` |
| `FuelVoucherPercentage` | N | não | % do adiantamento flexível; máximo 80 |
- `GET /Hired/ByName/{name}` (nome ou parte): `Result[]` com os campos acima + `Locked`, `LockedReason`, `BrazilianTransportRegulatoryAgency{ANTTDataConsulta, ANTTEquiparadoTAC, ANTTNomeRazaoSocial, ANTTRNTRCAtivo, ANTTRNTRCDataValidade, ANTTTransportadorTipo}`, `Status` (ex. `AvailableForUse`), `UsesFuelVoucher`.
- `GET /Hired/ByDocumente/{country}/{nationalId}` (o guia grafa "ByDocumente"): `Result` objeto único, mesmo layout.
- `PUT /Hired/{country}/{nationalId}`: corpo = cadastro sem `Country`/`HiredType`/`NationalId`; resposta 204.
- `PATCH /Hired/lockUnlock/{country}/{nationalId}`: `{"Locked":true,"LockedReason":"..."}` → 200 + mensagem.

## 3. Motorista (Driver)
`POST /Driver` (201). Um por chamada; CNH **não** tem a validade checada. Campos: `Country` A sim; `NationalId` CPF sim; `DriverLicenseNumber` N sim (CNH);
`Address{Street,Number,Complement,Neighborhood,ZipCode}` não; `Phones[]` (`AreaCode`,`Number`,`Preferential`,`TypeId` — todos sim); `DriverPersonalInformation{BirthDate D sim, Name A sim, Gender A sim}`.
`GET /Driver/ByDocument/{country}/{nationalId}` → `Result{Locked,LockedReason,Country,NationalId,DriverLicenseNumber,Address,Phones,DriverPersonalInformation}`.
`PUT /Driver/{country}/{nationalId}` (204). `PATCH /Driver/lockUnlock/{country}/{nationalId}` (corpo `Locked`,`LockedReason`).

## 4. Veículo (Vehicle)
O cadastro define a **quantidade de eixos**, que determina o valor do vale-pedágio; atenção ao preencher. Cadastra também tipo, RNTRC e proprietário.
`POST /Vehicle` (201): `Country` A sim; `LicensePlate` A sim (`ABC1234` ou `ABC1D23`); `VehicleClassification` A sim (`Implement`=1, `Traction`=2, 0 não informado);
`VehicleCategory` A sim (`Passenger`, `CommercialLightweight`, comercial pesado — nome do enum pesado não vem no guia; 0 não informado, 1 passeio, 2 leve, 3 pesado); `VehicleAxles` A sim (`Axle01`..`Axle10`; 0 não informado);
`Type` A não (0 não informado, 2 Toco, 3 Truck, 4 Utilitário, 5 VAN, 6 VUC, 7 tipo 7, 8 tipo 8; exemplo usa `CityDelivery`);
`VehicleOwner{Country sim, NationalId sim, Type sim (Person/Company), BrazilianSettings{RNTRC sim, VehiclePessoaJuridica{NomeFantasia sim}}, VehiclePersonalInformation{Name sim}}`.
`GET /Vehicle/ByDocument/{country}/{license}` → `Result{Country,Type,VehicleCategory,VehicleAxles,VehicleClassification,LicensePlate,Locked,LockedReason,VehicleOwner{...,BrazilianTransportRegulatoryAgency{ANTTValidado,ANTTDataValidacaoFrota,ANTTSituacaoFrota}},Status}`.
`PUT /Vehicle/{country}/{license}` (204); `PATCH /Vehicle/{country}/{license}` (grafado "PACTH") com `Locked`,`LockedReason`.

## 5. Tipos ANTT — `GET /AnttTypes/LoadTypes`
`Result[{CodeType, Description}]`: 1 Granel sólido, 2 Granel líquido, 3 Frigorificada, 4 Conteinerizada, 5 Carga Geral, 6 Neogranel, 7 Perigosa (granel sólido), 8 Perigosa (granel líquido). Usado em `LoadBrazilianANTTCodeType`.

## 6. Rota automática e consultas de rota
`POST /RouteRequest/RouteRequestAutomatic?x-api-version=2.4` — síncrono, devolve rota e percurso na hora. Campos: `BranchCode` N sim (filial cadastrada na Repom); `OriginIBGECode` N sim; `DestinyIBGECode` N sim; `RoundTrip` B sim;
`TraceIdentifier` A não (identificador da rota no cliente); `RouteStopIBGE` lista N não. Regras de IBGE, 23 paradas e "não repetir origem/destino" idênticas à VPR (sem os 2 primeiros dígitos e sem zero à esquerda).
Resposta: `Data{Status:1, RouteCode, TraceCodeRepom, ExternalTraceCode, ErrorDescription}`, `Errors[]`. **Em homologação a rota precisa ser aprovada pelo analista de integração**; em produção é 100% automática.
Consultas (todas GET, devolvem rota, percurso e valor de pedágio por eixos): `/Route/ByCEP/{cep}/{vehicleAxles}`; `/Route/byibge/{ibgecode}/{toibgecode}/{vehicleaxles}`; `/Route/byroutecode/{tracecode}/{routecode}/{vehicleaxles}`; `/Route/bytraceidentifier/{traceidentifier}/{vehicleaxles}`;
`/Route/getbycepsuspendedaxler/{cep}/{tocep}/{vehicleaxles}/{suspendedaxlenumber}/{returnsuspendedaxlenumber}` (o caminho no guia está truncado); `GET /RouteRequest/{traceIdentifier}` → `Result{Id,Status ("CompletedAutomatically"),TraceCode,RouteCode,DisapprovalReason,DisapprovalReasonCode,TraceIdentifier}`.
Item de resposta: `TraceCode, RouteCode, Distance, RoundTrip, Name, TotalVPRValue, TraceIdentifier` (+ `TotalVPRValueGoing/Return` na consulta por CEP e eixos suspensos).

## 7. Validações (`ShippingValidation`) — antes de emitir
- `GET /ShippingValidation/ByVehicles/{vehicles}` → `Vehicles[{LicensePlate, Validate, MessageError}], Errors[]` (veículo cadastrado e documentação em dia).
- `GET /ShippingValidation/ByVehiclesTag/{vehicles}` → `Vehicles[{LicensePlate, HasTag, StatusTag, MessageError}]` (tag de VPR Repom ativa).
- `GET /ShippingValidation/ByHiredDocument/{country}/{document}` → `HiredValidate, DateValidateRNTRC, Message, Errors[]` (prestador e RNTRC válidos na ANTT).
- `GET /ShippingValidation/ByCardNumberHiredDocument/{cardnumber}/{country}/{document}` → `CardValidate, PayCardActivationFee, ValueCardActivationFee, Errors[]`.
Como `{vehicles}` aceita mais de uma placa não está escrito (separador). → D-F10.

## 8. Emissão de contrato — `POST /Shipping?x-api-version=3.0` (**assíncrono**)
O corpo é um **array** de contratos. Resposta 201: `Message: "OperationKey: <guid>"`. O erro só é descoberto consultando a **chave de operação** (`GET /Shipping/StatusProcessing/ByOperationKey/{operationKey}`) — o guia diz que implementar essa consulta é **essencial**.
Contrato só frete ou frete+VPR é decidido pela configuração do cliente; o nó `VPR.Issue=false` deixa o vale opcional (pedágio por fora na viagem).
| Campo | Tipo | Obrig. | Observação |
|---|---|---|---|
| `Identifier` | A | sim | código único do contrato no cliente (**chave de consulta/idempotência nossa**) |
| `Country`, `HiredCountry` | A | sim | |
| `HiredNationalId` | N | sim | CPF/CNPJ do contratado |
| `OperationIdentifier` | N | sim | id da operação (cadastrada pela Repom) |
| `CardNumber` | N | sim | cartão do contratado/motorista; **`0` = viagem digital** (conta digital, parametrização interna) |
| `VPRCardNumber` | N | não | cartão do VPR |
| `BrazilianRouteTraceCode` / `BrazilianRouteRouteCode` | N | sim | percurso e roteiro (da rota já cadastrada) |
| `IssueDate` | D | sim | |
| `TotalFreightValue` | N | sim | valor do frete |
| `TotalLoadWeight` | N | sim | peso; decimal com ponto |
| `TotalLoadValue` | N | sim | valor da carga |
| `AdvanceMoneyValue` | N | sim | adiantamento, limitado ao parametrizado para o cliente |
| `BranchCode` | N | sim | |
| `LoadBrazilianNCM` | N | sim | NCM da mercadoria (usado no CIOT) |
| `LoadBrazilianANTTCodeType` | N | sim | tipo de carga ANTT (seção 5) |
| `BrazilianIBGECodeSource/Destination`, `BrazilianCEPSource/Destination`, `TravelledDistance` | N | não | |
| `VPR{Issue B sim, VPROneWay B sim ("true ida e volta / false só ida", o texto é contraditório com o nome), VPRSuspendedAxleNumber A sim, VPRReturnSuspendedAxleNumber A sim}` | | | |
| `ShippingPayment{ExpectedDeliveryDate D sim, ExpectedDeliveryLocationType A sim: Branch, GasStation, DigitalPayment, Hired}` | | | |
| `Drivers[{Country, NationalId, Main}]` | | sim | `Main` = portador do cartão |
| `Documents[{BranchCode, DocumentType, Series, Number, EletronicKey}]` | | sim | tipos: 1 CTE, 2 NFe, 3 NFSe, 4 CRT, 5 OCC, 6 Romaneio, 14 MDFe; `EletronicKey` obrigatória para CTE/NFe |
| `Vehicles[{Country, LicensePlate}]` | | sim | |
| `AccountingAdjustments[{Identifier, Value}]` | | não | movimento cadastrado no portal pelo administrador |
| `ShippingReceiver{Country, NationalId, Name, ReceiverType (1 Person, 2 Company)}` | | sim | |
| `Taxes[{Type: IRRF/SEST/SENAT/INSS (ou 1,2,3,34), Value}]` | | **sim se o cliente calcula impostos** | |
| `ShippingFuel{FuelCardNumber, FuelValue}` | | não | adiantamento flexível |
| `ShippingInternationalRoute{...}` | | não | rota internacional; não usaremos |
Campos **extras da emissão sem operação** (cliente com muitas operações): em `Documents[]`: `CheckDocument` B, `DocumentCheckLists[{Id, PaymentBlock}]`, `DeliveryLocationType` (`AnyWhere`, `GasStation`, `Branch`); no contrato: `ProcessingShippingType` (`OnlyFreight`...), `Outsourcing` B (subcontratação), `BillingBreak` (`NotCharge`=0, `Integral`=1, `Partial`=2), `ToleranceBreak` decimal.
**Emissão com CIOT TAC-Agregado:** dois campos novos: `CIOTShippingType` (1 padrão, 3 TAC-Agregado) e `ExistingContractId` (0 na primeira viagem; depois, o id do contrato da primeira).
Erros de TAC-Agregado: 40 contrato não está aberto (precisa estar em trânsito); 41 prestador tem contrato TAC aberto e o id não foi informado; 43 contrato existente não encontrado; 44 vinculado a outro prestador; 45 não é do tipo TAC-Agregado; 47 parâmetro **156 `ModuloEmissaoCIOTTacAgregado`** precisa estar habilitado.

## 9. Consultas de contrato
- `GET /Shipping/ByShipping/{shippingId}` e `GET /Shipping/ByIdentifier/{identifier}` → `Result{ShippingId, CIOT, CIOTInContingency, Status (ex. "InTransit","Finished"), Identifier, HiredNationalId, OperationIdentifier, CardNumber, rota, ShippingPayment{ExpectedDeliveryDate,...,DeliveryDate}, IssueDate, TotalFreightValue, TotalLoadWeight, TotalLoadValue, AdvanceMoneyValue, ConsumedValue, Drivers, Documents, Vehicles, AccountingAdjustments[{Date,Identifier,MovementType,Description,AdjustmentType Credit/Debit,Value}], ..., Occurences[{Type,Detail,IssueDate}], VPRCardNumber, VPRValue, RouteDescription, TraceDescription, ShippingFuel}`.
  `Occurences` traz erros de CIOT (ex.: `ErrorInCIOTEmissionAttempt`) e o aviso de **CIOT emitido em contingência**.
- `GET /StatusProcessing/ByIdentifier/{identifier}` → `Result{ShippingId, Identifier, Status ("Finished"), Errors[]}` (o guia grafa sem o prefixo `Shipping/`).
- `GET /Shipping/StatusProcessing/ByOperationKey/{operationKey}` → `Result{OperationKey, Results[{ShippingId, Identifier, Status, Errors[]}]}`.
- `GET /ByStatus/{datainicial}/{datafinal}/{status}` (caminho truncado no guia) → `Result[{ShippingId, OperationIdentifier, Status (número)}]`.
- `GET /shipping/ByTaxRecalculation/Pending/{initialDate}/{finalDate}` → lista com `ShippingId, Identifier, Status, TotalFreightValue, ConsumeValue, ShipPaymentDate, DeliveryLocationType, DeliveryLocationDescription`.
- `GET /Shipping/FuelConsume/ByShipping{shippingID}` (adiantamento flexível; falta a `/` no guia) → `[{Ticket, GasStationName, GasStationNationalId, CancelUser, CancelDate, IssuanceUser, UnitPrice, Value, Litre, ProductDescription, StatusID, Date}]`.

## 10. Movimentos, impostos, taxas e alterações do contrato
- `POST /Movement/MovementRegistration`: cadastra tipo de movimento: `CodigoCliente` N, `NomeMovimento` A, `TipoMovimento` A (`D` débito/`C` crédito), `IncideSobreImposto` B, `IncideSobreFrete` B, `LiberaSaldo` B (todos obrigatórios). O texto diz que o administrador cadastra no **portal**.
- `GET /Movement/GetMovement` → `Result[{Identifier, Description, AdjustmentType, FocusOnTaxes, FocusOnFreight, ReleaseBalance}]`.
- `PATCH /Shipping/AddTaxes`: `[{ShippingID, ShippingTaxes:[{Type, Value}]}]`; `PATCH /Shipping/AddTaxesByIdentifier`: `[{Identifier, ShippingTaxes:[...]}]` → `[{Message, ErrorCode}]`.
- `PATCH /Shipping/AddDocument/{shippingId}`: `{BranchCode, DocumentType, Series, Number, EletronicKey}`.
- `PATCH /Shipping/AddMoviment/{shippingId}` (grafado "AddMovement" na tabela): `{Identifier, Value}`; contrato em Trânsito ou Pendente. Erro típico: `113 O tipo de movimento 6449 não é válido para o Cliente`.
- `PATCH /Shipping/AdvanceFreightBalanceByIdentifier/{identifier}`: antecipa saldo de frete (corpo com o valor; **campo não documentado**).
- `PATCH /Shipping/lockUnlock/{shippingId}`: `{Locked, LockedReason}` (bloqueio temporário).
- **Cancelar:** `PATCH /Shipping/Cancel/{id}` → 200 "Shipping X canceled successfully". Só sem nenhum movimento do motorista (inclusive vale-pedágio). **Prazos (ANTT): CIOT 24 h, vale-pedágio 72 h, TAG 15 min.**
- **Interromper:** `PATCH /Shipping/Interruption/{id}` — "tipo de cancelamento" para quando houve consumo do motorista (inclusive pedágio).

## 11. CIOT TAC-Agregado (`x-api-version=3`)
O CIOT TAC-Agregado pode ser reutilizado para o mesmo prestador; o cliente **encerra** ao finalizar a viagem. Exige parâmetro 156.
- Emissão: `POST /Shipping` com `CIOTShippingType=3` e `ExistingContractId` (seção 8).
- Retificar (trocar veículo): `PATCH /Shipping/CIOTAggregate/ShippingRectification/?x-api-version=3`: `{TransportOperationIdentifierCode, Vehicle:[{CarLicensePlate, RNTRC}], QuantityRate, PriceRate}`. Erros 1 CIOT não informado; 2 não encontrado; 3 cancelado; 4 encerrado; 5 emissão pendente; 6 viagem/CIOT é do tipo padrão.
- Cancelar: `POST /Shipping/CIOTAggregate/CancelCIOT/?x-api-version=3`: `{TransportOperationIdentifierCode, Reason}`. Erros 1..6 (motivo não informado = 2).
- Encerrar: `POST /Shipping/CIOTAggregate/ClosingCIOT/?x-api-version=3.0`: `{TransportOperationIdentifierCode}`. Erros 1..6.

## 12. VPR na emissão do contrato e consulta
Para frete+VPR é preciso rota cadastrada antes e informar o cartão (`VPRCardNumber`) ou usar TAG (a busca é pela placa; placa sem TAG e sem cartão = erro de falta de cartão). Nós: `VPR{Issue:true,VPROneWay,VPRSuspendedAxleNumber,VPRReturnSuspendedAxleNumber}`.
Consulta das praças: `GET /VPR/TollList/ByShippingIdentifier/{shippingIdentifier}` → `Result[{TollCode, TollName, AxleNumber, AllowSuspendedAxle, TollValue, VPRStatus ("Uploaded")}]`.
(O vale-pedágio **avulso** (sem frete) é a API VPR v2.0 de `ESPECIFICACAO-VPR.md`.)

## 13. Autorização de pagamento e agenda
Parâmetro 57 habilitado: toda viagem quitada só é **paga** quando o cliente envia a autorização. Parâmetro 58 (agenda): a quitação fica "quitada" e o saldo é liberado só na data agendada.
- `POST /Payment/Authorization` (tabela diz `POST/PaymentAuthorization`): `[{ShippingId N (não), Identifier N (sim), Branch N (não), BranchCode N (sim), PaymentDate D (sim, AAAA-MM-DD)}]`.
- `GET /PaymentAuthorization/ByBatchId/{batchId}` (consultar muda o contrato de autorizado para **Pago**), `/ByIdentifier/{identifier}`, `/ByShippingId/{shippingId}` → `{ShippingId, PaymentDate, AmountPaid, BatchId}`.
- `PATCH /PaymentAuthorization/Cancel`: `[{ShippingId, Identifier, Branch, BranchCode}]`. Só cancela o **agendamento**; se o motorista já recebeu na data, não desfaz.

## 14. Quitação (ShippingPayment)
Após a finalização da viagem; contratado recebe os créditos pendentes e o contrato fica **pago**. Pré-pago exige saldo; pós-pago passa por análise de crédito.
- `POST /Shipping/Payment` no texto, `POST /ShippingPayment` na tabela: `{BranchCode N sim, ShippingID A sim, TotalUnloadWeight N não, Documents:[{Number, Series, BranchCode, DocumentType, DocumentStatus: Dismissed|Lost|Delivered|Reshipping}]}`. **Caminho ambíguo** (D-F12).
- `GET /ShippingPayment/DownloadPaymentFile/{shippingID}` — comprovante/valores liberados (a tabela diz "comprovante de prestação de contas").
- `PATCH /ShippingPayment/Cancel/{shippingID}` — só se o cliente usa Autorização de Pagamento. `PATCH /ShippingPayment/DocumentLost/{shippingID}` — altera documento na quitação (corpo não documentado). Ambos devolvem `[{Message, ErrorCode}]`.

## 15. Saldo do cliente
Só aparece na tabela inicial: `GET /Balance/Financial/GetByDateInicialDateFinal` ("consultar o saldo do cliente da Repom"). **Sem seção de detalhe** (parâmetros, formato, resposta): fica NÃO IMPLEMENTADO (D-F15).

## 16. Faturas e conciliação (só resumo, não implementado)
- Detalhamento da fatura: `GET /Statement/Billing/GetByCustomerOrder/{orderId}` (só faturamento automático). Faturas abertas até 90 dias: `GET /Statement/Billing/GetByCustomerStartDateEndDate/{start}/{end}` (status 0 aberto, 1 pago, 2 pago parcial, 3 atraso, 4/vazio todas) e variante com status.
- Conciliação (versão 1.0, host `Repom.Relatorio.WebAPI`): financeiro `Statement/Financial/GetByCustomer` (90 dias), `GetByCustomerDate/{date}`, `GetByCustomerStartDateEndDate/{start}/{end}`; contábil `Statement/Accounting/GetByCustomer`, `GetByCustomerDateInicialDateFinal/{i}/{f}`, `GetCustomerByViagemID/{id}`, `GetCustomerByContratoID/{id}`. Regra: financeiro após o lançamento no contrato; contábil só após a quitação. Necessária quando é a Repom que calcula os impostos.

## 17. Adiantamento flexível (só resumo, não implementado)
Vale-combustível integrado à TicketLog; máximo 80%. Jornada: `POST /Hired` com `FuelVoucherPercentage` → `PUT /Hired/{country}/{nationalId}` para alterar → `PATCH /ShippingFuelBenefit/JoinHiredDriverCard` (`{CardNumber (10 últimos dígitos no teste), HiredNationalID, DriverNationalId}`) → `POST /Shipping` com `ShippingFuel{FuelCardNumber, FuelValue}`. Consulta de consumo: seção 9.

## 18. Portal dos testes integrados (página 155)
A Repom abre um portal de acompanhamento dos testes (login e senha entregues na abertura do projeto). Mostra: progresso dos testes, linha do tempo do projeto, progresso geral, data de início e expectativa de término, painel com percentual de testes feitos, pendentes e validados, e o **menu Cenários** (quais já foram executados e quais pendentes). **Os cenários são configurados pelos analistas de integração da Repom** e o guia não os lista: só a Repom diz quais são. O guia serve para o desenvolvimento e para a homologação de uma nova conta. Ver `CHECKLIST-HOMOLOGACAO.md`.
