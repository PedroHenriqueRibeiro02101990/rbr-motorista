# REGRAS-QA (fixas)

- So QA da Repom (conta 9520 Frete). Nenhuma chamada de producao. Contrato 2166947 intocado.
- Nenhum segredo no chat, em log, commit ou relatorio.
- Teste so pela funcao repom-qa-teste, com acoes fixas (lista fechada). Interruptor REPOM_QA_TESTE_LIBERADO so durante o teste, apagado no fim; funcao desativada no fim (confirmar 410); manter REPOM_QA_* e REPOM_AMBIENTE.
- Sem push, sem e-mail, sem rascunho de e-mail. Commit local.
- Antes de cada escrita, valide o corpo localmente contra o Swagger v3 e o Guia Tecnico 3.0 (pasta C:\Users\Aline\Desktop\credenciais repom 24112026). Cada tentativa tem corpo DIFERENTE da anterior.
- Pare e avise se: der certo; vier Saldo Insuficiente ou 2768; o mesmo erro vier 2 vezes; erro sem explicacao no Swagger/guia; risco para producao.
- Relatorio maximo 8 linhas: tabela curta (tentativa, resposta, correcao) + 1 frase sobre o credito.

## Tarefa (maximo 6 tentativas de escrita no total)

1. Ler rotas existentes: byibge SP 3550308 para RJ 3304557, 5 eixos; e por TraceIdentifier RQ24222319 e RQ24222447.
2. Se nao houver rota do Frete, criar (IBGE 7 digitos, CEP, TraceIdentifier novo ate 10 caracteres, esperar ate 100 s e consultar ate 2 min).
3. Com a rota, emitir o contrato com adiantamento de R$ 10,00 (mesmo prestador, motorista e placa de 17/11; frete R$ 3.500; consultar por OperationKey em 20 a 30 s). Depois CANCELAR o contrato.
4. Responder: o credito da Karen chegou? (emitiu = sim; Saldo Insuficiente = nao; 2768 = pendencia da Karen).
Depois PARAR.

## Rodada 2 de QA (24/11/2026) - fechamento
- Rota própria do 9520 criada (só CEP): percurso 1, roteiro 148993, 885 km.
- Emissão com adiantamento de R$ 10,00: identificador **RBRQA261125000419** aceito (HTTP 201), processamento `Pending` sem erro e sem contrato visível (`Shipping not found`) após ~3 min. **Pendente para a Karen.** Nada cancelado. Crédito: sem resposta (sem Saldo Insuficiente nem 2768).
- Correções: OperationIdentifier do contrato-modelo (a Repom recusou o inventado: "Operação não encontrada"); leitor de OperationKey tolerante; caminho `/Shipping/StatusProcessing/ByIdentifier`.
- Ação só de leitura `consultar_emissao` (status + contrato da última emissão); `ler_rota_ibge` (byibge, só leitura).
- Fim: interruptor apagado, limites de rota e emissão em 2, função desativada (410 confirmado).

## Rodada 3 (25/11/2026)
- Auditoria do corpo do Shipping: docs/repom/AUDITORIA-CORPO-SHIPPING-2026-11-25.md. Taxes com os 4 impostos (IRRF, SEST, SENAT, INSS); limite de emissao 4 (+2 autorizadas pelo Pedro); voltar a 2 no fim.
