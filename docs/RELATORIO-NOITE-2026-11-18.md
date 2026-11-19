# Relatorio da noite fiscal — 18/11/2026
Branch: fix/fiscal-noite-2026-11-18. Cada secao = um item (A1..A8). Se a sessao cair, continue do primeiro item sem "CONCLUIDO".

## A1 — Sincronizar emitir-mdfe v30 — CONCLUIDO
- Baixei a v30 publicada (get_edge_function, so leitura) e comparei arquivo a arquivo: so index.ts (comentario v30) e mdfe.ts (contratantes) diferiam; _shared e condutorTitular ja identicos.
- mdfe.ts: contratantes = propTracao ? [{nome: emitente_razao_social, cnpj: cnpjEmitente}] : cliente ? [cliente] : [] (rejeicao 741).
- Teste novo em mdfe.test.ts (com proprietario PF: 1 contratante = emitente; sem: cliente). 47/47 passam.
- Nada publicado.

## A2 — Previa automatica no card do MDF-e — CONCLUIDO
- Ja existia: previa carregada ao abrir (carregarPreVoo). Faltava: link por item, contagem, "Conferir", dados reais em "Ver o que enviamos".
- gestor/src/lib/fiscalV3Modelo.ts: contarBloqueios, rotuloFaltam, destinoDoItem (CT-e/VPO/CIOT = visao da esteira; pagamento = /operacoes?op=&aba=financeiro; motorista; veiculo = /cadastros?aba=motoristas), linhasDoQueEnviamos(payload).
- fiscalV3Dados.ts: carregarPreVoo devolve {itens, payload}. FiscalV3Painel.tsx: "Corrigir em: <aba>" por item, botao "Conferir", botao Emitir mostra "(faltam N itens)", "Ver o que enviamos" lista contratante, proprietario, reboques com tara, CIOT 12 digitos e categoria do vale.
- Decisao: o campo "aba" de traduzirRejeicaoMdfe so existe para rejeicao pos-envio; para a previa o destino e derivado do campo/texto do item (funcao pura, testada).
- Testes: gestor/test/fiscalV3Modelo.test.ts (2 novos, 1 antigo atualizado para o novo texto).

## A3 — Categoria de combinacao veicular — CONCLUIDO
- _shared/combinacaoVeicular.ts: CATEGORIAS_VALIDAS, normalizarCategoria (padStart 2, so lista), rotuloCategoriaPorEixos. lancamentoManual.ts: validarLancamento bloqueia fora da lista; completarPadroes normaliza ("7"->"07"), sem Number/parseInt.
- CartaoFiscalManual.tsx: campo virou select (lista valida + "automatica pelos eixos"); rotulo mostra eixos reais ("6 eixos da combinacao -> 08"), eixos = cavalo + reboques de operacao_reboques.
- Testes em lancamentoManual.test.ts.

## A5 — CIOT manual sem exigir verificador — CONCLUIDO (codigo)
- etapaCiot e validarLancamento: verificador opcional (se vier, 4 digitos). "XXXX" ignorado (so digitos); 16 digitos separa 12+4. RPC confirmar_ciot_vpo_manual ja marca emitido sem verificador (nao exigiu mudanca de banco).
- verificadorReal() em lancamentoManual.ts e juntarCiot (_shared/ciotEfrete.ts) ignoram '0000' (marcador da OP-3771): encerramento (efrete-ciot-operacao) nao monta mais "ciot/0000". PENDENTE DE DEPLOY: efrete-ciot-operacao usa juntarCiot; so passa a valer quando a funcao for publicada (regra 5: nao publiquei).

## A4 — Leitura dos PDFs no lancamento manual — CONCLUIDO
- Confirmado no banco (so SELECT): o VPR da OP-3771 (documentacao_operacao.vpo) tinha 0 linhas em documento_extracoes. Causa: a leitura rodava dentro da acao de upload, qualquer falha virava um aviso generico e o status ja dizia "enviado e lido".
- CartaoFiscalManual.tsx: upload agora diz so "enviado"; a leitura roda depois (lerDocumento) com estado proprio (lendo / ok / erro). VPR -> vpr_vale_pedagio, contrato -> contrato_ciot_repom (gestor/src/lib/leituraManual.ts). So fica "lido" com extracao; erro mostra a mensagem e o codigo da funcao (ia_indisponivel etc.) + botao "Ler de novo".
- Preenche IDVPO, valor (valor_total), CIOT (12 + verificador se houver), frete e adiantamento nos campos, com selo "lido: confira"; editar o campo tira o selo; nada e gravado sem o clique (mantive o painel "Confirmar e gravar").
- Testes: gestor/test/leituraManual.test.ts. Nao consegui ver o log da edge function (query_logs exige SQL); a causa do 0 extracoes em producao pode ter sido a IA indisponivel (503) — agora a tela mostra isso.
