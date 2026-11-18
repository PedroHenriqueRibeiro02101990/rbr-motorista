# Aba Fiscal: vale-pedagio e CIOT manuais, esteira e uploads (Parte B do prompt mestre de 18/11/2026)

Tudo atras da flag `VITE_FISCAL_V3` (padrao desligada). Com a flag desligada a tela Fiscal fica exatamente como era.

## Regra central
Operacao real (nao DEMO, nao teste) com CIOT/VPO manuais mostra **so** o cartao novo "Vale-pedagio e CIOT (lancamento manual)". Os cartoes NSTech/efrete (conferencia, Simular, Consultar tag, Comprar, faixa de homologacao) aparecem apenas em DEMO/teste. Fonte unica da regra: `ehOperacaoManual` em `supabase/functions/_shared/lancamentoManual.ts` e a variavel `fiscalManualV3` em `Fiscal.tsx`.

## O que a tela faz
- Cartao manual (`CartaoFiscalManual.tsx`): IDVPO (20 digitos), valor do vale (`CampoMoeda`), CNPJ da fornecedora, categoria de combinacao (calculada pelos eixos, editavel, sem campo "tipo de vale-pedagio"); CIOT 12 + verificador de 4 (aceita os 16 digitos da Repom e separa), valor do frete, adiantamento e saldo, destino do pagamento (IPEF da Repom, CNPJ 65697260000103) e CNPJ responsavel (padrao da RBR).
- **Subir CIOT** (contrato da Repom, PDF) e **Subir VPO** (VPR/recibo, PDF ou imagem): valida tipo e tamanho (10 MB), calcula o hash (mesmo arquivo nao duplica), grava em `documentacao_operacao` (versao, historico de trocas, `origem_acao=manual`), registra evento em `eventos_fiscais_operacao`, le o arquivo com `extrair-documento` (modo cadastro) e mostra a conferencia com confianca por campo. **Nada e gravado sem o clique em Confirmar e gravar.** Se a gravacao no banco falhar, o arquivo enviado e desfeito.
- Avisos da conferencia: placa do documento diferente da operacao (bloqueia o Confirmar), valor do frete diferente (mostra os dois; o do CIOT da Repom prevalece em `condicoes_pagamento_operacao`), abaixo do piso ANTT (aviso).
- Esteira (`EsteiraV3.tsx`): 4 blocos (CT-e, Vale-pedagio, CIOT, MDF-e); a averbacao aparece dentro do CT-e (RCTR-C) e do MDF-e (RC-V, "Aguardando o MDF-e" antes da emissao). Estado vem do banco e se redesenha por realtime (G5).
- Pre-voo do MDF-e (`preVooMdfe`): le `operacao_ciot_vpo` e `documentacao_operacao` (nao as tabelas legadas). So bloqueia o que SEFAZ, ANTT, CIOT ou VPO bloqueiam; regra interna e aviso.
- "Desfazer e prazos" e "Troca de motorista e veiculo" saem da tela e viram o link "Regras de troca de motorista e veiculo" (janela com o mesmo conteudo).
- O bloco "Algo errado? Devolver esta operacao" ficou **exatamente onde estava** (dentro da esteira, coluna da direita), sem alteracao: decisao do Pedro.

## Banco (arquivo `supabase/migrations/20261118-0200-fiscal-uploads-manual.sql`, aplicado so na etapa 28)
`arquivo_hash` e `arquivo_historico` em `documentacao_operacao`; RPC `confirmar_ciot_vpo_manual` (grava `operacao_ciot_vpo` e `condicoes_pagamento_operacao` na mesma transacao); politicas minimas para os perfis operacao/fiscal; a regra da categoria de combinacao passa a aceitar 12, 13 e 14. Rollback em `supabase/rollback/`.
Conferido no banco: o enum `tipo_documento_fiscal` ja tem `ciot` e `vpo`; `documentacao_operacao` ja tem `origem_acao`, `versao` e `emitido_por`; `ciot_verificador` so aceita 4 digitos (por isso um CIOT de 16 digitos gravado na coluna `ciot` era descartado pelo emissor).

## Uploads (campo, bucket, tabela, evento, teste)
| Campo | Bucket | Tabela | Evento | Teste |
|---|---|---|---|---|
| NF-e XML | operacao-nfe (2 MB, so XML) | operacao_nfes (rotina existente) | upload | `uploadsFiscais.test.ts` (validacao) |
| PDF do CT-e | operacao-documentos | documentacao_operacao (cte) | upload/troca | `uploadsFiscais.test.ts` |
| PDF do vale-pedagio | operacao-documentos | documentacao_operacao (vpo) | upload, leitura, confirmacao | `uploadsFiscais.test.ts`, `extracao-documentos.test.ts` |
| PDF do CIOT | operacao-documentos | documentacao_operacao (ciot) | upload, leitura, confirmacao | idem |
| PDF do MDF-e | operacao-documentos | documentacao_operacao (mdfe) | upload/troca | `uploadsFiscais.test.ts` |

## O que NAO foi feito (honesto)
- A previa `preview-fiscal-completo-v3-2026-11-18.html` nao estava no repositorio: a etapa 9b foi feita pela descricao escrita.
- Campo de NF-e por chave de 44 digitos: nao existe funcao para isso; o campo fica como "use o XML" (a rotina atual de XML segue como esta).
- Cartoes de CT-e e MDF-e com campo "Subir PDF manual", Baixar PDF/XML e "Eventos do MDF-e" em v3: os botoes existentes do cartao antigo foram mantidos; o upload manual de PDF de CT-e e MDF-e tem a logica pronta (`uploadsFiscais.ts`) mas a caixa de upload na tela so foi ligada para CIOT e VPO.
- Linha unica "Conferencia: 7 de 7 ok" e a barra "Acoes fiscais" completa: so o titulo da barra foi aplicado; o resumo da conferencia nao foi refeito.
- Prints 1366x768: nao foi possivel gerar (sem navegador neste ambiente).
- Teste com OP-0360 em modo leitura: nao foi feito contra o banco; os testes usam dados sinteticos equivalentes.
- Os avisos antigos presos (G5) nas telas legadas (fora da v3) nao foram reescritos; os componentes novos ja derivam tudo do estado gravado.

## Como testar
`node --test gestor/test/*.test.ts supabase/functions/_shared/*.test.ts supabase/functions/emitir-mdfe/*.test.ts`
