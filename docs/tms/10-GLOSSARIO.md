# 10 · Glossário

| Termo | Significado no sistema |
|---|---|
| CT-e | Conhecimento de Transporte eletrônico; emitido por `emitir-cte` na Focus |
| MDF-e | Manifesto Eletrônico de Documentos Fiscais; emitido/encerrado por `emitir-mdfe`; exige CIOT em produção desde 23/11/2026 |
| CIOT | Código Identificador da Operação de Transporte (12 dígitos) do TAC/parceiro; emitido pela efrete/NSTech |
| VPO / IDVPO | Vale-Pedágio Obrigatório e seu identificador (`vpo_idvpo`); comprado via NSPEDAGIO ou Repom |
| VPR | Vale-pedágio da Repom (nome usado no PR #58) |
| RNTRC | Registro Nacional de Transportadores Rodoviários de Cargas (ANTT); do titular e do veículo |
| TAC | Transportador Autônomo de Cargas |
| ETC | Empresa de Transporte de Cargas (categoria RNTRC da RBR) |
| Piso ANTT | Frete mínimo por tabela, tipo de carga, eixos e distância: `cc_fixo + ccd_por_km × km` |
| Averbação | Declaração do embarque à seguradora (RCTR-C do CT-e; RC-V) via AT&M/NSTech Averba |
| RCTR-C / RC-V / RC-DC | Seguros de carga e responsabilidade civil (ramos 54/55 no cadastro Allianz) |
| GR | Gerenciamento de risco (pesquisa do motorista); opcional no sistema |
| ATM / Wialon | Averbação AT&M; rastreamento Wialon quando a seguradora exige |
| AET | Autorização Especial de Trânsito (DNIT/SIAET), carga superdimensionada; pedido manual, até 45 dias |
| Focus / efrete / NSPEDAGIO / Repom | Fornecedores de emissão fiscal, CIOT, vale-pedágio e roteirização |
| Titular / condutor | Dono da frota e quem dirige; MDF-e usa o condutor, pagamento vai ao titular |
| Agenciador | Parceiro que traz carga e ganha comissão/spread |
| Esteira | Sequência de passos da operação, do pedido à finalização (03) |
| Status | Estado da operação (`status_operacao`) ou do documento (`documentacao_operacao.status`) |
| Pré-voo | Checagem antes de liberar (`checar_pre_voo`): documentos, alocação, piso |
| Liberação com ressalva | Liberar com documento não conferido, com motivo e auditoria; nunca com documento inexistente |
| Bloqueio fiscal | `operacoes.bloqueio_fiscal`; impede liberar para coleta |
| Disjuntor fiscal | Pausa a emissão quando há achado grave de segregação |
| Modo teste (`eh_teste`) | Operação que emite de verdade na SEFAZ, com a RBR como todas as partes e NF até R$ 5 |
| Modo demonstração (`modo_demonstracao`) | Operação só de tela, sem chamada a fornecedor, para treinar e apresentar |
| Operação DEMO | Operação criada para treinamento (migração `demo-nstech-operacao`) |
| Spread | Diferença do frete repassada ao agenciador, líquida da taxa de tecnologia |
| Giro | Custo financeiro de adiantar o frete (desligado) |
| Proposta pública | Link `/p/<código>` de aceite sem login |
| Central de integrações | Tela só-leitura do dono (PR #67), atrás de flag |
