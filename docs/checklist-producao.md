# Checklist de produção da efrete (NSTech)

Nada aqui foi feito. É a lista do que falta antes do primeiro CIOT real. Complementa `docs/checklist-primeira-operacao-real.md` (o passo a passo do dia).
Legenda: **[NSTech]** depende de resposta da NSTech · **[Pedro]** depende de você.

## Conta e credenciais
- [ ] **[NSTech]** Conta de produção da RBR na efrete: Client ID e Client Secret de produção (hoje só há os de homologação).
- [ ] **[NSTech]** URL base de produção da API (hoje `EFRETE_BASE_URL` aponta para `dev.efrete.com.br`).
- [ ] **[NSTech]** Confirmar se a produção usa o mesmo formato de login (usuário/CNPJ, verbo POST) da homologação.
- [ ] **[NSTech]** Charset do REST: nomes com acento voltam como "??" em homologação? (teste de acentos pendente; ver `docs/efrete-passo4-testes.md`, seção 1).
- [ ] **[Pedro]** Guardar as credenciais de produção só no Vault do Supabase (nunca no repositório, em PR ou em log).

## Rede
- [ ] **[NSTech]** A produção exige IP fixo (liberação por IP) ou certificado? Hoje a chamada sai pelo proxy da Vercel (IP variável).
- [ ] **[Pedro]** Se exigir IP fixo: servidor pequeno em SP com IP fixo, passando as chamadas à efrete (decidir fornecedor e custo).
- [ ] **[Pedro]** Se exigir certificado: onde guardar e quem renova.

## Troca de ambiente (um dia só, em ordem)
- [ ] **[Pedro]** Trocar `EFRETE_BASE_URL` e as chaves no Vault para produção.
- [ ] **[Pedro]** Remover a trava "só homologação" de `efrete-ciot-operacao`, `efrete-ciot-teste` e `efrete-homologacao-teste` (hoje recusam URL que não seja homologação) em PR próprio, com revisão.
- [ ] **[Pedro]** Remover a chave interna de teste (`EFRETE_TESTE_CHAMADA_INTERNA`) do Vault e as ações de teste (`efrete-ciot-teste`, `efrete-homologacao-teste`).
- [ ] **[Pedro]** Revisar a trava de operação de teste (`travaEfreteOperacao`): em produção ela não age; confirmar com teste.
- [ ] **[Pedro]** `ciot_ambiente`: CIOT de homologação nunca libera MDF-e em produção (já está em `mdfe.ts`); conferir com 1 caso.
- [ ] **[Pedro]** Ligar `VITE_EFRETE_CIOT_HABILITADO=true` na produção do gestor só depois dos itens acima.
- [ ] **[Pedro]** Publicar as funções do Supabase (deploy) depois do merge dos PRs.

## Antes do piloto
- [ ] **[NSTech]** Regras de cancelamento e encerramento em produção (prazos). O combinado hoje: cancelar até 24 h antes do início e encerrar em até 5 dias. Confirmar na documentação deles; a tela ainda não impõe o prazo.
- [ ] **[NSTech]** Como o Pix da efrete é liberado (data/hora, limite, estorno) e quem recebe o webhook, se houver.
- [ ] **[Pedro]** Cadastros reais completos: titular com RNTRC ativo, motorista com CNH e Pix, veículos aprovados (hoje os de teste estão "aguardando documentos").
- [ ] **[Pedro]** Piso ANTT: coeficientes vigentes carregados (`piso_antt_coeficientes`) para as tabelas A a D que a RBR usa.
- [ ] **[Pedro]** Vale-pedágio (IDVPO) continua manual: conferir que a rota com pedágio tem o IDVPO digitado antes do MDF-e.

## Piloto
- [ ] **[Pedro]** Uma operação real, com valor baixo, com alguém da RBR acompanhando: emitir, consultar, baixar o PDF. Cancelamento só se necessário.
- [ ] **[Pedro]** Conferir o CIOT no portal da efrete e na ANTT antes de liberar a saída.
- [ ] **[Pedro]** Plano de volta: se a efrete cair, o CIOT manual (Repom) continua valendo e o caminho não foi removido.
