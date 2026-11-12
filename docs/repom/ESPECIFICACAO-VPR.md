# Especificação — API Vale-Pedágio Repom (VPR) v2.0 — cliente 9501

Fonte: `API-VPR-v2.0.pdf` (45 páginas, "Versão 2.0 atualizado em novembro de 2025"), lido inteiro. O PDF não é versionado
(regra `docs/repom/*.pdf` no `.gitignore`). Este arquivo foi conferido contra o PDF; a seção **Correções** diz o que o
resumo que o Claude tinha extraído deixava errado ou incompleto, e o que o código antigo (`repomClient.ts`,
`repomVpoClient.ts`) fazia de diferente do manual.

A solução tem DUAS APIs, com dois logins diferentes:
1. **Roteirização** (OAuth2 client_credentials) — cria rota e calcula o valor do pedágio.
2. **Vale-Pedágio** (usuario/senha, JWT de 24 h) — TAG, emissão, cancelamento e consulta do VPR.

A Repom exige **homologação com evidências** antes de usar em produção (página 4). Ver `CHECKLIST-HOMOLOGACAO.md`.

## URLs

| Serviço | QA | PRD |
|---|---|---|
| Token roteirização | `https://qa.repom.com.br/Repom.IdentityServer/connect/token` | `https://www.repom.com.br/Repom.IdentityServer/connect/token` |
| Rota (cadastro) | `POST https://roteirizacaoa.repom.com.br/Api/Rota` | `POST https://roteirizacao.repom.com.br/Api/Rota` |
| Rota (consulta) | `GET https://roteirizacaoa.repom.com.br/api/rota?codigoRoteiroCliente=` | `GET https://roteirizacao.repom.com.br/api/rota?codigoRoteiroCliente=` |
| Valor do pedágio | `POST https://roteirizacaoa.repom.com.br/Api/Roteiro` | `POST https://roteirizacao.repom.com.br/Api/Roteiro` |
| Token vale-pedágio | `POST https://qa.repom.com.br/Repom.ValePedagio.WebAPI/api/Token` | `POST https://www.repom.com.br/Repom.ValePedagio.WebAPI/api/Token` |
| Consulta TAG | `GET .../Repom.ValePedagio.WebAPI/api/RepomVeiculo/tags/placa?placa=` | idem (host `www.repom.com.br`) |
| Emitir VPR | `POST .../api/RepomViagem/ValePedagio` | idem |
| Cancelar VPR | `POST .../api/RepomViagem/CancelaViagem` | idem |
| Consultar VPR | `.../api/RepomViagem/ID?ID=<codigoViagem>` (o manual diz POST; o curl de exemplo não tem corpo) | idem |

O manual escreve `http://` nos três endpoints de viagem do vale-pedágio. **Usamos `https://`** sempre.
Processo é síncrono em todos. Todas as respostas esperadas: 200, 400 (validação), 401 (token inválido/ausente), 500.
Exceções: consulta de TAG não lista 400; consulta de rota lista também 204 e 404.

## 1. Token da roteirização (3.1)
`POST` `application/x-www-form-urlencoded`, campos: `client_id` (string, sim), `client_secret` (string, sim),
`grant_type` (string, sim, = `client_credentials`). Resposta 200: `access_token` (JWT), `expires_in` (int, 3600),
`token_type` ("Bearer"), `scope` (ex.: `repom_integracaorotas_api`). Erro: `{"error":"invalid_client"}`.
Boas práticas do manual: guardar em memória; nunca logar; renovar antes (exemplo: aos 55 min); **nunca um token por
requisição**; em 401 renovar e repetir, sem loop infinito. Usar header `Authorization: Bearer <access_token>`.

## 2. Cadastro de rota (3.2) — `POST /Api/Rota`, JSON
Campos (tipo, obrigatório, tamanho):

