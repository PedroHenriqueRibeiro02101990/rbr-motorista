# Treinamento · Cotação e proposta

**Público:** comercial e gestor. **Pré-requisitos:** cliente cadastrado; saber o que é piso ANTT e margem (glossário). Exercícios com cliente e carga de teste/DEMO.

## Sessão 1 · Pré-cotação (30 min)
**Objetivo:** montar uma pré-cotação com várias rotas.
1. Abra **Pré-cotação** (`/pre-cotacao`) e clique **Nova pré-cotação**.
2. Informe cliente e rotas; salve (o rascunho pode ser retomado com **Retomar** ou **Descartar**).
3. Abra com **Abrir**; em cada item use **Aceitar**, **Recusar** ou **Desfazer**.
4. Com itens aceitos, **Abrir cotações** leva à Cotação.
**Exercício (DEMO):** crie pré-cotação com 2 rotas, aceite uma e recuse a outra.
**Erros comuns:** editar depois de convertida (botões ficam desativados).
**Sei fazer:** [ ] criar [ ] aceitar/recusar [ ] ir para a cotação.

## Sessão 2 · Cotação, margem e custos (45 min)
**Objetivo:** fechar preço dentro da margem.
1. Em **Cotação** (`/cotacao`) escolha o cliente (campo "Buscar por razão social, fantasia ou CNPJ…") e informe origem, destino, NF-e, carga.
2. Confira piso ANTT, pedágio, seguro/TAG e imposto; a margem válida é **26% a 40%** (parâmetros `margem_cotacao_min/max`; fora disso o banco recusa).
3. Adicione custos adicionais (GR, rastreamento, AET etc., catálogo `tipos_custo_adicional`).
**Exercício (DEMO):** monte uma cotação com margem de 30% e tente 20% para ver a recusa.
**Erros comuns:** margem fora da faixa; origem/destino sem município IBGE; NF-e sem dados.
**Sei fazer:** [ ] preencher a cotação [ ] ler piso e margem [ ] adicionar custo.

## Sessão 3 · Proposta e aceite (30 min)
1. Gere o link de aceite com o botão do cartão da cotação (BotaoLinkAceite; válido 7 dias, de 1 a 60).
2. O cliente abre `/p/<código>`, informa nome e cargo e aceita (uma só vez).
3. A cotação convertida cria a operação automaticamente.
**Ainda não disponível:** **Enviar por e-mail**, **Baixar PDF da proposta**, **Enviar ao gestor**, **Aprovar** e **Recusar** (aprovação de preço) aparecem desativados.
**Exercício (DEMO):** gere o link, abra em janela anônima e aceite.
**Erros comuns:** link expirado ou já aceito mostra "link inválido".
**Sei fazer:** [ ] gerar link [ ] acompanhar aceite [ ] achar a operação criada.
