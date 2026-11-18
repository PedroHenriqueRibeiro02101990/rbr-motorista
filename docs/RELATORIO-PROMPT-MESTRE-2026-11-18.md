# Relatorio final do prompt mestre (18/11/2026)

| Parte | PR | Merge | Hash na main |
|---|---|---|---|
| A cadastro por documentos | #84 | sim | e5e0479 |
| B aba Fiscal v3 | #85 | sim | a07ebd8 |
| C erros do MDF-e | #86 | sim | 91b4ffa |
| D Repom endurecido | #87 | sim | cd40e50 |

**Testes na main:** 520 ok / 0 falhando; tsc, lint (so avisos antigos) e build do gestor ok em cada parte.

**Banco e funcoes (NADA aplicado: Supabase CLI nao instalado neste computador).** Ordem: migracoes `20261118-0100`, `0110`, `0200`, `0300`, `0400` (em `supabase/migrations`; rollbacks em `supabase/rollback`); depois, se quiser a do PR #82, `supabase-migrations/20261116-1000-bloqueios-so-externos.sql` (troca funcoes: nao e aditiva pura). Funcoes a publicar: `extrair-documento`, `emitir-mdfe`.

**Flags (todas desligadas, build da Vercel):** `VITE_CADASTRO_POR_DOCUMENTOS` (tela Cadastros), `VITE_FISCAL_V3` (aba Fiscal, esteira, cartao manual), `VITE_REPOM_CADASTRO_HABILITADO` (botao Cadastrar na Repom). Variaveis da Vercel: nenhuma foi mudada.

**DECISOES DO CODE**
- Migracoes em `supabase/migrations` e rollbacks em `supabase/rollback`, como pede o prompt (o projeto tambem usa `supabase-migrations/`).
- Part C partiu da main + merge do PR #82 (ainda aberto), conflitos so de import.
- Cavalo sem reboque voltou a ser BLOQUEIO (o #82 deixara aviso) porque a SEFAZ rejeitou na OP-0360.
- Previa `preview-fiscal-completo-v3` nao existia no repositorio: etapa 9b feita pela descricao.
- Eduardo: politicas aceitam `gestor_rbr`, `operacao` e `fiscal`; confirmei que `gestor_rbr` ja tem acesso total.
- Migracoes usam `drop policy/constraint if exists` + recriar (padrao do projeto); a de categoria de combinacao e superconjunto da regra antiga.
- Consultei o banco so em leitura (estrutura e as 3 operacoes de referencia); nada gravado.

**Pendentes / nao feito**
- Trocar TODOS os campos de peso e valor pelos componentes novos (feito nos principais; resto no inventario `docs/INVENTARIO-CAMPOS-PESO-VALOR-2026-11-18.md`).
- Aplicar migracoes e publicar funcoes; ligar flags (Pedro/assistente).
- Telas nao abertas em navegador; prints 1366x768 nao gerados; campo de NF-e por chave; caixas de upload manual de PDF de CT-e e MDF-e; "Conferencia 7 de 7"; exigir carreta ja na criacao da operacao; ligar `FilaPorChave`/`emitirOuAdotar` dentro do `fluxoFrete`.
- Karen: controle de saldo (2768), categoria pesada, TypeId do telefone, filial Repom, retencao de 5,06% da OP-0360.

**Desfazer:** `git revert` do commit de merge de cada PR; funcao: republicar a versao anterior; SQL: arquivos de `supabase/rollback`.

**Conflitos:** `mdfe.ts`, `mdfe.test.ts`, `emitir-mdfe/index.ts` e `extrair-documento/index.ts` entre A, B, C e #82, resolvidos sem perda.
