# Inventário do banco (projeto "ERP RBR", schema public)

Fonte: consultas somente leitura em 2026-11-12 (`list_tables`, `pg_policies`, `information_schema.triggers`, `pg_proc`, `list_migrations`). Todas as tabelas do schema public têm RLS ligado. 135 tabelas e 17 views (contagem em pg_tables). Linhas aproximadas entre parênteses quando relevante.

## Enums principais
- `papel_pessoa`: titular_motorista, condutor, agenciador, gestor_rbr, prestador_parceiro, comercial, operacao, fiscal, financeiro.
- `status_operacao`: alocando_motorista, aguardando_liberacao_fiscal, liberada_coleta, carregando, em_transito, entregue, fechada, cancelada, aguardando_assumir, aguardando_aceite_motorista, em_emissao, devolvida_pelo_fiscal, pausada_por_alteracao, aguardando_liberacao_gestor, ordem_liberada, em_viagem, finalizando, finalizada. (Máquina de estados em 03-ESTEIRA.)

## Tabelas por domínio

| Domínio | Tabelas (colunas principais) |
|---|---|
| Cadastros e frota | `pessoas` (papel, cpf/cnpj, rntrc_*, cnh_*, aprovacao_*, acesso_bloqueado, eh_teste), `veiculos` (placa, titular_id, rntrc, aprovacao_*, eh_teste), `clientes` (cnpj, origem, agenciador_id, vendedor_id), `fornecedores`, `prestadores_parceiros`, `funcoes_pessoa` (pessoa_id, funcao, ativo), `documentos_pessoais_imagens`, `documento_extracoes`, `rntrc_consultas`, `contatos_motoristas`, `perfis_veiculo`, `clientes_locais_entrega`, `vinculos_agenciador_motorista`, `indicacoes_motorista`, `sefaz_tipos_veiculo` |
| Comercial | `cotacoes` (status, valor_total, lucro_pct, piso_antt_calculado, pedagio, nf_*, eh_teste), `cotacao_destinos`, `cotacao_custos_adicionais`, `tipos_custo_adicional`, `pre_cotacoes`, `pre_cotacao_itens`, `propostas_publicas` (codigo, expira_em, aceita_em, aceite_nome/cargo/ip), `leads`, `interacoes`, `oportunidades`, `metas`, `projetos`, `condicoes_prazo` |
| Operação | `operacoes` (status, cliente_id, agenciador_id, pessoa_alocada_id, bloqueio_fiscal, congelada_em, eh_teste, modo_demonstracao, comprovante_entrega_path), `operacao_reboques`, `operacao_nfes`, `operacao_checklist_fotos`, `operacao_alteracoes`, `operacao_devolucoes_fiscal`, `operacao_cancelamento_passos`, `ordens_coleta`, `posicoes_gps`, `aet_autorizacoes`, `autorizacoes_aet`, `limites_peso_pbtc_eixos`, `incidentes_carga`, `declaracoes_carga`, `operacao_manual_relatorios_cliente` |
| Fiscal | `documentacao_operacao` (tipo, status, ambiente, chave_acesso, payload_enviado/resposta, versao), `documentacao_operacao_versoes`, `eventos_fiscais_operacao`, `operacao_ciot_vpo` (ciot, vpo_idvpo, vpo_valor, ciot_status, averbacao_rcv_*), `ciot_registros`, `apolices_seguro`, `averbacoes_negociacao`, `parametros_fiscais` (ambiente, CNPJ, endereço), `campos_obrigatorios_fiscais`, `disjuntor_fiscal`, `saude_fiscal_achados`, `piso_antt_coeficientes` (272), `pracas_pedagio` (144), `pedagio_categorias_antt`, `pedagio_historico`, `municipios_ibge` (5571), `municipios_coordenadas` |
| Integrações | `efrete_ciot_pedidos` (id_operacao_cliente único, ambiente, status), `efrete_ciot_pagamentos`, `efrete_cadastros` (só service_role), `vpo_requisicoes` (idempotency_key único), `repom_requisicoes`, `repom_rotas`, `repom_pedagios`, `integracao_averbacao` (só service_role), `consultas_externas`, `envios_whatsapp`, `mensagens_disparo` |
| Financeiro | `lancamentos_financeiros`, `baixas_financeiras`, `faturas`, `categorias_financeiras` (80), `contas_bancarias`, `transferencias_contas`, `extratos_bancarios`, `extrato_itens`, `conciliacoes_bancarias`, `documentos_financeiros`, `lancamento_documentos`, `recorrencias_financeiras`, `regras_categorizacao`, `analises_financeiras_ia`, `condicoes_pagamento_operacao`, `parcelas_pagamento_motorista`, `pagamentos_motorista` (chave_idempotencia), `validacoes_titularidade_pix`, `duplas_checagens_pagamento`, `aprovacoes_lancamento`, `saldos_projetados_caixa`, `apuracao_impostos`, `retencoes_apuracao`, `retencoes_eventos`, `notas_parceiro`, `notas_parceiro_operacoes`, `nfse_comissao`, `giro_aportes`, `feriados` |
| Agenciador e assinaturas | `comissoes_agenciador`, `comissao_agenciador_eventos`, `spreads_agenciador`, `taxas_tecnologia`, `agenciador_faixa_override`, `pix_cobrancas_agenciador`, `contratos_agenciador`, `assinaturas_motorista`, `faturas_assinatura`, `faturas_assinatura_itens`, `bloqueios_acesso_veiculo`, `regua_cobranca_eventos` |
| Conformidade, LGPD e auditoria | `auditoria_log` (append-only), `auditoria_financeira` (append-only), `trilha_auditoria`, `termos_contrato`, `termos_contrato_clausulas`, `aceites_termo`, `aceites_termo_pdf`, `contratos_aceite`, `contrato_config`, `solicitacoes_exclusao_dados`, `incidentes_seguranca`, `configuracoes_lgpd`, `alertas_conformidade_revisoes`, `pontuacao_eventos`, `pontuacao_contestacoes`, `notificacoes`, `avisos_carga_motorista`, `avisos_disponibilidade`, `tentativas_acesso_publico` |
| Apoio e IA | `parametros_sistema` (48 parâmetros), `base_conhecimento_ia`, `radar_regulatorio_temas`, `radar_regulatorio_execucoes` |