| Campo | Tipo | Obrig. | Tam. | Observação |
|---|---|---|---|---|
| `IdaVolta` | boolean | sim | – | true = ida e volta |
| `CodigoRoteiroCliente` | string | sim | 10 | código da rota no nosso sistema; é a chave de consulta |
| `Origem.CodigoIBGE` | string | cond. | 5 | IBGE sem os 2 primeiros dígitos e sem zeros à esquerda; exige `Estado` |
| `Origem.Estado` | string | cond. | 2 | exige `CodigoIBGE` |
| `Origem.Latitude` / `Origem.Longitude` | string | cond. | 20 | um exige o outro |
| `Origem.Cep` | string | cond. | 8 | |
| `Destino.*` | idem Origem | | | |
| `Paradas[].*` | idem Origem | opcional | | até **23** paradas (25 cidades com origem e destino); sequência = ordem informada; não repetir origem/destino |
| `VoltarMesmoCaminhoIda` | boolean | não | – | |
| `TipoVeiculo` | integer | não | 1 | 1 leve, 2 pesado |
| `TipoRoteiro` | integer | não | 1 | **1 Roteiro Curto, 2 Roteiro Rápido, 3 Roteiro Mais Curto, 4 Roteiro Econômico** |
| `Cliente` | string | não | 4 | código cliente Repom |

Regras: para cada ponto vale **só um** conjunto (IBGE+UF **ou** lat+long **ou** CEP). Descrição dos tipos de rota: mais rápida
(tempo), mais curta (distância), curta (meio-termo tempo/distância), econômica (tempo/consumo). **IBGE:** `1801012` vira
`1012`; `3550308` vira `50308`; `3304557` vira `4557`; `3524709` vira `24709`.
Exemplo do manual: `{"codigoRoteiroCliente":"RT321","idaVolta":true,"origem":{"codigoIBGE":"50308","estado":"SP"},"paradas":[{"cep":"01310100"}],"destino":{"codigoIBGE":"4557","estado":"RJ"},"TipoRoteiro":1}`.
Sucesso (200): `codigoRoteiroExterno` (string 10, o nosso código), `codigoRoteiroRepom` (string 10), `codigoPercurso` (string 10),
`status` (**1 = sucesso**), `descricaoErro` (sempre null no sucesso).
Erro de negócio: `{"isValid":false,"errors":[{"descricao":"Express: IBGE e/ou CEP da cidade de destino inválido"}]}`.
Erro de estrutura do JSON (400): problem-details `{type,title,status:400,traceId,errors:{"$.destino.codigoIBGE":["The JSON value could not be converted ..."]}}`.

## 3. Consulta de roteiro (3.3) — `GET /api/rota?codigoRoteiroCliente=`
Resposta: `roteiro{percursoCodigo:int, roteiroCodigo:int, cidadeOrigem(40), estadoOrigem(2), cidadeDestino(40), estadoDestino(2),
percursoCodigoCliente(10), sentido (0=IDA, 1=IDA/VOLTA), percursoDescricao(500), percursoTipoDescricao ("desconsiderar")}`,
`paradas[{indice, cidadeNome, estadoNome}]`, `descricaoErro`, `status` (boolean aqui, diferente do POST). Códigos: 200, 204, 404, 400, 401, 500.

## 4. Valor do pedágio (3.4) — `POST /Api/Roteiro`
Entrada: `CodigoRoteiro` (**integer**, sim), `CodigoPercurso` (**integer**, sim), `NumeroEixos` (**string**, sim, total do
veículo/conjunto), `NumeroEixosSuspensosIda` e `NumeroEixosSuspensosVolta` (string, opcionais; só quando a rota é ida e volta).
Resposta: `valorTotalVpr` Numeric(9,2), `valorVprIda` Numeric(9,2), `valorVprVolta` (opcional), `descricaoPercurso` (500).
Erros: mesmos dois formatos da seção 2 (`isValid/errors[].descricao` e problem-details 400).
Exemplo: `{"CodigoRoteiro":140476,"CodigoPercurso":334,"NumeroEixos":"7",...}` → `{"valorTotalVpr":793.36,"valorVprIda":422.95,"valorVprVolta":370.41,...}`.

