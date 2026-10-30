# Implantação do back: documento de execução

**Para o Claude Code.** Este é o único documento que você precisa. Leia inteiro, execute as etapas na ordem, **sem esperar o Pedro**, e vá escrevendo o relatório em `docs/RELATORIO-IMPLANTACAO.md`. O Pedro só quer ser chamado em algo realmente grave (seção 1). Se a sessão acabar, a próxima sessão lê este documento e o relatório e **continua do primeiro ID não concluído**: nada é refeito.

Contexto: RBR Cargo, repositório `rbr-motorista` (PC do Pedro: `C:\Users\Aline\rbr-motorista`), Supabase `kwscmegsfbtvlnyxougt`, Vercel time `rbr4` (projetos `rbr-gestor`, `rbr-motorista`, `rbr-agenciador`). Prazo duro: **23/11/2026**, quando o CIOT passa a ser exigido no MDF-e em produção (rejeição 684). Telas já aprovadas (quadros 1 a 56 do canvas "Gestor RBR"): não pedir nova aprovação.

## 1. Modo de execução: sem pausa, exceto grave

**Faça sozinho, sem perguntar:** implementar, testar, abrir PR, fazer commits, aplicar migrações aditivas (seção 3), publicar funções (seção 4), corrigir falhas pequenas, escolher o padrão nas decisões pendentes (seção 7) e seguir em frente. Não reperguntar nada que já esteja decidido neste documento.

**Pare e chame o Pedro (PAUSA GRAVE) apenas se:**
1. uma migração ou comando puder **apagar ou corromper dados de produção** fora do que está previsto aqui (DROP, TRUNCATE, DELETE ou UPDATE em massa);
2. um teste mostrar **exposição de dados** ou bloqueio indevido de acesso depois de uma mudança de RLS ou papel;
3. houver **segredo exposto** (chave, token, senha) em código, log ou commit;
4. algo for **emitir documento fiscal real ou mover dinheiro real** (isso só acontece no pacote de produção, com confirmação);
5. depois de publicar uma função, o teste de fumaça falhar e a **volta automática à versão anterior** também falhar;
6. o fluxo central de emissão (CT-e, MDF-e, CIOT) continuar quebrado depois de **3 tentativas** de correção diferentes.

Ao parar: escreva no relatório a seção "PAUSA GRAVE" (o que aconteceu, o que já foi feito, o que está seguro, o que você recomenda) e diga isso em uma mensagem curta no chat. **Qualquer outra coisa não é motivo de pausa**: anote no relatório, escolha o padrão e continue. Nunca repita a mesma ação com falha mais de 3 vezes. Não digite acentos no CMD.

## 2. Orçamento de deploys da Vercel (evitar o limite diário)

- Trabalhe em **uma branch só**: `feat/back-implantacao`. Faça quantos commits locais quiser; **não faça push a cada commit**.
- Cada push gera um deploy por projeto. Faça **no máximo 4 pushes no dia** (sugestão: depois das etapas 3, 5, 7 e no fim) e **no máximo 2 merges na main** (um no meio, um no fim). Antes de cada push, rode `npm run build` e os testes localmente: nunca teste empurrando.
- Se a mensagem de commit puder pular o deploy (`[skip ci]`), use nos commits de documentação. Confira se a Vercel respeita; senão, use o `ignoreCommand` (build só quando mudou `gestor/` ou `shared/` para o `rbr-gestor`; idem para os outros projetos).
- **Funções do Supabase não contam** para a Vercel: publique em lote ao fim de cada etapa (seção 4).
- Se aparecer erro de limite de deploys: **não tente de novo**. Siga construindo localmente, deixe os commits prontos, anote "push pendente (limite Vercel)" e **continue**. Isso não é pausa grave.
- Registre no relatório o número de pushes, de merges e de deploys da Vercel que ocorreram.

## 3. Banco de dados: como mudar sem risco

**Aditivas (aplicar sozinho):** criar tabela, criar coluna anulável, criar função, criar índice, inserir dados de configuração. Para cada uma, salve o SQL e o **rollback** em `docs/rollbacks/AAAAMMDD-HHMM-nome.sql`, aplique em transação, rode `get_advisors` (segurança e desempenho) e anote no relatório.

**Lote de comportamento (aplicar de uma vez, no fim, com backup):** tudo que muda o que já funciona: remover o UNIQUE de `documentacao_operacao` (A06), remover o gatilho que encerra o MDF-e ao marcar 'entregue' (B12), novas políticas RLS e papéis (A01, A02, A05), novos status (A04), trocar gatilhos de troca de veículo (C04), piso ANTT (C10). Regras: (1) backup conferido (etapa 0); (2) testes de papel com `set local role` e `request.jwt.claims` para cada papel, antes e depois; (3) aplicar de preferência na **janela 3h às 5h (Brasília)**, `revoke` primeiro nas migrações de segurança do PR #15; (4) rollback do lote pronto e testado em cópia; (5) se algum teste mostrar exposição de dados, é PAUSA GRAVE.

**Nunca:** `db reset`, apagar dados, mudar dados existentes sem estar previsto, usar `exception when others` que engole erro.

## 4. Funções do Supabase

