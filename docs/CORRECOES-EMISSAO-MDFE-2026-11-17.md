# Correcoes da emissao de MDF-e (Parte C do prompt mestre de 18/11/2026)

Base: o PR #82 (bloqueios so do que o orgao externo rejeitaria) foi trazido para este branch (merge `cc43ca2`), com conflitos de import resolvidos. Operacoes de referencia lidas **somente leitura**: OP-1bd8, OP-3ec3, OP-0360.

## O que mudou, por erro
| Etapa | Erro do historico | Correcao (arquivo) | Teste |
|---|---|---|---|
| 17 | Destino do pagamento caia no Pix do motorista (OP-3ec3) | CIOT `rbr_repom` com IPEF paga SEMPRE pela IPEF da Repom (65697260000103), com prioridade sobre Pix e banco; preenche `pagto_cnpj_ipef` e `ciot_cnpj_responsavel` quando vazios (`mdfe.ts`, `index.ts`) | `etapa 17` (2 testes) |
| 18 | CEP de descarregamento do tomador (OP-0360: 13295274 em vez de 65285000) | `cepDescarregamentoDe`: CEP do destinatario da NF-e; so usa o do cliente se destinatario = cliente; a coluna da view nao foi alterada | `etapa 18` (3 e 35180018) |
| 19 | 731: `tipo_vale_pedagio` junto da categoria | campo omitido; categoria pelos eixos (02 a 14, inclui 9, 10 e mais de 10 eixos) gravada de volta quando vazia; resposta do POST a Focus gravada a parte (`eventos_fiscais_operacao`, evento `resposta_post_focus`); **referencia nova a cada reemissao** (`-r2`, `-r3`) | `etapa 19` |
| 20 | CIOT de 16 digitos descartado em silencio | separa 12 + 4 no envio e grava assim; tamanho invalido bloqueia; contrato Repom sem CIOT bloqueia; `refazer` avisa; homologacao nao vale em producao | `etapa 20` (2) |
| 21 | Cavalo sem reboque; carreta com `e_reboque=false` | cavalo sem reboque e **bloqueio SEFAZ** com instrucao de vincular (decisao posterior a de 16/11, porque a SEFAZ rejeitou na OP-0360); gatilho marca `e_reboque=true` ao vincular (so vinculos novos); unificacao tracao/reboque e RNTRC nao consultado = aviso ja vinham do #82 | testes do #82 + `etapa 21` |
| 22 | Tara 26 kg e 10 kg; capacidade em toneladas | tara em 3 niveis (G3) e capacidade em t x 1000 so no payload, com aviso; so bloqueia sem nenhum nivel; aviso de CMT | testes da etapa 6b + `etapa 22` |
| 23 | CT-e vinculado "Faltando"; pre-voo legado; esteira | o cartao lia o caminho errado do payload (`conhecimentos_transporte.0...`); agora le `municipios_descarregamento.0.conhecimentos_transporte.0.chave_cte`. Pre-voo e esteira: Parte B (`EsteiraV3`) e a funcao SQL do #82 | `fiscalV3.test.ts` |

## O que NAO mudou
Regras de bloqueio que a SEFAZ/ANTT aplicam; modal e botoes do emissor; o fluxo da efrete; telas em modo DEMO; a coluna `destinatario_cep` da view (outras telas dependem).

## O que depende da Focus
Se a Focus reaceita uma referencia ja rejeitada nao foi testado (por isso a referencia nova a cada reemissao). A categoria de combinacao so e enviada pela Focus se `tipo_vale_pedagio` nao estiver presente.

## Investigacao pedida
- **Rejeicao citando tara?** Nenhuma. Os tres MDF-e (OP-1bd8, OP-3ec3, OP-0360) constam como emitidos e nem o `payload_resposta` nem os eventos citam "tara". A tara errada (26 kg e 10 kg) nao causou rejeicao; o risco era fiscal (dado errado no documento).
- **Veiculos com valores suspeitos** (placa, tara_kg, capacidade_carga, e_reboque; `tara_origem` ainda nao existe no banco): DBB9C49 (29 / 11.5), EFF2I58 (61 / 32, carreta com e_reboque=false), JAG9B55 (8500 / 17), MKT6E78 (25.5 / 17.16), MLN9A91 (9.8 / 25.5), MRJ1B57 (22.5 / 22). FET2F12 e RBC7I49 (Fiorino) sao veiculos leves sem tara: fora de escopo. EWJ8H11 e QJR6644 (taras estimadas) nao saem nesta consulta porque a tara gravada esta dentro da faixa. A tela "Cadastros para corrigir" (Parte A) lista os mesmos.
- **Diferenca de valor da OP-0360** (sistema 25.500,00 x Repom 24.210,33; 20.400,00 x 19.368,26): a razao e a mesma nos dois contratos (cerca de 5,06%), entao **nao e o vale-pedagio** (que e valor fixo por rota: R$ 1.431,56) **nem arredondamento**. O INSS que o sistema ja calcula (R$ 532,63 = 2,2% do contrato) explica so parte; o resto (cerca de 2,86%) e compativel com outras retencoes (SEST, SENAT, IRRF) ou taxa da Repom. **A confirmar com a Karen.** Hoje o banco ja tem 24.210,33 na OP-0360 (os valores do CIOT prevalecem).
- **Piso ANTT calculado**: OP-3ec3 = R$ 4.584,34 (793 km), contrato R$ 5.253,10; OP-0360 = R$ 22.412,42 (2.956 km), contrato R$ 24.210,33. Ambos acima do piso. Abaixo do piso continua sendo aviso.

## Publicar (ordem segura) e desfazer
1. migracoes `20261118-0100`, `0110`, `0200`, `0300` (e a do #82 `supabase-migrations/20261116-1000-bloqueios-so-externos.sql`, que e SQL de funcoes e nao e aditiva pura);
2. funcoes `extrair-documento` e `emitir-mdfe`;
3. front.
Conflitos de arquivo entre A, B e C: `mdfe.ts`, `mdfe.test.ts` e `emitir-mdfe/index.ts` (A mexeu na tara, B removeu `tipo_vale_pedagio`, C todo o resto) e `extrair-documento/index.ts` (A e #82): resolvidos por merge sem perda; os testes dos tres passam juntos.
Desfazer: `git revert` do merge de cada PR; funcao: republicar o hash anterior anotado; `supabase/rollback/*`.
