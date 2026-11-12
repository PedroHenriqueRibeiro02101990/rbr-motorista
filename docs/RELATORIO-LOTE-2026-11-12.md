# Relatório do lote 12/11/2026 (fases 1 a 6)

Modo autônomo, sem perguntas. Um relatório, uma seção por fase. Nenhum segredo, documento fiscal real, vale, chamada a efrete/NSPEDÁGIO/Focus/Repom foi feito.

**Dois bloqueios do sistema de segurança que afetaram o lote (não contornados):**
1. **Banco e deploy do Supabase negados** (`execute_sql` mesmo só para leitura e, por consequência, qualquer escrita no projeto). Afeta a Fase 3 (inserir as operações), a publicação das funções Repom (4.3), a criação do segredo no Vault e a aplicação de qualquer migração.
2. **Push forçado negado** (necessário depois de um rebase) e merge manual direto negado. O auto-merge dos PRs das fases 1 e 4 funcionou.

## Fase 1: abas Vale-pedágio e CIOT. **Pronta e mergeada** (PR #66)

- Esteira com CT-e, Averbação e MDF-e "Fora desta demonstração" (sem clique) e Vale-pedágio e CIOT como abas (`role=tab`, `aria-selected`, foco visível, Enter, Espaço e setas). Abre no vale. Um quadro por vez; o outro não é renderizado. CIOT abre sem ter comprado o vale.
- Vale comprado e CIOT não emitido: faixa verde "Vale-pedágio comprado. Próximo passo da esteira: emitir o CIOT." com "Continuar para o CIOT →" e anel dourado estático (sem animação) na aba do CIOT. Rolagem volta ao topo da esteira ao trocar.
- Aba lembrada em `sessionStorage` (com try/catch) e no hash `#vpo`/`#ciot` (sobrevive ao F5).
- Cada aba em duas colunas 1,55fr/1fr com altura igual (uma coluna abaixo de 900 px). Medido a 1366x768: vale 379/379 px, CIOT 727/727 px, sem rolagem horizontal. Dados editáveis do vale ficam recolhidos no rodapé do cartão da esquerda ("Ajustar dados da rota e do veículo", 4 colunas, 2 no celular).
- Operações que não são demonstração ficam como estavam (os cartões só mudam de layout quando recebem a tabela da demonstração).
- Testes: 3 novos em `modoDemonstracao.test.ts`, prova de tela `gestor/e2e/prova-abas-demo.cjs` (24 verificações, todas verdes) e a prova antiga ajustada. Bateria do CI 349/349. Prints em `docs/capturas/abas-demo-vpo-1366x768.png` e `abas-demo-ciot-1366x768.png`.
- **Divergências da descrição, registradas:** (a) as linhas da tabela "O que enviamos" são as que já existiam (ex.: "Placa e eixos" em uma linha), não a lista exata do pedido (placa e eixos separados, "Subcontratado" etc.), para não mexer em regra/testes; (b) no CIOT, "Baixar JSON" e "Salvar em PDF" são novos e exportam só o pedido e os pagamentos já carregados; (c) os botões "Transações (Pix)" e "Encerrar CIOT" continuam onde estavam (regra 1.5: nomes e ordem dos botões existentes); (d) o arquivo de referência estava em `docs/` e foi seguido.

## Fase 2: seletor de fornecedor nas abas. **PR aberto** (#65, sem merge, sem publicar, sem aplicar migração)

- Branch atualizado sobre a main. **O rebase foi feito, mas o push forçado foi negado**; para não contornar, a atualização foi por **merge da main** no branch (histórico normal). O rebase local ficou guardado no branch local `backup/65-rebase-local` (pode apagar).
- O seletor "Empresa que emite" ganhou um encaixe no topo do cartão da direita de cada aba, sem mudar a altura igual. Com a flag desligada, e sempre na demonstração, o encaixe fica vazio: tela idêntica à da Fase 1. Para operações reais (sem abas) o seletor segue acima de cada cartão.
- O seletor agora mostra as opções à vista (grupo de opções): **NSTech marcado e Repom desabilitada "(em implantação)"**, o que o select fechado não mostrava. Prints novos com a flag ligada, dados de exemplo, fora de produção: `docs/captura-fornecedor-seletor.png` e as demais. Operações DEMO continuam sem seletor (prova verde).
- SQL (não aplicado, aditivo, mesmo rollback): policy de leitura de `fornecedores_fiscais` agora para `gestor_rbr` **e `fiscal`**; escrita continua só `service_role` e as funções. Teste da migração atualizado. Bateria 370/370.