Publicar em lote ao fim de cada etapa com `node scripts/deploy-functions.js <nomes>`. Depois de cada publicação: (1) teste de fumaça com payload de **homologação**; (2) olhar os logs (`query_logs`); (3) se falhar, **voltar sozinho** à versão anterior do commit anterior e anotar. Registrar no relatório: função, versão antes e depois, hora, resultado do teste. Homologação **nunca** libera MDF-e em produção. Itens do NSPEDÁGIO só testam em dia útil, 9h às 18h: se estiver fora, **pule, deixe na fila e volte depois**; não é pausa.

## 5. Testes e evidências

Cada ID só vira "feito" com teste: unitário (regras em `cte.ts` e `mdfe.ts`), SQL (políticas e gatilhos) ou simulação em homologação. Guarde a evidência (nome do teste, resultado, trecho de log) no relatório. Rode `npm run build` antes de cada push. A bateria do item H01 e o simulador do G06 são a prova final.

## 6. Relatório de implantação

Arquivo `docs/RELATORIO-IMPLANTACAO.md`, **atualizado ao fim de cada etapa** e fechado na etapa final. Seções, nesta ordem:
1. **Resumo** (cinco linhas): quantos IDs feitos, parciais, bloqueados, pendentes; o que depende do Pedro; estado do prazo de 23/11.
2. **Tabela por ID**: ID, status (feito, parcial, bloqueado, pendente), PR ou commit, teste e evidência.
3. **Migrações**: nome, hora, aditiva ou lote, caminho do rollback, resultado dos advisors.
4. **Funções publicadas**: função, versão antes e depois, hora, teste de fumaça.
5. **Vercel**: pushes, merges, deploys, erros de limite, pushes pendentes.
6. **Decisões tomadas pelo padrão** (seção 7) e **extras** encontrados fora da lista.
7. **Incidentes** e voltas automáticas.
8. **PAUSA GRAVE** (só se houve).
9. **Pacote de produção** (seção 8).
10. **Próximos passos**.
Ao terminar, mostre no chat o resumo e o pacote de produção, em português simples, com no máximo 15 linhas.

## 7. Decisões pendentes: use o padrão e siga

| Item | Padrão a usar agora |
|---|---|
| C08 limite da apólice | Amarelo a partir de 80% (avisa o gestor, operação segue). Acima de 100%: trava a emissão até o gestor liberar COM a comunicação à seguradora anexada. Limite lido do cadastro das apólices, nunca fixo. |
| F04 busca com IA | Mostrar ao operador só a contagem 'N resultados ocultos pela sua função', sem o conteúdo. |
| F06 metas | Criar a estrutura configurável por função e pessoa. Metas de vendas ativas conforme o cadastro do gestor. Metas da Operação e do Fiscal: criar desligadas, com os indicadores de exemplo cadastrados, para o gestor ligar e definir os valores. |
| F03 e-mail após 4 h parado | Implementar desligado por configuração. Sobe ao gestor após 2 h, como decidido. |
| Níveis da Operação | Não construir (janeiro). Hoje o gestor faz tudo. |
| Multi-CT-e (vários destinatários no mesmo caminhão) | Não construir; aviso amarelo no pré-voo. |

## 8. Pacote de produção (fica para o fim, uma confirmação só)

Tudo que mexe com documento fiscal real, dinheiro ou segurança de produção **não roda sozinho**. Ao terminar as etapas, deixe tudo preparado e liste no relatório, em ordem, o que o Pedro precisa confirmar numa única mensagem:
1. Credenciais de produção da efrete e do NSPEDÁGIO, saldo do VPO (Pix pré-pago), IP fixo se exigido (H04).
2. Trocar o CIOT de homologação para produção; ligar as flags de produção; remover `NSPEDAGIO_TESTE_CHAMADA_INTERNA`; travar `COMPRA_LIBERADA` (H04).
3. Lote de comportamento do banco, se ainda estiver 'aguardando janela' (seção 3).
4. Migrações de segurança do PR #15 (H03).
5. Piloto: 1 operação real de valor baixo, depois da bateria de homologação (H02).
6. Perguntas externas ainda sem resposta (NSTech, NSPEDÁGIO, Averba, Focus, Alan, corretora) e quais itens elas travam.

## 9. Etapas e itens

Legenda das marcas: `[P]` decisão pendente do Pedro, use o padrão da seção 7 e siga; `[M]` migração, siga a seção 3; `[$]` dinheiro ou produção: implemente e teste só em homologação, a produção vai no pacote (seção 8); `[X]` depende de resposta externa: implemente o que der, marque o resto como bloqueado e siga. Fontes: CV=comercial-vendedor-decisoes-finais; OJ=operacao-jornada-decisoes-e-telas; FC=fiscal-completo; MF=matriz-fiscal-cenarios-correcoes-robos (seções e itens 5.x); DF=decisoes-fiscal-emissao-e-finalizacao; PA=piso-antt-tabela-b-e-telas-operacao-fiscal; CL=ciot-vpo-regra-e-lacunas; PS=plano-proxima-sessao; RA=regras-autonomia-code-e-claude; MON=monitoramento-localizacao-frota; CH=decisões do Pedro no chat de 30/10; backlog=backlog-redesenho-gestor-2026-10 (todos documentos do projeto RBR Cargo; se não conseguir lê-los, siga o texto do item).

