# 06 · Regras de negócio

Valores de `parametros_sistema` lidos em 2026-11-12 (podem mudar; ler sempre do banco). Gatilhos de banco citados por nome.

## Cotação e margem
- Margem (lucro) válida: **26% a 40%** (`margem_cotacao_min` 0,26 / `margem_cotacao_max` 0,40); padrão 40% (`lucro_cotacao_padrao`). Validação em `trg_cotacao_valida_margem`, destravável pela Comercial (comentário da tabela). Preço: `trg_cotacao_calcula_preco`.
- Imposto padrão 6% (`aliquota_imposto_cotacao_padrao`); seguro/TAG por faixas 0,10% a 0,90% (`tag_seguro_faixas`).
- Piso ANTT é referência; `checar_piso_operacao`. Pedágio por praças (`pracas_pedagio`, 144).
- Funil: Rascunho → Enviada → Convertida (+ perdida, com motivo). `trg_cotacao_valida_funil`. Link de aceite `/p/<código>` válido de 1 a 60 dias (`gerar_link_proposta`, padrão 7).
- Custo financeiro / giro (`giro_*`): desligado (`giro_ativo=false`); 3 propostas A, B, C em `giro_propostas` (nenhuma ativa).
- Peso acima de 25.000 kg (`peso_bruto_limiar_eixo2_kg`) aciona sinal de carga superdimensionada (AET).

## Agenciador: comissão e spread
- Comissão mensal por faixa de base ativa: `comissoes_agenciador` (snapshot mensal) e `comissao_agenciador_eventos`; "faixa é degrau": ao cruzar o patamar toda a base passa ao percentual novo (comentário de `agenciador_faixa_override`). Percentuais das faixas: **a confirmar** (não estão em `parametros_sistema`).
- Spread por operação: `spreads_agenciador` (bruto, taxa de tecnologia, líquido); taxa de tecnologia R$ 9,90 (`taxa_tecnologia_valor`).
- Carga de agenciador: Pix da cobrança deve estar confirmado antes de avançar o pagamento (`trg_pagamento_exige_pix_confirmado`).
- Agenciador novo: 30 dias ou 3 cargas, limite R$ 100.000 por carga; restrito 0; verificado sem limite (`conformidade`).

## Pagamentos ao motorista
- Adiantamento padrão **80%** (`adiantamento_motorista_padrao`); saldo com prazo 0 dias (`saldo_motorista_prazo_dias`). Não há mínimo legal de adiantamento, exceto vale-pedágio 100% (Lei 10.209/2001, comentário de `condicoes_pagamento_operacao`).
- Idempotência por `chave_idempotencia` em `pagamentos_motorista`; validação de titularidade Pix antes de qualquer pagamento automático.
- Retenção de INSS de parceiro (TAC): alíquota 11% sobre base 20% do frete (`retencoes_parceiro`); IRRF e SEST/SENAT desligados. `trg_aplicar_retencao_inss`, retenção com prazo de 30 dias e aviso em 3 (`conformidade`).
- Frete a parceiro sem NFS-e: falta de nota **nunca bloqueia** o pagamento (`NotasParceiros`).

## Faturas
`faturas` (cotação/operação/cliente, vencimento, Pix/boleto, atraso confirmado em banco). Cobrança ativa desligada (`cobranca_ativa=false`). Funções `criar_fatura`, `cancelar_fatura`, `alterar_vencimento_fatura`.

## Assinaturas e mensalidade
Mensalidade padrão R$ 19,90, piso R$ 9,90; carência de inadimplência 3 dias (`mensalidade_valor_padrao`, `mensalidade_valor_piso`, `carencia_inadimplencia_assinatura_dias`). Tabelas `assinaturas_motorista`, `faturas_assinatura(_itens)`. Limites do titular: 4 veículos e 3 condutores.

## Pontuação e bloqueios
- `pontuacao_eventos` (nunca deletados; contestação gera evento de reversão), `pontuacao_saldo` (view). Condutor sem histórico não é elegível para carga complexa (comentário).
- Bloqueios de acesso do veículo só impedem **receber carga nova**, nunca interrompem operação em andamento (`bloqueios_acesso_veiculo`).
- Suspensão de agenciador/motorista: `trg_trava_suspenso_alocacao`, `agenciador_suspender`.
- Conformidade: exame toxicológico exigido para CNH C, D, E (aviso 30 dias); `bloquear_liberacao_com_alerta=false`.