## 5. Token do vale-pedágio (4.1) — `POST /api/Token`, JSON
Entrada: `usuario` (string, sim), `senha` (string, sim). Resposta: `authenticated` (bool), `created` ("2025-11-12 17:00:19"),
`expiration` (24 h depois, mesmo formato), `accessToken` (JWT). Renovar antes do vencimento (manual sugere 10 min antes).
Credencial **diferente** da roteirização. Respostas: 200, 400, 500.

## 6. Consulta de TAG (4.2) — `GET /api/RepomVeiculo/tags/placa?placa=`
Valida a TAG da placa nas OSAs Taggy, Veloe, ConnectCar, MoveMais e SemParar. A TAG precisa estar ativa **e** apta ao VPR; a
TAG contratada por banco (ex.: C6 Tag) não é elegível — tem de ser contratada direto com a OSA.
Resposta (array, um item por administradora): `nomeTag` (ex.: "Tag Edenred", "Tag Veloe", "Tag Sem Parar"), `numeroTag`
(quando disponível), `codigoStatusTag` (**1 Ativa, 2 Bloqueada, 3 Cancelada, 4 Saldo Negativo, 5 Não Localizado, 6 Parceiro Não
Autorizado**), `statusTag` (texto), `apto` ("Sim"/"Não"), `observacao` (ex.: "Placa não possui Tag ou está com restrições").
Códigos: 200, 401, 500.

## 7. Emissão do vale-pedágio (4.3) — `POST /api/RepomViagem/ValePedagio`, JSON
| Campo | Tipo | Obrig. | Tam. | Observação |
|---|---|---|---|---|
| `processoCodigoCliente` | string | sim | 20 | identificador único da compra no nosso sistema (**chave de idempotência**) |
| `placa` | string | sim | 7 | tração |
| `numeroEixos` | integer | sim | 1 | eixos da tração |
| `carretaPlaca` | string | opcional | 7 | |
| `carretaNumeroEixos` | integer | opcional | 1 | com mais de uma carreta, a **soma** |
| `numeroCartao` | string | não | 9 | em desuso (carga é por TAG) |
| `nomeTransportador` | string | sim | 100 | deve ter RNTRC associado à placa na ANTT |
| `documentoTransportador` | string | sim | 14 | CNPJ ou CPF |
| `documentoSubcontratado` | string | opcional | 14 | só quando o transportador principal não tem RNTRC na placa |
| `nomeMotorista` | string | sim | 50 | |
| `documentoMotorista` | string | sim | 11 | CPF |
| `cnpjFilial` | string | sim | 14 | filial de emissão |
| `usuarioEmissao` | string | sim | 50 | |
| `roteiro.RoteiroCodigo` | integer | opcional | – | não obrigatório se enviar `pracas` |
| `roteiro.PercursoCodigo` | (tipo não claro) | opcional | 10 | idem |
| `documento[].documentoCodigo` | string | opcional | 100 | CT-e, NF-e, OCC |
| `documento[].serie` | string | opcional | 50 | |
| `pracas` / `pracasVolta` | array | opcional | – | só com roteirizador próprio (**não usamos**) |
| `configuracao.EixosSuspensosIda` / `EixosSuspensosVolta` | integer | não | 1 | rota ida/volta ou praças |
| `utilizaCarreta` | boolean | não | – | o exemplo do manual manda a string `"true"` |

