# Relatorio da etapa 30: aba Fiscal igual a previa aprovada

Especificacao visual: `docs/design/preview-fiscal-completo-v3-2026-11-18.html` (lida inteira: HTML, CSS e JS). Tudo atras de `VITE_FISCAL_V3`; com a flag desligada a tela antiga fica igual. Nenhuma edge function, migracao, RPC, regra de emissao ou dado de banco foi alterado; nenhum documento fiscal foi emitido.

## Previa x tela
| # | Item | Situacao |
|---|---|---|
| 1 | Esteira no topo com 4 cartoes clicaveis, selo "averbado", destaque do selecionado, proximo passo piscando (respeita prefers-reduced-motion), contador "N de 4 concluidas" | **feito** (`FiscalV3Painel`, regras em `fiscalV3Modelo.ts`) |
| 2 | Uma visao por cartao (titulo numerado, selo, fita de etapas, painel da esquerda + painel Acoes; no celular vira uma coluna) | **feito** |
| 3 | "O que enviamos e de onde vem" (Dado / Valor / Origem) em cada cartao | **feito** (dados reais da operacao; no CT-e e no MDF-e dentro de "Ver o que enviamos e de onde vem") |
| 4 | Cartao CT-e (NF-e do cliente, acoes, prazo, PDF manual, averbacao em bloco verde com "Ver resposta") | **feito**; a area de XML, a chave de 44 digitos e a lista de notas (Baixar XML, Tirar) reaproveitam o componente `NfesCliente` existente, com o visual dele (nao foi redesenhado) |
| 5 | Cartoes Vale-pedagio e CIOT (tabela, painel de Acoes, PDF manual, rodape Baixar JSON/Salvar em PDF, formulario manual e uploads dentro do cartao) | **parcial**: tabela, formulario manual (IDVPO, CIOT 12+4, valores, categoria), uploads, PDF manual e rodape feitos. **Simular, Consultar tag, Comprar, Emitir CIOT, Baixar recibo/PDF, Cancelar vale/CIOT ficam desabilitados com "Em breve"**: as integracoes NSPEDAGIO e efrete so rodam em operacao de teste/homologacao no codigo atual, nao em operacao real. "Registro de passos" nao tem fonte em operacao real |
| 6 | Cartao MDF-e (conferencia, acoes, PDF manual, averbacao, Finalizar viagem, Eventos, regras de troca) | **feito**; "Finalizar viagem" e "Eventos do MDF-e" usam o componente `FinalizarViagem` existente (o historico de eventos fica dentro dele); regras de troca abrem em janela |
| 7 | Barra "Acoes fiscais" e lista corrida de documentos saem | **feito** para operacao `cte_mdfe` em v3 (cada acao vai para o painel Acoes do seu cartao). Operacao de NFS-e em v3 continua com a tela antiga |
| 8 | PDF manual de CT-e, MDF-e, VPO e CIOT nos 4 cartoes | **feito** com o que ja existia (migracao 0200: `arquivo_hash`, versao, historico, eventos). Grava so o arquivo e NAO muda o status do documento; se a linha nao existia, cria como "pendente" (so conta como emitido quando houver numero e chave) |
| A | Emitir MDF-e apagado (opacity .4, cursor not-allowed) enquanto o pre-voo tiver item em vermelho, com o motivo abaixo | **feito + teste**. O pre-voo agora e a PREVIA do proprio emissor (`emitir-mdfe` com `previa: true`, que nao emite nem grava): uma unica fonte. Causa do "Falta: cep_carregamento" na OP-0360: o pre-voo antigo olhava so `cotacoes.origem_cep` (nulo), enquanto o emissor deriva o CEP da NF-e/RBR |
| B | NCM contraditorio | **feito + teste**. Causa: o pre-voo da Repom lia so `operacoes.ncm` (nulo na OP-0360) e o do MDF-e lia o NCM da cotacao. Agora os dois usam `ncmDaOperacao` (operacoes.ncm, NF-e, cotacao); OP-0360 resolve para 94069090 (NF-e 1375) |
| C | CIOT "PENDENTE" na lista e com visto na esteira | **feito**: um so estado por cartao, de `operacao_ciot_vpo`. Na OP-0360 o CIOT esta `emitido` e `producao` no banco, entao nao e pendente de verdade: o "PENDENTE" vinha do cartao antigo (registro legado de homologacao). Se um CIOT estiver em homologacao, o cartao mostra "HOMOLOGACAO - SEM VALIDADE FISCAL" e nao conta como concluido |
| D | Tara fora da faixa = aviso amarelo (!), nao bloqueia | **feito + teste** |

## Testes
`gestor/test/fiscalV3Modelo.test.ts` (4 estados da previa: CT-e a emitir, VPO e CIOT pendentes, MDF-e a emitir, tudo emitido: cartao selecionado, botoes habilitados, textos; mais A, B, C e D) e `fiscalV3.test.ts`. Nao ha biblioteca de teste de componentes React neste projeto: os estados sao testados no modelo que o componente desenha e por inspecao dos textos e do CSS do componente.

## O que dependeu de backend que nao existe
Compra e simulacao de vale-pedagio e emissao de CIOT pela API em operacao real; "Registro de passos"; lancar NF-e pela chave so existe dentro do `NfesCliente`; recibo/PDF do vale e do CIOT gerados pelo provedor.

## Nao feito
- Capturas de tela nos 4 estados: o Playwright nao esta instalado no projeto e nao instalei nada. Conferir pelo link de preview do PR.
- A tela nao foi aberta em navegador aqui (so tsc, lint, testes e build).
- Sem merge, como pedido.
