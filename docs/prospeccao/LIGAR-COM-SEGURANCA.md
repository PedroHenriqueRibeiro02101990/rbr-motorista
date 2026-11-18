# Prospecção (agente SDR): como ligar com segurança

Tudo nasce **desligado**. Siga na ordem; cada passo só depende do anterior.

## 0. Aplicar e publicar (nada disso liga o envio)
1. Aplicar `supabase-migrations/20261116-1000-prospeccao-parte-a.sql` e depois `20261116-1100-prospeccao-parte-b.sql`.
2. Publicar as edge functions `prospeccao-enviar` e `prospeccao-ler` (`verify_jwt = true`).
3. Cadastrar os segredos (abaixo) no Vault: Supabase → Project Settings → Vault (ou `select vault.update_secret(...)`).
4. Rodar `docs/prospeccao/agendar-robos.sql` (troque `<PROJECT_REF>`). Com tudo desligado os robôs só escrevem "desligado" no Log do agente.

## Segredos (apenas os nomes; os valores só você digita, no Vault)
| Nome | Para quê | Exemplo Hostinger |
|---|---|---|
| `PROSPECCAO_SMTP_HOST` | envio | smtp.hostinger.com |
| `PROSPECCAO_SMTP_PORTA` | envio | 465 |
| `PROSPECCAO_EMAIL_USUARIO` | login da caixa | pedro@rbrcargo.com.br |
| `PROSPECCAO_EMAIL_SENHA` | senha da caixa | (você digita) |
| `PROSPECCAO_IMAP_HOST` | leitura | imap.hostinger.com |
| `PROSPECCAO_IMAP_PORTA` | leitura | 993 |
| `PROSPECCAO_CRON_CHAVE` | agendador chama os robôs (chave service_role do projeto) | (você cola do painel) |
| `PROSPECCAO_IA_CHAVE` *(opcional)* | classificação de respostas por IA (API da Anthropic) | sem ela, só palavras-chave |
| `PROSPECCAO_VERIFICADOR_CHAVE` *(opcional)* | serviço de verificação de e-mail | **ainda não integrado**; sem ele: sintaxe + MX |

Enquanto o valor for `PREENCHER`, o robô trata o segredo como ausente.

## Passo a passo
1. **Cadastrar segredos** (tabela acima) e o **alias** `descadastrar@rbrcargo.com.br` na Hostinger apontando para a caixa do Pedro.
2. **Destinos de teste:** aba Prospecção → Saúde do envio → "Destinos de teste": cadastre os seus e-mails.
3. **Ligar a leitura primeiro** (Chaves → Leitura da caixa → SIM). Na 1ª rodada o robô só marca o ponto de partida (não lê nada antigo).
4. **Modo de teste (já vem ligado):** ligue o Envio. Importe 2–3 empresas de teste, gere o 1º toque, aprove na Fila. Os e-mails chegam **só** nos destinos de teste, com `[TESTE]` no assunto. Confira na caixa de teste: texto puro, `List-Unsubscribe` mailto, janela 07–18h, intervalo de 8–25 min, limite do dia.
5. Confira o **Log do agente** (sem erros) e a aba Saúde do envio.
6. **Tirar o modo de teste** (Chaves → Modo de teste → NÃO, digitando DESLIGAR). A partir daqui o envio é para empresas reais.
7. **Ligar com aprovação** (`PROSPECCAO_APROVACAO_OBRIGATORIA` = SIM, o padrão): o agente prepara rascunhos, você aprova na Fila.
8. Só depois de dias de operação limpa: **virar automático** (`PROSPECCAO_APROVACAO_OBRIGATORIA` = NÃO). É a única chave que muda.

## Textos que faltam decidir
Toques 2, 3, 4 e as respostas (sair, agora não, indicação, aviso de recebimento) estão como "A DEFINIR" e **inativos**: a jornada espera neles. Edite em "Jornada e textos".

## Parada automática
O envio se desliga sozinho e avisa Pedro e José Carlos com: 3+ devoluções permanentes no dia; 1 reclamação; erro SMTP de bloqueio/limite/spam/suspensão; aviso de abuso da Hostinger; devolução > 5% nos últimos 40 envios. Religar é manual (LIGAR), só pelo usuário do Pedro.
