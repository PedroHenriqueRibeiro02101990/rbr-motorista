# Documentação oficial do TMS da RBR

Regra de ouro: só consta o que foi **verificado** no código ou no banco (leitura, 2026-11-12). Suposição = "a confirmar". Inexistente = "ainda não disponível". Nenhum valor de segredo aparece aqui, só o NOME.

## Índice

| Arquivo | Assunto |
|---|---|
| [00-VISAO-GERAL](00-VISAO-GERAL.md) | O que é, apps, quem usa, ambientes, stack |
| [01-ARQUITETURA](01-ARQUITETURA.md) | Fluxo de dados (Mermaid), repositório, deploy, flags VITE_* |
| [INVENTARIO-TELAS](INVENTARIO-TELAS.md) | Rotas e telas por app e papel |
| [INVENTARIO-FUNCOES](INVENTARIO-FUNCOES.md) | Edge functions: versão, verify_jwt, tabelas, segredos (nome) |
| [INVENTARIO-BANCO](INVENTARIO-BANCO.md) | Tabelas por domínio, triggers, RPC, RLS, migrações |
| 02 a 10 | Regras, integrações, operação, segurança, decisões, glossário (PR 2) |
| [treinamento/](treinamento/) | Treinamento por área e por sessão (PR 3) |
| REVISAO-ERROS-E-MELHORIAS | Revisão crítica (PR 4) |

## Como ler
Comece por 00 e 01. Para operar, vá ao inventário da área. Cada afirmação importante cita a evidência (arquivo, tabela ou função).

## Como manter atualizada (checklist de PR)
Mexeu em tabela, função, tela, regra ou integração? Atualize o doc correspondente **no mesmo PR** e registre no [CHANGELOG](CHANGELOG.md).
- [ ] Tabela/coluna/trigger/policy nova → INVENTARIO-BANCO
- [ ] Edge function nova ou mudou segredo/verify_jwt → INVENTARIO-FUNCOES
- [ ] Rota/tela nova → INVENTARIO-TELAS
- [ ] Flag VITE_* nova → 01-ARQUITETURA
- [ ] Regra ou integração mudou → arquivo de regras/integrações e 09-DECISOES
