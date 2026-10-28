# Auditoria dos PRs #1 a #32 (2026-10-28)

CI: o repositório só tem as verificações da Vercel (o build do gestor roda `tsc -b && vite build`). Além disso rodei, em cada PR aberto, o resultado do merge com a main: `tsc -b` (gestor, motorista, agenciador), `node --test` e `vite build`. Todos passaram (detalhe no fim).
Migração "aplicada" = conferida em `list_migrations` do projeto Supabase. Nenhuma migração foi aplicada por mim.

| PR | Título | Estado | CI | Conflito com a main | Migração | Dinheiro / Pix / segurança | Recomendação |
|---|---|---|---|---|---|---|---|
| #1 | Política de prazo e desconto no cotador (depende da integracao-2026-10-15; não mesclar ainda) | aberto (draft) | verde (Vercel) | CONFLITO (base integracao-2026-10-15) | sim: 20261016_01_politica_prazo_desconto — NÃO aplicada | Sim (desconto/prazo em fatura e preço) | Não mesclar → Pedro |
| #2 | Fiscal: status dos documentos ao vivo, sem botão "Atualizar status" | mesclado | — | — | — | — | mesclado |
| #3 | Averbação RC-V (Sompo) do MDF-e nas telas e repositório sincronizado com o que está no ar | mesclado | — | — | — | — | mesclado |
| #4 | Integração 2026-10-15: modo teste, regras fiscais, status ao vivo, averbação Sompo e melhorias B1–B5 (não mesclar sem OK) | mesclado | — | — | — | — | mesclado |
| #5 | Painel da operação enxuto (próximo passo + linha do tempo) | mesclado | — | — | — | — | mesclado |
| #6 | Cotação: tipo de carga obrigatório para enviar/converter | mesclado | — | — | — | — | mesclado |
| #7 | Cotação: coleta em outro local (origem editável) | mesclado | — | — | — | — | mesclado |
| #8 | Avisos só enquanto acionáveis (todo o ERP) | aberto | verde (Vercel) | limpo | sim: 20261016_05 — aplicada (cotacoes_origem_coleta_cep_endereco) | Não | Mesclar |
| #9 | App motorista: envio de documento (CNH) que chega ao banco | aberto | verde (Vercel) | limpo | não | Dados pessoais (foto da CNH), sem dinheiro | Mesclar |
| #10 | Cotação: título origem → destino | aberto | verde (Vercel) | limpo | não | Não | Mesclar |
| #11 | Cadastro: tipo de documento comprovante de residência (migration + rollback) | aberto | verde (Vercel) | limpo | sim: 20261023_01 — aplicada (documentos_tipo_comprovante_residencia) | Não | Mesclar |
| #12 | Operação: ordem de coleta (PDF do motorista) + tabela ordens_coleta | aberto | verde (Vercel) | limpo | sim: 20261023_02 — aplicada (ordens_coleta) | Não | Mesclar |
| #13 | CRM comercial: leads, receber-lead e Fila do dia (etapa 1 + início da 2) | aberto | verde (Vercel) | limpo | sim: 20261023_03 — aplicada (crm_etapa1); a função receber-lead já está no ar (verify_jwt=false) | Segurança: endpoint público já existente; o PR só traz o código ao repositório + tela Fila do dia | Mesclar (anotado) |
| #14 | Segurança: remove backup _bkp_gr_exigido_20261015 (migration + rollback) | fechado | verde (Vercel) | limpo | sim (rollback/drop de backup) | Não | Fechado: manter como está |
| #15 | Segurança Supabase: análise e propostas (revoke de 2 funções, pg_net) — sem aplicar | aberto | verde (Vercel) | limpo | sim: propostas 20261023_05 e _06 — NÃO aplicadas (de propósito) | Segurança (revoke de funções, pg_net) | Não mesclar → Pedro |
| #16 | efrete (NSTech): conexão na homologação — cliente, função de teste e leitura do Vault | mesclado | — | — | — | — | mesclado |
| #17 | efrete (NSTech): proxy na Vercel + login e consultas OK na homologação (depende do #16) | mesclado | — | — | — | — | mesclado |
| #18 | efrete passo 3: CIOT Padrão com Pix na homologação (depende do #17) | mesclado | — | — | — | — | mesclado |
| #19 | Passo 4: NF-e do cliente na operação + CIOT da efrete ligado à operação (depende do #18) | mesclado | — | — | — | — | mesclado |
| #20 | Efrete: passos 2 a 4 (conexão, CIOT de teste, NF-e do cliente na operação) | mesclado | — | — | — | — | mesclado |
| #21 | Preparação para produção: CT-e/MDF-e publicados, RLS das NF-e, acentos no proxy, checklist e VPO | mesclado | — | — | — | — | mesclado |
| #22 | Proxy efrete: publicar correção de acentos (deploy) | mesclado | — | — | — | — | mesclado |
| #23 | Corrigir permissão de nfes_em_outra_operacao | mesclado | — | — | — | — | mesclado |
| #24 | Fechar pendências: permissões das NF-e (grant chave_nfe_valida e eh_backend por sessão) | mesclado | — | — | — | — | mesclado |
| #25 | Mapa do Início volta a claro | mesclado | — | — | — | — | mesclado |
| #26 | Operação: linha do tempo aprovada (painel lateral, cartão GR, CIOT manual, etapas recolhidas) | mesclado | — | — | — | — | mesclado |
| #27 | Painel 'O que fazer agora': filtro por tipo e 'Tudo em dia' | aberto | verde (Vercel) | limpo | não | Não | Mesclar |
| #28 | Cadastros: lista de clientes com filtros e Novo cliente enxuto (Tela 2, parcial) | aberto | verde (Vercel) | limpo | não | Não | Mesclar |
| #29 | Segurança: CIOT pela efrete só em produção real; CIOT manual é o caminho | mesclado | — | — | — | — | mesclado |
| #30 | CIOT pela efrete: tela da demonstração de homologação | aberto (draft) | verde (Vercel) | limpo | não (só SQL de limpeza em docs, não executável pelo app) | Fluxo CIOT/Pix atrás de flag DESLIGADA; trava 412 intacta; tela e demo só com flag | Mesclar |
| #31 | Fase 0: datas previstas de coleta e entrega na operação | aberto (draft) | verde (Vercel) | limpo | não | Não | Mesclar |
| #32 | Checklist de produção da efrete (só documento) | aberto (draft) | verde (Vercel) | limpo | não | Não | Mesclar |

## Verificação local do merge com a main
| PR | Resultado |
|---|---|
| #8 | tsc ok (3 apps), 30 testes ok, build ok |
| #9 | tsc ok (3 apps), 29 testes ok, build do motorista ok |
| #10 | tsc ok, 28 testes ok, build ok |
| #11 | tsc ok (3 apps), 25 testes ok |
| #12 | tsc ok (3 apps), 32 testes ok, builds ok |
| #13 | tsc ok (3 apps), 28 testes ok, build ok |
| #27 / #28 | tsc ok, 25 testes ok, build ok |
| #30 | tsc ok, 32 testes ok, build ok; build sem flags não contém o cartão do CIOT nem a demo (0 ocorrências) |
| #31 | tsc ok, 31 testes ok, build ok |
| #32 | só documento |

## Decisões conservadoras registradas
- #13: a função `receber-lead` (pública) e as tabelas já estão no ar; o merge só alinha o repositório e mostra a Fila do dia no menu. Mesclo, mas anoto aqui.
- #14 está fechado (não foi mesclado) e fica como está.
- #1 aponta para a base `integracao-2026-10-15` (já incorporada na main pelo #4): não dá para mesclar sem refazer a base e aplicar a migração.
