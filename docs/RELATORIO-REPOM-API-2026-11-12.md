# Relatório — Repom API completa (VPR 9501 + Frete 9520) — 12/11/2026

Branch `feat/repom-api-completa` (worktree `..\rbr-motorista-repom`, a partir de `origin/main`). Nada foi publicado, nenhuma migração foi aplicada, o banco não foi
acessado e **nenhuma chamada real foi feita à Repom** (tudo com mock). Nenhum segredo foi escrito em arquivo, log, teste ou neste relatório.

## Resumo final
1. **Pronto:** especificação dos dois manuais lidos inteiros (`docs/repom/ESPECIFICACAO-VPR.md`, `ESPECIFICACAO-FRETE.md`), checklist de homologação e 35 dúvidas para a Repom.
2. **Pronto:** `repomVprClient` (adaptador único: dois tokens com cache, criar/consultar rota, pedágio, TAG, emitir/cancelar/consultar vale) e `repomFreteClient` (cadastros, rota, validações, contrato/CIOT, TAC-Agregado, pagamento, quitação), 73 testes novos/ajustados com mock.
3. **Pronto:** estado e idempotência (`repomOperacao.ts` + migração aditiva `repom_operacoes`), travas (API, valor, confirmação humana, limite diário global), edge functions `repom-vpo` e `repom-frete` (código, **não publicadas**), `repom-status` e `repom-pedagio-rota` atualizadas, CORS restrito.
4. **Erros achados no código antigo (corrigidos):** `TipoRota`→`TipoRoteiro` com códigos trocados; a resposta da rota nunca era reconhecida (campo é `codigoPercurso`, o código lia `codigoPercursoRepom`); token do vale-pedágio e consulta de TAG usavam formato/caminho inventados; o erro da Repom vem em **4 formatos**, não 2.
5. **NÃO IMPLEMENTADO (e por quê):** saldo do cliente (guia só cita o nome, sem parâmetros: D-F15); antecipar saldo de frete (corpo não documentado: D-F11); alterar documento na quitação (D-F13); consulta de contratos por data/status (caminho truncado no guia: D-F09); listar operações (sem seção: D-F05); faturas, conciliação e adiantamento flexível (só resumo, como pedido).
6. **Com suposição marcada "CONFIRMAR" (dúvida aberta, código desligado):** corpo do token do Frete (formulário User/Version/Password/Partner: D-F02), caminho de quitação `/ShippingPayment` (D-F12) e de autorização `/PaymentAuthorization` (D-F14), verbo da consulta do vale (GET, configurável: D-V02). URL de PRD e do token do Frete **não estão no guia**: ficam em segredo e, sem elas, o cliente responde "não configurado".
7. **Emissão nunca é reenviada depois de timeout/5xx:** o registro fica `enviado` e a próxima chamada **confere antes** (vale: por `codigoViagem`; contrato: por `Identifier`/`OperationKey`). A API de vale só consulta por `codigoViagem`; sem ele a conferência é no portal Repom (D-V03/D-V12). Pagamento `enviado` sem resposta também nunca reenvia.
8. **Homologação nunca vale como produção:** registro por ambiente (`qa`/`prd`) e `podeLiberarMdfe()` só aceita `prd` + `emitido`. Esta entrega **não liga** nada ao `emitir-mdfe` nem ao fluxo da demonstração.

## Migrações (nenhuma aplicada)
| Arquivo | Rollback |
|---|---|
| `supabase-migrations/20261112-1400-repom-operacoes.sql` (tabela `repom_operacoes`, RLS só `gestor_rbr` lê, escrita só service_role; segredos `REPOM_API_LIBERADA='nao'` e `REPOM_VALOR_MAXIMO_OPERACAO='3000'`; índice do limite diário global) | `supabase/rollback/rollback-20261112-1400-repom-operacoes.sql` |
Depende de `public.operacoes`, `public.current_papel()` e `vault` (já existem) e das migrações Repom anteriores (`20261106-1000`, `20261112-1200`).

