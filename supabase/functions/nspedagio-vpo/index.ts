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
import { LIMITE_CHAMADA_MS, MOTIVO_CANCELAMENTO_EM_ANDAMENTO, MOTIVO_COMPRA_EM_ANDAMENTO, acaoPodeDemorar, conferirRecibo, decidirAntesDeComprar, ehTimeout, emProcessamento, type Andamento, type LinhaVpo, type Veredito } from "../_shared/vpoAndamento.ts";
import { chaveIdempotencia, criarNsPedagio, validarCompra, type AcaoVpo, type PedidoCompra, type PontoRota, type ProvedorNsPedagio, type ResultadoNs } from "../_shared/nspedagioClient.ts";
import { guardaFornecedor } from "../_shared/fornecedoresFiscais.ts";

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
  return criarNsPedagio({ baseUrl: baseUrl ?? "", authUrl: authUrl ?? "", clientId: clientId ?? "", clientSecret: clientSecret ?? "", cnpj: cnpj ?? "", compraLiberada: liberada === "sim", limiteMs: LIMITE_CHAMADA_MS });
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
async function numeroDaOperacao(operacaoId: string): Promise<{ numero: number; ehTeste: boolean; demo: boolean } | { erro: string }> {
  const { data: op, error } = await admin.from("operacoes").select("id, eh_teste, modo_demonstracao").eq("id", operacaoId).maybeSingle();
  if (error || !op) return { erro: "Operação não encontrada." };
  // numerar_operacao_vpo (supabase-migrations/20261029_02): devolve o número existente ou atribui o próximo.
  const { data: numero, error: e2 } = await admin.rpc("numerar_operacao_vpo", { p_operacao: operacaoId });
  if (e2 || !numero) return { erro: "Não consegui numerar a operação para o vale-pedágio." };
  return { numero: Number(numero), ehTeste: op.eh_teste === true, demo: op.eh_teste === true && op.modo_demonstracao === true };
}

const COLUNAS_LINHA = "id, acao, situacao, http_status, erro, criado_em, processando_desde";
async function linhasLentas(operacaoId: string): Promise<LinhaVpo[]> {
  const { data } = await admin.from("vpo_requisicoes").select(COLUNAS_LINHA).eq("operacao_id", operacaoId).in("acao", ["comprar", "cancelar", "trocar-placa"]);
  return (data ?? []) as LinhaVpo[];
}

