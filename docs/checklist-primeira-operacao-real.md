# Checklist da primeira operação real

Para a primeira carga real emitida pelo sistema (CT-e, MDF-e e CIOT pela efrete). Imprima ou abra ao lado da tela
Fiscal e marque item por item. Nada aqui traz dado de motorista ou cliente: os campos são preenchidos no sistema.

**Quem faz o quê**

- **Eduardo opera:** prepara a operação, sobe a NF-e, aloca motorista e veículo, emite e acompanha.
- **Pedro confere e libera:** confere cada bloco antes da emissão, confirma a prévia do CIOT e libera a carga.
  Nada é emitido sem o "ok" do Pedro.

**Antes de começar (pré-requisitos do sistema)**

- [ ] Conta de produção da RBR na NSTech (efrete) criada e configurada no sistema (passo 6). Hoje a emissão de CIOT
      pelo sistema só roda na homologação; sem o passo 6, a tela recusa com "Trava de segurança".
- [ ] Proxy da efrete na Vercel publicado com a correção de acentos (charset UTF-8).
- [ ] Pix do adiantamento: a liberação na homologação ainda não foi confirmada. Na primeira operação, combine com o
      motorista que o adiantamento pode precisar de acompanhamento manual (ver "Durante").

---

## 1. Antes de emitir

### Frete e piso ANTT
- [ ] Piso mínimo da ANTT calculado na cotação (eixos e distância conferidos).
- [ ] Frete do motorista **acima** do piso. Se ficar abaixo, o pré-voo marca "Frete do motorista abaixo do piso
      ANTT": corrija o valor antes de seguir.

### NF-e do cliente
- [ ] NF-e do cliente anexada no bloco "NF-e do cliente" da operação: XML de preferência; sem XML, a chave
      digitada (44 dígitos).
- [ ] Chave conferida com a nota física/DANFE: número, emitente, destinatário, valor e peso.
- [ ] Se a carga tem mais de uma nota, todas estão anexadas (o CT-e cita todas e soma valor e peso).
- [ ] Sem aviso de "NF duplicada em outra operação". Se aparecer, descubra o motivo antes de seguir.
- [ ] Sem nota na operação, o CT-e é bloqueado ("Operação sem NF-e do cliente"). Não contorne: a chave da cotação
      só vale para teste.

### Motorista e veículo
- [ ] Motorista **aprovado** em Cadastros (sem pendência e sem suspensão), com o termo/contrato aceito.
- [ ] Veículo de tração e reboques **aprovados**, com RNTRC ativo, tara, capacidade, UF e eixos cadastrados.
- [ ] CNH dentro da validade, com EAR e categoria que cobre o veículo.

### CIOT (pela efrete)
- [ ] Prévia do CIOT aberta na tela Fiscal e conferida pelo Pedro: contratado, veículo, rota, valores, adiantamento
      e quitação.
- [ ] Emitido pelo sistema (não pelo portal) e com confirmação registrada (nome de quem confirmou).
- [ ] Número com **12 dígitos + verificador** (ex.: `000000000000/0000`). O sistema guarda os dois separados.
- [ ] Ambiente do CIOT = **produção**. CIOT de homologação não libera MDF-e em produção.

### Vale-pedágio (VPO)
- [ ] A rota tem pedágio? Se sim, VPO comprado no fornecedor e **IDVPO**, valor e CNPJ da fornecedora preenchidos.
      Sem IDVPO o MDF-e fica bloqueado (Lei 10.209/2001).
- [ ] Enquanto não houver fornecedor integrado, o VPO é manual: compre no portal do fornecedor e preencha à mão.

### Seguro e gerenciamento de risco (GR)
- [ ] Apólice RCTR-C vigente cadastrada; valor da carga **abaixo do teto** da apólice.
- [ ] Pesquisa GR feita quando a seguradora exigir para essa carga (valor, tipo, rota). Registrar o número.
- [ ] Rastreamento configurado quando exigido.
- [ ] Averbação: CT-e averbado (Allianz, RCTR-C) e MDF-e averbado (Sompo, RC-V) depois das emissões.

### Pix do motorista
- [ ] Chave Pix do contratado cadastrada.
- [ ] **Titularidade conferida**: a chave pertence ao CPF do contratado (o mesmo do CIOT). Chave de terceiro não.
      O cadastro avisa "Chave Pix é de outro CPF/CNPJ".
- [ ] Condição de pagamento definida (adiantamento, saldo e prazo).

---

## 2. Durante

- [ ] **Conferência dupla do CIOT:** abrir o CIOT no portal da efrete e conferir com o sistema (número,
      verificador, contratado, veículo, valores). Pedro e Eduardo, cada um uma vez.
- [ ] **Conferência do MDF-e:** autorizado na SEFAZ, com a chave do CT-e, o CIOT de produção e o IDVPO (se houver).
- [ ] **Adiantamento:** acompanhar a liberação na tela Fiscal (consulta "transações", que usa o ObterTransacoes da
      efrete). Anotar o horário em que o Pix aparece. Se não aparecer no prazo combinado, falar com a NSTech antes de
      qualquer pagamento por fora.
- [ ] **Protocolos:** anotar na operação os protocolos de cada etapa (CT-e, MDF-e, CIOT, averbações, VPO).
- [ ] Liberar a carga para coleta só com todos os documentos conferidos.

---

## 3. Depois

- [ ] **Encerramento da viagem** na efrete (ação "encerrar" na tela Fiscal), com o peso das notas. Anotar o protocolo.
- [ ] **MDF-e encerrado** na SEFAZ. O sistema pede o encerramento quando a operação é marcada como entregue;
      confira na tela Fiscal que o status mudou.
- [ ] **Quitação** do saldo ao motorista conforme a condição de pagamento; conferir que saiu para a chave Pix
      conferida.
- [ ] **Comprovante de entrega** (canhoto ou foto) anexado à operação.
- [ ] **Arquivos guardados no sistema:** DACTE, DAMDFE e PDF do CIOT (ação "pdf" na tela Fiscal), além do XML das
      NF-e do cliente.
- [ ] Operação fechada no Financeiro, sem valor em aberto.

---

## 4. Se a efrete rejeitar

1. **Não reenvie de cabeça.** Copie o texto do erro como apareceu na tela e o **protocolo** (o sistema mostra os dois).
2. **Anti-duplicidade:** antes de tentar de novo, use "consultar" na tela Fiscal. O sistema procura pela mesma
   referência da operação e só emite de novo se a efrete disser que ela não existe. Nunca emita pelo portal
   enquanto o sistema tiver um pedido aberto: isso gera dois CIOTs.
3. Erro de cadastro (motorista, proprietário, veículo): corrija o cadastro no sistema e repita a partir da prévia.
4. Erro de valor ou piso: corrija a condição de pagamento ou o frete e gere uma nova prévia.
5. Erro que não for de cadastro nem de valor: pare e chame o Pedro. Se for preciso, abra chamado na NSTech com o
   protocolo e o horário.
6. Para cancelar um CIOT emitido, use a ação "cancelar" com o motivo escrito (mínimo de 15 caracteres). O
   protocolo fica gravado.

---

**Aprovação do checklist:** ____________________ (Pedro) em ___/___/______
