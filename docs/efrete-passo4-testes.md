# efrete — passo 4: testes que ficam para depois e limpeza

Tudo aqui é na **homologação** da efrete (dev.efrete.com.br), com a massa da ANTT e dados fictícios.
Nenhum passo pede usuário, senha, hash, token ou chave: as chamadas usam a chave interna de teste
lida do Vault dentro do próprio SQL, como no passo 3.

## 1. Acentos (charset)

O que aconteceu: no passo 3, "Rua Fictícia" voltou da efrete como "RUA FICT??CIA".

Situação: o proxy da Vercel já foi alterado no código (PR #19) para mandar
`Content-Type: application/json; charset=utf-8`. Ele também aceita `codificacao: 'ascii'`, que manda
os acentos como `í`. A publicação na Vercel ficou pendente porque a Vercel pediu para
reautorizar o acesso ao time `rbr4`.

Decisão provisória (já no código): tirar acento **só do endereço**. Nomes de pessoas vão como estão,
e a pergunta sobre nomes fica para a NSTech.

Teste, depois de publicar o proxy:

1. Regravar o motorista fictício com endereço acentuado (ação `cadastro-motorista` da
   `efrete-ciot-teste`, que manda "Rua Fictícia de Teste").
   - Se voltar "RUA FICTÍCIA", o charset resolve. Pode tirar o `semAcento` do endereço em
     `efrete-ciot-operacao`.
2. Se ainda voltar "??", ligar a codificação ASCII no cliente
   (`efrete.definirCodificacao('ascii')` na função) e repetir.
   - Se voltar certo, deixar `ascii` fixo.
3. Se nenhum dos dois resolver, manter a remoção de acento no endereço e perguntar à NSTech:
   "Qual charset o REST espera? Nomes de pessoas com acento chegam como '??'."

## 2. Pix liberado e ObterTransacoes

O CIOT de teste da operação `93e6216d` saiu com o adiantamento liberando **15 minutos depois da
emissão**. A quitação libera no fim da viagem, 24 h depois.

Para ver se o Pix aparece, troque `<acao>` por `transacoes` e rode depois do horário de liberação:

```sql
select net.http_post(
  url := 'https://kwscmegsfbtvlnyxougt.supabase.co/functions/v1/efrete-ciot-operacao',
  headers := jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer <chave anon pública do projeto>',
    'x-efrete-chave-interna', (select decrypted_secret from vault.decrypted_secrets where name='EFRETE_TESTE_CHAMADA_INTERNA')),
  body := '{"acao":"<acao>","operacao_id":"93e6216d-0b38-4155-b0ba-8aed00484a7f"}'::jsonb,
  timeout_milliseconds := 60000);
-- depois de alguns segundos:
select status_code, content from net._http_response order by id desc limit 1;
```

Para repetir o ciclo inteiro (emitir, esperar a liberação, transações, encerrar), use uma operação
de teste nova: cada operação gera uma referência própria na efrete.

## 3. Limpeza dos dados de teste (apagar depois)

Criados no passo 4, todos com `eh_teste = true` ou com "(apagar depois)" no nome:

- 2 pessoas:
  - `TESTE MASSA ANTT - TRANSPORTADOR EFRETE (apagar depois)`
  - `TESTE HOMOLOGACAO - MOTORISTA FICTICIO EFRETE (apagar depois)`
- 2 veículos: RQW4D58 e RRD5B39 (placas da massa da ANTT, `eh_teste`).
- 1 cotação (`observacoes` começando com `[TESTE] CIOT efrete homologacao - passo 4`).
- A operação dessa cotação, com o reboque, a condição de pagamento e a NF-e digitada.
- O pedido e os pagamentos em `efrete_ciot_pedidos` e `efrete_ciot_pagamentos`, e a linha de
  `operacao_ciot_vpo`.

Antes de apagar, confira que a lista abaixo só traz os registros de teste:

```sql
select o.id, o.eh_teste, c.observacoes from operacoes o join cotacoes c on c.id = o.cotacao_id
where c.observacoes like '[TESTE] CIOT efrete homologacao - passo 4%';
```
