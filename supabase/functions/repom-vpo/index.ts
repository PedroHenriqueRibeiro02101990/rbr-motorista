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
import { efeitoEmOperacaoCiotVpo, fluxoVpo, type EntradaVpo } from "../_shared/repomFluxos.ts";
import { admin } from "../_shared/repomEdge.ts";

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
  const entrada = corpo as unknown as EntradaVpo;
  const saida = await fluxoVpo(entrada, vpr, ctx.deps);
  // O IDVPO e o valor do vale vêm SÓ da conta 9501 (aqui) e vão para operacao_ciot_vpo (origem: api); o CIOT do Frete (9520) apenas referencia o número.
  // Só em produção: o vale de QA nunca vira dado da operação (o MDF-e leria um vale que não vale).
  const efeito = ctx.ambiente === "prd" && entrada.operacao_id ? efeitoEmOperacaoCiotVpo(entrada.acao, saida) : null;
  if (efeito) {
    const campos = "gravar" in efeito ? efeito.gravar : { vpo_idvpo: null, vpo_valor: null };
    const { data: existe } = await admin.from("operacao_ciot_vpo").select("id").eq("operacao_id", entrada.operacao_id!).maybeSingle();
    if (existe) await admin.from("operacao_ciot_vpo").update(campos).eq("id", existe.id);
    else if ("gravar" in efeito) await admin.from("operacao_ciot_vpo").insert({ operacao_id: entrada.operacao_id!, origem: "api", ...campos });
  }
  return saida;
});
