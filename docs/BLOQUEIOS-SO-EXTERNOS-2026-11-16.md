# Bloqueios só do que o órgão externo rejeitaria (16/11/2026)

Regra: **bloqueia** só quando SEFAZ, ANTT, CIOT (efrete/Repom/NSTech) ou VPO realmente rejeitariam. Regra interna da RBR é **aviso**. Dado que o sistema consegue montar sozinho é preenchido sozinho e mostrado para conferência.

Legenda: **B** = bloqueia (origem externa) · **A** = aviso · **A?** = virou aviso e o emissor tenta; se o órgão rejeitar, a rejeição aparece traduzida · **=** = não mudou

## emitir-mdfe (`mdfe.ts`)

| Regra | Antes | Agora | Origem |
|---|---|---|---|
| CT-e autorizado com chave | B | = B | sefaz |
| IE, RNTRC (8 dígitos), responsável técnico, endereço do emitente | B | = B | sefaz/antt |
| Contratante CNPJ/CPF; motorista CPF; UF origem/destino; municípios IBGE; peso; valor; produto; NCM 8 dígitos; CEPs; tipo de carga não reconhecido | B | = B | sefaz |
| Tração: placa, tara, UF, rodado, carroceria | B | = B (mensagem nova quando a carreta está no campo de tração) | sefaz |
| Reboque: placa, tara, capacidade, UF, carroceria; máx. 3 | B | = B | sefaz |
| Proprietário (não frota): CPF/CNPJ, UF, RNTRC 8 dígitos | B | = B | sefaz/antt |
| **RNTRC do veículo/motorista "não está ativo"** | B | **A** se nunca consultado (NULL). **B** só se status inativo/cancelado/suspenso/vencido/baixado | antt |
| **Cavalo sem reboque** | B | **A?** | a confirmar na SEFAZ |
| **Apólice RCTR-C ausente** | B | **A?** (MDF-e vai sem o grupo `seguros_carga`) | a confirmar SEFAZ x ANTT |
| Apólice sem número/CNPJ da seguradora | B | = B | sefaz |
| **`responsavel_seguro` fora do padrão** | B | **A** (assume "emitente") | rbr |
| Número da averbação (rej. 699) | B | = B quando há apólice | sefaz |
| Tipo de carga vazio | A | = A (carga geral) | rbr |
| CIOT do TAC em operação real | B | = B (teste/homologação: aviso) | antt |
| VPO quando a rota tem pedágio | B | = B | antt/sefaz |
| **Destino de pagamento do motorista (lotação)** | A "regra da RBR" | **Derivado** (Pix > banco/agência > IPEF informado > CNPJ da Repom se `ciot_origem = rbr_repom`); sem nenhum → **B** | sefaz |
| **Valor do contrato de frete (grupo `infPag`)** | A "regra da RBR" | Vem da condição ou do contrato do CIOT (efrete emitido); sem valor → **B** (TAC) | sefaz |
| Condição da operação diferente do contrato do CIOT | — | **A** (usa o valor do CIOT) | rbr |
| Carreta em `veiculo_id` com `cavalo_veiculo_id` | erro de rodado | Cavalo vira tração, carreta vira reboque, **A** informativo | rbr |

## emitir-cte (`cte.ts`)

| Regra | Agora |
|---|---|
| IE, endereço, responsável técnico, RNTRC da RBR, municípios IBGE, NF-e (chave 44 dígitos), remetente/destinatário/tomador, telefones, peso, valor, intramunicipal | = B (sefaz/antt) |
| Veículo/motorista alocados | = B |
| **RNTRC do veículo/motorista não ativo** | **A** se NULL; **B** só se status impeditivo (mesma regra do MDF-e) |
| Divergências informativas (CNPJ da chave x remetente, destinatário sem telefone, CFOP) | = A |

## efrete-ciot-operacao (`_shared/ciotEfrete.ts`) — sem mudança de regra, só classificação

| Regra | Classe |
|---|---|
| CPF/CNH do motorista, CPF/CNPJ e RNTRC do contratado, Pix, tração, rota geocodificada, NF-e, valor do frete, eixos, peso, NCM 4 dígitos, schema do pedido | B (efrete/ANTT) |
| Piso mínimo ANTT | B (ANTT) |
| Divergência CIOT x contrato do MDF-e; NF-e do CIOT x CT-e | B (consistência entre documentos já emitidos) |
| Pedágio do CIOT x estimativa da cotação; carga complexa; início previsto já passou | A |
| **Aceita CIOT de 16 dígitos colados** (`separarCiot`) | novo |

## nspedagio-vpo / repom-*

| Regra | Classe |
|---|---|
| Rota (2+ pontos, IBGE ou cidade/UF), placa, tag ativa, eixos 2–15, vigência ≤ 15 dias | B (NSTech/ANTT) |
| "Vale-pedágio real só roda em operação de teste", gestor_rbr, confirmação da ação | **política da RBR/fase do projeto**: fica como está (não mexi em integração externa; avaliar na liberação da produção) |
| repom-pedagio-rota: flag `REPOM_ROTEIRIZACAO_HABILITADO`, limite por minuto | controle operacional, = |

## checar_pre_voo (migração separada, NÃO aplicada)

| Item | Antes | Agora |
|---|---|---|
| rntrc | B se status ≠ "ativo" (NULL bloqueava) | **A** se NULL; B só se impeditivo |
| ciot | lia só `ciot_registros` | lê `operacao_ciot_vpo` + `documentacao_operacao` (+ legado); **A** |
| averbacao | lia só `averbacoes_negociacao` | lê `operacao_ciot_vpo.numero_averbacao`/`averbacao_rcv_numero` (+ legado); **A** |
| seguro (teto), rastreio | B | **A** (regra da RBR) |
| piso_antt, valor, NF-e, endereços, IE, bloqueio_fiscal | B | = B |

A tela de pré-voo mostra "Aviso ·" e o título "N aviso(s) — não impedem a emissão". Sem a migração aplicada nada muda na tela.

## Gatilhos do banco (migração separada, NÃO aplicada)

| Gatilho | Decisão |
|---|---|
| `trg_fn_operacao_exige_aprovados` | gestor_rbr: **libera e registra** em `auditoria_log` (quem vinculou). Outros perfis: continua bloqueando. Cadastro de TESTE em operação real: continua bloqueando para todos |
| `trg_fn_veiculos_protege_campos` | **Mantido**. Acréscimo: gestor não grava `aprovacao_por` em nome de outra pessoa |

## Fica para confirmar

1. CNPJ da Repom `65697260000103` (constante `CNPJ_IPEF_REPOM`) na documentação da Repom, e se o frete de CIOT Repom sempre é pago pela conta digital Repom (hoje só é usado quando não há Pix/banco/IPEF informado).
2. Se a SEFAZ rejeita: cavalo sem reboque; ausência de apólice RCTR-C.
3. Contrato do CIOT **Repom** como fonte da condição de pagamento: `repom_operacoes` está vazia e `valor` não tem semântica confirmada; por ora só o contrato da efrete preenche a condição sozinho.
4. `trg_fn_pessoas_protege_campos_sistema` (equivalente em motoristas): não lido nem alterado.
5. Telas: botão que leva ao campo a corrigir (a função já devolve `corrigir: [{mensagem, campo, aba}]`), sugestão de tipo/tara do CRLV nos formulários de cadastro (a função `extrair-documento` já devolve `sugestoes`), e aviso da RBR ignorado nos eventos fiscais do CT-e (o MDF-e já grava `aviso_regra_rbr`).