### Etapa 0 · Preparação (sem mudar produção)
1. Ler este documento inteiro, `docs/CHECKLIST-BACK.md` (criar se não existir, com uma linha por ID desta lista) e `docs/RELATORIO-IMPLANTACAO.md` (criar se não existir; se já existir, **retomar do primeiro ID que não está feito**).
2. Mapear o que já existe no código e no banco para cada ID (já existe / parcial / falta) e gravar no checklist. Não duplicar.
3. Criar o script `scripts/deploy-functions.js` que copia `supabase-functions/` para uma pasta temporária no formato que o CLI espera (`supabase/functions/`), publica as funções pedidas e apaga a cópia (resolve o item H05; nada de cópia solta no repositório).
4. Conferir o orçamento de deploys da Vercel (seção 2) e configurar o build ignorado para os projetos que não mudaram (`rbr-motorista`, `rbr-agenciador`), se ainda não estiver.
5. Registrar no relatório qual backup existe das tabelas fiscais (PITR do plano ou dump). Sem backup possível, o lote de comportamento (seção 3) fica para o pacote final.

### Etapa 1 · Frente A: Fundação: papéis, trilha, estados e versões
- **A01** Papéis por login `[M]`: Criar os papéis comercial, operacao, fiscal, financeiro e gestor (hoje só gestor_rbr existe na prática). Permissão no servidor (RLS e edge functions) com log de auditoria. _(fontes: CV, MF5.5)_
- **A02** Segregação de funções: Quem gerou a operação e quem alocou o motorista não emitem o fiscal dela; o gestor é exceção. Checar em emitir-cte, emitir-mdfe, eventos-fiscais, cancelar-documento-fiscal e nas políticas RLS. _(fontes: OJ, MF5.5)_
- **A03** Ator em tudo `[M]`: Guardar emitido_por, origem (app, operação ou gestor), hora real do fato e hora do registro em cada documento, evento e mudança de status. _(fontes: MF5.5, DF)_
- **A04** Status novos da operação `[M]`: aguardando_assumir, alocando_motorista, aguardando_aceite_motorista, aguardando_liberacao_fiscal, em_emissao, devolvida_pelo_fiscal, pausada_por_alteracao, aguardando_liberacao_gestor, ordem_liberada, em_viagem, finalizando, finalizada, cancelada. Nenhuma mudança de status fora das funções. _(fontes: OJ, FC)_
- **A05** Operação avança em nome do motorista `[M]`: Papel Operação pode avançar liberada_coleta, carregando, em_transito e entregue em nome do motorista, registrando que foi em nome dele (ator + origem). _(fontes: DF)_
- **A06** Reemissão com versões `[M,X]`: Ref versionada (rbr-mdfe-<op>-v2) e tabela documentacao_operacao_versoes (chave, protocolo, motivo); a linha atual aponta a versão ativa; tirar o UNIQUE(operacao_id,tipo) que apaga histórico. Confirmar com a Focus se a ref pode ser reutilizada. _(fontes: MF5.1)_
- **A07** Carteira individual de clientes `[M]`: Cada vendedor vê só os seus clientes; transferência só pelo gestor, com motivo registrado. _(fontes: CV)_
- **A08** Campos novos em operacoes `[M]`: Cavalo e reboques separados; motorista separado de pessoa_alocada_id; contatos de coleta e de quem recebe (nome, e-mail, WhatsApp); exigências da carga; aceite do motorista; protocolo da GR; versão da proposta e histórico de alterações com antes e depois; comprovante de entrega. Lote usa grupo_saida_id e sequencia (já existem). _(fontes: OJ)_
- **A09** Trilha de auditoria geral `[M]`: Quem, quando e motivo para: liberação do gestor, cancelamentos, transferências de carteira, trocas, buscas da IA. _(fontes: CH)_
- **A10** Limpar Repom: Corrigir textos e a origem 'rbr_repom' desatualizados. _(fontes: MF5.10)_