## Views
v_lancamentos, v_saldos_contas, v_faturas, v_resultado_operacoes, v_inss_retido_mensal, pontuacao_saldo, v_frete_pago_parceiro, v_checklist_prontidao, v_notas_parceiro_pendentes, v_qualidade_cliente, v_historico_pagamento_cliente, v_protesto_cliente, v_alertas_ciot, v_pendencias_painel, v_cotacao_saldo, v_fila_do_dia, agenciador_cotacoes_v.

## Triggers de regra (resumo; lista completa por tabela em `information_schema.triggers`)
- **operacoes**: `trg_operacao_valida_transicao` (nunca liberar com bloqueio fiscal), `trg_exigir_aceite_na_alocacao`, `trg_operacao_exige_aprovados`, `trg_trava_conformidade_operacao`, `trg_trava_suspenso_alocacao`, `trg_trava_contrato_operacao`, `trg_operacoes_protege_campos_gestor`, `trg_operacao_0_herda_teste`, `trg_ciot_troca_veiculo`, `trg_trilha_status_operacao`, `trg_fin_sync_operacao`, `trg_operacao_auditoria_eventos`.
- **cotacoes**: `trg_cotacao_calcula_preco`, `trg_cotacao_valida_margem`, `trg_cotacao_valida_funil`, `trg_cotacao_valida_prazo`, `trg_cotacao_convertida` (cria operação), `trg_cotacao_0_modo_teste`, `trg_trava_contrato_cotacao`, `trg_fin_sync_cotacao`.
- **documentacao_operacao**: `trg_averbar_automatico_ao_emitir`, `trg_doc_segregacao`, `trg_doc_versoes`, `trg_trilha_documento`, `trg_fin_sync_doc_emitido`, `trg_doc_teste_auditoria`.
- **operacao_ciot_vpo**: `trg_regras_prazo_ciot`, `trg_validar_ciot_origem`.
- **condicoes_pagamento_operacao**: `trg_aplicar_retencao_inss`, `trg_fin_sync_condicao`.
- **pagamentos_motorista**: `trg_pagamento_exige_pix_confirmado`, `trg_pagamento_motorista_auditoria`, `trg_trava_pagamento_retido`.
- **pessoas/veiculos**: proteção de campos de sistema/conformidade/parceiro/eh_teste, reavaliação de cadastro, histórico, auditoria de troca de papel.
- **Imutáveis**: aceites_termo(_pdf), declaracoes_carga, retencoes_eventos (UPDATE/DELETE bloqueados por trigger); lançamentos e baixas gravam `auditoria_financeira`.

