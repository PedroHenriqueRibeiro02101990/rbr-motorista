# Demonstração para a NSTech: CIOT pela tela (só homologação)

## Antes
1. Publicar a Edge Function `efrete-ciot-operacao` (agora o `status` devolve `ambiente` e `pagamentos`).
2. Build de preview com `VITE_EFRETE_CIOT_HABILITADO=true`. Produção continua desligada.
3. Operação de teste nova (`eh_teste = true`, marcada na cotação em "Operação de teste") com motorista, cavalo,
   semirreboque, condição de pagamento e ao menos 1 NF-e do cliente. A massa ANTT e os dados fictícios estão em
   `docs/efrete-passo4-testes.md`. As duas operações de teste que existem hoje não servem: uma está cancelada e
   a outra já tem CIOT encerrado.

## Roteiro (logado como gestor_rbr, etapa CIOT da operação)
1. Faixa "HOMOLOGAÇÃO: nenhum CIOT real" aparece fixa no topo. Estado inicial: "Sem CIOT nesta operação".
2. **Prévia do CIOT** → conferir piso ANTT, placas, NF-e, pagamentos. **Confirmar e emitir**.
   Esperado: CIOT 12 dígitos / verificador 4, protocolo, data e hora, tabela de pagamentos (Adiantamento e Quitação).
3. Recarregar a página: os mesmos dados voltam (vêm de `efrete_ciot_pedidos` e `efrete_ciot_pagamentos`).
4. **Baixar PDF do CIOT** → arquivo `CIOT-<12 dígitos>.pdf` abre.
5. **Transações (Pix)** → lista (vazia antes da data de liberação).
6. **Cancelar CIOT** → o botão só habilita com motivo de 15+ caracteres → cancelado, protocolo exibido.
7. Tentar emitir de novo na mesma operação: a prévia/emissão recusa ("pedido já foi cancelado; use uma nova referência").
   Para a anti-duplicidade de "Tentar de novo": com o pedido em **Erro**, o botão "Tentar de novo" monta a prévia e,
   ao emitir, a função consulta a efrete pela mesma referência antes de emitir; se já existe, só grava o CIOT.
8. Evidência: linha de `efrete_ciot_pedidos` (status, ciot, protocolo), `efrete_ciot_pagamentos`, e o retorno da efrete.

## Acentos ("??")
Chamar, na homologação, um cadastro com nome acentuado ("João Conceição") e registrar o enviado e o devolvido.
Procedimento e leitura do resultado: seção 1 de `docs/efrete-passo4-testes.md`. Não alterar `semAcento` sem autorização.