## Fase 3: operações DEMO virgens. **Travada** (não executada)

O acesso ao banco foi negado, então nenhuma operação foi criada e não há id, código nem link para listar. Ficou pronto o **SQL de clonagem** `docs/sql/demo-operacoes-virgens-2026-11-12.sql`: copia a OP-d755 três vezes (cotação, operação, condições de pagamento e reboques), liga `eh_teste` e `modo_demonstracao`, deixa sem vale, CIOT, documentos fiscais e NF-e, e termina com a consulta que lista `id`, código (`OP-` + 4 primeiras letras do id) e link `/fiscal?op=<id>`. **Termina em `rollback` de propósito** e **não foi testado** (esquema real não conferido). Só lê a d755; não altera nenhuma operação existente.

## Fase 4: Repom. **Mergeada** (PR #70); **funções não publicadas**

- 4.1 Estado do repo: o PR #58 (roteirização, cache, adapter VPO e esqueleto do Frete) já estava na main. Existiam `repom-pedagio-rota`, `repom-status`, `repomClient`, `repomPedagio`, `repomVpoClient` (token e consulta de TAG; emitir/cancelar **não implementados**, sem manual em `docs/`), `repomFrete.ts` (esqueleto, **NÃO IMPLEMENTADO**, sem segredo) e `repom_segredo` (grants só `service_role`). Faltavam a trava de custo, o limite diário e o diagnóstico completo.
- 4.2 Feito: `REPOM_ROTEIRIZACAO_LIBERADA` (só `sim` libera; senão **503 "Roteirização Repom desligada"** sem chamar a Repom e sem quebrar a cotação); limite diário global (`REPOM_LIMITE_DIARIO`, padrão 100) contado em `repom_requisicoes` só para consultas que foram à Repom, **429** acima; cache de 30 dias (mesma rota e eixos) sem chamar a Repom e sem contar no limite. O nome antigo `REPOM_ROTEIRIZACAO_HABILITADO` saiu das duas funções.
- 4.3 `repom-status` agora informa ambiente, trava, limite diário, uso de hoje e credenciais; com `{"verificar_token": true}` faz **uma** chamada de token (não consulta rota nem pedágio). **Não publicado e não executado:** deploy e Vault dependem de acesso que foi negado. **Resultado do `repom-status`: não rodado.**
- 4.4 Front: botão só com a flag ligada **e** trava liberada (lê `repom-status`); mostra valor, rodovias, data e "origem: Repom"; campo manual igual. Grava `pedagio_origem` (manual/repom) e `pedagio_consultado_em` **somente com a flag do Repom ligada**, para não quebrar o salvamento de cotações enquanto a migração não for aplicada. Aditivo.
- 4.5 Adapter e Frete: já existiam; nada ligado, NSPEDAGIO não foi trocado.
- 4.6 Testes com mock (`repomTrava.test.ts`, 10): trava desligada, 429, cache fora do limite, cache vencido, 5xx cai no manual, agenciador sem leitura das tabelas, sem segredo em resposta, token único. Bateria 359/359.
- **Versões publicadas (Repom): nenhuma.** Migração `20261112-1200-repom-trava-custo.sql` (cria só o registro `REPOM_ROTEIRIZACAO_LIBERADA=nao`, as 2 colunas da cotação e um índice) **não aplicada**.

## Fase 5: reemissão de CT-e e MDF-e. **PR aberto** (#74, sem merge, sem publicar, sem Focus)

