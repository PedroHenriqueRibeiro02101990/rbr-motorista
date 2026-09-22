// Edge Function: emitir-nfse-intramunicipal
//
// Emite a NFS-e de um frete que começa e termina na mesma cidade (frete
// intramunicipal) — o caso que a emitir-cte detecta e bloqueia, porque não é
// CT-e/ICMS, e sim NFS-e/ISS (LC 116/2003, item 16; ICMS só incide em
// transporte INTER-municipal/interestadual, Constituição Art. 155, II).
//
// Mecanismo confirmado em 2026-09-19 (pesquisa cruzada com fontes oficiais —
// FAQ da Prefeitura de BH, Lei Municipal 8.725/2003, Manual/Nota Técnica do
// Sistema Nacional NFS-e — ver claude/gestao-risco-fiscal-integracoes.md,
// seção "Qual município recebe o ISS ... RESOLVIDO"):
//   - Quando o município do frete é a própria sede da RBR (São Paulo capital),
//     usa a NFS-e MUNICIPAL comum da Focus (endpoint /v2/nfse) — já
//     habilitada no painel.
//   - Quando o município do frete é OUTRO (ex: Belo Horizonte), usa a NFS-e
//     NACIONAL (endpoint /v2/nfsen), informando o município de incidência do
//     ISS separado do município do estabelecimento (RBR/São Paulo), com
//     iss_retido=true — o tomador do serviço lá é quem recolhe (LC 116/2003
//     Art. 3º XIX + lei de retenção municipal, ex: Lei 8.725/2003 em BH).
//
// Bloqueado DE PROPÓSITO até confirmação humana, porque são dados fiscais que
// não são seguros de adivinhar:
//   1. A cidade do frete precisa estar cadastrada em `municipios_ibge`
//      (código IBGE + alíquota de ISS de transporte) — se não estiver,
//      bloqueia pedindo pra cadastrar a cidade nova.
//   2. Se o município NÃO for a sede (SP), exige
//      parametros_fiscais.nfse_nacional_habilitada = true — ou seja, alguém
//      confirmou que o Emissor Nacional está de fato ligado no painel da
//      Focus. Sem isso, chamar /v2/nfsen pode falhar (ou, pior, sair errado).
//   3. item_lista_servico_transporte_municipal precisa estar preenchido em
//      parametros_fiscais — código da lista LC 116/2003 pro item 16
//      (transporte municipal), a confirmar com o Alan antes do primeiro envio
//      real.
//   4. O NOME EXATO dos campos da API da Focus pro grupo de "município de
//      incidência" (usamos `servico.codigo_municipio_incidencia`, conforme a
//      pesquisa) não foi confirmado contra a doc oficial deles
//      especificamente pra esse cenário — testar em homologação e ajustar via
//      suporte@focusnfe.com.br se a Focus usar outro nome de campo.
//
// Fluxo (mesmo padrão da emitir-cte): valida -> monta payload -> chama Focus
// -> grava em documentacao_operacao (tipo='nfse') -> status final chega
// depois via consultar-documento-fiscal.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// Mesma normalização usada na emitir-cte, pra "São Paulo" vs "Sao Paulo" não
// escapar da checagem por causa de acentuação divergente no cadastro.
function normalizarCidade(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { operacao_id } = await req.json();
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

    // Emissão fiscal é ação de gestor — mesmo princípio já usado na emitir-cte.
    const { data: pessoaAtor } = await supabaseAdmin
      .from("pessoas")
      .select("papel")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!pessoaAtor || pessoaAtor.papel !== "gestor_rbr") {
      return jsonResponse({ sucesso: false, erro: "Só um gestor RBR pode emitir NFS-e." }, 403);
    }

    const { data: op, error: opError } = await supabaseAdmin
      .from("v_checklist_prontidao")
      .select("*")
      .eq("operacao_id", operacao_id)
      .maybeSingle();

    if (opError || !op) {
      return jsonResponse({ sucesso: false, erro: "Operação não encontrada." }, 404);
    }

    const bloqueios: string[] = [];

    const mesmoMunicipio =
      op.uf_origem &&
      op.uf_destino &&
      op.uf_origem === op.uf_destino &&
      op.cidade_origem &&
      op.cidade_destino &&
      normalizarCidade(op.cidade_origem) === normalizarCidade(op.cidade_destino);

    if (!mesmoMunicipio) {
      bloqueios.push(
        `Esta operação não é frete intramunicipal (origem ${op.cidade_origem}/${op.uf_origem}, destino ${op.cidade_destino}/${op.uf_destino}) — use emitir-cte pra esse caso, não esta função.`,
      );
    }
    if (!op.cotacao_id) bloqueios.push("Operação sem cotação vinculada — não há dados pra montar a NFS-e.");
    if (!op.valor_total_cotacao) bloqueios.push("Cotação sem valor_total (valor do serviço) preenchido.");
    if (!op.nf_destinatario_cnpj && !op.nf_remetente_cnpj) {
      bloqueios.push("Cotação sem tomador do serviço identificado (CNPJ remetente/destinatário).");
    }

    // Resolve o município do frete na tabela de apoio (código IBGE + alíquota
    // de ISS). Só faz sentido buscar se de fato é intramunicipal.
    let municipio: { codigo_ibge: string; aliquota_iss_transporte: number | null; eh_sede_rbr: boolean } | null =
      null;
    if (mesmoMunicipio && op.cidade_origem && op.uf_origem) {
      const { data: muni } = await supabaseAdmin
        .from("municipios_ibge")
        .select("codigo_ibge, aliquota_iss_transporte, eh_sede_rbr")
        .eq("uf", op.uf_origem)
        .ilike("cidade", op.cidade_origem)
        .maybeSingle();
      municipio = muni ?? null;
      if (!municipio) {
        bloqueios.push(
          `Cidade "${op.cidade_origem}/${op.uf_origem}" ainda não está cadastrada em municipios_ibge (código IBGE + alíquota de ISS de transporte) — cadastrar antes de emitir.`,
        );
      } else if (municipio.aliquota_iss_transporte === null) {
        bloqueios.push(
          `Alíquota de ISS de transporte de "${op.cidade_origem}/${op.uf_origem}" ainda não confirmada em municipios_ibge.aliquota_iss_transporte.`,
        );
      }
    }

    const { data: pf } = await supabaseAdmin
      .from("parametros_fiscais")
      .select("nfse_nacional_habilitada, item_lista_servico_transporte_municipal")
      .eq("id", op.parametros_fiscais_id)
      .maybeSingle();

    if (!pf?.item_lista_servico_transporte_municipal) {
      bloqueios.push(
        "parametros_fiscais.item_lista_servico_transporte_municipal ainda não confirmado (código da lista LC 116/2003 pro item 16) — confirmar com o Alan antes de emitir.",
      );
    }

    const usaNacional = Boolean(municipio && !municipio.eh_sede_rbr);
    if (usaNacional && !pf?.nfse_nacional_habilitada) {
      bloqueios.push(
        `Frete intramunicipal fora da sede da RBR (${op.cidade_origem}/${op.uf_origem}) precisa do Emissor Nacional da NFS-e habilitado no painel da Focus (endpoint /v2/nfsen) — parametros_fiscais.nfse_nacional_habilitada ainda está false. Habilitar no painel e marcar true antes de emitir.`,
      );
    }

    if (bloqueios.length > 0) {
      const mensagem = bloqueios.join(" ");
      await supabaseAdmin.from("documentacao_operacao").upsert(
        {
          operacao_id,
          tipo: "nfse",
          status: "bloqueado",
          mensagem_erro: mensagem,
          ambiente: op.ambiente_fiscal ?? "homologacao",
          provedor: municipio ? (municipio.eh_sede_rbr ? "nfse" : "nfsen") : null,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "operacao_id,tipo" },
      );
      return jsonResponse({ sucesso: false, bloqueado: true, motivos: bloqueios, erro: mensagem }, 422);
    }

    const ref = `rbr-nfse-${operacao_id}`;
    const tomadorCnpj = op.nf_destinatario_cnpj || op.nf_remetente_cnpj;
    const tomadorNome = op.nf_destinatario_razao_social || op.nf_remetente_razao_social;
    const endpoint = usaNacional ? "/v2/nfsen" : "/v2/nfse";
    const provedorGravado = usaNacional ? "nfsen" : "nfse";

    const payload: Record<string, unknown> = {
      data_emissao: new Date().toISOString(),
      prestador: {
        cnpj: op.emitente_cnpj,
        codigo_municipio: "3550308", // sede RBR, São Paulo capital — fixo (sem filial)
      },
      tomador: {
        cnpj: tomadorCnpj,
        razao_social: tomadorNome,
      },
      servico: {
        discriminacao: `Serviço de transporte rodoviário de carga, intramunicipal, em ${op.cidade_origem}/${op.uf_origem}.`,
        item_lista_servico: pf!.item_lista_servico_transporte_municipal,
        codigo_municipio_incidencia: municipio!.codigo_ibge,
        valor_servicos: op.valor_total_cotacao,
        aliquota: municipio!.aliquota_iss_transporte,
        iss_retido: usaNacional, // fora da sede: tomador retém na fonte; na sede, RBR recolhe normalmente
      },
    };

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_focus_nfe_token", {
      p_ambiente: op.ambiente_fiscal ?? "homologacao",
    });
    if (tokenError || !token) {
      return jsonResponse({ sucesso: false, erro: "Token Focus NFe não encontrado no Vault." }, 503);
    }

    const baseUrl =
      (op.ambiente_fiscal ?? "homologacao") === "producao"
        ? "https://api.focusnfe.com.br"
        : "https://homologacao.focusnfe.com.br";

    const focusResp = await fetch(`${baseUrl}${endpoint}?ref=${encodeURIComponent(ref)}`, {
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
          tipo: "nfse",
          status: "erro",
          referencia: ref,
          ambiente: op.ambiente_fiscal ?? "homologacao",
          provedor: provedorGravado,
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
        tipo: "nfse",
        status: "pendente",
        referencia: ref,
        ambiente: op.ambiente_fiscal ?? "homologacao",
        provedor: provedorGravado,
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
      endpoint_usado: endpoint,
      aviso:
        (op.ambiente_fiscal ?? "homologacao") === "homologacao"
          ? "Ambiente de homologação — esta NFS-e NÃO tem validade fiscal."
          : undefined,
    });
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: String(e) }, 500);
  }
});
