# Alertas de segurança do Supabase: análise de 23/10/2026

Só análise. As correções propostas estão em `supabase-migrations/propostas/`, cada uma com rollback em `supabase/rollback/`. **Nada foi aplicado.**

## 1. `pg_net` no schema `public`

- Só o **registro** da extensão está em `public`. As funções e tabelas ficam no schema `net`.
- A extensão não é relocável, então é preciso recriá-la. A proposta está em `20261023_06_pg_net_schema_extensions.sql`.
- **Usam `net.http_post`:**
  - os gatilhos `trg_averbar_automatico_ao_emitir` e `trg_fn_encerrar_mdfe_na_entrega`;
  - o cron `sincronizar-documentos-fiscais`.

  Nenhum deles é apagado pelo drop. Durante alguns segundos, porém, as chamadas HTTP falham, então a recriação deve ser feita fora do horário de emissão.
- **Ganho:** só tira o alerta. **Risco:** baixo, desde que feito fora do horário de emissão.

## 2. Tabelas com RLS ligado e sem política: o bloqueio total é intencional

Com RLS ligado e nenhuma política, `anon` e `authenticated` não leem nem gravam nada pela API. Só `service_role` (Edge Functions) e funções `SECURITY DEFINER` acessam.

| Tabela | Quem usa | Decisão |
|---|---|---|
| `documento_extracoes` | Edge Functions `extrair-documento` e `acesso-app` (service role); função `lgpd_executar_exclusao` (definer) | manter como está |
| `tentativas_acesso_publico` | Edge Functions `conta-publica` e `receber-lead` (service role) | manter como está |
| `pedagio_categorias_antt` | ninguém no código (tabela de referência) | manter fechada; abrir com política só se um app precisar ler |
| `_bkp_gr_exigido_20261015` | — | apagada pelo Pedro no painel em 23/10 |

## 3. Funções `SECURITY DEFINER` executáveis por `authenticated`

São 89 funções (87 nomes; `peso_acima_limiar_eixo2` e `proximo_dia_util` têm duas versões cada). Classificação:

### Excluídas pelo Pedro (sem mudança): 9

`agenciador_suspender`, `alertas_conformidade_abertos`, `alertas_conformidade_operacao`, `anexar_nota_parceiro`, `campos_pendentes_termo`, `detectar_documento_por_cidades`, `painel_conformidade`, `publicar_termo`, `reter_para_apuracao`

### Chamadas pelos apps via RPC (manter): 69

`aceitar_termo`, `acessos_app`, `agenciador_reativar`, `alterar_vencimento_fatura`, `base_motoristas_agenciador`, `buscar_municipio` (também em Edge Function), `calcular_retencao_inss`, `cancelar_fatura`, `carga_declarada`, `checar_piso_operacao`, `ciot_origem_esperada`, `cobranca_ativa`, `conciliar_extrato_item`, `confirmar_pagamento_assinatura`, `contrato_agenciador_enviar`, `contrato_agenciador_gerar`, `contrato_agenciador_validar`, `criar_fatura`, `criar_lancamentos`, `current_pessoa_id`, `dados_pdf_aceite`, `decidir_cadastro`, `declarar_carga`, `documentos_operacao_agenciador`, `dre`, `encerrar_incidente_carga`, `fin_apagar_lancamento`, `fluxo_caixa`, `gerar_lancamentos_recorrentes`, `importar_extrato`, `indicar_motorista`, `lancar_extrato_item`, `liberar_operacao_com_ressalva`, `liberar_retencao`, `mapa_operacional`, `marcar_contato_nao_enviar`, `meu_contrato_agenciador`, `meu_termo_pendente`, `meus_contratos`, `meus_recebimentos`, `montar_aviso_carga`, `municipio_ibge_cliente`, `nomes_pessoas_relacionadas`, `operacoes_aguardando_motorista`, `painel_inicio`, `pendencias_agenciador`, `peso_acima_limiar_eixo2`, `possiveis_duplicados`, `prorrogar_retencao`, `proxima_mensagem_disparo`, `reativar_contato`, `reativar_prestador`, `reavaliar_cadastro`, `reavaliar_meu_cadastro`, `registrar_aviso_carga`, `registrar_baixa`, `registrar_consentimento_antecedentes`, `registrar_dossie_incidente`, `registrar_envio_whatsapp`, `registrar_incidente_carga`, `registrar_meu_cadastro`, `registrar_pdf_aceite`, `resolver_indicacao_motorista`, `revisar_alerta_conformidade`, `sugerir_vencimento`, `sugestoes_motoristas_operacao`, `textos_declaracao_carga`, `transferencia_extrato_item`, `valor_acima_teto_seguro`, `vincular_documento_lancamento`

### Usadas pelo próprio banco (manter): 6

O usuário logado precisa poder executar estas, porque o banco as chama no contexto dele.

- `current_papel`: políticas RLS.
- `proximo_dia_util`: view e outras funções.
- `dia_util_anterior`, `eh_dia_util`, `motivo_nao_util`, `sugerir_conciliacao`: chamadas por outras funções.

### Não chamadas por ninguém: 2 (revoke proposto em `20261023_05`)

- `sincronizar_financeiro_operacao(uuid)`: nenhum app, Edge Function, política, view, gatilho ou cron chama esta função.
- `trg_fn_interacao_primeiro_contato()`: função de gatilho do CRM. Ganhou `EXECUTE` para `PUBLIC` (incluindo `anon`) pelo padrão do Postgres. O gatilho continua funcionando sem isso.

**Como foi levantado:** `rpc('…')` nos apps (`gestor`, `motorista`, `agenciador`, `shared`) e nas branches dos PRs abertos (#9 a #13); `rpc` nas Edge Functions; e, no banco, uso em `pg_policies`, `pg_views`, `pg_trigger`, código de outras funções e `cron.job`.

**O que continua pendente por causa da exclusão:** as 9 funções acima seguem executáveis por qualquer usuário logado. A conferência de quem pode chamar cada uma depende do código delas, que não foi alterado.

## 4. Fora do banco (é com o Pedro, no painel)

- Proteção contra senha vazada (Auth).
- Tokens `sbp_` expostos: regenerar.
