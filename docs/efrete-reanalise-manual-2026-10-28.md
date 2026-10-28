# Reanálise do kit da efrete (v8.2) contra o que enviamos

**O manual/kit v8.2 NÃO está no repositório.** Esta tabela foi feita só com o que o código registra do manual (comentários em `efreteClient.ts` e `ciotEfrete.ts`) e com as respostas reais do servidor. **Pedro: anexe o PDF do manual** para eu conferir campo a campo e dizer o que mudou desde 24/10.

| Ponto | O que o manual manda (segundo o código) | O que enviamos | Divergência / risco |
|---|---|---|---|
| Login | GET com CPF no usuário | POST com JSON; usuário no formato da NSTech | Servidor só aceita POST (24/10). Baixo, já funciona. |
| ConsultaSituacaoTransportador | GET | configurável (POST) | Igual ao login. Baixo. |
| Cadastros (proprietário gravarV2, veículo, motorista) | POST | POST, ordem proprietário, cavalo, semirreboque, motorista | Sem divergência. Funcionou hoje 13:36 UTC (protocolos de cadastro 6133885 a 6133891). |
| Emissão `AdicionarOperacaoTransporteV2` (Versao 8) | Exemplo JSON com `Viagens` como objeto | `Viagens` e `NotasFiscais` como listas | Divergência do exemplo (o servidor recusa objeto). Já tratada. |
| CIOT devolvido | número do CIOT | 12 dígitos + "/" + verificador de 4; guardamos separado e remontamos | Divergência conhecida, tratada. |
| Estado do CIOT | texto | número (ex.: "1") | Divergência conhecida, tratada. |
| ConsultarTipoCarga | opcional | desligado no servidor ("não é requisito"); usamos tipo fixo 5 (Carga Geral) | Hoje o servidor repete: `Este.Metodo.Foi.Desabilitado...` (28/10). Baixo. |
| Consulta por referência | retorno de CIOT | "não encontrada" = `Operacao.Nao.Localizada` | Tratada; tratamos "não encontrado" só quando o código é esse (conservador). |
| Encerramento | Versão 2 no texto e no exemplo, 3 na tabela | Versão 2 por padrão, 3 opcional | Ambíguo no manual; precisa confirmar com a NSTech. Médio. |
| PDF, ObterTransacoes, Cancelamento | POST | POST | Sem divergência; ainda sem sucesso hoje (sem CIOT). |
| Acentos | UTF-8 | `Content-Type: application/json; charset=utf-8` pelo proxy | **Resolvido em 28/10**: enviamos "Rua Fictícia de Teste" e a efrete devolveu "RUA FICTÍCIA DE TESTE". O "??" de 24/10 era o proxy sem charset. `semAcento` do endereço pode sair (decisão do Pedro). |
| Pagamento/Pix | Pix sem dados bancários, soma dos pagamentos = frete | igual | Sem divergência. |
| Datas | início não no passado | início = coleta prevista ou agora + 15 min | Testado: a data não explica o erro de hoje. |

**Mudou desde 24/10 (observado, não do manual):** a homologação ora devolve `ANTT.Falha.Comunicacao`, ora `APP.Nao.Categorizado / Erro interno`, ora "SERVIÇOS INDISPONÍVEIS: Sistema iniciando" (códigos novos para nós). O código de emissão é o mesmo de 24/10 (a função no ar é a v2 de 24/10).
