// Edge Function: emitir-mdfe (v5)
// Emite o MDF-e de uma operação via Focus NFe (POST /v2/mdfe, resposta assíncrona 202).
// Pré-requisito: CT-e já AUTORIZADO (status 'emitido' + chave). Lê os dados -> monta payload e bloqueios em
// mdfe.ts (testado em mdfe.test.ts) -> chama Focus -> grava em documentacao_operacao.
// v5 (2026-10-07): estrutura conferida com a doc de campos da Focus: dados do modal em `modal_rodoviario`, veículo de
// tração em campos *_veiculo, condutores e veiculos_reboque dentro do modal; reboques vêm de operacao_reboques
// (cavalo mecânico deixa de ser bloqueado quando há carreta vinculada); proprietário com IE e tipo PF/PJ.
// v4: busca de município tolerante a acento/caixa (RPC buscar_municipio) sobre a tabela IBGE completa.
// Modo `previa: true` devolve payload + bloqueios sem gravar nem chamar a Focus.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { montarMdfe, type VeiculoMdfe } from "./mdfe.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function buscarMunicipio(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  cidade: string | null,
  uf: string | null,
): Promise<{ codigo_ibge: string; cidade: string } | null> {
  if (!cidade || !uf) return null;
  const { data } = await supabaseAdmin.rpc("buscar_municipio", { p_cidade: cidade, p_uf: uf });
  return Array.isArray(data) && data.length ? data[0] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { operacao_id, previa } = await req.json();
    if (!operacao_id || typeof operacao_id !== "string") {
      return jsonResponse({ sucesso: false, erro: "Informe operacao_id." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ sucesso: false, erro: "Não autenticado" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: pessoaAtor } = await supabaseAdmin
      .from("pessoas")
      .select("papel")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode emitir MDF-e." }, 403);
    }

    const { data: op, error: opError } = await supabaseAdmin
      .from("v_checklist_prontidao")
      .select("*")
      .eq("operacao_id", operacao_id)
      .maybeSingle();

    if (opError || !op) {
      return jsonResponse({ sucesso: false, erro: "Operação não encontrada." }, 404);
    }

    const hoje = new Date().toISOString().slice(0, 10);

    const { data: cteDoc } = await supabaseAdmin
      .from("documentacao_operacao")
      .select("status, chave_acesso")
      .eq("operacao_id", operacao_id)
      .eq("tipo", "cte")
      .maybeSingle();

    const camposVeiculo =
      "placa, renavam, tara_kg, capacidade_carga, tipo_veiculo, tipo_carroceria, uf_licenciamento, titular_id, is_veiculo_proprio, quantidade_eixos";
    // deno-lint-ignore no-explicit-any
    async function carregarVeiculo(v: Record<string, any> | null): Promise<VeiculoMdfe | null> {
      if (!v) return null;
      let titular = null;
      if (!v.is_veiculo_proprio && v.titular_id) {
        const { data: t } = await supabaseAdmin
          .from("pessoas")
          .select("nome, cpf, cnpj, inscricao_estadual, uf, rntrc_numero")
          .eq("id", v.titular_id)
          .maybeSingle();
        titular = t;
      }
      return { ...v, titular } as VeiculoMdfe;
    }

    let tracao: VeiculoMdfe | null = null;
    if (op.veiculo_id) {
      const { data: v } = await supabaseAdmin.from("veiculos").select(camposVeiculo).eq("id", op.veiculo_id).maybeSingle();
      tracao = await carregarVeiculo(v);
    }
    const { data: vinculos } = await supabaseAdmin
      .from("operacao_reboques")
      .select("veiculo_id, ordem")
      .eq("operacao_id", operacao_id)
      .order("ordem");
    const reboques: VeiculoMdfe[] = [];
    for (const r of vinculos ?? []) {
      const { data: v } = await supabaseAdmin.from("veiculos").select(camposVeiculo).eq("id", r.veiculo_id).maybeSingle();
      const carregado = await carregarVeiculo(v);
      if (carregado) reboques.push(carregado);
    }

    let cot = null;
    if (op.cotacao_id) {
      const { data } = await supabaseAdmin
        .from("cotacoes")
        .select("peso_bruto_kg, tipo_carga, nf_produto_predominante, ncms_produtos, pedagio")
        .eq("id", op.cotacao_id)
        .maybeSingle();
      cot = data;
    }

    const { data: apolice } = await supabaseAdmin
      .from("apolices_seguro")
      .select("seguradora_nome, seguradora_cnpj, numero_apolice, responsavel_seguro")
      .eq("tipo", "RCTR-C")
      .lte("vigencia_inicio", hoje)
      .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
      .maybeSingle();

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select(
        "responsavel_tecnico_cnpj, responsavel_tecnico_contato, responsavel_tecnico_email, responsavel_tecnico_telefone, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cep, endereco_uf, endereco_codigo_municipio, rntrc, telefone_contato, email_contato",
      )
      .eq("id", op.parametros_fiscais_id)
      .maybeSingle();

    let municipioEmitente: string | null = null;
    if (pf?.endereco_codigo_municipio) {
      const { data: m } = await supabaseAdmin
        .from("municipios_ibge")
        .select("cidade")
        .eq("codigo_ibge", String(pf.endereco_codigo_municipio))
        .maybeSingle();
      municipioEmitente = m?.cidade ?? null;
    }

    let motorista = null;
    if (op.motorista_id) {
      const { data: m } = await supabaseAdmin
        .from("pessoas")
        .select("banco_codigo, banco_agencia, pix")
        .eq("id", op.motorista_id)
        .maybeSingle();
      motorista = m;
    }
    const { data: opRow } = await supabaseAdmin.from("operacoes").select("cliente_id").eq("id", operacao_id).maybeSingle();
    let cliente = null;
    if (opRow?.cliente_id) {
      const { data: c } = await supabaseAdmin.from("clientes").select("cnpj, cpf, razao_social").eq("id", opRow.cliente_id).maybeSingle();
      cliente = c;
    }

    const { data: ciotVpo } = await supabaseAdmin.from("operacao_ciot_vpo").select("*").eq("operacao_id", operacao_id).maybeSingle();
    const { data: cond } = await supabaseAdmin
      .from("condicoes_pagamento_operacao")
      .select("valor_total_contrato, valor_adiantamento, saldo_prazo_dias")
      .eq("operacao_id", operacao_id)
      .maybeSingle();

    const { ambiente, bloqueios, avisos, payload } = montarMdfe({
      op,
      pf,
      municipioEmitente,
      cte: cteDoc ?? null,
      tracao,
      reboques,
      carregamento: await buscarMunicipio(supabaseAdmin, op.cidade_origem, op.uf_origem),
      descarregamento: await buscarMunicipio(supabaseAdmin, op.cidade_destino, op.uf_destino),
      cotacao: {
        peso_bruto_kg: cot?.peso_bruto_kg != null ? Number(cot.peso_bruto_kg) : null,
        tipo_carga: cot?.tipo_carga ?? null,
        produto: cot?.nf_produto_predominante ?? null,
        ncm: Array.isArray(cot?.ncms_produtos) && cot.ncms_produtos.length ? String(cot.ncms_produtos[0]) : (op.ncm ?? null),
        pedagio: Number(cot?.pedagio ?? 0),
      },
      apolice,
      motorista,
      cliente,
      ciotVpo,
      condicao: cond
        ? {
          valor_total_contrato: cond.valor_total_contrato != null ? Number(cond.valor_total_contrato) : null,
          valor_adiantamento: cond.valor_adiantamento != null ? Number(cond.valor_adiantamento) : null,
          saldo_prazo_dias: cond.saldo_prazo_dias != null ? Number(cond.saldo_prazo_dias) : null,
        }
        : null,
      agora: new Date(),
    });

    const ref = `rbr-mdfe-${operacao_id}`;

    if (previa === true) {
      return jsonResponse({
        sucesso: true,
        previa: true,
        ambiente,
        bloqueios,
        avisos,
        payload,
      });
    }

    if (bloqueios.length > 0) {
      const mensagem = bloqueios.join(" ");
      await supabaseAdmin.from("documentacao_operacao").upsert(
        {
          operacao_id,
          tipo: "mdfe",
          status: "bloqueado",
          mensagem_erro: mensagem,
          ambiente,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, avisos, erro: mensagem }, 422);
    }

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: ambiente,
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    }

    const baseUrl =
      ambiente === "producao"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";

    const focusResp = await fetch(`${baseUrl}/v2/mdfe?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${token}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const focusJson = await focusResp.json().catch(() => null);

    if (focusResp.status !== 202 && !focusResp.ok) {
      const mensagemErro = focusJson?.mensagem
        ? `Focus NFe recusou: ${focusJson.mensagem}${focusJson.codigo ? ` (código ${focusJson.codigo})` : ""}`
        : `Focus NFe respondeu ${focusResp.status}.`;

      await supabaseAdmin.from("documentacao_operacao").upsert(
        {
          operacao_id,
          tipo: "mdfe",
          status: "erro",
          referencia: ref,
          ambiente,
          mensagem_erro: mensagemErro,
          payload_enviado: payload,
          payload_resposta: focusJson,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({ sucesso: false, erro: mensagemErro, detalhe: focusJson }, 502);
    }

    await supabaseAdmin.from("documentacao_operacao").upsert(
      {
        operacao_id,
        tipo: "mdfe",
        status: "pendente",
        referencia: ref,
        ambiente,
        mensagem_erro: null,
        payload_enviado: payload,
        payload_resposta: focusJson,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "operacao_id,tipo" },
    );

    return jsonResponse({
      sucesso: true,
      status: "processando_autorizacao",
      referencia: ref,
      aviso:
        ambiente === "homologacao"
          ? "Ambiente de homologação — este MDF-e NÃO tem validade fiscal."
          : undefined,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
