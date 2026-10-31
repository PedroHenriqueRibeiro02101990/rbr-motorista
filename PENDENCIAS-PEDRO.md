# Pendências para o Pedro (front aprovado)

Branch: feat/front-aprovado (nunca main). Decisões e dúvidas anotadas aqui; nada trava a execução.

## Decisões que dependem de você
- Pedido de aprovação de preço (visual Aprovacao-Preco): não existe tabela nem regra no banco. A tela aparece desativada ("ainda não disponível"). Para ligar, é preciso criar a tabela de pedidos e mensagens (migração aditiva, com a sua autorização).
- Vendedor da cotação: a cotação não guarda quem é o vendedor. Colunas, filtros "Minhas/Equipe/Por vendedor" e avatares ficam desativados.
- Autonomia de preço (Novo/Intermediário/Sênior): sem dado; elemento desativado "ainda não disponível".
- Selo "Homologação · nenhum documento real": não foi posto, seria falso (operação de teste emite documento real na SEFAZ).
- Faixas de margem 29% e 32% do desenho valem só para a cor; a faixa de gravação do banco continua 26%–40%.
- Contato de quem recebe a carga: a cotação não guarda nome/e-mail/WhatsApp de aviso; campos desativados.
