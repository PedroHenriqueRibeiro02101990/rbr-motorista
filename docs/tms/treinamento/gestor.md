# Treinamento · Gestor (permissões, auditoria, parâmetros)

**Público:** gestor_rbr. **Pré-requisitos:** 02-PAPEIS-E-PERMISSOES e 07-OPERACAO-DO-SISTEMA.

## Sessão 1 · Equipe e acessos (35 min)
1. **Cadastros → Equipe** lista funcionários; o convite (**Convidar**) e **Testar conexão** aparecem desativados (ainda não disponível). A função de cada pessoa vem de `funcoes_pessoa`.
2. Acesso de motorista/agenciador: link de definir senha (função `acesso-app`), bloqueio e desbloqueio.
3. Entenda: o menu esconde, o banco decide.
**Sei fazer:** [ ] consultar funções [ ] bloquear/desbloquear acesso.

## Sessão 2 · Auditoria e saúde (35 min)
1. Trilha de auditoria por operação (aba **Histórico**) e `auditoria_log` (somente leitura).
2. **Saúde fiscal**: achados e o **disjuntor fiscal** (reabrir só com motivo).
3. **Conformidade** (`/conformidade`): termos, contratos, escudo contra carga ilícita; **Conferir** contrato de agenciador.
**Sei fazer:** [ ] ler a trilha [ ] reabrir disjuntor com motivo.

## Sessão 3 · Parâmetros e relatórios (40 min)
1. Parâmetros fiscais em **Fiscal → Parâmetros fiscais** (ambiente, dados da RBR).
2. Parâmetros do sistema (margens, adiantamento, mensalidade) ficam no banco; mudar só com decisão registrada em 09-DECISOES.
3. **Relatório comercial**, **Metas**, **Risco**, **Jornada da operação**. Baixar PDF e exportar planilha do relatório aparecem desativados.
4. Central de integrações (flag `VITE_CENTRAL_INTEGRACOES`, PR #67), se ligada.
**Erros comuns:** liberar com ressalva sem motivo claro; ligar modo teste em operação real.
**Sei fazer:** [ ] consultar parâmetros [ ] registrar decisão.
