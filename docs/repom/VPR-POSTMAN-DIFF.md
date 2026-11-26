# Postman da Repom (API Vale-Pedágio, 9501) x corpo que enviávamos

Fonte: `API Vale-Pedágio Repom.postman_collection.json` (variável `baseUrl`; login de viagem no corpo do Token, não gravado aqui).
Emissão: `POST {{baseUrl}}/api/RepomViagem/ValePedagio`, headers `Content-Type: application/json` e `Accept: application/json` (Bearer do token de viagem).

| Campo | Postman | Nós (3 emissões com erro 0) | Agora |
|---|---|---|---|
| **Pracas** | `[]` ("com Roteiro, o array Pracas deve ser vazio") | **omitido** (nulo no servidor) | `[]` |
| NumeroCartao | `""` ("sempre enviar vazio") | omitido | `""` |
| UtilizaCarreta | texto `"true"` | omitido / boolean | `"true"` ou `"false"` (texto) |
| CarretaPlaca / CarretaNumeroEixos | placa / número; sem carreta "enviar vazio" | omitidos (depois "" e 0) | "" e 0 sem carreta |
| DocumentoSubcontratado | `""` | omitido (depois "") | `""` |
| Roteiro | `{RoteiroCodigo, PercursoCodigo}` numéricos | 1/143217, que NÃO existe na 9501 (depois 148993/4) | 148993/4 |
| documento | `[{documentoCodigo, serie}]` | ausente (depois 1 item) | 1 item |
| Configuracao | `{EixosSuspensosIda:0, EixosSuspensosVolta:0}` | enviado | igual |
| Chaves/caixa | ProcessoCodigoCliente, Placa, NumeroEixos, CarretaPlaca, CarretaNumeroEixos, NumeroCartao, NomeTransportador, DocumentoTransportador, DocumentoSubcontratado, NomeMotorista, DocumentoMotorista, CnpjFilial, UsuarioEmissao, Roteiro, documento, Pracas, Configuracao, UtilizaCarreta | iguais, exceto os omitidos acima | todas |
Outras rotas do Postman: TAG `GET /api/RepomVeiculo/tags/placa?placa=`; cancelar `POST /api/RepomViagem/CancelaViagem {viagemCodigo, usuario}`; consulta por código `GET /api/RepomViagem/ID?ID=` (**GET**); consulta por processo `GET /api/RepomViagem/ProcessoCodigoCliente?processoCodigoCliente=` (nova, adicionada); relatório `GET /api/RepomRelatorio/Relatorio?inicio=&termino=`. Roteirização: `POST /Api/Rota` (campos em minúsculas `codigoIBGE`, `estado`, `paradas` sempre array, `TipoRoteiro` 1 curto/2 rápido/3 mais curto/4 econômico), `GET /api/rota?codigoRoteiro=&codigoPercurso=` e `?codigoRoteiroCliente=`, `POST /Api/Roteiro` (valor).
Causa mais provável do NullReference: `Pracas` omitido (a Repom itera a lista sem checar nulo).

# Planilha de transportadores/placas autorizados (PRESTADOR OK ANTT.xlsx)
Colunas: DOCUMENTO, RNTRC, PLACA, TIPO VEICULO (TRAÇÃO/IMPLEMENTO), TIPO PRESTADOR (TAC/ETC/CTC); cerca de 30 linhas úteis (o resto do arquivo são ~1 milhão de linhas vazias).
- **BIS4025 está na lista**: tração, prestador TAC, RNTRC 012287698, documento terminando em 4687 (o mesmo que usamos). Sem implemento na lista.
- O motorista não consta na planilha; usamos o motorista do Postman/QA (CPF terminando em 2853).
- Linhas com tração + implemento (reserva): ETC 09524157000190 (FPU2C10 + NPJ5072), ETC 11278971000114 (EHX9J93 + SUM8I91), CTC 83158824000111 (QIB4852 + QTL9584).
