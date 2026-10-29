# Regras das funções fiscais: o que bloqueia e o que só avisa

Decisão de 2026-10-15: só bloqueia a emissão o que é regra real da SEFAZ (ou da Focus), da ANTT ou de lei.
Regra interna da RBR vira aviso: aparece em amarelo, com o rótulo "Regra da RBR", e o gestor segue por conta própria.
A trava do modo teste (só a RBR, até R$ 5) é segurança nossa e não entra nesta classificação.

Na resposta das funções, `regras[]` traz cada item com `tipo` (bloqueio ou aviso) e `origem`:

| origem | significado | efeito |
|---|---|---|
| `sefaz` | rejeição ou exigência da SEFAZ ou da Focus | bloqueia sempre (teste, produção e homologação) |
| `antt` | ANTT ou lei (RNTRC, CIOT do TAC, Vale-Pedágio, RCTR-C) | bloqueia em operação real |
| `rbr` | política interna da RBR | só avisa |
| `info` | informativo (homologação, dispensa de teste, o que só a SEFAZ confere) | só avisa |
| `tecnico` | sem isso o envio é impossível (integração AT&M) | bloqueia |
| `teste` | trava de segurança do modo teste | bloqueia (fica como está) |

## MDF-e (`emitir-mdfe/mdfe.ts`)

| bloqueio | categoria | bloqueia / avisa |
|---|---|---|
| CT-e da operação não autorizado | sefaz | bloqueia |
| IE da RBR não cadastrada | sefaz | bloqueia |
| Nenhum veículo alocado / nenhum motorista alocado | sefaz | bloqueia |
| RNTRC do veículo / do motorista não ativo | antt | bloqueia |
| Motorista sem CPF de 11 dígitos | sefaz | bloqueia |
| UF de origem/destino vazia | sefaz | bloqueia |
| Tração sem tara, sem UF de licenciamento, rodado ou carroceria não reconhecidos | sefaz | bloqueia |
| Proprietário (veículo de terceiro): sem titular, sem CPF/CNPJ, sem UF | sefaz | bloqueia |
| Proprietário sem RNTRC de 8 dígitos | antt | bloqueia |
| Cavalo sem carreta; mais de 3 reboques; reboque sem placa/tara/capacidade/UF/carroceria | sefaz | bloqueia |
| Município de carregamento/descarregamento fora da tabela IBGE | sefaz | bloqueia |
| Peso bruto, valor da carga, tipo de carga, produto predominante | sefaz | bloqueia |
| NCM de 8 dígitos | sefaz | bloqueia (inclusive no teste) |
| CEP de carregamento/descarregamento (carga lotação) | sefaz | bloqueia (inclusive no teste; antes era relaxado) |
| Apólice RCTR-C vigente inexistente | antt | bloqueia |
| Apólice sem número/CNPJ da seguradora; responsável do seguro não reconhecido | sefaz | bloqueia |
| Número da averbação (rejeição 699) | sefaz | bloqueia (inclusive no teste; antes era relaxado) |
| Responsável técnico; endereço do emitente | sefaz | bloqueia |
| RNTRC da RBR com 8 dígitos | antt | bloqueia |
| Contratante sem CNPJ/CPF | sefaz | bloqueia |
| CIOT do TAC (12 dígitos) | antt | bloqueia em operação real; no teste é **dispensa de teste** (trava da Repom, decisão do Pedro); em homologação, aviso |
| Vale-Pedágio (IDVPO) com rota com pedágio | antt | bloqueia |
| Valor do VPO; CNPJ da fornecedora do VPO | sefaz | bloqueia |
| Destino de pagamento do motorista (Pix, banco ou IPEF) | rbr | **avisa** (antes bloqueava); o MDF-e sai sem o grupo de pagamento e o aviso fica nos eventos do MDF-e |
| Condição de pagamento do motorista (TAC) | rbr | **avisa** (antes bloqueava); o MDF-e sai sem o grupo de pagamento |

## CT-e (`emitir-cte/cte.ts`)

Nenhuma regra do CT-e é só da RBR.

| bloqueio | categoria | bloqueia / avisa |
|---|---|---|
| Frete intramunicipal (ISS/NFS-e, LC 116) | sefaz | bloqueia |
| IE da RBR | sefaz | bloqueia |
| Nenhum veículo / nenhum motorista alocado | antt | bloqueia (sem alocação não há RNTRC a conferir) |
| RNTRC do veículo / do motorista não ativo | antt | bloqueia |
| Sem cotação; origem/destino incompletos; sem valor do serviço | sefaz | bloqueia |
| Endereço do emitente; município da RBR; responsável técnico | sefaz | bloqueia |
| RNTRC da RBR | antt | bloqueia |
| Código IBGE de início/fim | sefaz | bloqueia |
| Chave da NF-e ausente ou inválida (44 dígitos, modelo 55, DV) | sefaz | bloqueia |
| Remetente/destinatário ausentes; CNPJ inválido | sefaz | bloqueia |
| Telefone da RBR (remetente RBR); endereço e telefone do remetente terceiro | sefaz | bloqueia |
| Endereço do destinatário | sefaz | bloqueia |
| Tomador não reconhecido; tomador terceiro com cadastro incompleto | sefaz | bloqueia |
| Peso bruto | sefaz | bloqueia |
| Destinatário sem telefone; CNPJ da chave diferente do remetente; NF-e precisa existir (SP, rej. 661); nomes de homologação | info | avisa |

## Averbação (`enviar-averbacao`)

| bloqueio | categoria | bloqueia / avisa |
|---|---|---|
| CT-e não emitido; XML do CT-e não capturado | tecnico | bloqueia |
| Integração AT&M ausente, inativa ou incompleta | tecnico | bloqueia |
| Apólice RCTR-C vigente sem número | antt | bloqueia |

## NF-e de teste em produção (`emitir-nfe-teste-producao`)

| bloqueio | categoria | bloqueia / avisa |
|---|---|---|
| Ambiente da RBR não está em produção; RBR não é remetente e destinatária; NF acima de R$ 5; cotação já tem NF-e; teste desligado | teste | bloqueia |
| Dados da RBR incompletos; sem valor da NF; sem peso; endereço do destinatário incompleto | sefaz | bloqueia |

## Liberação da operação para coleta (banco, `trg_fn_operacao_valida_transicao` e afins)

| trava | categoria | situação |
|---|---|---|
| Bloqueio fiscal manual ativo | decisão do gestor | bloqueia |
| Veículo e motorista alocados | sefaz/antt | bloqueia |
| Documento exigido que ainda não existe (CT-e, MDF-e, CIOT, VPO, averbação...) | sefaz/antt | bloqueia |
| Documento existente ainda não conferido por nós | rbr | "Seguir mesmo assim" com motivo (20261015_02) |
| Condição de pagamento do motorista não definida | rbr | "Seguir mesmo assim" com motivo (20261015_02) |
| Aprovação de cadastro do motorista/veículo | rbr, protege CNH/RNTRC/CRLV | bloqueia (decisão do Pedro) |
| Aceite do termo/contrato do parceiro | rbr, contratual | bloqueia (decisão do Pedro) |
| Parceiro suspenso; agenciador sem contrato/declaração de carga | decisão da RBR | bloqueia |
| Alertas de conformidade | rbr | já configurável (`parametros_sistema.conformidade.bloquear_liberacao_com_alerta`) |
| Margem mínima | rbr | já não bloqueia (grava auditoria) |
| GR (gerenciamento de risco) | depende da seguradora | opcional/aviso desde 20261014_01; backup em `_bkp_gr_exigido_20261015` |
