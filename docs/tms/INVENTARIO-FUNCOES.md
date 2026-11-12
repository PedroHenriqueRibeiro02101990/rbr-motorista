# Inventário de edge functions

Fonte: código em `supabase/functions/` e projeto publicado "ERP RBR" (listagem em 2026-11-12). Segredos por **nome** (RPC do Vault ou variável); `SUPABASE_*` omitidas. "verify_jwt" é o valor publicado.

## Divergências repositório x publicado
- Publicadas **sem fonte no repositório**: `baixar-documento-fiscal` (v2), `consultar-protesto` (v1).
- No repositório e **não publicadas**: `repom-pedagio-rota`, `repom-status`.

## Tabela

| Função | v | verify_jwt | O que faz | Tabelas que toca | Segredos (nome) |
|---|---|---|---|---|---|
| acesso-app | 2 | sim | Link de acesso, bloqueio e exclusão LGPD de motorista/agenciador | pessoas, auditoria_log, solicitacoes_exclusao_dados, documento_extracoes | (service role) |
| assistente-ajuda | 6 | sim | Assistente de ajuda (IA) | base_conhecimento_ia, pessoas | get_gemini_api_key, GEMINI_MODEL |
| avaliar-risco-carga | 2 | sim | Avalia risco da carga (IA) | — | get_gemini_api_key |
| calcular-rota-frete | 2 | sim | Rota e piso ANTT | piso_antt_coeficientes | — |
| cancelar-documento-fiscal | 3 | sim | Cancela CT-e/MDF-e na Focus | cotacoes, documentacao_operacao, eventos_fiscais_operacao, pessoas | get_focus_nfe_token |
| conferir-documento-operacao | 2 | sim | Conferência de documentos com IA | operacoes, documentacao_operacao, ciot_registros, condicoes_pagamento_operacao, veiculos | get_gemini_api_key |
| consulta-cadastros | 4 | **não** (auth interna: `x-rbr-segredo` ou usuário gestor/agenciador) | Consulta CNPJ/municípios | municipios_ibge, pessoas | get_focus_nfe_token, get_segredo_eventos_fiscais |
| consultar-documento-fiscal | 4 | sim | Consulta status na Focus | documentacao_operacao | get_focus_nfe_token |
| consultar-protesto | 1 | **não** | Consulta de protesto (fonte fora do repo) | a confirmar | a confirmar |
| conta-publica | 2 | **não** (limite de tentativas por IP/documento) | Conta pública (criar/recuperar acesso) | pessoas, tentativas_acesso_publico | (service role) |
| efrete-ciot-operacao | 7 | sim | Emite, confirma, cancela e encerra CIOT por operação na efrete | efrete_ciot_pedidos, efrete_ciot_pagamentos, efrete_cadastros, operacao_ciot_vpo, operacoes | efrete_segredo, RBR_CNPJ |
| efrete-ciot-teste | 5 | sim | Teste de CIOT em homologação | efrete_ciot_* | efrete_segredo |
| efrete-homologacao-teste | 5 | sim | Teste de conexão efrete | pessoas | efrete_segredo |
| emitir-cte | 24 | sim | Emite CT-e (Focus) | operacoes, documentacao_operacao, clientes, parametros_fiscais | get_focus_nfe_token, trava_teste_fiscal |
| emitir-cte-teste-producao | 1 | sim | CT-e de teste em produção | parametros_fiscais, municipios_ibge | get_focus_nfe_token |
| emitir-mdfe | 27 | sim | Emite/encerra MDF-e (Focus) | operacoes, documentacao_operacao, operacao_ciot_vpo, apolices_seguro | get_focus_nfe_token, trava_teste_fiscal |
| emitir-nfe-teste | 2 | sim | NF-e de teste | cotacoes, parametros_fiscais | get_focus_nfe_token |
| emitir-nfe-teste-producao | 2 | sim | NF-e de teste em produção | idem | get_focus_nfe_token, trava_teste_fiscal |
| emitir-nfse-intramunicipal | 3 | sim | NFS-e de frete intramunicipal | documentacao_operacao, municipios_ibge | get_focus_nfe_token |
| enviar-averbacao | 9 | **não** (gestor logado OU `x-sync-secret`) | Averba CT-e (RCTR-C) | documentacao_operacao, integracao_averbacao, apolices_seguro, operacao_ciot_vpo | get_nstech_averba_senha (e _allianz), validar_sync_secret |
| enviar-averbacao-rcv | 2 | **não** (gestor ou `x-sync-secret`) | Averba RC-V (Sompo) | idem | idem |
| eventos-fiscais | 1 | **não** (segredo ou gestor) | Eventos fiscais (CC-e etc.) | eventos_fiscais_operacao, documentacao_operacao | get_focus_nfe_token, get_segredo_eventos_fiscais |
| extrair-documento | 6 | sim | Lê CNH/CRLV com IA | documento_extracoes, documentos_pessoais_imagens, pessoas, veiculos | get_gemini_api_key |
| financeiro-ia | 4 | sim | Análise financeira e categorização (IA) | lançamentos, categorias, extrato_itens | get_gemini_api_key |
| importar-motoristas-csv | 5 | sim | Importa motoristas | pessoas, vinculos_agenciador_motorista | — |
| nspedagio-vpo | 10 | sim | Compra e recibo de vale-pedágio | operacao_ciot_vpo, operacoes, vpo_requisicoes | nspedagio_segredo |
| proposta-publica | 1 | sim (cliente chama com a chave pública) | Ver e aceitar proposta `/p/<código>` | propostas_publicas, cotacoes, notificacoes, tentativas_acesso_publico | (service role) |
| receber-lead | 1 | **não** (limite por IP) | Recebe lead do site | leads, interacoes, tentativas_acesso_publico | — |
| repom-pedagio-rota | não publicada | — | Rota e pedágio Repom | repom_rotas, repom_pedagios, repom_requisicoes | repom_segredo |
| repom-status | não publicada | — | Status Repom | pessoas | repom_segredo |
| resumo-dia | 2 | sim | Resumo do dia (IA) | (RPC painel_inicio) | get_gemini_api_key |
| saude-fiscal | 1 | sim | Robô de conferência (não emite, não cancela) | documentacao_operacao, operacoes, saude_fiscal_achados | — |
| sincronizar-documentos-fiscais | 1 | **não** (`x-sync-secret`) | Sincroniza status com a Focus | documentacao_operacao | get_focus_nfe_token, validar_sync_secret |
| baixar-documento-fiscal | 2 | sim | Baixa PDF/XML (fonte fora do repo) | a confirmar | a confirmar |

"Quem chama": telas dos três apps via `supabase.functions.invoke`; as com `x-sync-secret` são chamadas pelo banco/agendador (agendador: pg_cron, ver INVENTARIO-BANCO).
