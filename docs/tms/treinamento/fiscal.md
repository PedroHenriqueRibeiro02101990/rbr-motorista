# Treinamento · Fiscal

**Público:** papel `fiscal` e gestor. **Pré-requisitos:** glossário (CT-e, MDF-e, CIOT, VPO, averbação). **Regra de ouro:** emissão real só em operação real autorizada; para treinar use a **operação DEMO** (modo demonstração: só tela, sem chamada a fornecedor).

## Sessão 1 · Tela Fiscal e pré-voo (35 min)
1. **Fiscal** (`/fiscal`): fila por operação com esteira de documentos. Menu do papel: Início, Serviços, Parâmetros fiscais (`/fiscal?parametros=1`).
2. Entenda bloqueio x aviso: bloqueia só regra SEFAZ/ANTT/lei; regra da RBR só avisa (`regras-fiscais.md`).
3. Leia os alertas do pré-voo antes de emitir.
**Exercício (DEMO):** abra a operação DEMO na aba Fiscal e identifique CIOT e vale-pedágio.
**Erros comuns:** emitir sem NF-e válida (44 dígitos); IE da RBR ausente.
**Sei fazer:** [ ] ler esteira [ ] diferenciar bloqueio de aviso.

## Sessão 2 · Vale-pedágio e CIOT (45 min)
1. Cartão do vale-pedágio: **Consultar tag**, **Comprar vale-pedágio** (só depois de simular e sem compra ativa), **Reemitir recibo**, **Trocar placa**, **Cancelar vale**, **Baixar JSON** e **Salvar em PDF** do passo a passo.
2. Cartão do CIOT: confira dados, use **Corrigir ›** nos itens com pendência; o pedágio declarado usa o valor real do vale (`vpo_valor`) com aviso se divergir.
3. Na DEMO nada é comprado de verdade (homologação).
**Erros comuns:** comprar duas vezes (a chave de idempotência bloqueia); CIOT sem vale.
**Sei fazer:** [ ] simular e comprar na DEMO [ ] ler a divergência de pedágio.

## Sessão 3 · CT-e, averbação e MDF-e (40 min)
1. Ordem: CT-e → averbação → vale → CIOT → MDF-e (04). CIOT obrigatório no MDF-e em produção a partir de 23/11/2026.
2. Prazos: CT-e cancela até 7 dias; MDF-e até 24 h (viagem não iniciada); CIOT até 24 h antes do início.
3. **Saúde fiscal** (`/saude-fiscal`) mostra achados do robô (não emite nem cancela).
**Ainda não disponível:** aba "Cancelamentos" desativada na tela Fiscal.
**Sei fazer:** [ ] seguir a ordem [ ] consultar prazos [ ] ler Saúde fiscal.
