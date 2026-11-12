// Edge Function: repom-vpo  (verify_jwt = true; só gestor_rbr)  NÃO PUBLICADA: deploy só depois de revisão.
// Vale-pedágio Repom (API VPR v2.0, cliente 9501): TAG, prévia, emissão, cancelamento e consulta.
// Corpo: { acao: 'tag' | 'previa' | 'emitir' | 'cancelar' | 'consultar', operacao_id, placa?, pedido?, valor?, rota_descricao?,
//          confirmacao?: { nome, em, previa_hash }, usuario? }
// Travas (nascem DESLIGADAS): REPOM_API_LIBERADA = sim (senão 503); emissão exige confirmação humana (nome e hora) da prévia (400);
// valor acima de REPOM_VALOR_MAXIMO_OPERACAO (padrão 3000) = 422 sem chamar a Repom; limite diário global REPOM_LIMITE_DIARIO (padrão 100) = 429.
// Emissão: estado gravado ANTES ("enviado"); timeout/5xx NUNCA reenvia, confere antes; homologação (qa) nunca libera MDF-e em produção.
// Esta função NÃO substitui o nspedagio-vpo (a demonstração e o provedor padrão continuam nele).
import { servir } from "../_shared/repomEdge.ts";
import { criarRepomVprClient } from "../_shared/repomVprClient.ts";
import { fluxoVpo, type EntradaVpo } from "../_shared/repomFluxos.ts";

servir("vpo", async (corpo, ctx) => {
  const s = ctx.segredo;
  const vpr = criarRepomVprClient({
    ambiente: ctx.ambiente,
    roteirizacaoLogin: (await s("REPOM_VPR_ROTEIRIZACAO_LOGIN")) ?? "",
    roteirizacaoSenha: (await s("REPOM_VPR_ROTEIRIZACAO_SENHA")) ?? "",
    valePedagioLogin: (await s("REPOM_VPR_VALEPEDAGIO_LOGIN")) ?? "",
    valePedagioSenha: (await s("REPOM_VPR_VALEPEDAGIO_SENHA")) ?? "",
    verboConsultaVale: String((await s("REPOM_VPR_VERBO_CONSULTA")) ?? "").toUpperCase() === "POST" ? "POST" : "GET",
  });
  return fluxoVpo(corpo as unknown as EntradaVpo, vpr, ctx.deps);
});
