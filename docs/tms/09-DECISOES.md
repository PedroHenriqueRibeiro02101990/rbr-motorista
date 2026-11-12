# 09 · Registro de decisões

Fonte: commits em `origin/main`, `docs/` e comentários do banco. Data = data do commit/documento.

| Data | Decisão | Motivo | Evidência |
|---|---|---|---|
| 2026-09-18 | Margem de cotação entre 26% e 40%, validada em trigger e não em CHECK | Limites vêm de `parametros_sistema` | comentário de `cotacoes` |
| 2026-09-18 | Desativar veículo/bloquear acesso nunca interrompe operação em andamento | Regra corrigida na simulação (itens 24/25/27) | comentários de `veiculos`, `bloqueios_acesso_veiculo`, `posicoes_gps` |
| 2026-09-18 | Radar regulatório revisita cada tema a cada 30 dias | Combinado com o Pedro | comentário de `radar_regulatorio_temas` |
| 2026-10-15 | Só bloqueia o que é regra da SEFAZ, ANTT ou lei; regra interna da RBR só avisa | Evitar travar operação por política interna | `supabase/functions/regras-fiscais.md` |
| 2026-10-15 | Modo teste: partes = RBR, NF até R$ 5, GR/CIOT/VPO/ATM dispensados | Testar emissão real sem risco | `supabase/migrations/20261014_01_modo_teste.sql` |
| 2026-10-16 | Documento emitido (pelo sistema ou gestor) conta como cumprido na liberação | Evitar bloqueio duplicado | `20261016_04_liberacao_considera_emitidos`, trigger de transição |
| 2026-10-16 | Segunda integração de averbação (caixa Allianz, RCTR-C) | Seguradoras distintas | `averbacao_integracao_allianz.sql` |
| 2026-10-24 | CIOT pela efrete atrás de flag, só homologação | Conta de produção ainda não existe | `docs/checklist-producao.md`, `efreteFlags.ts` |
| 2026-10-29 | NSPEDAGIO como provedor de VPO, só homologação | Integração em avaliação | migração `nspedagio_base`, `nspedagioClient.ts` |
| 2026-10-30 | Link público de aceite de proposta, 32 hex, só gestor gera | Cliente sem conta | `20261030_07_link_proposta.sql` |
| 2026-11-02 | Front aprovado com elementos "ainda não disponível" em vez de dado falso | Honestidade de tela | `PENDENCIAS-PEDRO.md` |
| 2026-11-03 | Condutor e titular separados na operação (MDF-e usa condutor, pagamento vai ao titular) | Exigência do MDF-e | commit "feat(mdfe): condutor e titular separados (B4)" |
| 2026-11-06 | Repom (roteirização e VPR) atrás de flag, em QA | Contrato/ambiente pendente | PR #58, `RELATORIO-REPOM-2026-11-06.md` |
| 2026-11-11 | Modo demonstração independente do ambiente fiscal global | Demo não pode depender de produção | PR #61 |
| 2026-11-11 | Pedágio do CIOT usa o valor real do vale comprado (`vpo_valor`), com aviso de divergência | Declarar valor correto ao ANTT | PR #64 |
| 2026-11-11 | Recibo do VPO devolvido em PDF sem gravar no banco | Reduzir dado guardado | PR #63 |
| 2026-11-12 | Central de integrações atrás de flag, porque não há papel "dono" | Segregar visão do Pedro | PR #67 |
| 2026-11-12 | Painel do embarcador só em desenho até decisão de segurança do Pedro | Risco de login externo | PR #68 |
