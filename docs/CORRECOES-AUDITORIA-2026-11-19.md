# Correcoes da auditoria 19/11/2026 (sessao da manha)
Branch `fix/correcoes-auditoria-2026-11-19`. Lista de trabalho: `docs/AUDITORIA-2026-11-19.md`.

## O que mudou
| Id | O que foi feito | Onde | Teste |
|---|---|---|---|
| C1 / D2 | Titular do veiculo = **proprietario do CRLV** (CPF/CNPJ + nome + UF lidos do documento). Bate com pessoa cadastrada: usa; nao bate: cria a pessoa (`titular_motorista`, sem login). Nunca motorista do lote nem quem esta logado. Sem documento no CRLV: bloqueia (tela e banco). Veiculo ja cadastrado: so troca o titular se estava vazio ou era da equipe; titular de terceiro e mantido e vira aviso. | RPC `confirmar_cadastro_por_documentos` + `_titular_do_crlv` (migracao `20261119-0900`), `lib/titularVeiculo.ts`, `lib/cadastroPorDocumentos.ts` | `gestor/test/titularVeiculo.test.ts` (motorista dono, outra pessoa, CNPJ, funcionario, bloqueios, guarda estatica da migracao); `supabase/tests/cadastro_por_documentos_titular_e_docs.sql` (banco, com ROLLBACK) |
| C2 / D1 | CNH, RG, CPF, RNTRC, comprovante, dados bancarios e CRLV ficam vinculados: linha em `documentos_pessoais_imagens` (pessoa ou veiculo, com `campos_extraidos` de `documento_extracoes`), `pessoas.cnh_foto_url`, `cnh_extracao_id`, `comprovante_residencia_url/data`. Idempotente. O painel abre o arquivo no bucket certo (`cadastro-documentos/` ou `documentos-pessoais`) e rotula CPF/RNTRC/comprovante/dados bancarios. | mesma migracao (CHECK de tipos ampliado), `PainelCadastro.tsx`, `ComprovanteResidencia.tsx`, `lib/arquivoCadastro.ts` | idem |
| C4 | CRLV novo grava `cavalo mecanico` / `truck` / `toco` / `van` / `utilitario` / `semirreboque` (todos reconhecidos por `mapearTipoRodado`); o texto cru "TRACAO CAMINHAO TRATOR" **nao** e reconhecido (e o que esta nos cavalos SXR2E28 e MIT7D37: dado antigo, bloco 9 de `correcoes-pendentes`). Carroceria do cavalo nao entra no MDF-e (emissor manda 00); previa de cavalo + carreta gravados pelo cadastro novo nao trava por rodado nem carroceria. | `tipoVeiculoDoCrlv` (ja existia), teste novo contra `emitir-mdfe/mdfe.ts` | `titularVeiculo.test.ts` (C4 x2) |
| D5 | CRLV a mais (2o cavalo, 2a carreta) nao e mais descartado em silencio nem vira "carreta": entra em `excedentes` e **bloqueia** com a placa. 2o documento pessoal do mesmo tipo: aviso. | `lib/cadastroPorDocumentos.ts` | teste D5 |
| D6 | Carroceria do CRLV gravada no texto que o emissor entende (aberta, bau, sider, graneleira, container, nao aplicavel). Sem equivalente (tanque, frigorifica, basculante...): grava o texto cru e **avisa na entrada** (nao so na previa). | `carroceriaParaMdfe` em `_shared/validacoes-cadastro.ts` | teste D6 |
| D4 | Cadastro novo: ao trocar o comprovante antes de salvar, o arquivo anterior (`pessoa/novo/...`) e removido (melhor esforco). No fluxo por documentos o comprovante agora e vinculado pela RPC. | `ComprovanteResidencia.tsx` | tsc/build |
| B9 | Historico dos uploads fiscais grava o id da **pessoa** (antes: `null` ou id do login) e mostra o erro se falhar. | `lib/eventoFiscal.ts`, `CartaoFiscalManual.tsx`, `SubirPdfManual.tsx` | tsc/build |
| S1 | Consultas dos buckets/policies em `docs/sql/auditoria-2026-11-19-consultas-f1.sql` (secao 1I). Precisa rodar no banco. | — | — |

## Nao feito (decisao do Pedro)
D3 (onde mora o dado bancario lido) e B10 (status `pendente` x `emitido` para PDF subido a mao): ver o resumo da sessao.

## Ordem para aplicar no banco (Claude do chat)
1. Rodar so-leitura: `docs/sql/auditoria-2026-11-19-consultas-f1.sql` (principalmente 1I e 1J).
2. `supabase/migrations/20261119-0900-cadastro-docs-titular-e-vinculos.sql` (rollback: `supabase/rollback/rollback-20261119-0900-...sql`).
3. `supabase/tests/cadastro_por_documentos_titular_e_docs.sql` (ROLLBACK no fim; deve imprimir OK 1 a OK 8).
4. `supabase/correcoes-pendentes-2026-11-19.sql` bloco a bloco com o Pedro (novos: 6B, 9, 10).
