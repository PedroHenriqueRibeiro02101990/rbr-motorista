# Schema da emissão do vale-pedágio (POST /api/RepomViagem/ValePedagio), manual API VPR v2.0 (nov/2025), seção 4.3

Swagger/OpenAPI do vale-pedágio no QA: **não existe** (GET sem token e com token do vale em `/Repom.ValePedagio.WebAPI/swagger`, `/swagger/v1/swagger.json`, `/swagger/index.html`, `/help`: todos 404). A fonte é o manual (PDF de 45 páginas, texto extraído e lido por inteiro).

| Campo (caixa do exemplo) | Tipo | Obrig. | Tam. | Observação do manual | No nosso corpo |
|---|---|---|---|---|---|
| ProcessoCodigoCliente | string | sim | 20 | id único da compra no sistema de origem | RBV+aammdd+hhmmss (15) |
| Placa | string | sim | 7 | tração | sim |
| NumeroEixos | integer | sim | 1 | eixos da tração | sim |
| CarretaPlaca | string | opc. | 7 | | sempre presente ("" sem carreta) |
| CarretaNumeroEixos | integer | opc. | 1 | soma se mais de uma carreta | sempre presente (0 sem carreta) |
| NumeroCartao | string | não | 9 | em desuso (carga via TAG) | **proibido, não enviado** |
| NomeTransportador | string | sim | 100 | precisa RNTRC associado à placa na ANTT | sim |
| DocumentoTransportador | string | sim | 14 | CPF/CNPJ | sim |
| DocumentoSubcontratado | string | opc. | 14 | só se o principal não tem RNTRC na placa | sempre presente (""): é o que o exemplo faz |
| NomeMotorista | string | sim | 50 | | sim |
| DocumentoMotorista | string | sim | 11 | CPF | sim |
| CnpjFilial | string | sim | 14 | filial de emissão | sim |
| UsuarioEmissao | string | sim | 50 | | sim |
| Roteiro.RoteiroCodigo / PercursoCodigo | integer | opc.* | | *não obrigatório se informar praças; **tem de existir na conta 9501** | rota própria da 9501 (ação rota_vpr) |
| documento[].documentoCodigo / serie | string | opc. | 100 / 10 | CT-e, NF-e, OCC | 1 item (CT-e do contrato-modelo) |
| Pracas, PracasVolta | array | opc. | | só com roteirizador próprio | **proibido, não enviado** |
| Configuracao.EixosSuspensosIda / Volta | integer | não | 1 | | sempre objeto {0,0} |
| UtilizaCarreta | boolean | não | | exemplo traz "true" (texto) | boolean sempre presente |

Exemplo do manual (4.3): `{"ProcessoCodigoCliente":"FL462","Placa":"XXX0000","NumeroEixos":2,"CarretaPlaca":"AAA1111","CarretaNumeroEixos":4,"NumeroCartao":"","NomeTransportador":"Transportadora Teste","DocumentoTransportador":"00000000000","DocumentoSubcontratado":"","NomeMotorista":"Motorista Teste","DocumentoMotorista":"00000000000","CnpjFilial":"00000000000000","UsuarioEmissao":"User Test","Roteiro":{"RoteiroCodigo":0,"PercursoCodigo":0},"documento":[{"documentoCodigo":"141506","serie":"2"}],"Pracas":[256],"Configuracao":{"EixosSuspensosIda":0,"EixosSuspensosVolta":0},"UtilizaCarreta":"true"}`
Erro: `result.status=false`, `result.descricao`, `result.numeroErro` (ex.: 347 placa inválida). Teste automático: `repomVprSchemaManual.test.ts` (chaves do corpo = chaves do exemplo, menos Pracas/PracasVolta/NumeroCartao).

## Diferenças do corpo das 2 emissões que falharam (erro 0, NullReference) contra o manual
| # | Diferença | Emissão 1 | Emissão 2 | Agora |
|---|---|---|---|---|
| 1 | Roteiro 1/143217 não existe na 9501: `POST /Api/Roteiro` na roteirização da 9501 respondeu 400 "Roteiro inativo ou não cadastrado para o cliente" | sim | sim | rota própria da 9501 |
| 2 | DocumentoSubcontratado ausente | sim | "" | "" |
| 3 | UtilizaCarreta ausente | sim | false | false |
| 4 | documento ausente | sim | 1 item | 1 item |
| 5 | CarretaPlaca / CarretaNumeroEixos ausentes | sim | sim | "" e 0 |

Passo 1 (17/11): não há corpo de VPO da 9501 de 17/11 no banco (repom_requisicoes começa em 24/11, repom_operacoes e repom_rotas vazias), nos docs, nas evidências nem no git; o checklist marca A9 (emissão do VPR) como "não feito". A emissão de 17/11 foi do contrato do Frete, e a rota 1/143217 veio dele.