### Etapa 2 · Frente B: CIOT, VPO e MDF-e (prazo duro 23/11)
- **B01** Testar token do NSPEDÁGIO `[X]`: Testar do PC do Pedro e depois pelo proxy da Vercel (a nuvem do Supabase foi bloqueada). Ambiente de homologação: seg a sex, 9h às 18h. _(fontes: CL1)_
- **B02** Função nspedagio_segredo `[M]`: Leitura das credenciais NSPEDAGIO_* no Vault (a efrete_segredo só lê EFRETE_*). _(fontes: CL2)_
- **B03** Número numérico da operação e vpo_requisicoes `[M]`: ID da operação numérico (Long) e único para o NSPEDÁGIO; tabela vpo_requisicoes. _(fontes: CL3)_
- **B04** Cliente e funções do NSPEDÁGIO `[X]`: nspedagioClient e funções: simular, comprar (assíncrona, idempotente, consultar antes de recomprar), cancelar (com resultado explícito), recibo, trocar placa, consultar TAG e status. Gravar idVpoAntt em operacao_ciot_vpo (origem api). _(fontes: CL4, MF5.11)_
- **B05** Cartão do VPO na aba Fiscal: Cartão do VPO e Registro de passos (evidência para a NSTech). _(fontes: CL5)_
- **B06** Proxy da Vercel para o NSPEDÁGIO `[X]`: Liberar o host apigateway.digitalcomm.com.br:8443 (depende do limite de deploys da Vercel). _(fontes: CL6)_
- **B07** Pedágio estimado na cotação: A simulação do NSPEDÁGIO alimenta o pedágio da cotação (hoje manual). _(fontes: PS)_
- **B08** CIOT: encerrar e registrar desembarque `[X]`: EncerrarOperacaoTransporte (POST /Services/Pef/EncerrarOperacaoTransporte; CodigoIdentificacaoOperacao, PesoCarga opcional, Integrador, Versao 2; retorna Sucesso, Protocolo, Excecao). RegistrarQuantidadeDaMercadoriaNoDesembarque por nota: confirmar com a NSTech se vem antes. Conferir o Pix liberado de fato. Tratar acentos. _(fontes: CL7, FC)_
- **B09** Ligar CIOT e VPO ao emitir-mdfe: infCIOT no MDF-e e nCompra = idVpoAntt. Exigir ciot_status=emitido e VPO ativo, ambiente compatível. Homologação nunca libera MDF-e em produção. _(fontes: MF5.2, CL9)_
- **B10** CIOT com várias NF-e: Lista NotasFiscais 1 a N (Numero, Serie, CnpjEmissor, ValorTotal, NCM, unidade, quantidade, TipoDeCalculo, valor por unidade); PesoCarga total; DocumentoViagem = número do CT-e. Testar na homologação: 2 notas, encerramento com peso total, com e sem registrar desembarque. _(fontes: FC)_
- **B11** Finalizar viagem: um botão `[$]`: Encerra o MDF-e (município, UF e hora reais) e o CIOT. Se um falhar, mostra qual e tenta de novo só o que faltou; fica 'finalizando' e avisa o fiscal. Saldo ao Financeiro só depois; nada é pago antes. _(fontes: FC, DF)_
- **B12** Remover o encerramento automático `[M]`: Tirar o gatilho que encerra o MDF-e quando o status vira 'entregue' (e que engole erros com exception when others). O encerramento passa à finalização pela Operação. _(fontes: MF5.3, DF)_
- **B13** Pré-voo único e esteira: Pré-voo: piso ANTT, NF-e, CEP, NCM, motorista TAC, pedágio/VPO, averbação, soma de peso e valor, limite do veículo e valor segurado. Esteira: CT-e, averbação, VPO, CIOT, MDF-e, RC-V, saída, com etapas 'não se aplica' e motivo (sem pedágio: sem VPO; frota própria: sem CIOT), estado e retomada por etapa, um botão por etapa. _(fontes: PA, FC)_
- **B14** Janela de emissão: Emitir até a véspera da coleta; emissão ANTES da chegada do caminhão (decisão atual). _(fontes: FC, DF)_
- **B15** Cancelar a operação inteira `[$]`: Só o gestor; motivo e observação obrigatórios; ordem inversa MDF-e, CIOT, VPO, averbação, CT-e, um passo por vez; só segue se o anterior deu certo; ao travar, para e mostra o que já foi desfeito; confere prazo de cada etapa; gera aviso à seguradora (cláusulas 23 e 24); estorna o financeiro; avisa o motorista e libera o caminhão; fica na trilha. Tela: quadro 56. _(fontes: FC, CH)_
- **B16** Cancelar MDF-e com conferência: Conferir as 24 h e se a viagem começou antes de cancelar; se não der, oferecer encerrar e reemitir (hoje a SEFAZ responde 220 e o erro é genérico). _(fontes: MF5.6)_
- **B17** Tabela única de prazos: Um só lugar no código com: CT-e cancelar até 7 dias e sem MDF-e ativo, substituição até 60 dias; MDF-e cancelar até 24 h e viagem não iniciada, encerrar até 30 dias; CIOT cancelar até 24 h antes do início, encerrar até 5 dias após o fim previsto (TAC-Agregado 30 dias), operação até 90 dias; VPO validade até 15 dias; CIOT exigido no MDF-e em 23/11/2026 (rejeição 684). _(fontes: MF2, FC)_
- **B18** Idempotência geral: Timeout: nunca reenviar sem consultar (Focus por ref, efrete por ref, NSPEDÁGIO por idDocumentoTransporte). Documento pendente há mais de 10 min: consultar sozinho. _(fontes: MF F)_