## Funções RPC (public)
277 funções no schema public (inclui funções de trigger). Dependem de `current_papel()` e `tem_funcao()`. Grupos:
- **Executáveis por `authenticated`** (telas): operação (`assumir_operacao`, `largar_operacao`, `cancelar_operacao`, `iniciar_finalizacao`, `terminar_finalizacao`, `devolver_pelo_fiscal`, `liberar_operacao_com_ressalva`, `avancar_em_nome_do_motorista`, `checar_pre_voo`, `checar_alocacao`, `checar_piso_operacao`), comercial (`converter_pre_cotacao`, `reabrir_cotacao`, `gerar_link_proposta`, `abrir_operacoes_cotacao`), financeiro (`criar_fatura`, `registrar_baixa`, `fin_apagar_lancamento`, `importar_extrato`, `conciliar_extrato_item`, `dre`, `fluxo_caixa`), cadastro e contratos, painéis (`painel_inicio`, `mapa_operacional`, `busca_contagens`, `painel_conformidade`).
- **Somente service_role** (sem EXECUTE para anon/authenticated): leitores de segredo (`get_focus_nfe_token`, `get_gemini_api_key`, `get_nstech_averba_senha(_allianz)`, `get_directdata_token`, `get_repom_portal`, `get_segredo_eventos_fiscais`, `efrete_segredo`, `nspedagio_segredo`, `repom_segredo`), `validar_sync_secret`, `trava_teste_fiscal`, `lgpd_executar_exclusao`, `numerar_operacao_vpo`, `revogar_sessoes_usuario`.
- **anon e authenticated** (utilitárias puras): `cpf_valido`, `cnpj_valido`, `so_digitos`, `distancia_km`, `eh_backend`, `eh_gestor_ou_backend`, `calcular_vencimentos` e semelhantes (sem dado sensível).

## RLS (resumo)
- Padrão: policy `gestor_acesso_total` (`current_papel() = 'gestor_rbr'`, ALL) na maioria das tabelas.
- Funções internas (`operacao`, `fiscal`, `financeiro`) leem por `tem_funcao(...)` em `operacoes`, `documentacao_operacao`, `clientes`, `cotacoes`, `eventos_fiscais_operacao`, `faturas`, `lancamentos_financeiros`; comercial por `cliente_na_minha_carteira`.
- Motorista/titular: operação própria ou da frota, condição de pagamento própria, posição GPS própria.
- Agenciador: operações, cotações, clientes, NF-e, documentação liberada (`disponivel_para_agenciador`) e comissões **próprios**.
- Só service_role: `efrete_cadastros`, `efrete_ciot_pedidos` (sem policy de usuário), `integracao_averbacao`.
- `operacao_manual_relatorios_cliente`: propositalmente sem SELECT para gestor (comentário da tabela).

## Migrações
- Aplicadas no banco: 184 registros em `supabase_migrations.schema_migrations` de `20260917220938 01_extensoes_enums` até `20261112011520 ciot_pedagio_declarado`.
- No repositório existem **duas pastas**: `supabase/migrations/` (6 arquivos, p.ex. modo teste, demo NSTech) e `supabase-migrations/` (arquivos por data, 20261011 a 20261112).
- **Divergência verificada**: os arquivos `supabase-migrations/20261030_01..12` (trilha, estruturas de fluxo, link de proposta, auditores, assumir, finalizando etc.) **não aparecem** na lista de migrações aplicadas, embora as funções e tabelas resultantes existam no banco (`gerar_link_proposta`, `assumir_operacao`, `iniciar_finalizacao`, `propostas_publicas`, `metas`). Foram aplicadas fora do controle de versão de migração. A confirmar como (SQL direto).
- Rollbacks: `supabase/rollback/rollback-<migração>.sql` (existem até 20261106 repom; a partir de 20261111 a confirmar).

## Agendamentos (pg_cron, 5 jobs ativos)
| Job | Quando | O que faz |
|---|---|---|
| sincronizar-documentos-fiscais | a cada minuto | chama a função `sincronizar-documentos-fiscais` |
| auditor-segregacao-30min | a cada 30 min | `auditar_segregacao()` e atualiza disjuntor |
| auditor-dinheiro-30min | minutos 5 e 35 | `auditar_dinheiro()` |
| reavaliar-cadastros-diario | 09:00 | `reavaliar_vencimentos()` |
| limpar-tentativas-publicas | 09:30 | apaga tentativas antigas de `tentativas_acesso_publico` |
