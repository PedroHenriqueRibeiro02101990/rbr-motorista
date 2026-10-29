# efrete: acentos "??" nos cadastros (reprodução com UTF-8)

**Resumo:** o "??" de 24/10 vinha do envio sem `charset`. Com `Content-Type: application/json; charset=utf-8` a efrete devolveu o acento certo em 28/10. A remoção de acento (`semAcento`) continua ativa só no **endereço**; **não foi retirada**, esperando a decisão do Pedro.

## O que foi enviado (exemplo)
Cabeçalho que o proxy (`vercel/efrete-proxy`) manda à efrete:

```
POST /services/<Servico>/<Metodo>
Content-Type: application/json; charset=utf-8
Content-Length: <tamanho em BYTES, não em caracteres>
```

Corpo (UTF-8), cadastro fictício:

```json
{"Rua":"Rua Fictícia de Teste","Nome":"João Conceição"}
```

- 55 caracteres, mas **59 bytes** em UTF-8: cada acento ocupa 2 bytes (`í` = `c3 ad`). Por isso o `Content-Length` usa `Buffer.byteLength`.
- Se o corpo UTF-8 for lido como Latin-1, o resultado é `{"Rua":"Rua FictÃ­cia de Teste","Nome":"JoÃ£o ConceiÃ§Ã£o"}`. Servidor que não entende o charset também pode trocar o acento por `?`.
- Alternativa já implementada no proxy (`codificacao: 'ascii'`): só ASCII no fio, acentos como `\uXXXX`: `{"Rua":"Rua Fictícia de Teste","Nome":"João Conceição"}`. O JSON lido de volta é idêntico.

## O que a efrete devolveu
| Quando | Envio | Retorno |
|---|---|---|
| 24/10 (passo 3), proxy **sem** charset | "Rua Fictícia" | `RUA FICT??CIA` |
| 28/10, proxy com `charset=utf-8` | "Rua Fictícia de Teste" | `RUA FICTÍCIA DE TESTE` (acento preservado; a efrete põe em maiúsculas) |

Fonte: `docs/efrete-reanalise-manual-2026-10-28.md` e `docs/efrete-passo4-testes.md`.

## Reprodução desta data (29/10)
- No proxy, `node --test vercel/efrete-proxy/efrete.test.js`: **11 testes passam**, entre eles "o corpo enviado à efrete leva 'João Conceição' e 'Rua São José' em UTF-8, com charset e tamanho em bytes", "acentos com codificacao ascii: só ASCII no fio" e "'ã' partido entre dois pedaços da requisição não vira '??'".
- **Não** repeti a chamada real à efrete hoje: este ambiente de desenvolvimento não tem as credenciais (ficam só no Vault do Supabase) nem sessão de gestor para chamar a função. O retorno real citado acima é o de 28/10. Para repetir ao vivo: ação `cadastro-motorista` da `efrete-ciot-teste` (endereço acentuado) e conferir o campo devolvido.

## Onde o acento ainda é removido (e continua assim)
`supabase/functions/efrete-ciot-operacao/index.ts`, função `semAcento`, aplicada **só** a: rua e bairro do endereço do contratante, do titular/motorista e do destinatário, e à busca de cidade em `municipios_coordenadas`. **Nomes de pessoas vão com acento.**

## Decisão que depende do Pedro
Como o charset resolveu, o `semAcento` do **endereço** pode sair (os cadastros ficariam com "Rua Fictícia" e não "Rua Ficticia"). Isso mexe em dado enviado à efrete, então **não alterei**. Quando o Pedro autorizar: retirar `semAcento` só dos campos de endereço (manter na busca de cidade, que compara com `nome_norm`), publicar a função e conferir um cadastro de ponta a ponta.
