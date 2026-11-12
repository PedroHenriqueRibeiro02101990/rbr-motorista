# 04 · Fiscal

Fonte: `supabase/functions/regras-fiscais.md`, `_shared/prazos.ts`, funções `emitir-*`, `cancelar-documento-fiscal`, `enviar-averbacao*`, tabelas `documentacao_operacao`, `operacao_ciot_vpo`, `efrete_ciot_pedidos`.

## Princípio (decisão de 2026-10-15, `regras-fiscais.md`)
Só bloqueia a emissão o que é regra real da SEFAZ/Focus, da ANTT ou de lei. Regra interna da RBR vira **aviso**. Origens: `sefaz`, `antt`, `rbr`, `info`, `tecnico`, `teste`.

## Ordem e dados
| # | Documento | Quem emite | De onde vêm os dados | Observação |
|---|---|---|---|---|
| 1 | CT-e | `emitir-cte` (Focus) | cotação (NF-e, partes), operação, RBR (`parametros_fiscais`), veículo/motorista (RNTRC) | Frete intramunicipal vai por NFS-e (`emitir-nfse-intramunicipal`) |
| 2 | Averbação RCTR-C | `enviar-averbacao` (AT&M/NSTech) e automática ao emitir (`trg_averbar_automatico_ao_emitir`) | apólice (`apolices_seguro`), CT-e | caixas postais em `integracao_averbacao` (Sompo, Allianz) |
| 3 | Averbação RC-V | `enviar-averbacao-rcv` | `operacao_ciot_vpo.averbacao_rcv_*` | |
| 4 | Vale-pedágio (VPO) | `nspedagio-vpo` (NSPEDAGIO, hoje só homologação) ou Repom (não publicada) | rota/pedágio, placa, vigência | número gravado em `operacao_ciot_vpo` (`vpo_idvpo`, `vpo_valor`) |
| 5 | CIOT | `efrete-ciot-operacao` (efrete/NSTech) | condição de pagamento, veículo, TAC | `efrete_ciot_pedidos`; tela espelha em `operacao_ciot_vpo`; pedágio declarado usa o `vpo_valor` real (PR #64) |
| 6 | MDF-e | `emitir-mdfe` (Focus) | CT-e, CIOT, VPO, apólice, condutor e titular | CIOT obrigatório em produção a partir de **23/11/2026 00:00 Brasília** (`prazos.ts`, rejeição 684) |

Bloqueios por documento: tabelas completas em `supabase/functions/regras-fiscais.md` (MDF-e, CT-e, averbação). Não repetidas aqui.

## Cancelamento, encerramento, reemissão (`_shared/prazos.ts`)
| Documento | Cancelar | Depois do prazo |
|---|---|---|
| CT-e | até 7 dias, sem MDF-e ativo | CT-e de substituição até 60 dias |
| MDF-e | até 24 h e viagem não iniciada | encerrar e emitir outro; encerrar até 30 dias |
| CIOT | até 24 h **antes** do início da viagem | encerrar até 5 dias após o fim previsto (TAC agregado: 30 dias) |
| VPO | validade máxima 15 dias | — |
Operação do CIOT: máximo 90 dias. Correções por CC-e: `eventos-fiscais`. Cancelamento: `cancelar-documento-fiscal`. Reemissão de CT-e/MDF-e por tela: **ainda não disponível como fluxo dedicado** (a confirmar, outra janela trabalha nisso).

## Piso ANTT
Tabela `piso_antt_coeficientes` (272 linhas; Resolução ANTT 6.084/2026, Anexo II). Piso = `cc_fixo + ccd_por_km × km`. Verificação: `checar_piso_operacao`, `calcular-rota-frete`.

## Modo teste e demonstração
`eh_teste` (operação real na SEFAZ com RBR como todas as partes, NF até R$ 5; `trava_teste_fiscal`) é diferente de `modo_demonstracao` (coluna em `operacoes`, só tela, sem chamada a fornecedor). Dispensas do modo teste: GR, CIOT, VPO, ATM.

## Alertas de CIOT (`parametros_sistema.alertas_ciot`)
encerramento 5 dias, cancelamento 24 h, aviso de pagamento 5 dias, prazo de pagamento 30 dias úteis.
