# Painel do agenciador — relatório (2026-11-05)

## Fase A (comercial + demo + visual)

**Como o Pedro vê / apresenta**
- Demonstração sem login: abrir `<URL do Preview do rbr-agenciador>/demo`. A rota só existe se a variável `VITE_DEMO_AGENCIADOR=true` estiver no escopo **Preview** da Vercel (projeto rbr-agenciador). Em produção a variável não existe e `/demo` cai no app normal. (Criar a variável é um passo do Pedro/Vercel; não foi criada por mim.)
- Dados 100% fictícios: agenciador "Horizonte Agenciamento (exemplo)" com logotipo fictício, 6 clientes, 12 cotações em todos os estados, 5 operações em etapas diferentes, 3 meses de histórico financeiro. Tudo navegável e **nada grava no banco**.

**Pronto**
- A1: login, esqueci a senha e cadastro PF/PJ com aceite já existiam (AuthTelas); mantidos.
- A2: Início com funil (dados reais, da visão `agenciador_cotacoes_v`), pendências, botão fixo "Falar com a RBR" (wa.me 11 95397-7966). Mapa de frota escondido pela flag.
- A5: Operações somente leitura com linha do tempo em palavras simples (conta real e demo).
- A6: logotipo (PNG/JPG/WebP, até 1 MB, redimensionado a 512 px no navegador, SVG recusado) + coluna `pessoas.logo_path` + bucket `agenciador-logos` (migração aplicada, aditiva, rollback em `supabase-migrations/agenciador_logo_e_view_cotacoes.sql`). Gestor pode remover (política de delete).
- A7: selo "Agenciador parceiro RBR" no cabeçalho (logo em quadrado branco, máx. 36 px; sem logo, iniciais), esqueleto de carregamento, estados vazios, modo escuro (segue o sistema) e celular.
- Motor de spread (`shared/spreadAgenciador.ts`, testado): preço = (frete + pedágio + seguro/TAG + custo financeiro + lucro mínimo RBR + spread) / (1 − alíquota); spread em R$, em % do preço final ou digitando o preço (3 campos ligados); trava no piso ANTT e spread negativo; aviso amarelo no limite; taxa de tecnologia R$ 9,90 descontada do spread.
- Flag `VITE_AGENCIADOR_MODULOS_RBR` (desligada): esconde contrato gov.br, base de motoristas/override e mapa de frota. Código não apagado.

## Decisões tomadas sem perguntar
1. **Gatilho de preço não foi alterado.** Incluir o spread no motor real exige `CREATE OR REPLACE` de `trg_fn_cotacao_calcula_preco` (não é aditivo, e mexe no preço da RBR em produção). Escolhi não aplicar. Na conta real o bloco de spread **ainda não está ligado à gravação**; ele está completo na demo e no motor testado. Falta aplicar a migração do motor (a escrever com o Pedro) para ligar a gravação real.
2. **Status "aceita" não existe no banco** (`status_cotacao`: rascunho, enviada, convertida, perdida). Adicionar valor ao enum afeta gestor/gatilhos. Na conta real o funil mostra 4 estados; "Aceita" só aparece na demo.
3. **% do spread** é definido sobre o **preço final** (mesma base da margem mostrada).
4. Cadastro (A1) e telas reais de Clientes/Cotações (A3/A4) **não foram reescritas**: as existentes seguem em uso; o novo bloco de spread/envio vive na demo.
5. Logo no PDF: não incluído (conforme escopo).

## Riscos de confidencialidade (CONFIRMADO)
- Papel `authenticated` (inclui agenciador) tem **SELECT e UPDATE** em `cotacoes.lucro_rbr`, `custo_financeiro`, `valor_frete_motorista`, `valor_total_motorista`, `valor_seguro_tag`, `lucro_pct`; a política `agenciador_gerencia_cotacoes_proprias` é ALL nas cotações dele. Ou seja, **hoje o agenciador consegue ler (e gravar) esses campos nas próprias cotações**.
- Correção aditiva feita: visão `agenciador_cotacoes_v` (security_invoker, 21 colunas, sem os campos internos); Início e Operações já leem só dela.
- **NÃO revoguei** o acesso direto: a página Cotações atual do agenciador grava direto em `cotacoes` e quebraria. Pendente: migrar Cotações para RPC/visão e então revogar.

## SQL / ações pendentes para o Pedro
- Criar `VITE_DEMO_AGENCIADOR=true` no escopo Preview.
- Ligar o spread à gravação real (migração do motor + RPC de envio com travamento) e depois revogar colunas internas.
- Conta de teste real aprovada: `docs/SQL-conta-demo-agenciador.sql` (NÃO executado).

## Não feito nesta fase
- Testes de segurança com duas contas reais de teste (exigem criar usuários no Auth); cobertos apenas por inspeção de privilégios/RLS.