### Etapa 3 · Frente C: Fiscal: regras, trocas, correções e limite da apólice
- **C01** Averbação automática e confiável `[X]`: Averbação do CT-e (RCTR-C) e do RC-V automáticas após o documento, com 'tentar de novo', alarme na falha (o gatilho hoje engole), prazo e cancelamento da averbação (confirmar com NSTech/Averba se o cancelamento do documento propaga). _(fontes: MF5.4)_
- **C02** Troca de motorista `[X]`: M0: livre, nova GR e novo aceite. M1/M2: CT-e permanece; nova GR; CIOT de lotação não retifica (cancelar se faltar mais de 24 h e reemitir; senão encerrar e emitir outro); MDF-e cancelar e reemitir (RC-V reaverba) ou Inclusão de Condutor. M3 (em viagem): nova GR do novo condutor ANTES de ele assumir, Inclusão de Condutor, aviso imediato à seguradora, histórico de quem autorizou; só o gestor autoriza. _(fontes: MF C, FC)_
- **C03** Inclusão de condutor completa: Exigir GR aprovada do novo condutor; atualizar o motorista atual na operação e o CIOT; avisar a seguradora (hoje só valida nome e CPF). _(fontes: MF5.7)_
- **C04** Troca de veículo `[X]`: M0 livre. M1/M2: VPO troca de placa (mesmo número de eixos) ou cancela e recompra; CIOT nova operação; MDF-e cancela e reemite; RC-V reaverba; nova GR. M3 (quebra, transbordo): encerrar o MDF-e original, emitir novo para o novo veículo, reaverbar ANTES de sair, nova GR, novo CIOT. Trocar só a carreta (operacao_reboques) dispara refazer MDF-e, CIOT e RC-V. Eixos diferentes recalculam piso e VPO e são alteração nível A. _(fontes: MF D, FC)_
- **C05** Correções de documentos `[X]`: Carta de correção do CT-e (até 20; não corrige valores, partes nem datas); CT-e de substituição e complementar; inclusão de DF-e (incluir_dfe_mdfe); liberação de prazo (extemporâneo) como fluxo guiado. _(fontes: MF5.9)_
- **C06** Mesma NF-e em duas operações `[X]`: Bloquear a mesma chave de NF-e em duas operações ativas (confirmar com o Alan a prática de remessa parcial). _(fontes: FC)_
- **C07** Várias NF-e na mesma operação: Permitido (caso Mills): 1 CT-e, 1 MDF-e, 1 CIOT com N notas; o pré-voo soma peso e valor e confere limite do veículo e valor segurado. _(fontes: FC, CH)_
- **C08** Limite da apólice `[P]`: Limite lido do cadastro das apólices (RCTR-C, teto por embarque; nunca fixo no código). A soma inclui outros veículos do mesmo cliente que saem juntos (comboio: mesmo destino ou menos de 15 min na via). Amarelo a partir de 80%: avisa o gestor, a operação segue. Acima de 100%: trava a emissão até o gestor liberar COM a comunicação à seguradora anexada (RC-DC: aviso com 3 dias úteis e aceite formal; sem aceite não averbar). Aviso na central com 'Revisar valor segurado'; liberação na trilha. _(fontes: FC, CH)_
- **C09** Uma operação, um caminhão, uma carga: Padrão: 1 CT-e, 1 MDF-e, 1 CIOT, 1 RC-V e 1 GR por operação. Vários destinatários no mesmo caminhão (multi-CT-e) ADIADO, com aviso amarelo no pré-voo. Dois veículos = duas operações. Lote por grupo_saida_id. _(fontes: FC)_
- **C10** Piso ANTT atualizado `[M]`: Atualizar piso_antt_coeficientes (272 combinações) da Resolução 6.084 para a Portaria SUROC 22/2026 (vigente desde 30/09/2026; diesel R$ 7,33). Prever atualização a cada nova portaria. Tabela B com 2 ou 3 eixos: avisar 'essa combinação não existe; use a Tabela A ou revise os eixos', sem erro. Valores de conferência (carga geral): Tabela A 3 eixos CCD 5,2177 e CC 541,86; Tabela B 4 eixos 5,3538 e 533,40; 5 eixos 6,0900 e 594,62; 6 eixos 6,7863 e 608,99; 7 eixos 7,2181 e 720,31; 9 eixos 8,0379 e 773,22. _(fontes: PA, MF5.13)_
- **C11** GR a cada troca: Toda troca de motorista, veículo ou carreta exige nova GR antes do novo assumir (RC-DC 20.4.1). _(fontes: MF3, backlog)_
- **C12** Rejeição e contingência: Rejeição SEFAZ: registrar o código, permitir corrigir e reemitir com NOVA ref. Contingência do MDF-e: transmite em até 168 h; CIOT continua obrigatório. _(fontes: MF F)_
- **C13** Vários municípios e UFs no MDF-e `[X]`: MDF-e aceita vários municípios de descarga (municipios_descarregamento[].conhecimentos_transporte[].chave_cte). Validar com a Focus: um MDF-e por UF de descarga, rejeição 611 (MDF-e aberto para mesma placa, emitente e UF de descarga), ordem das UFs de percurso, rota longa (8 dias ou mais). _(fontes: FC)_

