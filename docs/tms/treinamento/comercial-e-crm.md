# Treinamento · Comercial e CRM

**Público:** vendedor/pré-vendedor (papel `comercial`) e gestor. **Pré-requisitos:** login no gestor com papel comercial; clientes na sua carteira. Menu do papel: Início, Serviços, Meus clientes (`menuPorPapel.ts`, `AppShell.tsx`). Exercícios só na **operação DEMO** ou com cadastros de teste; nunca em cliente real.

## Sessão 1 · Fila do dia e leads (35 min)
**Objetivo:** trabalhar a fila e registrar contatos.
1. Abra **Fila do dia** (`/fila-do-dia`; no menu "Mais" do gestor, e para o papel operação conforme `POR_PAPEL`; para comercial a rota **a confirmar** no menu enxuto).
2. Clique **+ Novo lead** e preencha os campos.
3. Em um lead, clique **Registrar contato** e anote o resultado.
**Exercício (DEMO):** cadastre um lead fictício e registre dois contatos.
**Erros comuns:** lead duplicado (conferir antes); contato sem resultado (a fila não avança).
**Sei fazer:** [ ] criar lead [ ] registrar contato [ ] achar o lead na Busca (Ctrl K).

## Sessão 2 · Carteira de clientes (35 min)
**Objetivo:** consultar e cadastrar clientes da sua carteira.
1. Abra **Meus clientes** (`/meus-clientes`): o banco mostra só os seus (RLS `clientes_carteira_comercial`).
2. Para cliente novo, use **Cadastros → Clientes → Novo cliente** (CNPJ ou CPF, endereço, contato).
3. Veja a ficha: risco comercial e protesto aparecem na ficha (`RiscoComercial`).
**Exercício (DEMO):** cadastre um cliente de teste com CNPJ válido e confira que ele aparece em Meus clientes.
**Erros comuns:** CNPJ inválido (validação de dígito); cliente de outra carteira não aparece (é regra, não erro).
**Sei fazer:** [ ] abrir ficha [ ] cadastrar cliente [ ] ler o risco comercial.

## Fora do escopo hoje ("ainda não disponível")
Aprovação de preço, pedidos por canal e autonomia de preço aparecem desativados (`PENDENCIAS-PEDRO.md`).
