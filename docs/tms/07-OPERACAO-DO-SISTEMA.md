# 07 · Operação do sistema

Fonte: `COMO-PUBLICAR.md`, `scripts/deploy-functions.js`, `docs/checklist-producao.md`, `docs/checklist-primeira-operacao-real.md`, `supabase/rollback/`, `docs/rollbacks/`, cron do banco. O que não consta no repositório está marcado.

## Publicar
- **Front** (gestor, motorista, agenciador): Vercel por pasta de app, publicação pelo GitHub ou `vercel --prod` (`COMO-PUBLICAR.md`). Merge na `main` publica produção (a confirmar a regra do projeto Vercel).
- **Funções**: `node scripts/deploy-functions.js <nome>` (CLI Supabase, project-ref do projeto ERP RBR). Confira antes se o repositório = publicado (hoje divergem: ver INVENTARIO-FUNCOES).
- **Banco**: aplicar o SQL da migração no projeto; só migrações aditivas e com arquivo de rollback. Ordem importa quando uma função depende de coluna nova (cabeçalho de `20261014_01_modo_teste.sql`: migração **antes** do front e das funções).

## Reverter (rollback)
| O quê | Como |
|---|---|
| Front | Promover o deploy anterior na Vercel (instant rollback) |
| Função | Republicar a versão anterior do código (`git checkout <commit> -- supabase/functions/<nome>` e deploy). Versões publicadas hoje em INVENTARIO-FUNCOES |
| Banco | Rodar `supabase/rollback/rollback-<migração>.sql`; as de 20261030 estão em `docs/rollbacks/` (duas pastas, a unificar). Migrações de 20261111 em diante: rollback **a confirmar** |
| Flag VITE_* | Remover a variável na Vercel e republicar o front |

## Backups e retenção
- Backup do banco: **a confirmar** (plano e janela do Supabase não constam no repositório).
- Retenção de dados: política LGPD descrita nos comentários do banco: imagens de documento removidas até 90 dias após inativação (`inativacao_imagem_documento_dias`); posições GPS 2 anos após finalização; CT-e/MDF-e seguem retenção fiscal. Rotina que executa a limpeza: **a confirmar** (só `limpar-tentativas-publicas` existe no cron).

## Segredos e rotação
Segredos ficam no Vault do Supabase, lidos por funções `get_*` / `*_segredo` só com service_role. Rotacionar: criar novo valor no Vault e manter o mesmo NOME; depois testar a função (modo teste/homologação). Nunca em arquivo, PR, log ou relatório. Lista de nomes em INVENTARIO-FUNCOES e 05-INTEGRACOES. Rotina periódica de rotação: **ainda não disponível**.

## Agendamentos
5 jobs pg_cron (INVENTARIO-BANCO): sincronização fiscal a cada minuto, auditores a cada 30 min, reavaliação diária de cadastros, limpeza de tentativas públicas.

## Incidentes
| Situação | O que fazer |
|---|---|
| SEFAZ/Focus fora | O disjuntor (`disjuntor_fiscal`) e a sincronização cuidam do estado; não reemitir manualmente em loop; acompanhar em Saúde fiscal e aguardar `sincronizar-documentos-fiscais` |
| Fornecedor fora (efrete, NSPEDAGIO) | O pedido fica gravado (`efrete_ciot_pedidos.ultimo_erro`, `vpo_requisicoes.erro`); não repetir compra de VPO sem checar `vpo_requisicoes` (idempotência) |
| Erro de emissão | Ler a mensagem em `documentacao_operacao.mensagem_erro` e `eventos_fiscais_operacao`; corrigir o dado; reemitir só após conferir que não autorizou |
| Vazamento ou suspeita | Registrar em `incidentes_seguranca`; revogar sessões (`revogar_sessoes_usuario`); rotacionar o segredo envolvido; avisar o titular (LGPD) |
| Segredo exposto | Rotacionar imediatamente no Vault |

## Checklist de go-live (resumo; detalhes nos checklists de `docs/`)
- [ ] Conta e credenciais de produção da efrete e URL de produção; remover trava "só homologação" das funções efrete.
- [ ] Ambiente fiscal em produção em `parametros_fiscais` e IE/RNTRC/apólice da RBR em dia.
- [ ] NSPEDAGIO em produção (hoje fixo em homologação).
- [ ] `VITE_EFRETE_CIOT_HABILITADO` ligada só depois dos itens acima.
- [ ] CIOT no MDF-e obrigatório em 23/11/2026.
- [ ] Cadastros reais aprovados; primeira operação real conforme `docs/checklist-primeira-operacao-real.md`.
- [ ] Repositório = funções publicadas; migrações 20261030 registradas.
