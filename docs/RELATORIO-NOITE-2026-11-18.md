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

## A6 — CIOT indo para "refazer_troca_veiculo" sem troca — CONCLUIDO (aplicado em producao)
- Causa (lida no banco): ciot_troca_veiculo (operacoes.veiculo_id) ja usa "is distinct from" e esta certo. O culpado era trg_fn_ciot_troca_carreta (operacao_reboques, AFTER INSERT/UPDATE/DELETE) que marcava refazer em QUALQUER evento. A auditoria mostra INSERT de carreta na OP-3771 (23:12 de 18/11) e na OP-0360 (17/11): era o vinculo da carreta (exigido pelo MDF-e) a um CIOT manual ja emitido. O editor de veiculo da tela nao mexe em operacao_reboques (so insert/delete pontuais em OperacaoFluxo.tsx).
- Nova regra (migracao so troca a funcao): UPDATE so marca se o veiculo_id mudou; INSERT do PRIMEIRO vinculo de carreta em CIOT manual (operacao_ciot_vpo.origem='manual') nao marca, so grava auditoria 'ciot_primeira_carreta_manual'; DELETE e demais INSERTs marcam como antes.
- Arquivos: supabase/migrations/20261118-2300-ciot-troca-carreta-so-quando-muda.sql; rollback em supabase/rollback/rollback-20261118-2300-ciot-troca-carreta-so-quando-muda.sql (corpo original).
- Aplicada via apply_migration; conferido: funcao nova ativa e sem EXECUTE para anon/authenticated.
- NAO testei com escrita em producao (um teste dentro de transacao com rollback na OP-3771 precisaria alterar linhas reais; a confirmacao expirou e preferi nao insistir). Teste sugerido para o Pedro/staging: com CIOT 'emitido' manual, (1) update operacao_reboques set veiculo_id=veiculo_id nao muda o status; (2) delete da carreta muda para refazer_troca_veiculo.
- Obs: a OP-3771 hoje pode continuar com ciot_status='refazer_troca_veiculo' do evento antigo; nao corrigi o dado (nao e em massa, mas e dado de producao fora do pedido). Decisao do Pedro.

## A7 — Cadastro de veiculo — CONCLUIDO (correcao em massa NAO feita)
- Causa de is_veiculo_proprio = true: o RPC confirmar_cadastro_por_documentos insere o veiculo (placa, renavam, titular_id) sem o campo e a coluna tinha DEFAULT true. Migracao 20261118-2310 (aplicada): DEFAULT false so para insercoes futuras; rollback em supabase/rollback. O formulario de Cadastros.tsx tambem nascia com true e tinha o rotulo "Veiculo proprio do titular" (levava a marcar true). Agora: default false, checkbox trocado por nota, e o payload usa veiculoProprioParaGravar(titular=true) = sempre false.
- gestor/src/lib/veiculoCadastro.ts (testado): bloqueia semirreboque/carreta sem e_reboque; avisa tara fora da faixa (taraPlausivel), cavalo com tara > 13.000 kg (caso AWJ0B09 com 16.000) e tara igual a capacidade; bloqueia titular PF sem UF (MDF-e exige UF do proprietario). Ligado em Cadastros.tsx (avisos ao vivo + bloqueio ao salvar).
- e_reboque: ja coberto pelo gatilho trg_reboque_marca_e_reboque (so vinculos novos) e pelo RPC; a validacao nova cobre o cadastro manual. "Cavalo exige carreta ja na alocacao": o emissor ja bloqueia (mdfe.ts) e a previa mostra; NAO alterei a tela de alocacao (OperacaoFluxo.tsx) para bloquear a alocacao sem carreta — pendente/decisao.
- Tara igual ao peso da CARGA da operacao: so ha o aviso do emissor (tara + carga > CMT). No cadastro comparei tara x capacidade do proprio veiculo.

### Veiculos com is_veiculo_proprio = true e titular_id preenchido (26) — para decisao do Pedro (nada alterado)
Consulta feita em 18/11/2026, sem nomes de pessoas. Papel do titular entre parenteses.

| Placa | Tipo | Papel do titular |
|---|---|---|
| AHB1J44 | TRACAO CAMINHAO TRATOR | titular_motorista |
| AHP3H35 | Cavalo mecanico | prestador_parceiro |
| AIA8E06 | Truck | titular_motorista |
| AVD9I97 | CARGA SEMI-REBOQUE (e_reboque ok) | titular_motorista |
| AWT0B06 | TRUCK | titular_motorista |
| BWG9I49 | TRUCK | titular_motorista |
| DBB9C49 | TRUCK (tara 29 kg: suspeita) | titular_motorista |
| DGY2E47 | Passeio | titular_motorista |
| EFF2I58 | Carreta (e_reboque = false: ERRADO; tara 61 kg) | titular_motorista |
| FET2F12 | Fiorino | titular_motorista |
| IZM8H04 | Van | titular_motorista |
| JAG9B55 | Reboque (e_reboque ok) | titular_motorista |
| MBW7B19 | CARGA SEMI-REBOQUE (e_reboque ok) | titular_motorista |
| MIT7D37 | TRACAO CAMINHAO TRATOR | titular_motorista |
| MKT6E78 | Cavalo (tara 25.5: suspeita) | titular_motorista |
| MLN9A91 | CARGA SEMI-REBOQUE (tara 9.8: suspeita) | titular_motorista |
| MRJ1B57 | TRUCK (tara 22.5: suspeita) | titular_motorista |
| OZP4F75 | Van | titular_motorista |
| QKJ0D68 | Cavalo | titular_motorista |
| RBC7I49 | Fiorino | titular_motorista |
| RVJ1G89 | Fiorino | titular_motorista |
| RXX9D05 | CARGA SEMI-REBOQUE (e_reboque ok) | titular_motorista |
| SXR2E28 | TRACAO CAMINHAO TRATOR | titular_motorista |
| TST1E34 | Truck (cadastro de TESTE) | titular_motorista |
| TST9A99 | cavalo_mecanico (cadastro de TESTE) | titular_motorista |
| UEM6A44 | Toco (titular PJ) | titular_motorista |

Sugestao de correcao em massa (NAO aplicada): `update veiculos set is_veiculo_proprio = false where is_veiculo_proprio is true and titular_id is not null;` (e `e_reboque = true` para EFF2I58). Excecao a decidir: veiculos que a RBR de fato opere em comodato no RNTRC dela (o teste do emissor trata AHP3H35 como comodato na frota da RBR).