### Etapa 4 · Frente D: Operação: fila, completar, liberar, finalizar
- **D01** Fila por urgência: Fila ordenada pela coleta mais próxima; coleta em menos de 24 h é 'urgente'; espera amarela com 2 h e vermelha com 4 h, avisando o gestor. _(fontes: OJ, CH)_
- **D02** Assumir a operação: Assumir trava a operação no nome de quem assumiu; mostra quem gerou (Comercial) e há quanto tempo espera. O gestor pode seguir direto. _(fontes: PA, CV)_
- **D03** Completar e enviar ao fiscal: Escolher motorista e veículo (sistema sugere pelo matching: veículo compatível, disponibilidade, localização; gestor ou operação confirma), aceite do motorista, GR. Checklist de 11 itens: motorista e veículo; aceite do motorista; GR; exigências atendidas; peso dentro da capacidade; mercadoria dentro do seguro (R$ 1 milhão); NF-e; datas e contatos (inclui e-mail de quem recebe); piso ANTT com o veículo alocado; data de nascimento da CNH; pagamento do motorista (Pix). 'Pronta para o fiscal' só abre com tudo. Depois de enviada, a operação trava para edição. _(fontes: OJ, PA)_
- **D04** Alterações níveis A a D: A (valor, rota, tipo de veículo ou eixos, peso acima do cotado, prazo de pagamento): pausa, gestor aprova versão 2, cliente aceita de novo, valor fechado. B (data, motorista ou veículo do mesmo tipo, endereço na mesma cidade): livre, gestor informado com antes e depois. C (contato, recado): só registro. D (depois que o fiscal começou): fiscal desfaz na ordem inversa, gestor avisado. _(fontes: OJ, FC)_
- **D05** Devolvida pelo fiscal: Fiscal devolve com motivo e detalhe obrigatórios; só o item errado reabre; histórico. O aviso vai a quem errou. _(fontes: PA, CH)_
- **D06** Gestor libera a ordem de coleta: Quando o fiscal conclui tudo, a operação aparece no painel do gestor, que libera a ordem ao motorista (sem e-mails). _(fontes: OJ)_
- **D07** Liberar o caminhão: A Operação libera depois de carregado: exige ordem liberada, motorista na coleta, carga carregada e conferida, documentos a bordo. Vira em_viagem, registra saída em nome do motorista e dispara os e-mails ao embarcador e a quem recebe (sem valores) com o link para acompanhar a viagem. _(fontes: OJ, DF)_
- **D08** Registrar a entrega: A Operação registra a entrega no lugar do motorista com comprovante anexado, data e hora reais, município e UF; guarda origem (painel ou app). _(fontes: DF)_
- **D09** Finalizar a operação: Usa o botão único de B11; depois do app do motorista, o app registra a entrega, a Operação confere e finaliza. _(fontes: DF, FC)_
- **D10** Ocorrência em rota: Tipos: atraso, avaria, quebra, acidente, recusa, roubo. Abre a ocorrência, avisa o gestor e quem cotou (para falar com o cliente) e leva ao fluxo certo (quebra aciona troca de veículo; roubo e acidente avisam seguradora e GR). Tela: quadro 49. _(fontes: CH)_
- **D11** Lote de viagens: Várias viagens do mesmo cliente em lote por grupo_saida_id e sequencia, uma operação por CT-e. Tela: quadro 40. _(fontes: OJ)_
- **D12** Alertas de prazo da viagem: Passou da entrega prevista sem finalização; CIOT perto de 5 dias do fim previsto; MDF-e perto de 30 dias. _(fontes: DF)_
- **D13** Operação vê o valor ao cliente: Decisão do Pedro: a Operação pode ver o valor ao cliente. _(fontes: OJ)_

### Etapa 5 · Frente F: Avisos, busca com IA, metas e Início por função
- **F01** Sino e central de avisos: Sino no canto superior direito; Central com abas Pendentes e Resolvidas (quem e quando); tipos ALTERAÇÃO, FISCAL, EM ROTA, PRAZO, LIBERAR, CIOT, SEGURO. Telas: quadros 47 e 48. _(fontes: CH)_
- **F02** Todo aviso tem botão que resolve: Cada pendência tem um botão que leva direto ao campo exato onde se resolve. Vale para todo o TMS. _(fontes: CH)_
- **F03** Aviso vai a quem errou `[P]`: Pela trilha: quem mexeu por último no dado; sem dono claro, quem é dono da etapa (ex.: Fiscal para seguradora fora do ar). Fiscal e gestor só acompanham ('aguardando Bruno'). Parado 2 h sobe ao gestor com o nome; mais de 4 h por e-mail (proposta). Botão Cobrar manda lembrete. Tabela causa x responsável x botão no quadro 51. _(fontes: CH)_
- **F04** Busca com IA `[P]`: Barra no topo de todos os painéis. A IA só lê o que a função permite (mesma RLS do banco), não executa ação sem confirmação na tela de destino, e cada busca é auditada. Operação vê 'N resultados ocultos pela sua função' (decisão pendente do Pedro: mostrar ou esconder a existência). Quadro 50. _(fontes: CH)_
- **F05** Início por função com mapa: Gestor, Operação, Fiscal e vendedor, cada um com o seu (quadros 52 a 55). Mapa com a última posição conhecida e 'há X min' (GPS do celular só com app aberto e ONLINE; Wialon pendente; carga perigosa exige rastreador certificado). Coluna Hoje, 'Agora' ou 'Precisa de você', viagens em andamento, botão 'Resumo do dia com IA' (gestor), filtrado pela função. _(fontes: CH, MON)_
- **F06** Metas `[M,P]`: Tabela de metas por função e por pessoa, definida pelo gestor. Vendas: faturamento, cargas fechadas, taxa de aprovação, projeção no ritmo atual e dias úteis que faltam. Operação e Fiscal: metas A DEFINIR (exemplos: operações no prazo, resposta na fila, sem devolução do fiscal; emitido sem rejeição, tempo da fila à emissão). Ranking completo só para o gestor. _(fontes: CH)_
- **F07** 'O que fazer agora' por módulo: Painel no topo de cada módulo (Cotações, Fiscal, Operações, Financeiro, Cadastros, Risco), acima das abas: o que está errado, por que importa, com quem falar, botões diretos; sem pendência mostra 'Tudo em dia'. O Início não repete. _(fontes: backlog)_
- **F08** Confirmação visível e janela de edição: Componente único de ✓/✗ com texto do que aconteceu e botão 'enviando…'; janela de edição sobre fundo cinza em tudo que abre para editar ou criar. _(fontes: backlog)_
- **F09** Banner de homologação: Faixa 'Homologação: nenhum documento real' enquanto o ambiente não for produção. _(fontes: CH)_

