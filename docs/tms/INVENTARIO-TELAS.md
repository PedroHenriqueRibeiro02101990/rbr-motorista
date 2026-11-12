# Inventário de telas

Papéis do gestor conforme `gestor/src/lib/menuPorPapel.ts` (o menu é conforto; **quem decide o que cada papel lê é o RLS**). O gestor_rbr vê todas.

## Gestor (`gestor/src/App.tsx`)

| Rota | Tela | Para que serve | Papéis que aparecem no menu |
|---|---|---|---|
| `/` | Início / InicioFuncao | Dashboard do dia; início enxuto por função | todos |
| `/busca` | Busca | Busca global em clientes, cotações, operações (respeita RLS) | todos |
| `/avisos` | Avisos | Central de avisos (hoje: operação em finalização) | todos |
| `/cotacao` | Cotação | Montar preço, margem, custos, pedágio; link de aceite | gestor, comercial |
| `/pre-cotacao` | Pré-cotação | Pré-cotações e itens; converter em cotação | gestor, comercial |
| `/fila-do-dia` | Fila do dia | CRM do pré-vendedor | gestor, operação |
| `/meus-clientes` | Meus clientes | Carteira de quem vende | gestor, comercial |
| `/cadastros` | Cadastros | Clientes, motoristas, veículos, parceiros (abas) | gestor, comercial, operação |
| `/operacoes` | Operações | Esteira da operação, abas Resumo / NF-e e documentos fiscais / Motorista e veículo / Financeiro / Histórico (`abasOperacao.ts`) | gestor, operação, fiscal, financeiro |
| `/operacoes/lote/:cotacaoId` | Lote | Cotação que virou várias operações | sem filtro de menu |
| `/servicos` | Serviços | Lista do que está andando por etapa | quem usa cotação, operações ou fiscal |
| `/jornada` | Jornada da operação | Mapa de quem faz cada passo | só gestor (fora de POR_PAPEL) |
| `/mapa` | Mapa | Frota e operações no mapa | gestor, operação |
| `/alteracoes` | Alterações | Mudanças após o aceite | gestor, operação |
| `/fiscal` | Fiscal | Documentos fiscais, parâmetros fiscais (`?parametros=1`), modo demonstração | gestor, fiscal |
| `/saude-fiscal` | Saúde fiscal | Achados do robô de conferência | gestor, fiscal |
| `/financeiro` | Financeiro | Lançamentos, faturas, conciliação, DRE | gestor, financeiro |
| `/notas-parceiros` | Notas parceiros | Frete a parceiros sem NFS-e | gestor, financeiro |
| `/relatorio-comercial` | Relatório comercial | Funil, perdas, fechado no mês | só gestor |
| `/metas` | Metas | Metas por função | só gestor |
| `/risco` | Risco | Risco comercial/cadastral | só gestor |
| `/conformidade` | Conformidade | Termos, contratos, escudo contra carga ilícita | só gestor |
| `/pessoas` | (redireciona) | → `/cadastros?aba=motoristas` | — |
| `/p/<código>` | Proposta pública | Aceite da proposta **sem login**, antes da checagem de sessão | público |
| `/demo-ciot` | Demo CIOT | Dados fictícios, sem login, só se `VITE_DEMO_CIOT=true` | público (preview) |
| `*` | — | Redireciona para `/` | — |

Observação verificada: rotas sem entrada em `POR_PAPEL` (jornada, relatório, metas, risco, conformidade) ficam fora do menu dos papéis não-gestor, mas **a rota em si não bloqueia o papel** (`App.tsx` só filtra por `PAPEIS_DO_PAINEL`); o bloqueio de dado vem do RLS.

## Motorista (`motorista/src/App.tsx`) · papéis titular_motorista, condutor
`/` Início · `/cargas` Cargas e aceite · `/caixa` Recebimentos · `/pontos` Pontuação · `/perfil` Perfil e documentos. Titular passa por `AceiteGate` (termo).

## Agenciador (`agenciador/src/App.tsx`) · papel agenciador
`/` Início · `/cotacoes` Cotações próprias · `/financeiro` Comissão e spread · `/clientes` Carteira própria · `/operacoes` Operações próprias · `/perfil` Perfil e contrato.
