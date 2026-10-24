// Edge Function: emitir-mdfe (v21)
// v21 (2026-10-24, passo 4): com NF-e do cliente na operacao (operacao_nfes), peso bruto, NCM e valor da carga vem das notas
// (soma); sem notas, segue a cotacao. CIOT emitido na homologacao da efrete nunca libera MDF-e em producao (mdfe.ts).
// v20 (2026-10-16): CEP de carregamento = cotacoes.origem_cep (coleta em outro local) quando tiver 8 digitos; senao, o da NF-e/RBR como antes.
// v18 (2026-10-16): cotacao sem tipo de carga assume "Carga geral" (05) e AVISA, em vez de bloquear. Tipo escrito mas nao reconhecido continua bloqueando. Ver mdfe.ts.
// v17 (2026-10-16): tipo_transporte so e enviado quando ha proprietario do veiculo de tracao (SEFAZ: "O tipo de transportador nao pode ser informado quando nao estiver informado proprietario do veiculo de tracao"). Veiculo da frota da RBR: campo omitido. Ver mdfe.ts.
// v16 (2026-10-15): o relaxamento do teste em producao vem da resposta de trava_teste_fiscal (chamada antes de montar), nao do flag da cotacao.
// v16: CEP de carregamento = CEP da RBR (parametros_fiscais) quando o remetente da NF-e e a propria RBR.
// v15 (2026-10-09): NCM do produto predominante (8 digitos) sempre bloqueia, inclusive em teste - ver mdfe.ts. (v14 revertida: alterava telefone do responsavel tecnico sem querer.)
// v13: valores monetarios do pagamento com 2 casas e nParcela com 3 digitos (schema da SEFAZ).
// v12: CEPs de carregamento/descarregamento (carga lotacao). v11: CT-e dentro de municipios_descarregamento. v10: numero_averbacao. v8: tipo_transporte TAC.
// v7: operacao de TESTE em producao (observacoes da cotacao comeca com "[TESTE PRODUCAO") trata regras so do nosso sistema como aviso.
// Emite o MDF-e de uma operacao via Focus NFe (POST /v2/mdfe, resposta assincrona 202).
// Pre-requisito: CT-e ja AUTORIZADO (status 'emitido' + chave). Le os dados -> monta payload e bloqueios em mdfe.ts -> chama Focus -> grava em documentacao_operacao.
// Modo `previa: true` devolve payload + bloqueios sem gravar nem chamar a Focus.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cepCarregamentoDe, montarMdfe, testeDaTrava, type VeiculoMdfe } from "./mdfe.ts";

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
      .select("id, papel")
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
        .select("peso_bruto_kg, tipo_carga, nf_produto_predominante, ncms_produtos, pedagio, nf_remetente_cnpj, nf_remetente_endereco, origem_cep")
        .eq("id", op.cotacao_id)
        .maybeSingle();
      cot = data;
    }

    const { data: nfesCliente } = await supabaseAdmin.from("operacao_nfes").select("valor, peso_kg, ncm").eq("operacao_id", operacao_id).order("created_at");
    const notas = nfesCliente ?? [];
    const somaNotas = (campo: "valor" | "peso_kg") => notas.reduce((s, n) => s + (Number(n[campo]) || 0), 0);
    const ncmNotas = notas.map((n) => String(n.ncm ?? "")).find((x) => x.replace(/\D/g, "").length === 8) ?? null;

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

    // Modo teste (cotacoes.eh_teste): trava invertida no banco — RBR remetente E destinatária, cliente = RBR,
    // valores até R$ 5. Roda ANTES de montar: só a resposta da trava (teste=true) relaxa as regras de teste;
    // o flag da cotação sozinho não basta. Fora do modo teste devolve teste=false e nada muda.
    const { data: trava, error: travaErr } = await supabaseAdmin.rpc("trava_teste_fiscal", { p_operacao_id: operacao_id, p_tipo: "mdfe" });
    if (travaErr) {
      return jsonResponse({ sucesso: false, erro: `Não consegui verificar o modo teste: ${travaErr.message}` }, 500);
    }

    // v20: coleta em outro local -> CEP informado na cotacao tem prioridade; senao, o da NF-e (ou da RBR).
    const cepColetaManual = String(cot?.origem_cep ?? "").replace(/\D/g, "");
    const cepCarregamento = cepColetaManual.length === 8
      ? cepColetaManual
      : cepCarregamentoDe(cot?.nf_remetente_cnpj, op.emitente_cnpj, cot?.nf_remetente_endereco, pf?.endereco_cep);

    const { ambiente, bloqueios, avisos, regras, payload } = montarMdfe({
      op: notas.length && notas.every((n) => n.valor != null) ? { ...op, valor_nf: Math.round(somaNotas("valor") * 100) / 100 } : op,
      pf,
      municipioEmitente,
      cte: cteDoc ?? null,
      tracao,
      reboques,
      carregamento: await buscarMunicipio(supabaseAdmin, op.cidade_origem, op.uf_origem),
      descarregamento: await buscarMunicipio(supabaseAdmin, op.cidade_destino, op.uf_destino),
      cotacao: {
        peso_bruto_kg: somaNotas("peso_kg") > 0 ? Math.round(somaNotas("peso_kg") * 1000) / 1000 : cot?.peso_bruto_kg != null ? Number(cot.peso_bruto_kg) : null,
        tipo_carga: cot?.tipo_carga ?? null,
        produto: cot?.nf_produto_predominante ?? null,
        ncm: ncmNotas ?? (Array.isArray(cot?.ncms_produtos) && cot.ncms_produtos.length ? String(cot.ncms_produtos[0]) : (op.ncm ?? null)),
        pedagio: Number(cot?.pedagio ?? 0),
        teste_producao: testeDaTrava(trava),
      },
      cepCarregamento,
      cepDescarregamento: op.destinatario_cep ?? null,
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

    if (testeDaTrava(trava) && Array.isArray(trava.bloqueios)) bloqueios.push(...trava.bloqueios);
    if (testeDaTrava(trava) && Array.isArray(trava.avisos)) avisos.push(...trava.avisos);

    const ref = `rbr-mdfe-${operacao_id}`;

    if (previa === true) {
      return jsonResponse({ sucesso: true, previa: true, ambiente, bloqueios, avisos, regras, payload });
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
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, avisos, regras, erro: mensagem }, 422);
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

    // Regra da RBR que não barrou (ex.: destino de pagamento do motorista): fica registrada nos eventos fiscais
    // da operação, para aparecer depois da emissão e não só na tela do momento.
    const avisosRbr = regras.filter((r) => r.tipo === "aviso" && r.origem === "rbr").map((r) => r.mensagem);
    if (avisosRbr.length > 0) {
      await supabaseAdmin.from("eventos_fiscais_operacao").insert({
        operacao_id,
        tipo_documento: "mdfe",
        evento: "aviso_regra_rbr",
        origem: "automatico",
        ator_id: pessoaAtor.id,
        sucesso: true,
        mensagem: avisosRbr.join(" "),
        requisicao: { referencia: ref, ambiente },
      });
    }

    return jsonResponse({
      sucesso: true,
      status: "processando_autorizacao",
      regras,
      referencia: ref,
      avisos,
      aviso:
        ambiente === "homologacao"
          ? "Ambiente de homologação — este MDF-e NÃO tem validade fiscal."
          : undefined,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