- Ref versionada (`_shared/refDocumento.ts`): v1 mantém `rbr-cte-<op>`/`rbr-mdfe-<op>`; reemissão depois de cancelar (e, no MDF-e, de encerrar) usa `-v2`, `-v3`; tentativa após erro ou pendente mantém a ref gravada. `emitir-cte` e `emitir-mdfe` usam o helper; payload e regras fiscais intactos. 6 testes com mock. Bateria 365/365.
- Migração aditiva/idempotente `20261112-1300-documentacao-versoes.sql` (não aplicada) + rollback. **Desvio:** já existe `documentacao_operacao_versoes` (lote A06) com gatilho que arquiva a versão anterior; a migração só garante a tabela, acrescenta colunas (protocolo, motivo, emitido_por, datas), liga e **força** o RLS, e impede versão repetida. O `UNIQUE (operacao_id, tipo)` foi **mantido** (índice parcial quebraria os upserts de cte, mdfe, nfse e averbação); a linha atual segue apontando para a versão ativa e o histórico fica na tabela de versões.
- **5.3 Outros defeitos (lidos no código, não testados):**
  1. Erros dos `upsert` em `documentacao_operacao` não são verificados: se a Focus aceitar e o banco falhar, a tela não sabe.
  2. Um novo clique com o documento já autorizado e com bloqueio novo regrava `status: bloqueado` por cima do autorizado.
  3. Sem trava de duplo clique antes da Focus (a ref repetida protege a Focus, mas o `upsert` sobrescreve `pendente`).
  4. A chamada à Focus não tem timeout próprio (fica até o limite da função).
  5. `codigoIbge` carrega todos os municípios da UF a cada consulta (várias idas ao banco por emissão).
  6. CORS `*` nas duas funções de emissão fiscal.
  7. `req.json()` malformado vira erro 500 genérico em vez de 400.
  8. Emitir CT-e/MDF-e com status já `emitido` não é recusado na entrada (depende da Focus recusar a ref).

## Fase 6: auditoria de segurança. **Pronta** (somente leitura)

`docs/RELATORIO-SEGURANCA-AUDITORIA-2026-11-12.md`. Altas: pagamentos sem limite, dupla aprovação, bloqueio pós-troca de Pix e alerta de login; sem cabeçalhos de segurança no `vercel.json`; `jspdf` (crítica) e `dompurify` (alta). Médias: CORS `*`, funções caras sem limite, chave Gemini na URL, `SECURITY DEFINER` sem `search_path` (confirmar no banco), sem Dependabot. Limitação: banco vivo não inspecionado (consultas prontas no fim do relatório).

## Resumo final

| Fase | Status | Link |
|---|---|---|
| 1 | pronta e mergeada | #66 |
| 2 | PR aberto (atualizado por merge) | #65 |
| 3 | travada: SQL pronto, não executado | `docs/sql/demo-operacoes-virgens-2026-11-12.sql` |
| 4 | mergeada; funções **não** publicadas | #70 |
| 5 | PR aberto | #74 |
| 6 | pronta | relatório de segurança |

Versões Repom publicadas: nenhuma. SQL pendente de aplicar: `20261112-1100-fornecedores-fiscais.sql` (#65), `20261112-1200-repom-trava-custo.sql` (#70), `20261112-1300-documentacao-versoes.sql` (#74) e o SQL da Fase 3.

## O que o Pedro faz depois de sexta (13/11), em ordem

1. **Fase 3:** rodar `docs/sql/demo-operacoes-virgens-2026-11-12.sql` no SQL Editor (termina em rollback; conferir e trocar por `commit`). Rollback depois: apagar as 3 operações novas pelo id. Se der erro de coluna única, me enviar a mensagem.
2. **Repom:** aplicar `20261112-1200-repom-trava-custo.sql` (rollback: `supabase/rollback/rollback-20261112-1200-repom-trava-custo.sql`); publicar `repom-pedagio-rota` e `repom-status` com `verify_jwt` verdadeiro; rodar `repom-status` com `{"verificar_token": true}` uma vez e conferir ambiente, trava `liberada: false`, limite 100 e token obtido. Só então, se quiser, mudar `REPOM_ROTEIRIZACAO_LIBERADA` para `sim` e ligar `VITE_REPOM_ROTEIRIZACAO_HABILITADO`. Rollback: deixar o segredo em `nao` e a flag desligada.
3. **Fornecedor (#65):** aplicar `20261112-1100-fornecedores-fiscais.sql` (rollback em `supabase/rollback/rollback-20261112-1100-fornecedores-fiscais.sql`), depois ligar `VITE_SELETOR_FORNECEDOR=true` num build de homologação e conferir com um usuário Fiscal (agora lê o catálogo). Mergear o #65 só depois da demo. Rollback: desligar a flag.
4. **Reemissão (#74):** aplicar `20261112-1300-documentacao-versoes.sql` (rollback no mesmo padrão), mergear e **publicar `emitir-cte` e `emitir-mdfe`**; testar primeiro uma reemissão em homologação (cancelar e emitir de novo). Rollback: republicar as versões anteriores das duas funções (a migração só acrescenta).
5. **Segurança:** pelo menos os 3 itens altos do relatório (cabeçalhos no `vercel.json`, atualizar `jspdf`, limites de pagamento); ligar Dependabot, secret scanning e push protection no GitHub; rodar as consultas do fim do relatório no banco.
6. Apagar o branch local `backup/65-rebase-local`.
