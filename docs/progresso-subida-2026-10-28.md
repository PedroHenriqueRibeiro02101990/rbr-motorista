# Progresso da subida (2026-10-28)

## Fase 0
- (a) #33 e #34 mesclados (docs). Antes: 84ba89e → 9f4b368 (#33) → 103a41d (#34).
- (b) Ciclo na operação de teste 965ceb0d (homologação), com a exceção autorizada:
  - SQL de reversão escrito antes: `docs/sql/reversao-aprovacao-reboque-RRD5B39-2026-10-28.sql`. Aprovei o RRD5B39 mudando só `aprovacao_status` (os outros campos de aprovação ficaram como estavam; só o `updated_at` mudou por gatilho). **Reposto ao final** ('aguardando_documentos', conferido).
  - Reboque RRD5B39 vinculado à operação de teste (linha nova em `operacao_reboques`). Prévia: ok. Piso ANTT: tabela A, 6 eixos, R$ 1.407,40, frete R$ 8.000 (sem falta de coeficiente), tipo de carga 5.
  - **Emitir: falhou 3 de 3** com `ANTT.Falha.Comunicacao` ("Não foi possível estabelecer uma comunicação com ANTT"), protocolos 6133655, 6133660 e 6133675. O mesmo erro de comunicação com a ANTT apareceu no cadastro do proprietário (protocolo 6133683): é a homologação da efrete sem acesso à ANTT, não o nosso código.
  - Anti-duplicidade ok: a 2ª e a 3ª tentativa reaproveitaram o mesmo pedido (cb81e2e9), consultaram a efrete pela referência antes e `consultar` voltou `encontrado: null` (nenhum CIOT duplicado).
  - Consultar (sem CIOT): ok. PDF e cancelar: não rodaram (sem CIOT). **Acentos: não rodou** (o cadastro também cai no erro da ANTT antes de ter retorno com texto). Nada de semAcento alterado.
- (c) "Emitir novamente": PR #36 (mesclado). Precisa de deploy da função.

## Fase 1: parcial (PR #35 mesclado)
Feito: filas Sem motorista / Sem nota / Para revisar / Prontas para o fiscal com contador nos chips, busca por placa, NF-e, cliente e código, "Ocultar testes", `?fila=`. Já existiam: `?op=` e a lista com filtros.
Não feito: contador no menu lateral, painel único com cabeçalho fixo e setas anterior/próxima, abas Cotação|Operação|Fiscal com badge de vários caminhões, "esperando por mim", celular em tela cheia. Motivo: o app trata uma operação como um caminhão; o "serviço" com N operações ligadas (grupo_saida_id) exige refazer a tela de Operações (1.200 linhas) e o orçamento desta sessão acabou antes de fazer isso com segurança.

## Fases 2 e 3: não iniciadas
Dependem de colunas novas e de regra fiscal (CFOP 5357, expedidor/recebedor, travas pós-CT-e) atrás de flag. Já existe na main: tipos de cotação carga única / veículos juntos / várias entregas, N operações ligadas, tomador_papel, CFOP 5353/6353, carta de correção, ZIP no dossiê.

## Fase 4: parcial (PR #37 mesclado)
Feito: CIOT só libera com CT-e e averbação ok ou "não exigido"; cancelar CIOT bloqueado com MDF-e e depois de 24 h antes do início, com motivo. Não feito: orquestração com estados e retomada por etapa, papéis no CT-e, NFS-e por cidade, parceiro ETC, substituição de documentos; encerrar CIOT em 5 dias (sem botão de encerrar na tela).

## Fases 5 e 6
Fase 5 (Pix, adiantamento, encerramento): não iniciada, nenhuma flag. Fase 6: `docs/checklist-producao.md` atualizado.

## Funções para publicar (não publiquei)
- `efrete-ciot-operacao`: `supabase functions deploy efrete-ciot-operacao --project-ref kwscmegsfbtvlnyxougt` (traz a trava 412 do PR #29, o status com pagamentos e o "emitir novamente").

## Flags
Nenhuma flag nova. Produção: `VITE_EFRETE_CIOT_HABILITADO` e `VITE_DEMO_CIOT` seguem só no Preview. Para ligar o cartão do CIOT em produção, só depois da conta de produção da efrete.

## Decisões conservadoras
- O CIOT de teste não saiu; por isso não repeti tentativas além de 3.
- Contador por fila considera operação "com NF-e" quando existe qualquer linha em operacao_nfes.