No exemplo do manual, tração 2 eixos + carreta 4 eixos resulta em praça com `quantidadeEixos` 6: a Repom soma.
Resposta de sucesso: `result.status` (true), `numeroEixosCavalo`, `clienteCNPJ`, `transportadorCPFCNPJ`,
`documentoSubContratado`, `motoristaCPF`, `dataEmissao`, `razaoSocialCliente`, `statusCarga` (no exemplo vem texto
"Carregado"; a tabela diz 1 Pendente / 2 Carregado / 3 Cancelado), `viagemAtiva`, **`codigoViagem`** (usado em consulta e
cancelamento), **`codigoViagemRepom`** (portal Repom Express), **`idvpoAntt`** (array com **um** IDVPO da ANTT), `veiculo`,
`tipoEmissao` ("Pedágio Eletrônico"), `valor` (Decimal 10,2), `tag`, `dataCancelamento`, `usuarioCancelamento`, `dataCarga`,
`dataDescarga`, `usuarioDescarga`, `pracas[]{id, nomeConcessionaria, concessionariaCodigo, nomePraca, nomeRodovia, ativa (1/0),
pracaPreco[{preco, quantidadeEixos}], result{status}}`. Datas "0001-01-01T00:00:00Z" significam "vazio".
Erro de negócio: `{"result":{"status":false,"descricao":"Placa: Placa informada invalida.","numeroErro":"347"},...zeros}`.
Erro de tipo de campo: dicionário **na raiz**: `{"NumeroEixos":["The input was not valid."]}`.

## 8. Cancelamento (4.4) — `POST /api/RepomViagem/CancelaViagem`
Entrada: `viagemCodigo` (integer, sim — o `codigoViagem` da emissão), `usuario` (string 50, sim). Sucesso: `{"result":{"status":true}}`.
Prazo padrão **3 horas** após a emissão (configurável para mais; cada OSA tem seu máximo e o sistema respeita). Erro de negócio
`{"result":{"status":false,"descricao":"Viagem já se encontra cancelada.","numeroErro":"325"}}`. Erro inesperado/estrutura:
`{"Message":"Unexpected error","Description":"Unexpected error"}`.

## 9. Consulta (4.5) — `.../api/RepomViagem/ID?ID=<codigoViagem>`
Parâmetro `ID` (integer, sim, 10). Resposta igual à da emissão (sem o status "pendente" de emissão). Erro: `result.status false`,
`numeroErro "205"` = "Viagem não Encontrada."; sem o ID: `{"ID":["The value '' is invalid."]}`.

## Correções (resumo antigo e código antigo × manual)
1. **Erro tem QUATRO formatos, não dois:** (a) `isValid:false + errors[].descricao` (rota, pedágio); (b) problem-details
   400 com `errors{campo:[msgs]}` (rota, pedágio); (c) vale: `result.status:false + descricao + numeroErro`; (d) vale: dicionário
   `{Campo:[msgs]}` na raiz (emissão, consulta) ou `{Message, Description}` (cancelamento). O cliente novo trata todos.
2. **`TipoRoteiro` (não `TipoRota`)**: 1 curto, 2 rápido, 3 mais curto, 4 econômico. O código antigo mandava `TipoRota` e
   mapeava `mais_rapida:1` (que é "curto" no manual) — corrigido em `repomClient.ts`.
3. Faltavam no resumo: `VoltarMesmoCaminhoIda`, sentido `0/1` na consulta de rota, CEP e lat/long como alternativas ao IBGE.
4. Token do vale-pedágio é `{usuario, senha}`; o código antigo (`repomVpoClient.ts`) mandava `{Login, Senha, CodigoCliente}` e
   consultava TAG por `POST /api/Tag/Consultar` (caminho inventado). O correto é `GET /api/RepomVeiculo/tags/placa?placa=`.
5. Tamanhos: `numeroEixos` e `carretaNumeroEixos` têm tamanho 1 no manual (um dígito) mas o exemplo de resposta tem 6 eixos
   somados: tratar como dúvida (DUVIDAS-PARA-REPOM.md).
6. A consulta (4.5) é POST no texto e sem corpo no curl: o cliente deixa o verbo configurável (padrão GET) e a dúvida registrada.
7. Prazo de cancelamento: este manual diz 3 h; o guia Repom Frete diz VPR 72 h, CIOT 24 h, TAG 15 min — ver dúvidas.
