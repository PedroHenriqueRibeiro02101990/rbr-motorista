# 02 · Papéis e permissões

Fonte: `pg_policies` e `pg_proc` do banco em 2026-11-12; `gestor/src/lib/menuPorPapel.ts`; `gestor/src/App.tsx`. O menu esconde, **o RLS decide**. Papéis: `papel_pessoa` (9 valores, ver INVENTARIO-BANCO). Funções internas (operacao, fiscal, financeiro, comercial) também aparecem em `funcoes_pessoa` e são testadas por `tem_funcao()`.

## Matriz resumida (leitura L, escrita E, nada –)

| Dado | gestor_rbr | comercial | operacao | fiscal | financeiro | agenciador | titular/condutor |
|---|---|---|---|---|---|---|---|
| operacoes | L E | L (clientes da carteira) | L | L | L | L (próprias) | L (própria/frota), E só avançar status |
| cotacoes | L E | L E (carteira) | L | L | L | L E (próprias) | – |
| clientes | L E | L E (carteira) | L | L | L | L E (próprios) | L (da própria operação) |
| documentacao_operacao | L E | – | L | L | – | L (só `disponivel_para_agenciador`) | – |
| lancamentos / faturas | L E | – | – | – | L | – | – |
| pagamentos_motorista | L E | – | – | – | – | – | L (titular, da frota) |
| comissões / spread | L E | – | – | – | – | L (próprios) | – |
| pessoas | L E | – | – | – | – | – | L (si), titular gerencia condutores |
| parametros_fiscais, parametros_sistema | L E | – | – | – | – | – | – (exceção: chave pix da taxa, leitura autenticada) |
| efrete_*, integracao_averbacao | só service_role / backend | – | – | – | – | – | – |
| vpo_requisicoes, repom_requisicoes | gestor | – | – | – | – | – | – |
| auditoria_log, trilha_auditoria | L | – | – | – | – | – | – |

Observação: em tabelas de escrita fiscal e financeira só aparece policy do gestor; as telas das demais funções que gravam fazem via RPC `SECURITY DEFINER` (ex.: `assumir_operacao`, `registrar_baixa`).

## Segregação de funções (verificado)
- `trg_doc_segregacao` em `documentacao_operacao` e `auditar_segregacao()` (cron de 30 min): "quem criou não emitiu".
- `disjuntor_fiscal`: aberto quando há achado grave de segregação; só o gestor reabre, com motivo (`reabrir_disjuntor`).
- `duplas_checagens_pagamento` e `validacoes_titularidade_pix`: validação de titularidade Pix antes de qualquer pagamento automático (comentário da tabela).
- Conferência: `conferido_por` e `emitido_por` em `documentacao_operacao`.
- Operação de teste (`eh_teste`): só gestor liga/desliga.

## O que cada papel NUNCA pode (por banco)
- **Agenciador**: ver cotação/operação/cliente de outro agenciador; ver detalhe de `averbacoes_negociacao` (sem policy); ver CIOT/VPO por tabela; ler dados bancários de motorista (revogado em `20261011_12_revoga_funcoes_dados_pessoais`).
- **Motorista/condutor**: mudar status fora de liberada_coleta→carregando→em_transito→entregue (`trg_fn_operacao_valida_transicao` bloqueia); alterar `coleta_em`, `entregue_em`, `fechamento_motivo`.
- **Comercial**: ver operação de cliente fora da carteira; ver financeiro.
- **Financeiro/Fiscal/Operação**: alterar cadastro de pessoas e parâmetros (só gestor).
- **Gestor**: ler `operacao_manual_relatorios_cliente` (propositalmente sem SELECT).
- **Ninguém (nem gestor)**: UPDATE/DELETE em `auditoria_log` e `auditoria_financeira`; alterar aceites de termo, declarações de carga e eventos de retenção (triggers de imutabilidade).

## Fato a observar
Rotas do gestor fora de `POR_PAPEL` (`/jornada`, `/metas`, `/risco`, `/conformidade`, `/relatorio-comercial`) não são bloqueadas por papel na rota; a proteção é só o RLS das tabelas que leem (ver revisão crítica, PR 4).