// Grava no banco o desfecho de uma chamada que ficou em processamento (compra apareceu no recibo, ou cancelamento confirmado).
async function resolverLinha(linha: { id: string }, v: Veredito, operacaoId: string, simulado: boolean) {
  if (v.situacao === "concluida") {
    await admin.from("vpo_requisicoes").update({ response_json: v.bruto ?? null, http_status: 200, id_vpo_antt: v.dados.idVpoAntt, numero_viagem: v.dados.numeroViagem, id_recibo: v.dados.idRecibo, total_viagem: v.dados.totalViagem, erro: null, situacao: "concluida" }).eq("id", linha.id);
    if (!simulado && v.dados.idVpoAntt) {
      const campos = { vpo_idvpo: v.dados.idVpoAntt, vpo_valor: v.dados.totalViagem ?? null };
      const { data: existe } = await admin.from("operacao_ciot_vpo").select("id").eq("operacao_id", operacaoId).maybeSingle();
      if (existe) await admin.from("operacao_ciot_vpo").update(campos).eq("id", existe.id);
      else await admin.from("operacao_ciot_vpo").insert({ operacao_id: operacaoId, origem: "api", ...campos });
    }
  } else if (v.situacao === "cancelada") {
    await admin.from("vpo_requisicoes").update({ response_json: v.bruto ?? null, http_status: 200, erro: null, situacao: "concluida" }).eq("id", linha.id);
    // Cancelado de verdade: o ID do vale não pode continuar gravado na operação (o MDF-e leria um vale que não existe).
    if (!simulado) await admin.from("operacao_ciot_vpo").update({ vpo_idvpo: null, vpo_valor: null }).eq("operacao_id", operacaoId);
  }
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
    // Empresa que emite o vale desta operação: só a nstech (NSPEDAGIO) tem adaptador. Outra escolhida => erro claro, sem chamar ninguém.
    const forn = await guardaFornecedor(admin as unknown as Parameters<typeof guardaFornecedor>[0], operacaoId, "vpo", op.demo);
    if (!forn.ok) return json({ ok: false, erro: forn.erro }, 409);
    const prov = await provedor();
    // Trava da operação: o NSPEDAGIO real só atende operação de teste nesta fase.
    if (!prov.simulado && !op.ehTeste) return json({ ok: false, erro: "Nesta fase o vale-pedágio real só roda em operação de teste." }, 403);
    // Operação de demonstração: nunca cai no provedor SIMULADO. Sem as credenciais reais, a função avisa em vez de fingir.
    if (prov.simulado && op.demo) return json({ ok: false, erro: "O NSPEDAGIO de homologação não está configurado (credenciais ausentes no Vault). A demonstração não usa simulação." }, 503);
    const gravaMudanca = acao === "comprar" || acao === "cancelar" || acao === "trocar-placa";
    if (gravaMudanca && b.confirmar !== true) return json({ ok: false, erro: "Confirme a ação para continuar." }, 400);

    // Acompanhamento de compra/cancelamento que passou do limite: a tela chama {acao:"recibo", aguardando:"comprar"|"cancelar"}
    // a cada 15 s. Só lê o NSPEDAGIO (recibo) e fecha a linha pendente; não compra nem cancela nada.
    if (acao === "recibo" && (b.aguardando === "comprar" || b.aguardando === "cancelar")) {
      const esperando = b.aguardando as Andamento;
      const pendente = (await linhasLentas(operacaoId)).filter((l) => l.acao === esperando && emProcessamento(l)).sort((x, y) => y.criado_em.localeCompare(x.criado_em))[0];
      if (!pendente) return json({ ok: true, simulado: prov.simulado, ambiente: AMBIENTE, situacao: "nada_pendente" });
      const v = await conferirRecibo(prov, esperando, op.numero);
      await resolverLinha(pendente, v, operacaoId, prov.simulado);
      if (v.situacao === "concluida") return json({ ok: true, simulado: prov.simulado, ambiente: AMBIENTE, situacao: "concluida", dados: v.dados });
      if (v.situacao === "cancelada") return json({ ok: true, simulado: prov.simulado, ambiente: AMBIENTE, situacao: "cancelada" });
      return json({ ok: true, simulado: prov.simulado, ambiente: AMBIENTE, situacao: "aguardando", ...(v.situacao === "erro" ? { aviso: v.detalhe } : {}) });
    }

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
      // Nunca uma segunda compra enquanto houver compra/cancelamento em processamento. Primeiro olha o recibo: se a viagem
      // já existe, a compra anterior concluiu e nada é comprado de novo.
      const dec = decidirAntesDeComprar(await linhasLentas(operacaoId));
      if (dec.tipo === "conferir_recibo") {
        const esperando: Andamento = dec.linha.acao === "cancelar" ? "cancelar" : "comprar";
        const v = await conferirRecibo(prov, esperando, op.numero);
        await resolverLinha(dec.linha, v, operacaoId, prov.simulado);
        if (esperando === "comprar" && v.situacao === "concluida") return json({ ok: true, repetida: true, simulado: prov.simulado, ambiente: AMBIENTE, dados: v.dados });
        if (!(esperando === "cancelar" && v.situacao === "cancelada")) {
          return json({ ok: false, em_processamento: true, erro: esperando === "comprar" ? MOTIVO_COMPRA_EM_ANDAMENTO : MOTIVO_CANCELAMENTO_EM_ANDAMENTO }, 409);
        }
      }
      // Compra repetida com a mesma chave devolve o que já foi comprado, sem comprar de novo.
      const { data: ja } = await admin.from("vpo_requisicoes").select("id, response_json, http_status, id_vpo_antt, numero_viagem, id_recibo, total_viagem, erro").eq("idempotency_key", chave).maybeSingle();
      if (ja && ja.http_status && ja.http_status >= 200 && ja.http_status < 300 && !ja.erro) return json({ ok: true, repetida: true, simulado: prov.simulado, ambiente: AMBIENTE, resultado: ja });
      // Linha anterior sem sucesso (travou ou deu erro): a tentativa nova reaproveita a mesma linha em vez de bater na chave única.
      if (ja) reaproveitar = ja.id as string;
    } else {
      // Cancelar ou trocar placa também esperam: nada de mexer no vale enquanto outra operação dele ainda está em processamento.
      if (acao === "cancelar" || acao === "trocar-placa") {
        const pend = (await linhasLentas(operacaoId)).filter(emProcessamento);
        if (pend.length) return json({ ok: false, em_processamento: true, erro: pend[0].acao === "cancelar" ? MOTIVO_CANCELAMENTO_EM_ANDAMENTO : MOTIVO_COMPRA_EM_ANDAMENTO }, 409);
      }
      chave = `vpo:${operacaoId}:${acao}:${crypto.randomUUID()}`;
      if (acao === "simular") requisicao = { acao, operacao_id: operacaoId, pontos: b.pontos };
      if (acao === "consultar-tag") requisicao = { acao, operacao_id: operacaoId, placa: b.placa };
      if (acao === "cancelar") requisicao = { acao, operacao_id: operacaoId, motivo: b.motivo };
      if (acao === "trocar-placa") requisicao = { acao, operacao_id: operacaoId, placa: b.placa, motivo: b.motivo };
    }

    // 1) grava a linha ANTES de chamar e de interpretar a resposta
    const { data: linha, error: eIns } = reaproveitar
      ? await admin.from("vpo_requisicoes").update({ request_json: requisicao, response_json: null, http_status: null, erro: null, situacao: null, processando_desde: null, criado_por: quem.authUserId }).eq("id", reaproveitar).select("id").single()
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
      const demorou = ehTimeout(e);
      if (demorou && acaoPodeDemorar(acao)) {
        // Passou do limite: o NSPEDAGIO pode concluir depois (a compra de 11/11 levou ~3 min). Não é erro: fica "em processamento"
        // e a tela confere o recibo sozinha. Se o banco recusar (já há compra em processamento), nada é comprado de novo.
        const { error: eMarca } = await admin.from("vpo_requisicoes").update({ situacao: "em_processamento", processando_desde: new Date().toISOString(), erro: null }).eq("id", linha.id);
        if (eMarca) return json({ ok: false, em_processamento: true, erro: MOTIVO_COMPRA_EM_ANDAMENTO }, 409);
        return json({ ok: true, em_processamento: true, acao, simulado: prov.simulado, ambiente: AMBIENTE, limite_ms: LIMITE_CHAMADA_MS }, 202);
      }
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