## Edge functions e ordem de publicação (todas `verify_jwt = true` + checagem de gestor no código)
1. Aplicar a migração `20261112-1400`.
2. Publicar `repom-status` (agora mostra `apiLiberada`, `valorMaximoOperacao`, credenciais sim/não, uso global do dia; agenciador continua vendo só os campos antigos).
3. Publicar `repom-pedagio-rota` (só mudou CORS e a contagem do limite, que agora é global).
4. Publicar `repom-vpo` e `repom-frete` (novas; só gestor_rbr).
Nenhuma toca `nspedagio-vpo`, `efrete-ciot-operacao`, `emitir-cte`, `emitir-mdfe`, as operações DEMO nem o front. **Atenção ao publicar:** CORS agora é restrito (produção `rbr-motorista.vercel.app`, previews `rbr-*-rbr4.vercel.app` e `REPOM_CORS_ORIGENS`); se o agenciador ou o gestor usam outro domínio, definir essa variável de ambiente antes, senão o navegador bloqueia.

## Travas (todas nascem desligadas)
`REPOM_API_LIBERADA` (só `sim` libera; senão 503) · confirmação humana (nome ≥3 letras e hora até 15 min, ligada ao hash da prévia com valor, motorista, placa, rota e eixos; senão 400) · `REPOM_VALOR_MAXIMO_OPERACAO` padrão 3000, acima 422 sem chamar a Repom · `REPOM_LIMITE_DIARIO` padrão 100, 429 · cache de rota/pedágio não conta no limite · o caminho manual (portal Repom) continua sempre disponível.

## O que depende do Pedro
- Cadastrar no Vault **pelo painel do Supabase (nunca no chat)**: `REPOM_FRETE_USER`, `REPOM_FRETE_VERSION`, `REPOM_FRETE_PASSWORD`, `REPOM_FRETE_PARTNER` (CNPJ), `REPOM_FRETE_URL_TOKEN`, `REPOM_FRETE_URL_BASE` (obrigatória em prd); e conferir `REPOM_VPR_ROTEIRIZACAO_LOGIN/SENHA`, `REPOM_VPR_VALEPEDAGIO_LOGIN/SENHA` (credencial diferente da roteirização), `REPOM_VPR_CODIGO_CLIENTE`, `REPOM_AMBIENTE` (`qa` até a Repom aprovar).
- Decidir quando virar `REPOM_API_LIBERADA` e `REPOM_ROTEIRIZACAO_LIBERADA` para `sim` (só durante o teste), conferir `REPOM_VALOR_MAXIMO_OPERACAO` e `REPOM_LIMITE_DIARIO`.
- Pedir à Repom: QA configurado do nosso lado (as credenciais que existem são de **produção**), IP fixo/whitelist se exigirem, habilitar o parâmetro 156 (TAC-Agregado) e saber se 57/58 (autorização/agenda) estão ligados no 9520.
- Front: a tela que mostra a prévia e envia `confirmacao {nome, em, previa_hash}` ainda **não existe** (fora do escopo; o prompt proibia mexer em front).

## O que depende da Karen (levar `docs/repom/DUVIDAS-PARA-REPOM.md`)
Mais urgentes: D-F01/D-F02 (URL e corpo do token do Frete), D-V03/D-V12 (reenvio e consulta de emissão incerta), D-V09 (QA do 9501 funciona com as credenciais atuais?), D-F20 (lista oficial de cenários do Portal dos Testes Integrados), D-F12/D-F14 (caminhos de quitação e autorização), D-F15 (saldo do cliente), D-F17/D-V06 (prazos de cancelamento: 3 h × 72 h).

## Verificação
`node --test` (mesma lista do CI): 406 testes, 0 falhas. `tsc` estrito nos arquivos novos e `tsc -b && vite build` do gestor: ok. `oxlint`: só avisos já existentes e de estilo. Limite da leitura: as figuras do guia Frete (token, portal de testes, quadro do TAC-Agregado) são imagens e não puderam ser lidas; as dúvidas D-F02, D-F16 e D-F20 cobrem isso.

## PR e merge
PR #76. Regra do dia: merge squash permitido só se todos os checks passarem **e** o diff não tocar nada que a demonstração usa. Checks: `testes` (2 execuções) e Vercel, todos verdes; o diff (26 arquivos, só `docs/`, `supabase/functions/_shared/repom*`, `repom-*`, uma migração e um rollback) **não toca** `nspedagio-vpo`, `efrete-ciot-operacao`, `emitir-cte`, `emitir-mdfe`, abas Vale-pedágio/CIOT, operações DEMO nem front. **Resultado: PR mergeado (squash).** Nada foi publicado e nenhuma migração foi aplicada: isso fica para o Claude, na ordem acima.