### Etapa 6 · Frente E: Comercial: cotação, envio, aceite
- **E01** Funil e cotação (verificar o que existe): Pedido, funil, cotação, versões, envio, aceite, checklist, gerar operação. Conferir antes o que já está no código e no banco; construir só o que falta. _(fontes: CV)_
- **E02** Margem e níveis do vendedor `[M]`: Faixas: vermelho abaixo de 29%, amarelo 29% a 32%, verde acima de 32%; piso fixo de 26% (abaixo só o gestor libera). Vendedor vê só a cor e a palavra (No limite, Médio, Bom). Níveis Novo, Intermediário, Sênior; gestor ajusta; sistema sugere afrouxar após 15 cotações aprovadas sem ajuste. Vermelho: observação obrigatória, Enviar ao gestor, chat dentro do pedido. _(fontes: CV)_
- **E03** Envio por e-mail e WhatsApp `[X]`: E-mail é o canal padrão, saindo da caixa de cada funcionário (credenciais no Vault; testar SMTP 465 pela edge function; plano B: remetente transacional no domínio rbrcargo.com.br com Reply-To). WhatsApp é o segundo e só abre a conversa com o link; quando vai por WhatsApp o e-mail também sai. _(fontes: CV)_
- **E04** Link público de aceite `[M]`: rbrcargo.com.br/p/<código>: rota, valor e condições (nunca custo ou margem). Só o botão Aceitar, sem ajuste nem recusa. Expira na validade; o vendedor marca a perda. Rota única /p/[código]; cada proposta é uma linha no banco e um PDF no Storage. _(fontes: CV)_
- **E05** Aceite com registro `[M]`: Registra nome, cargo, data, hora e IP. O vendedor confirma com o cliente antes de gerar a operação. _(fontes: CV)_
- **E06** PDF da proposta: Layout atual com QR e link de aceite, bloco 'Por que contratar a RBR' e 'Carga segurada pela Allianz até R$ 1 milhão'; botão Baixar PDF; registra o toque e as aberturas ('aberta por N aparelhos'). _(fontes: CV, PA)_
- **E07** Prazos e valores da cotação: Sempre o que está na cotação; sem acréscimo fixo de 3% na tela de envio. _(fontes: PA)_
- **E08** Aviso de disponibilidade: 'X caminhões livres em tal região no dia tal', preenchido à mão por vendedor ou operação; se vazio, some. Nunca inventar urgência. _(fontes: CV)_
- **E09** Equipe e convites: Aba Equipe em Cadastros, convidar pessoa, definir função, cadastrar credenciais de e-mail. _(fontes: CV)_
- **E10** Quem recebe a carga: Contato unificado (nome, e-mail, WhatsApp) no checklist de gerar operação. _(fontes: OJ)_
- **E11** Relatório comercial e celular do vendedor: Telas já desenhadas (Relatório comercial; Celular do vendedor). _(fontes: CV)_
- **E12** Cotação vencida e pré-cotação: Aviso de cotação vencida há N dias (validade já é guardada); aviso fixo na pré-cotação: 'Esta é uma pré-cotação. Os valores podem ser alterados de acordo com a necessidade dos itens informados.' _(fontes: backlog)_

### Etapa 7 · Frente G: Robôs e Saúde fiscal
- **G01** Bateria de testes de regra no CI: Todas as combinações (TAC, ETC, frota própria; com e sem pedágio; 1 a 3 reboques; 1 ou vários CT-e; homologação, produção, teste) contra cte.ts e mdfe.ts a cada mudança; falha trava o deploy. _(fontes: MF6)_
- **G02** Sentinela de prontidão (15 min): Refaz o pré-voo das operações com coleta nas próximas 72 h e avisa o que mudou (CNH, RNTRC, apólice, certificado digital, vigência do VPO, início do CIOT). _(fontes: MF6)_
- **G03** Reconciliador (30 min e virada do dia): Compara o banco com a Focus, efrete, NSPEDÁGIO e Averba: banco diz emitido e a fonte diz cancelado; pendente há mais de 10 min; averbação pendente há mais de 30 min; CT-e sem averbação; MDF-e aberto depois da entrega; CIOT sem encerrar perto dos 5 dias; VPO comprado em operação cancelada. _(fontes: MF6)_
- **G04** Auditor de dinheiro: Valor do frete na cotação x CT-e x CIOT x pagamento do MDF-e x pagamentos_motorista x financeiro; VPO x pedágio da cotação; piso ANTT; pagamento em até 30 dias úteis. _(fontes: MF6)_
- **G05** Auditor de segregação e trilha: Toda emissão, cancelamento e troca tem ator; quem gerou ou alocou não emitiu; nenhuma mudança direta de status; relatório semanal ao gestor. _(fontes: MF6)_
- **G06** Simulador noturno `[X]`: Roda a matriz de cenários ponta a ponta em homologação (em dia útil, por causa do NSPEDÁGIO 9h às 18h) e gera o PDF de evidências (serve à homologação da NSTech). _(fontes: MF6)_
- **G07** Disjuntor: Achado grave (divergência de dinheiro, documento sem averbação, saldo baixo) bloqueia novas emissões e chama o gestor pelo sino e WhatsApp; só o gestor reabre. _(fontes: MF6)_
- **G08** Vigia regulatório: O radar existente ganha itens fiscais (NT do MDF-e, portarias SUROC, piso) com data de verificação; mudança abre pendência. _(fontes: MF6)_
- **G09** Tela Saúde fiscal: Verde, amarelo, vermelho e 'precisa de você'; log em eventos_fiscais_operacao; pg_cron + edge functions. Quadro 46. _(fontes: MF6, FC)_

