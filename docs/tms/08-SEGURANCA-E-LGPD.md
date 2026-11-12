# 08 · Segurança e LGPD

Não repete o relatório de auditoria da outra janela (PR #65, lote VPO/CIOT/Repom/reemissão); referencie-o quando existir. Antes dele: `docs/seguranca-supabase-2026-10-23.md`, `docs/auditoria-prs-1-32-2026-10-28.md`, `docs/checagem-aplicacao-seguranca-15-2026-10-28.md`.

## O que existe (verificado em 2026-11-12)
- **RLS** ligado em todas as tabelas do schema public; padrão `gestor_acesso_total` + policies mínimas por papel (02).
- **Vault**: segredos lidos por funções `SECURITY DEFINER` sem EXECUTE para anon/authenticated (`get_focus_nfe_token`, `get_gemini_api_key`, `efrete_segredo`, `nspedagio_segredo`, `repom_segredo`, `get_nstech_averba_senha*`).
- **Auditoria**: `auditoria_log` e `auditoria_financeira` append-only (sem UPDATE/DELETE); `trilha_auditoria`; aceites de termo e declarações de carga imutáveis por trigger.
- **Idempotência**: `vpo_requisicoes.idempotency_key`, `efrete_ciot_pedidos.id_operacao_cliente`, `repom_requisicoes.idempotency_key`, `pagamentos_motorista.chave_idempotencia`.
- **Endpoints públicos com limite**: `proposta-publica`, `conta-publica`, `receber-lead` (tabela `tentativas_acesso_publico`, limpeza diária por cron). Código de proposta com 128 bits.
- **Funções verify_jwt=false** com autenticação interna: consulta-cadastros, enviar-averbacao(-rcv), eventos-fiscais (segredo ou gestor), sincronizar-documentos-fiscais (`x-sync-secret`), conta-publica, receber-lead; **consultar-protesto sem fonte no repo (não verificável)**.
- **LGPD**: `solicitacoes_exclusao_dados` e `lgpd_executar_exclusao` (apaga/anonimiza, remove fotos, apaga login); `configuracoes_lgpd`; `documentos_pessoais_imagens` com retenção de 90 dias após inativação; consentimento de consulta de antecedentes; `incidentes_seguranca`; revogação de funções com dado pessoal (`20261011_12`).
- Modo teste e demonstração isolados por coluna e trava no servidor (`trava_teste_fiscal`).

## Em aberto (a confirmar ou ainda não disponível)
- Rotina que executa as retenções (imagens 90 dias, GPS 2 anos): não há job no cron.
- Rotação periódica de segredos; backup e teste de restauração (não constam).
- Funções publicadas sem fonte no repositório (`consultar-protesto`, `baixar-documento-fiscal`): revisão de código impossível pelo repo.
- Funções utilitárias executáveis por `anon` (validadores de CPF/CNPJ, `eh_backend`, `eh_gestor_ou_backend`): sem dado sensível, mas `eh_backend` deve ser revisada (usa a sessão).
- Painel de embarcador (login externo): só desenho, PR #68.
- Papel "dono" distinto do gestor: não existe (limita a Central de integrações a flag de build).
