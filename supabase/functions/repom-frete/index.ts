// Edge Function: repom-frete  (verify_jwt = true; só gestor_rbr)  NÃO PUBLICADA: deploy só depois de revisão.
// Repom Frete (guia 3.0, cliente 9520): cadastros (contratado, motorista, veículo), validações, prévia e emissão de contrato/CIOT,
// consulta, cancelamento, interrupção, CIOT TAC-Agregado, autorização de pagamento e quitação. Saldo do cliente: acao 'consultar_saldo' { dados: { inicio, fim } } (caminho informado pela Repom fora do guia; resposta devolvida como veio, D-F15).
// Corpo: { acao, operacao_id?, contrato?, valor?, confirmacao?: { nome, em, previa_hash }, recurso?, metodo?, chave?, corpo?, dados? } (ver repomFluxos.ts).
// Travas (nascem DESLIGADAS): REPOM_API_LIBERADA = sim (503); emissão e pagamento exigem confirmação humana da prévia (400);
// valor acima de REPOM_VALOR_MAXIMO_OPERACAO (padrão 3000) = 422 sem chamar a Repom; limite diário global REPOM_LIMITE_DIARIO = 429.
// Contrato é assíncrono: fica "enviado" até a consulta confirmar; timeout/5xx NUNCA reenvia, confere por Identifier/OperationKey antes.
// Esta função NÃO substitui a efrete (CIOT continua pela efrete; a Repom entra como fornecedor selecionável).
// Segredos (Vault, cadastrados pelo Pedro no painel; nunca no chat): REPOM_FRETE_USER, REPOM_FRETE_VERSION (opcional), REPOM_FRETE_TOKEN_FORMATO (form|form_pascal|json), REPOM_FRETE_PASSWORD,
// REPOM_FRETE_PARTNER (CNPJ), REPOM_FRETE_URL_TOKEN, REPOM_FRETE_URL_BASE (obrigatória em prd; em qa tem padrão).
import { servir } from "../_shared/repomEdge.ts";
import { criarRepomFreteClient, lerFormatoToken } from "../_shared/repomFreteClient.ts";
import { fluxoFrete, type EntradaFrete } from "../_shared/repomFluxos.ts";

servir("frete", async (corpo, ctx) => {
  const s = ctx.segredo;
  const frete = criarRepomFreteClient({
    ambiente: ctx.ambiente,
    credenciais: {
      user: (await s("REPOM_FRETE_USER")) ?? "",
      version: (await s("REPOM_FRETE_VERSION")) ?? "",
      password: (await s("REPOM_FRETE_PASSWORD")) ?? "",
      partner: (await s("REPOM_FRETE_PARTNER")) ?? "",
    },
    urlToken: (await s("REPOM_FRETE_URL_TOKEN")) ?? undefined,
    tokenFormato: lerFormatoToken(await s("REPOM_FRETE_TOKEN_FORMATO")), // form (padrão) | form_pascal | json
    urlBase: (await s("REPOM_FRETE_URL_BASE")) ?? undefined,
  });
  return fluxoFrete(corpo as unknown as EntradaFrete, frete, ctx.deps);
});
