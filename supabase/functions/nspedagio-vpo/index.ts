// Edge Function: nspedagio-vpo  (verify_jwt = true)  NÃO PUBLICADA: deploy só com o ok do dono.
//
// Vale-pedágio (VPO) pelo NSPEDAGIO, ligado à operação. Só gestor RBR. Ambiente fixo: homologação.
// Ações: {acao, operacao_id, ...}
//   simular {pontos}  | consultar-tag {placa} | comprar {pedido, confirmar:true} | cancelar {motivo, confirmar:true}
//   recibo | trocar-placa {placa, motivo, confirmar:true} | status
// Sem as credenciais NSPEDAGIO_* no Vault, usa o provedor SIMULADO ("SIMULADO, não é real"), que não chama a rede.
// Comprar, cancelar e trocar placa exigem confirmar:true E a trava de compra liberada no Vault (NSPEDAGIO_COMPRA_LIBERADA = 'sim').
// Só operação marcada como teste (eh_teste) chama o NSPEDAGIO real. Toda chamada é gravada em vpo_requisicoes ANTES de
// a resposta ser interpretada (sem segredo e sem token no registro).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { chaveIdempotencia, criarNsPedagio, validarCompra, type AcaoVpo, type PedidoCompra, type PontoRota, type ProvedorNsPedagio, type ResultadoNs } from "../_shared/nspedagioClient.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nspedagio-chave-interna",
};
const AMBIENTE = "homologacao" as const;

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const segredo = async (nome: string): Promise<string | null> => {
  const { data, error } = await admin.rpc("nspedagio_segredo", { p_nome: nome });
  if (error) throw new Error(`Não consegui ler a configuração do vale-pedágio: ${error.message}`);
  return (data as string | null) ?? null;
};

