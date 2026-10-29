# Roteiro da demonstração ao vivo do CIOT (homologação), 10 passos

Para a reunião com a NSTech. Tudo é **homologação** da efrete: nenhum CIOT real. Sem senha, token ou chave neste arquivo.

## Preparo (antes de a reunião começar)
- Função `efrete-ciot-operacao` publicada na versão 3 (29/10) e flag `VITE_EFRETE_CIOT_HABILITADO` ligada no gestor. Sem a flag o cartão do CIOT não aparece.
- Operação de teste **965ceb0d** (cliente "TESTE CIOT", São Paulo/SP → Campinas/SP, 100 km) pronta para emitir:
  - cavalo RQW4D58 (3 eixos) **não** marcado como frota própria (frota própria não tem CIOT);
  - semirreboque RRD5B39 (3 eixos) ligado: a composição passa a 6 eixos, tabela A da ANTT, piso **R$ 1.407,40** contra frete **R$ 8.000,00**;
  - motorista com CPF e CNH, titular com RNTRC e Pix, 1 NF-e do cliente, condição de pagamento;
  - coleta prevista daqui a 3 dias e entrega no dia seguinte: o cancelamento só vale até 24 h antes do início da viagem.
- Conferir 10 minutos antes: abrir a operação e ver o cartão **"CIOT · Caminhão 1 · RQW4D58"** com a faixa "HOMOLOGAÇÃO: nenhum CIOT real". Se a efrete estiver instável (ela devolveu "Erro interno" em 28/10), anote o horário e use o plano B no fim.

## Os 10 passos
1. **Criar a operação.** Em **Cotação**, abra a cotação do teste e mostre que ela virou operação. Use os botões **Cotação | Operação | Fiscal** no topo do painel: cada um abre o mesmo serviço na outra tela, sem perder o contexto.
2. **Abrir a operação.** Em **Operações**, marque **Mostrar testes** e clique na linha da 965ceb0d. O painel abre por cima da lista; mostre as abas e o cabeçalho (cliente, rota, motorista, placa, frete).
3. **Ir à aba Fiscal.** Mostre que o cartão do CIOT vem **depois** do CT-e e da averbação (a ordem do CIOT na cadeia fiscal).
4. **Conferência antes de emitir.** No cartão, percorra a lista: motorista, titular/RNTRC, Pix, rota, NF-e, pagamento e **piso ANTT** (R$ 1.407,40 contra R$ 8.000,00). Itens com "Corrigir ›" levam ao cadastro certo. Diga: o protocolo é gravado **antes** de ler a resposta.
5. **Emitir o CIOT.** Clique em **Emitir CIOT** e depois em **Confirmar e emitir** (seu nome e a hora ficam gravados). Esperado: CIOT de 12 dígitos + verificador, **protocolo**, data e hora e a tabela de pagamentos (adiantamento e saldo).
6. **Consultar.** Clique em **Consultar**: o sistema pergunta à efrete pela referência da operação (`RBR-HML-OP-…`) e mostra "Consultado na efrete". Recarregue a página: os mesmos dados voltam do banco.
7. **Baixar o PDF.** Clique em **Baixar PDF**: arquivo `CIOT-<12 dígitos>.pdf`. Se a efrete não devolver o arquivo, a tela diz isso em português.
8. **Mostrar o registro do protocolo.** No cartão: campo **Protocolo** e quem confirmou. Para a prova completa, mostre a linha da operação em `efrete_ciot_pedidos` (status, CIOT, protocolo, tentativas, confirmado por) e `efrete_ciot_pagamentos`.
9. **Cancelar.** Clique em **Cancelar CIOT**. O motivo precisa de **15 ou mais caracteres** (a tela mostra quantos faltam). Regras: só até **24 h antes do início da viagem** e **bloqueado se existir MDF-e** (a tela explica o motivo e o botão fica desabilitado). Confirme: aparece "CIOT cancelado" com o protocolo do cancelamento.
10. **Emitir novamente.** Depois de cancelado, **Emitir novamente** gera um CIOT novo com nova referência (`…-T2`); o cancelado continua registrado. Nunca com um CIOT ativo.

## Perguntas rápidas se algo falhar no ar
- **"Erro interno" / "Sistema iniciando":** a tela mostra a mensagem em português e o texto original em "Ver a mensagem original da efrete". Clique em **Tentar de novo**: antes de emitir, o sistema consulta a efrete pela mesma referência, então **não gera CIOT duplicado**.
- **Plano B:** capturas em `docs/capturas/` e a página `/demo-ciot` (4 estados com dados fictícios, sem login).

## Evidências e perguntas para a NSTech
Veja `docs/roteiro-apresentacao-ciot-2026-10-28.md` (tabela de protocolos de 24/10 e 28/10 e a lista de perguntas) e `docs/efrete-reanalise-manual-2026-10-28.md`.