### Etapa 8 · Frente H: Homologação, produção e segurança
- **H01** Bateria de homologação com evidência: Feliz (TAC e frota própria; com e sem pedágio); cancelar cada etapa em ordem inversa; cancelar fora do prazo (deve oferecer o caminho certo); reemissão após cancelamento (ref nova); carta de correção; troca de motorista em M0, M2 e M3; troca de veículo em M0, M2 e M3; timeout simulado; averbação com falha e nova tentativa; encerramento pela Operação com CIOT e MDF-e; várias NF-e; CIOT com 2 notas. _(fontes: MF8)_
- **H02** Piloto real `[P,$]`: 1 operação real de valor baixo, depois da bateria; só com confirmação do Pedro. _(fontes: MF8)_
- **H03** Migrações de segurança do PR #15 `[M,P]`: Só de madrugada (3h às 5h), revoke primeiro, depois da reunião com a NSTech; confirmação do Pedro. _(fontes: RA)_
- **H04** Produção: credenciais, saldo e flags `[P,$,X]`: Credenciais de produção da efrete e do NSPEDÁGIO, saldo do VPO (Pix pré-pago), IP fixo se exigido; trocar o CIOT de homologação para produção; remover NSPEDAGIO_TESTE_CHAMADA_INTERNA; travar COMPRA_LIBERADA; confirmação do Pedro. _(fontes: CL10, RA)_
- **H05** Deploy permanente das funções: O repo guarda em supabase-functions/ e o CLI procura em supabase/functions/: renomear a pasta ou criar script de deploy e apagar a cópia temporária. _(fontes: PS)_
- **H06** Limite de deploys da Vercel `[X]`: Resolver o limite (plano Pro) e publicar a branch feat/nspedagio-etapa1 (hoje local, sem push). _(fontes: CL, PS)_
- **H07** Operação de teste 965ceb0d `[M]`: Aprovar o semirreboque RRD5B39 (exceção de uma linha, com SQL de reversão) e conferir o piso (coeficiente tabela B 3 eixos). _(fontes: PS)_
- **H08** Confirmar texto da Allianz `[P]`: Conferir com a apólice o texto 'Carga segurada pela Allianz até R$ 1 milhão' (limites e exclusões) e se a Shogun está na lista da Allianz. _(fontes: CV, PA)_
- **H09** Reunião de homologação da NSTech `[X]`: Levar o resultado das provas, o PDF de evidências do simulador e as perguntas abertas (preço e saldo do NSPEDÁGIO, IP fixo, ordem VPO x CIOT, produção). _(fontes: CL, PS)_

### Etapa final · Lote de comportamento, pacote de produção e relatório
1. Aplicar o lote de comportamento (seção 3) quando os testes estiverem verdes e o relógio estiver na janela 3h às 5h (horário de Brasília). Fora da janela: deixar pronto e anotar 'aguardando janela'.
2. Montar o pacote de produção (seção 8).
3. Fechar o relatório (seção 6) e mostrar no chat o resumo final.

## 10. Adiado de propósito (não construir agora)
- **Níveis da Operação (Novo, Intermediário, Sênior)**: Janeiro. Hoje o gestor faz tudo.
- **Várias entregas com destinatários diferentes no mesmo caminhão (multi-CT-e)**: Adiado; aviso amarelo no pré-voo.
- **Emitir o MDF-e só depois da conferência no carregamento**: Fica para depois; hoje emite antes da chegada.
- **Central de integrações (só do Pedro) e painel do embarcador**: Depois de Operação e Fiscal; depois API e EDI.
- **Telas do Financeiro**: Ainda sem redesenho.
- **Contratação de pré-vendedores e transcrição de ligações do CRM**: Janeiro.
- **E-mail Hostinger**: Adiado.

## 11. Perguntas externas em andamento (o Pedro envia, em paralelo)
- **NSTech (Higor)**: Troca de motorista retifica o CIOT? Encerrar com viagem não realizada? Registrar desembarque antes de encerrar? Cancelar averbação propaga? Ordem VPO x CIOT. _(afeta C02, B08, C01)_
- **NSPEDÁGIO (Antonio)**: Por que o 1º cancelamento falhou; devolução de saldo; troca de placa com eixos diferentes; timeout acima de 100 s; preço, saldo, IP fixo, produção; limites do VPO em rota longa. _(afeta B04, H04)_
- **Averba/ATM**: Cancelar averbação de CT-e e de MDF-e; reaverbar RC-V com novo veículo. _(afeta C01)_
- **Focus**: Ref reutilizável após cancelamento; CT-e 4.00 leva veículo ou motorista; substituição e complementar via API; UF por MDF-e; ordem das UFs de percurso. _(afeta A06, C05, C13)_
- **Alan (contador)**: Cancelar CT-e fora dos 7 dias em SP; NF de anulação do tomador no Simples; mesma NF-e em dois veículos; MDF-e aberto. _(afeta C06, C05)_
- **Corretora (Yellow)**: Troca na viagem, transbordo, reaverbar; Shogun na lista da Allianz. _(afeta C02, C04, H08)_
