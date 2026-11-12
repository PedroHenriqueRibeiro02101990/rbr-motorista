# Relatório: pedágio real no CIOT (PR 1) e escolha de fornecedor por operação (PR 2) — 12/11/2026

Nenhum segredo neste arquivo. Demonstração da NSTech: sexta 13/11, 14h.

## PARTE A — Pedágio do CIOT usa o valor real do vale (PR #64, mergeado)
- Regra (`decidirPedagio`, `_shared/ciotEfrete.ts`): `vpo_idvpo` preenchido **e** `vpo_valor > 0` => pedágio = `vpo_valor`; senão `cotacoes.pedagio`. Vale cancelado, valor zero ou nulo voltam para a cotação.
- `efrete-ciot-operacao` lê `vpo_valor` e `vpo_idvpo` junto com `ciot_origem`. Prévia, confirmação e envio usam a mesma regra.
- Conferência do CIOT e "Dado enviado" da demo mostram a origem; divergência acima de 10% vira aviso (não bloqueia).
- CIOT emitido: aviso discreto "CIOT emitido com pedágio R$ A; vale atual R$ B", sem botão. Para isso, migração aditiva `efrete_ciot_pedidos.pedagio_declarado` (aplicada; rollback em `supabase/rollback/rollback-20261112-1000-ciot-pedagio-declarado.sql`).
- Publicada: `efrete-ciot-operacao` **v7** (anterior v6; voltar = republicar a v6).
- Escolha do mais simples: na demo, a tabela "Dado enviado" ganhou a linha "Pedágio do CIOT" (pedido explícito do A2). Nada mais da demo mudou.
- Pendente: conferir pela prévia de uma operação de teste (precisa de login; não rodei no servidor).
- Pergunta para a NSTech: a declaração de pedágio do CIOT precisa bater com o valor do vale?

## PARTE B — Fornecedor de CIOT e de VPO por operação (PR 2, ABERTO, sem merge)
- Migração `20261112-1100-fornecedores-fiscais.sql` (aditiva) + rollback. **NÃO APLICADA** no banco: o classificador de segurança negou o `apply_migration`. Pedro precisa aplicar (ou autorizar) antes de ligar o seletor.
- B1: tabela `fornecedores_fiscais` (id, nome, capacidades, ativo, disponivel_emissao, ambiente, ordem, padrao_ciot, padrao_vpo). RLS leitura só gestor e fiscal; escrita só service_role. Linhas: `nstech` (ciot e vpo, disponível, padrão) e `repom` (ativo, **indisponível** até implementar a emissão).
- B2: colunas em `operacao_ciot_vpo`: `ciot_fornecedor`, `vpo_fornecedor`, `fornecedor_escolhido_por`, `fornecedor_escolhido_em`. Nulo = padrão. Reaproveita a linha que já guarda `ciot_origem`; `ciot_origem` segue sendo quem gerou o CIOT (fato), `ciot_fornecedor` é a escolha. Padrão global: colunas `padrao_ciot`/`padrao_vpo` (um índice único cada) e função `definir_fornecedor_padrao` (só gestor).
- B3: função `escolher_fornecedor_fiscal` (Fiscal ou gestor; só fornecedor ativo, com a capacidade e disponível; bloqueia depois de CIOT emitido/pendente ou vale comprado/em andamento: "cancele antes de trocar a empresa"; grava quem e quando). Tela: componente `SeletorFornecedor` antes dos cartões CIOT e Vale-pedágio da aba Fiscal; indisponíveis aparecem desabilitados "em implantação".
- B4: `_shared/fornecedoresFiscais.ts`: tipos `ProvedorVpo` (= `ProvedorNsPedagio`) e `ProvedorCiot` (já existente no `efreteClient`), `criarProvedor` (fábrica por id) e `guardaFornecedor`. As duas edge functions chamam a guarda: fornecedor sem adaptador => `409` com "Fornecedor X ainda não está disponível para emitir." sem chamar ninguém. Falha de leitura (tabela ainda não existe) não bloqueia: o nstech segue como hoje. Cancelar, reemitir, consultar e recibo usam o fornecedor gravado na operação, não o padrão atual.
- B5 (parcial): o seletor mostra "VPO: NSPEDAGIO" / "CIOT: efrete" e "padrão, sem escolha feita"; documentos emitidos mostram "Emitido por". **Não** mexi na esteira nem no pré-voo (ficaria dentro da demo); `rotuloEtapa` já está pronto para isso.
- B6: flag `VITE_SELETOR_FORNECEDOR` desligada por padrão; operação DEMO sempre nstech, seletor não aparece (e a função do banco recusa troca em demo).
- B7: testes (backend 6 e front 6 novos): padrão nstech, escolha/troca, bloqueio, cancelar com fornecedor de origem, erro claro sem rede, só Fiscal e gestor, demo ignora.
- Sem prints: com a flag desligada e a migração não aplicada o seletor não renderiza.
- As edge functions **não foram publicadas** nesta parte (as guardas só entram no ar quando Pedro mandar).

## Para o Pedro
1. Revisar e liberar o PR 2 depois de sexta; aplicar a migração; só então publicar as funções e ligar a flag.
2. Perguntar à NSTech se o pedágio declarado no CIOT precisa bater com o valor do vale.
3. Implementar a emissão da Repom em outra rodada.
