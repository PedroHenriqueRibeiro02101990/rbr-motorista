# Relatório da atualização de 03/11/2026

Branch: `feat/atualizacao-2026-11-03` (criada em cima da `feat/front-aprovado`, com os 8 commits locais que já existiam).
Regra do dia: o Pedro emite documentos fiscais reais, então nada foi enviado, publicado ou aplicado. Tudo está em commits locais.

## Números
- Pushes: 0. Merges: 0. Deploys da Vercel: 0 (nada foi enviado).
- Funções publicadas no Supabase: 0. Migrações aplicadas: 0. Migrações aguardando o Pedro: nenhuma escrita ainda (B4 e B12 ficaram para depois).
- Registros criados em produção nesta etapa: nenhum. Nenhuma operação, cotação, cliente, motorista, veículo ou documento fiscal foi lido, alterado ou emitido. Só li o código publicado das funções (leitura).
- Testes: 179 passando (128 do gestor e 51 das funções), build e lint sem erros.

## Concluído
- A2. Repositório igual ao publicado, com diff conferido:
  - `emitir-cte` v22 para v24: CFOP 5932/6932 quando a prestação começa fora da UF da RBR (SP). Primeiro dígito: mesma UF = 5, UFs diferentes = 6. O CFOP da NF-e não define o do CT-e.
  - `emitir-mdfe` v21 para v26: UFs de percurso (`percursos[].uf_percurso`, caminho mais curto entre UFs limítrofes ou o `percurso_ufs` do VPO), pagamento só com o frete (o VPO sai do contrato e continua no grupo de vale-pedágio) e telefone do responsável técnico.
  - A versão publicada do `emitir-mdfe` ainda tem 3 textos antigos ("Repom"). O repositório mantém os textos novos (efrete e NSPEDÁGIO). Quando alguém publicar o repositório, só esses 3 textos mudam; a lógica é a mesma da v26.
  - O caminho no repositório é `supabase/functions/` (a pasta `supabase-functions/` do pedido foi movida antes, no PR #41).
- A3. Testes novos: CFOP (mesma UF, UFs diferentes, saída fora de SP), `ufsPercurso` (adjacentes = vazio; DF para SP = GO ou MG; percurso informado válido e inválido), pagamento com e sem VPO (parcelas + adiantamento = contrato; VPO fora dos componentes) e CIOT de 12 dígitos no MDF-e.
  - Observação: DF para SP com percurso `["GO"]` não é cadeia válida (GO não faz divisa com SP); cai em MG. `["GO","MG"]` é válido.
- A4. Evento "incluir condutor no MDF-e": regras extraídas para `eventos-fiscais/condutor.ts` (mesma regra de antes) e cobertas por teste.
- B1 (parcial). Aviso de sucesso ou erro, em português e sem código cru, ao cancelar MDF-e/CT-e, enviar carta de correção, incluir condutor e cancelar documento. O pop-up de condutor agora confirma o resultado.
- B2 (parcial). Título dos pop-ups de evento e de cancelamento mostra "OP-xxxx - Cliente - Origem/UF > Destino/UF".

## Parcial
- A1. Cotação por dentro: a moldura já é página (commit `718881d`), mas os cartões Cliente e carga, Rota e Prazo continuam sendo o formulário antigo. Não converti nesta etapa para não arriscar a gravação.
- B1/B2. Faltam o aviso e o título nos botões de emitir e encerrar (ficam em `OperacaoFluxo` e `ConferenciaEmissaoModal`, que lidam com a emissão real; deixei para uma rodada com revisão).

## Não feito (sem alteração)
B3 (Fiscal uma operação por vez), B4 (condutor e titular separados), B5 (cliente a partir da NF-e), B6 (peso, NCM, valor repetidos e alertas de divergência), B7 (pacote de dados da Repom), B8 (upload de PDF de VPO/CIOT), B9 (pacote do motorista), B10 (alertas antes de alocar), B11 (fila do dia com responsável), B12 (locais de entrega por cliente), B13 (perfis para Eduardo e José).

## Aguardando o Pedro
1. Liberar o push, o merge e a publicação de funções. Como ele emite hoje, a sugestão é fazer isso fora do horário de emissão, com o rollback pronto (produção atual `dpl_CtPQ5CNwwPTuL2KcUSEuiHAYgYDW`; anterior `dpl_FrtnbBDhFG4hN4kt14jMitq58fRq`).
2. B4 exige migração aditiva (colunas anuláveis `condutor_id` e `titular_id`) e mudança no `emitir-mdfe`, que emite documento real. Só com autorização e fora do horário de emissão.
3. B13: a fundação de papéis (A01 e A02) ainda não existe, então só a lista do que falta: perfis de emissão para Eduardo e José, com RLS própria, ainda a criar.
4. Conta de teste `teste.gestor@rbrcargo.invalid` criada antes (para apagar com a ordem do Pedro).