async function provedor(): Promise<ProvedorNsPedagio> {
  const [baseUrl, authUrl, clientId, clientSecret, cnpj, liberada] = await Promise.all([
    segredo("NSPEDAGIO_BASE_URL"),
    segredo("NSPEDAGIO_AUTH_URL"),
    segredo("NSPEDAGIO_CLIENT_ID"),
    segredo("NSPEDAGIO_CLIENT_SECRET"),
    segredo("NSPEDAGIO_CNPJ"),
    segredo("NSPEDAGIO_COMPRA_LIBERADA"),
  ]);
  return criarNsPedagio({ baseUrl: baseUrl ?? "", authUrl: authUrl ?? "", clientId: clientId ?? "", clientSecret: clientSecret ?? "", cnpj: cnpj ?? "", compraLiberada: liberada === "sim" });
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Quem chama: gestor RBR logado, ou o banco/teste com a chave interna (NSPEDAGIO_TESTE_CHAMADA_INTERNA no Vault).
async function gestor(req: Request): Promise<{ ok: true; authUserId: string | null } | { ok: false; status: number; erro: string }> {
  const interna = req.headers.get("x-nspedagio-chave-interna") ?? "";
  if (interna) {
    const esperada = (await segredo("NSPEDAGIO_TESTE_CHAMADA_INTERNA")) ?? "";
    return iguais(interna, esperada) ? { ok: true, authUserId: null } : { ok: false, status: 403, erro: "Chave interna inválida." };
  }
  const auth = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return { ok: false, status: 401, erro: "Não autenticado." };
  const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
  if (p?.papel !== "gestor_rbr") return { ok: false, status: 403, erro: "Só um gestor RBR usa o vale-pedágio." };
  return { ok: true, authUserId: data.user.id };
}

// Número numérico e único da operação (idDocumentoTransporte). Operações antigas ficam sem número até a primeira vez.
async function numeroDaOperacao(operacaoId: string): Promise<{ numero: number; ehTeste: boolean } | { erro: string }> {
  const { data: op, error } = await admin.from("operacoes").select("id, eh_teste").eq("id", operacaoId).maybeSingle();
  if (error || !op) return { erro: "Operação não encontrada." };
  // numerar_operacao_vpo (supabase-migrations/20261029_02): devolve o número existente ou atribui o próximo.
  const { data: numero, error: e2 } = await admin.rpc("numerar_operacao_vpo", { p_operacao: operacaoId });
  if (e2 || !numero) return { erro: "Não consegui numerar a operação para o vale-pedágio." };
  return { numero: Number(numero), ehTeste: op.eh_teste === true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const quem = await gestor(req);
    if (!quem.ok) return json({ ok: false, erro: quem.erro }, quem.status);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(b.acao ?? "") as AcaoVpo;
    const operacaoId = String(b.operacao_id ?? "");
    if (!["simular", "consultar-tag", "comprar", "cancelar", "recibo", "trocar-placa", "status"].includes(acao)) return json({ ok: false, erro: "Ação desconhecida." }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(operacaoId)) return json({ ok: false, erro: "Informe a operação." }, 400);

    const op = await numeroDaOperacao(operacaoId);
    if ("erro" in op) return json({ ok: false, erro: op.erro }, 404);
    const prov = await provedor();
    // Trava da operação: o NSPEDAGIO real só atende operação de teste nesta fase.
    if (!prov.simulado && !op.ehTeste) return json({ ok: false, erro: "Nesta fase o vale-pedágio real só roda em operação de teste." }, 403);
    const gravaMudanca = acao === "comprar" || acao === "cancelar" || acao === "trocar-placa";
    if (gravaMudanca && b.confirmar !== true) return json({ ok: false, erro: "Confirme a ação para continuar." }, 400);

    let chave = "";
    let reaproveitar: string | null = null;
    let pedidoCompra: PedidoCompra | null = null;
    let requisicao: unknown = { acao, operacao_id: operacaoId };
    if (acao === "comprar") {
      const pedido = b.pedido as Omit<PedidoCompra, "idDocumentoTransporte"> | undefined;
      if (!pedido) return json({ ok: false, erro: "Faltam os dados da compra." }, 400);
      pedidoCompra = { ...pedido, idDocumentoTransporte: op.numero };
      const tag = await prov.consultarTag(pedidoCompra.placa);
      const ativa = tag.ok && tag.dados.some((m) => m.ativo);
      const invalido = validarCompra(pedidoCompra, ativa);
      if (invalido) return json({ ok: false, erro: invalido }, 422);
      chave = chaveIdempotencia(operacaoId, pedidoCompra.placa, pedidoCompra.inicioVigencia);
      requisicao = { acao, operacao_id: operacaoId, pedido: pedidoCompra };
      // Compra repetida com a mesma chave devolve o que já foi comprado, sem comprar de novo.
      const { data: ja } = await admin.from("vpo_requisicoes").select("id, response_json, http_status, id_vpo_antt, numero_viagem, id_recibo, total_viagem, erro").eq("idempotency_key", chave).maybeSingle();
      if (ja && ja.http_status && ja.http_status >= 200 && ja.http_status < 300 && !ja.erro) return json({ ok: true, repetida: true, simulado: prov.simulado, ambiente: AMBIENTE, resultado: ja });
      // Linha anterior sem sucesso (travou ou deu erro): a tentativa nova reaproveita a mesma linha em vez de bater na chave única.
      if (ja) reaproveitar = ja.id as string;
    } else {
      chave = `vpo:${operacaoId}:${acao}:${crypto.randomUUID()}`;
      if (acao === "simular") requisicao = { acao, operacao_id: operacaoId, pontos: b.pontos };
      if (acao === "consultar-tag") requisicao = { acao, operacao_id: operacaoId, placa: b.placa };
      if (acao === "cancelar") requisicao = { acao, operacao_id: operacaoId, motivo: b.motivo };
      if (acao === "trocar-placa") requisicao = { acao, operacao_id: operacaoId, placa: b.placa, motivo: b.motivo };
    }

    // 1) grava a linha ANTES de chamar e de interpretar a resposta
    const { data: linha, error: eIns } = reaproveitar
      ? await admin.from("vpo_requisicoes").update({ request_json: requisicao, response_json: null, http_status: null, erro: null, criado_por: quem.authUserId }).eq("id", reaproveitar).select("id").single()
      : await admin
          .from("vpo_requisicoes")
          .insert({ operacao_id: operacaoId, acao, ambiente: AMBIENTE, idempotency_key: chave, request_json: requisicao, criado_por: quem.authUserId })
          .select("id")
          .single();
    if (eIns || !linha) return json({ ok: false, erro: "Não consegui registrar a chamada. Nada foi enviado ao NSPEDAGIO." }, 500);

    // 2) chama o provedor
    let r: ResultadoNs<unknown>;
    try {
      if (acao === "simular") r = await prov.simular({ pontos: (b.pontos ?? []) as PontoRota[] });
      else if (acao === "consultar-tag") r = await prov.consultarTag(String(b.placa ?? ""));
      else if (acao === "comprar") r = await prov.comprar(pedidoCompra!);
      else if (acao === "cancelar") r = await prov.cancelar(op.numero, String(b.motivo ?? ""));
      else if (acao === "trocar-placa") r = await prov.trocarPlaca(op.numero, String(b.placa ?? ""), String(b.motivo ?? ""));
      else r = await prov.recibo(op.numero); // recibo e status
    } catch (e) {
      const demorou = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      const erro = demorou ? "O NSPEDAGIO não respondeu a tempo. Confira com Reemitir recibo se a viagem foi criada antes de tentar de novo." : e instanceof Error ? e.message : "Falha ao falar com o NSPEDAGIO.";
      await admin.from("vpo_requisicoes").update({ erro }).eq("id", linha.id);
      return json({ ok: false, erro }, 502);
    }

    // 3) atualiza a linha com o que veio
    const compra = r.ok && typeof r.dados === "object" && r.dados && "idVpoAntt" in (r.dados as object) ? (r.dados as { idVpoAntt: string | null; numeroViagem: string | null; idRecibo: string | null; totalViagem: number | null }) : null;
    await admin
      .from("vpo_requisicoes")
      .update({
        response_json: r.bruto ?? null,
        http_status: r.http || null,
        id_vpo_antt: compra?.idVpoAntt ?? null,
        numero_viagem: compra?.numeroViagem ?? null,
        id_recibo: compra?.idRecibo ?? null,
        total_viagem: compra?.totalViagem ?? null,
        erro: r.ok ? null : r.erro,
      })
      .eq("id", linha.id);

    // B04: o ID do vale (idVpoAntt) vai para operacao_ciot_vpo, de onde o emitir-mdfe lê o IDVPO (origem 'api').
    // Só compra real; o CNPJ da fornecedora não vem na resposta e continua a ser preenchido à parte.
    if (!prov.simulado) {
      // A compra pode estourar o limite de 60 s e concluir depois no NSPEDAGIO: o recibo (viagem existente) grava o mesmo ID.
      if ((acao === "comprar" || acao === "recibo" || acao === "status") && compra?.idVpoAntt) {
        const campos = { vpo_idvpo: compra.idVpoAntt, vpo_valor: compra.totalViagem ?? null };
        const { data: existe } = await admin.from("operacao_ciot_vpo").select("id").eq("operacao_id", operacaoId).maybeSingle();
        if (existe) await admin.from("operacao_ciot_vpo").update(campos).eq("id", existe.id);
        else await admin.from("operacao_ciot_vpo").insert({ operacao_id: operacaoId, origem: "api", ...campos });
      } else if (acao === "cancelar" && r.ok) {
        await admin.from("operacao_ciot_vpo").update({ vpo_idvpo: null, vpo_valor: null }).eq("operacao_id", operacaoId);
      }
    }

    return json({ ok: r.ok, simulado: prov.simulado, ambiente: AMBIENTE, ...(r.ok ? { dados: r.dados } : { erro: r.erro }) }, r.ok ? 200 : r.http >= 400 && r.http < 600 ? 502 : 422);
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
