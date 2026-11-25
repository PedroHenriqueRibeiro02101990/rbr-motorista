# Auditoria do corpo do POST /Shipping (25/11/2026)

Fontes: Guia Técnico 3.0 (cap. 34-36, 44, 60, 66) e Swagger v3 de QA (`Repom.Frete.WebAPI.Models.V3_0.Shipping.Request.Shipping`). Motivo: o contrato RBRQA261125000419 terminou em `Error`: `"3-SENAT" não informado. Verifique o parâmetro "SENAT".` Nada foi emitido nesta auditoria.

## Campos (S = obrigatório sempre, C = condicional, O = opcional)
| Campo | Tipo | Regra |
|---|---|---|
| Identifier, Country, HiredCountry, HiredNationalId | S | Country/HiredCountry: enum (`Brazil`) |
| OperationIdentifier | S | máx. 10; precisa ser uma operação cadastrada (`GET /Operation`) |
| CardNumber | C | 0 = conta digital (viagem digital) |
| VPRCardNumber | C | só com vale-pedágio |
| BrazilianRouteTraceCode / RouteCode | S (guia) | rota do próprio cliente (`TraceCodeRepom`/`RouteCode`) |
| IssueDate | S | >= hoje |
| TotalFreightValue (>0), TotalLoadWeight, TotalLoadValue, AdvanceMoneyValue (>=0), BranchCode (máx. 10) | S | adiantamento limitado ao parâmetro do cliente |
| LoadBrazilianNCM (máx. 4), LoadBrazilianANTTCodeType | S (guia) | tipo pela lista `ANTTTypes/loadtypes` |
| BrazilianIBGECodeSource/Destination | C | guia "não", mas o QA devolve 725 sem eles (CIOT) |
| BrazilianCEPSource/Destination, TravelledDistance | C | CEP com 8 dígitos; distância inteira <= 99999 |
| VPR {Issue, VPROneWay, VPRSuspendedAxleNumber, VPRReturnSuspendedAxleNumber} | S | eixos são **inteiros** no Swagger e no exemplo |
| ShippingPayment {ExpectedDeliveryDate, ExpectedDeliveryLocationType} | S | tipo: Branch/GasStation/DigitalPayment/Hired |
| Drivers[] {Country, NationalId, Main} | S | um motorista principal |
| Documents[] {BranchCode, DocumentType, Series, Number, EletronicKey} | S | chave obrigatória para CTE/NFe (44 dígitos); CheckDocument, DocumentCheckLists, DeliveryLocationType opcionais |
| Vehicles[] {Country, LicensePlate} | S | |
| ShippingReceiver {Country, NationalId, Name (máx. 100), ReceiverType} | S | Person/Company |
| **Taxes[] {Type, Value}** | **C** | **obrigatório quando o cliente calcula os impostos** (guia); o exemplo manda os quatro: IRRF=1, SEST=2, SENAT=3, INSS=34 (Swagger aceita o nome); Value >= 0 |
| MinimumFreightCost {DistanceTravel, EmptyReturn, HighPerformanceTransport, VeichleComposition} | C | piso da ANTT: as 4 chaves |
| AccountingAdjustments, ShippingFuel, ShippingInternationalRoute, ProcessingShippingType, Outsourcing, BillingBreak, ToleranceBreak, FreightBreak, CIOTShippingType, ExistingContractId, Lat/Long, Stops, RoutesANTT, SubContractor*, CustomerPayment... | O | não enviados |

## Diferenças encontradas (corpo enviado em 25/11 vs guia/Swagger)
| # | Antes | Agora |
|---|---|---|
| 1 | `Taxes` só com SEST (10,50) | IRRF 0, SEST 10,50, SENAT 7,00, INSS 77,00 (valores fictícios de QA; base 20% de R$ 3.500) |
| 2 | `VPRSuspendedAxleNumber`/`VPRReturnSuspendedAxleNumber` como texto ("0") | inteiros (0), como Swagger e exemplo do guia |
| 3 | limite de 2 emissões por rota, já gasto | limite 4 (+2 autorizadas), motivo no código |

Sem diferença: Identifier, operação do modelo, CardNumber 0, rota 1/148993, IBGE, CEP, distância 885, NCM, ANTT, VPR.Issue false, pagamento, motorista, CT-e novo com DV, placa, destinatário, MinimumFreightCost. O payload da emissão de 17/11 (CPN1377 / 2166947) não está guardado no repositório nem em `repom_requisicoes`; só o GET do modelo (prestador, motorista, placa, rota 1/143217, NCM, documento, destinatário), que a emissão reaproveita. Se o GET mostrar débitos de IRRF/SEST/SENAT/INSS em `AccountingAdjustments`, confirma os quatro impostos naquele contrato (não lido nesta rodada). Os valores dos impostos não são validados pelo Swagger, só `>= 0`; a Repom pode recusar a base.
