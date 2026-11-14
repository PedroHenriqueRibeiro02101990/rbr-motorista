# Perguntas para a Repom (Karen) - segunda-feira

Mensagem curta, pronta para colar no WhatsApp. So as duvidas ainda abertas; nenhum segredo, senha ou token.
Referencias internas: D-F02, D-F15, D-F24, D-F20, D-F21 (DUVIDAS-PARA-REPOM.md).

---

Oi Karen, bom dia! Obrigado pelas respostas da semana passada, ja avancamos bastante. Ficaram so 5 duvidas:

1. *Login do 9520 (POST /Token)*: testamos e ele responde "unsupported_grant_type". O corpo e formulario OAuth padrao (grant_type=password, username, password, partner) ou JSON com o campo grant_type? Pode mandar um exemplo com dados ficticios? Algo assim:
   `{ "grant_type": "password", "User": "9520", "Password": "senha-exemplo", "Partner": "00000000000000" }`

2. Existe o campo *Version* no login? Se sim, qual valor usar? E qual a validade do token?

3. *Saldo* (Balance/Financial/GetByDateInicialDateFinal): qual o formato da resposta (quais campos)? A mesma rota e o mesmo host de Relatorio valem em producao? E o que o saldo representa (disponivel, a pagar, pre-pago)?

4. *Status*: voce nos enviou a lista (InTransit, Accountability, Cleared, Authorized, Paid, Interrupted, Cancelled, Locked). A que cada um se refere: viagem/contrato, pagamento ou CIOT? E qual a lista dos status de processamento da emissao (alem de Finished)? Quais sao finais?

5. *Homologacao*: quando ela e liberada para nos? E como pedimos a troca das senhas do 9520 e do 9501 (usamos as que estao hoje so para testes)?

Obrigado!
