# Repom endurecido e campos do cadastro (Parte D do prompt mestre de 18/11/2026)

Tudo com mocks: nenhuma chamada a producao. Codigo em `supabase/functions/_shared/repomEndurecido.ts`, `repomPreVoo.ts` e `repomCadastro.ts`; migracao `20261118-0400-repom-campos-cadastro.sql` (nao aplicada).

## Regras (etapa 25)
- (a) Emissao **sequencial** por prestador + motorista (`FilaPorChave`); chaves diferentes seguem em paralelo.
- (b) Identifier deterministico (`identificadorContratoDe`, ja existente); apos timeout ou "Processo do cliente ja esta cadastrado" **consulta antes** e adota o contrato existente (`emitirOuAdotar`). Nunca cria de novo.
- (c) Piso ANTT: bloqueia abaixo do piso (caso CPN1377: R$ 1.000 rejeitada, R$ 3.500 aceita); piso vem de configuracao editavel, sem valor inventado.
- (d) Cavalo sem carreta bloqueia (AJE5040). (e) Conta digital envia `CardNumber 0`; cartao fisico e amarrado a um prestador e motorista (BWH3818). (f) Pre-checagem 801 e 760. (g) `MinimumFreightCost` como objeto com 4 chaves. (h) `PaymentAuthorization` so com viagem Quitada; erro 2768 = pendencia externa sem retry.
- (i) Tabela de erros com dono da acao (Eduardo, Karen, Alan, Pedro) e se pode tentar de novo; eventos sem dados pessoais.

| Codigo | Mensagem | Dono | Tenta de novo |
|---|---|---|---|
| 801 | motorista nao cadastrado antes do contrato | Eduardo | sim |
| 760 | codigo generico: veiculo fora do prestador, pagamento antes da quitacao OU data de pagamento invalida (ler a mensagem; com data: dono Pedro, reenviar uma vez com o dia seguinte) | Karen (ou Pedro, se for data) | nao (sim, uma vez, se for data) |
| 728 | Branch obrigatorio na autorizacao de pagamento (API exige; guia diz opcional) | Pedro (valores: Karen) | sim |
| 760 (filial) | Filial invalida para o identificador (Branch/BranchCode errados) | Karen | nao |
| 2768 | controle de saldo nao configurado | Karen (pendencia externa) | nao |
| ja cadastrado | adota o contrato existente | Eduardo | nao |

## Campos do cadastro (etapa 26)
RG (numero, orgao, UF), genero, dependentes, optante pelo Simples (prestador), tipo de carga ANTT (tabela editavel `tipos_carga_antt`, codigos 1 a 8 do guia da Repom), codigo da filial (`repom_config`, chave `filial_codigo`); a previsao de entrega ja existe em `operacoes.entrega_prevista`. RG e genero saem da leitura de documentos (genero so entra se a pessoa confirmar). O pre-voo da Repom (`faltaParaRepom`, bloco na esteira v3) lista o que falta, derivado do banco.

## Pendencias com a Karen
Controle de saldo (2768); categoria "pesada" do veiculo (nome do enum); TypeId do telefone; veiculos GPQ6618 fora do prestador; codigo da filial; confirmar a retencao de 5,06% da OP-0360.

## Nao feito
Ligar `FilaPorChave` e `emitirOuAdotar` dentro de `fluxoFrete` (as funcoes estao prontas e testadas, mas o cliente existente nao foi alterado para nao quebrar o fluxo de QA); campos novos nas telas de cadastro alem da leitura por documentos e do pre-voo.
