// Edge Function: financeiro-ia
//
// A IA do financeiro. Tudo passa por aqui e tudo termina numa SUGESTÃO que o gestor confirma
// (regra do projeto: toda automação tem saída manual).
//
// Ações:
//  - ler_documento        { documento_id }  → lê NF/boleto/fatura/comprovante/guia, identifica fornecedor/cliente/operação,
//                                             sugere categoria, vencimentos e se é para CRIAR, VINCULAR ou BAIXAR um lançamento.
//  - ler_extrato_pdf      { arquivo_path }  → transforma o PDF do extrato em lista de transações (depois o app importa).
//  - classificar_extrato  { extrato_id }    → para o que a conciliação automática não achou, sugere categoria/contraparte/lançamento.
//  - analisar             {}                → diagnóstico do caixa (alertas e ações) com base nos números do sistema.
//  - mensagem_cobranca    { lancamento_ids } → texto de cobrança educado para WhatsApp/e-mail.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { lerBoleto } from "./boleto.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const placaNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const dataOk = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

async function gemini(admin: SupabaseClient, parts: Record<string, unknown>[], schema: Record<string, unknown>) {
  const { data: key, error } = await admin.rpc("get_gemini_api_key");
  if (error || !key) throw new Error("Gemini não configurado (chave não encontrada no Vault).");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    }),
  });
  if (!resp.ok) {
    const t = (await resp.text()).slice(0, 300);
    if (resp.status === 429) throw new Error("Limite gratuito da IA atingido agora. Tente de novo em 1 minuto.");
    throw new Error(`IA respondeu ${resp.status}: ${t}`);
  }
  const j = await resp.json();
  const texto = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error("A IA não devolveu conteúdo legível.");
  return { dados: JSON.parse(texto) as Record<string, any>, model };
}

async function arquivoParaParts(admin: SupabaseClient, path: string, nome: string | null) {
  const { data: blob, error } = await admin.storage.from("financeiro-documentos").download(path);
  if (error || !blob) throw new Error(`Não achei o arquivo: ${error?.message ?? "desconhecido"}`);
  const n = String(nome ?? path).toLowerCase();
  const ehTexto = n.endsWith(".xml") || n.endsWith(".txt") || n.endsWith(".csv") || n.endsWith(".ofx") || blob.type.includes("xml") || blob.type.startsWith("text/");
  if (ehTexto) return [{ text: `Conteúdo do arquivo (${nome ?? path}):\n${(await blob.text()).slice(0, 250000)}` }];
  const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type
    : n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".png") ? "image/png" : "image/jpeg";
  return [{ inline_data: { mime_type: mime, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) } }];
}

// ---------------------------------------------------------------- ler_documento
const TIPOS_DOC = ["nfe", "nfse", "cte", "boleto", "fatura", "recibo", "comprovante", "extrato", "contrato", "guia_imposto", "outro"];

const SCHEMA_DOC = {
  type: "object",
  properties: {
    tipo_documento: { type: "string", enum: TIPOS_DOC },
    numero: { type: "string", nullable: true },
    serie: { type: "string", nullable: true },
    chave_acesso: { type: "string", nullable: true },
    data_emissao: { type: "string", nullable: true },
    competencia: { type: "string", nullable: true },
    emitente_nome: { type: "string", nullable: true },
    emitente_documento: { type: "string", nullable: true },
    destinatario_nome: { type: "string", nullable: true },
    destinatario_documento: { type: "string", nullable: true },
    valor_total: { type: "number", nullable: true },
    vencimentos: { type: "array", items: { type: "object", properties: { data: { type: "string" }, valor: { type: "number" } }, required: ["data", "valor"] } },
    linha_digitavel: { type: "string", nullable: true },
    codigo_barras: { type: "string", nullable: true },
    pix_copia_cola: { type: "string", nullable: true },
    descricao_resumida: { type: "string", nullable: true },
    chaves_referenciadas: { type: "array", items: { type: "string" } },
    placas: { type: "array", items: { type: "string" } },
    comprovante_data_pagamento: { type: "string", nullable: true },
    comprovante_valor_pago: { type: "number", nullable: true },
    comprovante_pagador_nome: { type: "string", nullable: true },
    comprovante_pagador_documento: { type: "string", nullable: true },
    comprovante_favorecido_nome: { type: "string", nullable: true },
    comprovante_favorecido_documento: { type: "string", nullable: true },
    comprovante_identificador: { type: "string", nullable: true },
    categoria_sugerida: { type: "string", nullable: true },
    categoria_motivo: { type: "string", nullable: true },
    observacoes: { type: "string", nullable: true },
  },
  required: ["tipo_documento", "valor_total", "vencimentos", "chaves_referenciadas", "placas"],
};

function promptDoc(categorias: { codigo: string; nome: string; tipo: string }[], cnpjRbr: string) {
  return `Você é o assistente financeiro da RBR Cargo (corretora de frete rodoviário, CNPJ ${cnpjRbr || "não informado"}).
Leia o documento anexo e extraia os campos do schema. Regras:
- Nunca invente: se não existir ou não estiver legível, devolva null (ou lista vazia).
- tipo_documento: nfe (nota fiscal de produto), nfse (nota de serviço), cte (conhecimento de transporte), boleto, fatura (fatura/duplicata/cobrança sem boleto),
  recibo, comprovante (comprovante de Pix/TED/pagamento de boleto), extrato (extrato bancário), contrato, guia_imposto (DAS, DARF, GPS, guias municipais/estaduais), outro.
- emitente = quem emitiu/cobra (no boleto: o beneficiário/cedente). destinatario = quem deve pagar/tomador (no boleto: o pagador/sacado).
- documentos (CPF/CNPJ): só dígitos.
- valor_total: valor total a pagar/cobrado. Número, sem R$.
- vencimentos: lista de {data, valor} de cada parcela/duplicata/boleto; se houver só um vencimento, uma entrada. Datas AAAA-MM-DD.
- linha_digitavel/codigo_barras: só dígitos, exatamente como no boleto/guia.
- pix_copia_cola: o texto do Pix copia-e-cola (começa com 000201), se houver.
- chave_acesso: 44 dígitos da própria nota/CT-e. chaves_referenciadas: chaves de NF-e/CT-e citadas no documento.
- placas: placas de veículo citadas (sem hífen).
- competencia: mês de referência (AAAA-MM) quando for guia de imposto, mensalidade ou fatura mensal.
- Para comprovante: preencha os campos comprovante_* (data, valor pago, pagador, favorecido, identificador/autenticação/E2E).
- descricao_resumida: até 60 caracteres dizendo o que é (ex.: "Pesquisa GR setembro", "Mensalidade sistema", "Frete Campinas→Curitiba").
- categoria_sugerida: escolha UM código desta lista (ou null se nenhum servir):
${categorias.map((c) => `  ${c.codigo} — ${c.nome} (${c.tipo})`).join("\n")}
- categoria_motivo: uma frase curta explicando a escolha.`;
}

async function lerDocumento(admin: SupabaseClient, documentoId: string) {
  const { data: doc } = await admin.from("documentos_financeiros").select("*").eq("id", documentoId).maybeSingle();
  if (!doc) throw new Error("Documento não encontrado.");
  if (!doc.arquivo_path) throw new Error("Documento sem arquivo.");
  await admin.from("documentos_financeiros").update({ status_ia: "processando", erro_ia: null }).eq("id", doc.id);

  const [{ data: cats }, { data: empresa }] = await Promise.all([
    admin.from("categorias_financeiras").select("id, codigo, nome, tipo").eq("ativa", true).order("ordem"),
    admin.from("parametros_sistema").select("valor").eq("chave", "dados_empresa").maybeSingle(),
  ]);
  const categorias = (cats ?? []).filter((c: any) => c.codigo) as { id: string; codigo: string; nome: string; tipo: string }[];
  const cnpjRbr = digitos((empresa?.valor as Record<string, unknown> | null)?.cnpj);

  const parts = [{ text: promptDoc(categorias, cnpjRbr) }, ...(await arquivoParaParts(admin, doc.arquivo_path, doc.arquivo_nome))];
  const { dados: ext, model } = await gemini(admin, parts, SCHEMA_DOC);

  const alertas: string[] = [];
  // Quando o app já sabe o tipo (comprovante anexado numa baixa, boleto de fatura, extrato), ele manda.
  const tipoFixo = ["comprovante", "boleto", "extrato"].includes(doc.tipo) ? doc.tipo : null;
  const tipo: string = tipoFixo ?? (TIPOS_DOC.includes(ext.tipo_documento) ? ext.tipo_documento : "outro");
  const emit = digitos(ext.emitente_documento);
  const dest = digitos(ext.destinatario_documento);

  // Boleto/guia: confere a linha digitável matematicamente
  let linha: string | null = null;
  let vencBoleto: string | null = null;
  let valorBoleto: number | null = null;
  const bruto = digitos(ext.linha_digitavel) || digitos(ext.codigo_barras);
  if (bruto) {
    const info = lerBoleto(bruto);
    if (info?.valido) {
      linha = info.linha;
      vencBoleto = info.vencimento;
      valorBoleto = info.valor;
    } else {
      alertas.push("A linha digitável lida não confere nos dígitos verificadores — digite/cole a linha manualmente antes de pagar.");
    }
  }

  // Direção e contraparte
  let direcao: "recebido" | "emitido" = "recebido";
  let tipoLanc: "pagar" | "receber" = "pagar";
  let contraDoc = emit;
  let contraNome: string | null = ext.emitente_nome ?? null;
  if (tipo === "comprovante") {
    const pag = digitos(ext.comprovante_pagador_documento);
    const fav = digitos(ext.comprovante_favorecido_documento);
    if (cnpjRbr && fav === cnpjRbr) {
      tipoLanc = "receber"; contraDoc = pag; contraNome = ext.comprovante_pagador_nome ?? null;
    } else {
      tipoLanc = "pagar"; contraDoc = fav; contraNome = ext.comprovante_favorecido_nome ?? null;
    }
  } else if (cnpjRbr && emit === cnpjRbr) {
    direcao = "emitido"; tipoLanc = "receber"; contraDoc = dest; contraNome = ext.destinatario_nome ?? null;
  } else if (cnpjRbr && dest && dest !== cnpjRbr && ["nfe", "nfse", "boleto", "fatura"].includes(tipo)) {
    alertas.push(`O pagador/tomador deste documento não é a RBR (doc ${dest}). Confira se a cobrança é mesmo nossa.`);
  }

  const { data: contraparte } = contraDoc ? await admin.rpc("fin_buscar_contraparte", { p_doc: contraDoc }) : { data: null };
  const cp = contraparte as Record<string, any> | null;
  if (tipoLanc === "pagar" && !cp && contraDoc && tipo !== "comprovante" && !doc.fornecedor_id) {
    alertas.push("Fornecedor ainda não cadastrado — ao confirmar, cadastre-o em Cadastros → Fornecedores para as próximas notas caírem sozinhas.");
  }

  // Categoria: regra aprendida > padrão do fornecedor > sugestão da IA
  let categoriaId: string | null = null;
  let categoriaOrigem = "";
  if (contraDoc) {
    const { data: regra } = await admin.from("regras_categorizacao").select("categoria_id").eq("campo", "documento").eq("padrao", contraDoc).maybeSingle();
    if (regra?.categoria_id) { categoriaId = regra.categoria_id; categoriaOrigem = "regra aprendida"; }
  }
  if (!categoriaId && cp?.categoria_id) { categoriaId = cp.categoria_id; categoriaOrigem = "padrão do fornecedor"; }
  if (!categoriaId && ext.categoria_sugerida) {
    const c = categorias.find((x) => x.codigo === ext.categoria_sugerida);
    if (c) { categoriaId = c.id; categoriaOrigem = "sugestão da IA"; }
  }
  if (!categoriaId && direcao === "emitido") {
    categoriaId = categorias.find((x) => x.codigo === "receita_frete")?.id ?? null;
  }

  // Operação relacionada
  let operacaoId: string | null = null;
  const chaves = [...new Set([...(ext.chaves_referenciadas ?? []), ext.chave_acesso].map(digitos).filter((c) => c.length === 44))];
  if (chaves.length) {
    const { data: porNf } = await admin.from("cotacoes").select("id").in("nf_chave_acesso", chaves).limit(1);
    if (porNf?.[0]) {
      const { data: op } = await admin.from("operacoes").select("id").eq("cotacao_id", porNf[0].id).maybeSingle();
      operacaoId = op?.id ?? null;
    }
    if (!operacaoId) {
      const { data: porDoc } = await admin.from("documentacao_operacao").select("operacao_id").in("chave_acesso", chaves).limit(1);
      operacaoId = porDoc?.[0]?.operacao_id ?? null;
    }
  }
  const placas = (ext.placas ?? []).map(placaNorm).filter(Boolean);
  if (!operacaoId && placas.length) {
    const { data: veics } = await admin.from("veiculos").select("id").in("placa", placas);
    const ids = (veics ?? []).map((v: any) => v.id);
    if (ids.length) {
      const { data: ops } = await admin.from("operacoes").select("id").in("veiculo_id", ids).neq("status", "cancelada").order("created_at", { ascending: false }).limit(1);
      operacaoId = ops?.[0]?.id ?? null;
    }
  }

  // O que já estava ligado ao documento (operação na qual foi anexado, fornecedor cadastrado na revisão) não se perde.
  operacaoId = operacaoId ?? doc.operacao_id ?? null;
  const fornecedorId = cp?.tipo === "fornecedor" ? cp.id : doc.fornecedor_id ?? null;
  const clienteId = cp?.tipo === "cliente" ? cp.id : doc.cliente_id ?? null;
  const pessoaId = cp?.tipo === "pessoa" ? cp.id : doc.pessoa_id ?? null;
  if (!categoriaId && doc.categoria_id) categoriaId = doc.categoria_id;
  if (tipo === "comprovante" && (doc.direcao === "emitido" || doc.direcao === "recebido")) direcao = doc.direcao;

  // Duplicidade de arquivo
  const chaveAcesso = digitos(ext.chave_acesso).length === 44 ? digitos(ext.chave_acesso) : null;
  let chaveGravar = chaveAcesso;
  let linhaGravar = linha;
  if (chaveAcesso) {
    const { data: dup } = await admin.from("documentos_financeiros").select("id, created_at").eq("chave_acesso", chaveAcesso).neq("id", doc.id).limit(1);
    if (dup?.[0]) { alertas.push(`Esta nota já foi importada em ${new Date(dup[0].created_at).toLocaleDateString("pt-BR")}. Não lance de novo.`); chaveGravar = null; }
  }
  if (linha) {
    const { data: dup } = await admin.from("documentos_financeiros").select("id, created_at").eq("linha_digitavel", linha).neq("id", doc.id).limit(1);
    if (dup?.[0]) { alertas.push(`Este boleto já foi importado em ${new Date(dup[0].created_at).toLocaleDateString("pt-BR")}. Cuidado para não pagar duas vezes.`); linhaGravar = null; }
  }

  // Valores e vencimentos
  const valorDoc = tipo === "comprovante" ? num(ext.comprovante_valor_pago) ?? num(ext.valor_total) : num(ext.valor_total) ?? valorBoleto;
  if (valorBoleto != null && valorDoc != null && Math.abs(valorBoleto - valorDoc) > 0.01 && tipo !== "comprovante") {
    alertas.push(`O valor impresso (${valorDoc.toFixed(2)}) é diferente do valor na linha digitável (${valorBoleto.toFixed(2)}).`);
  }
  let parcelas = (ext.vencimentos ?? [])
    .map((v: any) => ({ vencimento: dataOk(v.data), valor: num(v.valor) }))
    .filter((v: any) => v.vencimento && v.valor && v.valor > 0) as { vencimento: string; valor: number }[];
  if (!parcelas.length && valorDoc) {
    const venc = vencBoleto ?? null;
    if (!venc && cp?.condicao_prazo_id) {
      const { data: regra } = await admin.from("condicoes_prazo").select("*").eq("id", cp.condicao_prazo_id).maybeSingle();
      if (regra) {
        const { data: vs } = await admin.rpc("calcular_vencimentos", { p_regra: regra, p_data_base: dataOk(ext.data_emissao) ?? hoje(), p_total: valorDoc });
        if (Array.isArray(vs) && vs.length) parcelas = vs.map((x: any) => ({ vencimento: x.vencimento, valor: Number(x.valor) }));
      }
    }
    if (!parcelas.length) parcelas = [{ vencimento: venc ?? dataOk(ext.data_emissao) ?? hoje(), valor: valorDoc }];
  }
  if (vencBoleto && parcelas.length === 1 && parcelas[0].vencimento !== vencBoleto) {
    alertas.push(`O vencimento impresso (${parcelas[0].vencimento}) é diferente do vencimento da linha digitável (${vencBoleto}).`);
  }
  const somaParc = parcelas.reduce((s, p) => s + p.valor, 0);
  if (valorDoc && parcelas.length > 1 && Math.abs(somaParc - valorDoc) > 0.05) {
    alertas.push("As parcelas lidas não somam o valor total — confira antes de salvar.");
  }

  // O que fazer
  let acao = "criar_lancamento";
  let candidatos: any[] = [];
  if (tipo === "extrato") {
    acao = "importar_extrato";
  } else if (tipo === "comprovante") {
    const { data: c } = await admin.rpc("fin_candidatos_baixa", {
      p_tipo: tipoLanc, p_valor: valorDoc ?? 0, p_nome: contraNome, p_doc: contraDoc || null, p_data: dataOk(ext.comprovante_data_pagamento),
    });
    candidatos = c ?? [];
    acao = candidatos.length ? "baixar_lancamento" : "criar_lancamento_pago";
  } else if (direcao === "emitido") {
    acao = "nota_emitida";
    if (operacaoId) {
      const { data: ls } = await admin.from("v_lancamentos").select("id, descricao, contraparte, saldo_aberto, valor, data_vencimento, situacao")
        .eq("operacao_id", operacaoId).eq("tipo", "receber").neq("status", "cancelado");
      candidatos = (ls ?? []).map((l: any) => ({ lancamento_id: l.id, descricao: l.descricao, contraparte: l.contraparte, saldo_aberto: l.saldo_aberto, data_vencimento: l.data_vencimento, score: 90 }));
      const receita = (ls ?? []).reduce((s: number, l: any) => s + Number(l.valor), 0);
      if (valorDoc && receita && Math.abs(receita - valorDoc) > 0.01) {
        alertas.push(`O valor da nota (${valorDoc.toFixed(2)}) difere do previsto a receber na operação (${receita.toFixed(2)}).`);
      }
    } else {
      const { data: c } = await admin.rpc("fin_candidatos_baixa", { p_tipo: "receber", p_valor: valorDoc ?? 0, p_nome: contraNome, p_doc: contraDoc || null, p_data: null });
      candidatos = c ?? [];
    }
  } else if (valorDoc) {
    const { data: c } = await admin.rpc("fin_candidatos_baixa", {
      p_tipo: "pagar", p_valor: valorDoc, p_nome: contraNome, p_doc: contraDoc || null, p_data: parcelas[0]?.vencimento ?? null,
    });
    candidatos = (c ?? []).filter((x: any) => Number(x.score) >= 55);
    if (candidatos.length) acao = "vincular_lancamento";
  }

  const tipoLabel: Record<string, string> = { nfe: "NF-e", nfse: "NFS-e", cte: "CT-e", boleto: "Boleto", fatura: "Fatura", recibo: "Recibo", comprovante: "Comprovante", guia_imposto: "Guia", contrato: "Contrato", extrato: "Extrato", outro: "Documento" };
  const descricao = (ext.descricao_resumida && String(ext.descricao_resumida).trim()) ||
    `${tipoLabel[tipo] ?? "Documento"}${ext.numero ? " " + ext.numero : ""}${contraNome ? " — " + contraNome : ""}`;

  const sugestao = {
    acao,
    tipo_lancamento: tipoLanc,
    categoria_origem: categoriaOrigem,
    categoria_motivo: ext.categoria_motivo ?? null,
    contraparte: cp,
    lancamento: {
      descricao,
      categoria_id: categoriaId,
      fornecedor_id: fornecedorId,
      cliente_id: clienteId,
      pessoa_id: pessoaId,
      contraparte_nome: cp || fornecedorId ? null : contraNome,
      contraparte_documento: contraDoc || null,
      operacao_id: operacaoId,
      valor_total: valorDoc,
      data_emissao: dataOk(ext.data_emissao),
      competencia: ext.competencia && /^\d{4}-\d{2}$/.test(ext.competencia) ? `${ext.competencia}-01` : dataOk(ext.data_emissao),
      numero_documento: ext.numero ?? null,
      linha_digitavel: linha,
      pix_copia_cola: ext.pix_copia_cola ?? null,
      forma_pagamento: linha ? "boleto" : ext.pix_copia_cola ? "pix" : null,
      parcelas,
      data_pagamento: dataOk(ext.comprovante_data_pagamento),
    },
    candidatos,
    alertas,
  };

  await admin.from("documentos_financeiros").update({
    tipo,
    direcao,
    status_ia: "processado",
    erro_ia: null,
    extraido: { ...ext, _modelo: model },
    sugestao,
    numero: ext.numero ?? null,
    serie: ext.serie ?? null,
    chave_acesso: chaveGravar,
    emitente_nome: ext.emitente_nome ?? null,
    emitente_documento: emit || null,
    destinatario_nome: ext.destinatario_nome ?? null,
    destinatario_documento: dest || null,
    valor: valorDoc,
    data_emissao: dataOk(ext.data_emissao),
    data_vencimento: parcelas[0]?.vencimento ?? vencBoleto,
    linha_digitavel: linhaGravar,
    pix_copia_cola: ext.pix_copia_cola ?? null,
    descricao,
    fornecedor_id: fornecedorId,
    cliente_id: clienteId,
    pessoa_id: pessoaId,
    operacao_id: operacaoId,
    categoria_id: categoriaId,
    updated_at: new Date().toISOString(),
  }).eq("id", doc.id);

  return { sucesso: true, sugestao };
}

// ---------------------------------------------------------------- extrato em PDF
const SCHEMA_EXTRATO = {
  type: "object",
  properties: {
    banco: { type: "string", nullable: true },
    saldo_final: { type: "number", nullable: true },
    transacoes: {
      type: "array",
      items: {
        type: "object",
        properties: { data: { type: "string" }, descricao: { type: "string" }, valor: { type: "number" }, documento_ref: { type: "string", nullable: true } },
        required: ["data", "descricao", "valor"],
      },
    },
  },
  required: ["transacoes"],
};

async function lerExtratoPdf(admin: SupabaseClient, path: string) {
  const parts = [
    { text: `Leia este extrato bancário brasileiro e liste TODAS as movimentações (não inclua linhas de saldo).
- data: AAAA-MM-DD; descricao: como aparece no extrato; valor: positivo para entradas/créditos, NEGATIVO para saídas/débitos.
- documento_ref: número do documento/ID da transação, se houver.
- saldo_final: saldo no fim do período, se aparecer. Nunca invente.` },
    ...(await arquivoParaParts(admin, path, path)),
  ];
  const { dados } = await gemini(admin, parts, SCHEMA_EXTRATO);
  const transacoes = (dados.transacoes ?? [])
    .map((t: any) => ({ data: dataOk(t.data), descricao: String(t.descricao ?? "").slice(0, 300), valor: num(t.valor), documento_ref: t.documento_ref ?? null }))
    .filter((t: any) => t.data && t.valor);
  return { sucesso: true, transacoes, saldo_final: num(dados.saldo_final), banco: dados.banco ?? null };
}

// ---------------------------------------------------------------- classificar extrato
const SCHEMA_CLASSIF = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          categoria_codigo: { type: "string", nullable: true },
          contraparte: { type: "string", nullable: true },
          descricao: { type: "string", nullable: true },
          transferencia_entre_contas: { type: "boolean" },
          lancamento_id: { type: "string", nullable: true },
          confianca: { type: "string", enum: ["alta", "media", "baixa"] },
        },
        required: ["id", "transferencia_entre_contas", "confianca"],
      },
    },
  },
  required: ["itens"],
};

async function classificarExtrato(admin: SupabaseClient, extratoId: string) {
  const { data: itens } = await admin.from("extrato_itens").select("id, data, descricao, valor, sugestao").eq("extrato_id", extratoId).eq("status", "pendente").limit(200);
  const alvo = (itens ?? []).filter((i: any) => !(i.sugestao?.candidatos?.length) && !i.sugestao?.regra).slice(0, 80);
  if (!alvo.length) return { sucesso: true, classificados: 0 };
  const [{ data: cats }, { data: contas }, { data: abertos }] = await Promise.all([
    admin.from("categorias_financeiras").select("id, codigo, nome, tipo").eq("ativa", true),
    admin.from("contas_bancarias").select("id, nome, banco_nome").eq("ativa", true),
    admin.from("v_lancamentos").select("id, tipo, contraparte, descricao, saldo_aberto, data_vencimento").in("status", ["aberto", "previsto"]).order("data_vencimento").limit(150),
  ]);
  const categorias = (cats ?? []).filter((c: any) => c.codigo);
  const prompt = `Você concilia o extrato bancário da RBR Cargo (corretora de frete). Para cada movimentação abaixo sugira:
- categoria_codigo (da lista), contraparte (nome curto de quem pagou/recebeu), descricao (curta, em português claro);
- transferencia_entre_contas = true se for movimentação entre contas da própria empresa (contas: ${(contas ?? []).map((c: any) => c.nome + (c.banco_nome ? " / " + c.banco_nome : "")).join("; ")}; ou aplicação/resgate);
- lancamento_id: SÓ se tiver certeza de que corresponde a um lançamento em aberto da lista (mesma contraparte; entrada=receber, saída=pagar; valor igual ou pagamento parcial). Senão null.
- confianca: alta/media/baixa.
Categorias:
${categorias.map((c: any) => `${c.codigo} — ${c.nome} (${c.tipo})`).join("\n")}
Lançamentos em aberto (id | tipo | contraparte | descrição | saldo | vencimento):
${(abertos ?? []).map((l: any) => `${l.id} | ${l.tipo} | ${l.contraparte ?? ""} | ${l.descricao} | ${l.saldo_aberto} | ${l.data_vencimento}`).join("\n")}
Movimentações (id | data | descrição | valor):
${alvo.map((i: any) => `${i.id} | ${i.data} | ${i.descricao} | ${i.valor}`).join("\n")}`;
  const { dados, model } = await gemini(admin, [{ text: prompt }], SCHEMA_CLASSIF);
  const porId = new Map(alvo.map((i: any) => [i.id, i]));
  const abertosPorId = new Map((abertos ?? []).map((l: any) => [l.id, l]));
  let n = 0;
  for (const s of dados.itens ?? []) {
    const it = porId.get(s.id) as any;
    if (!it) continue;
    const cat = categorias.find((c: any) => c.codigo === s.categoria_codigo);
    let lancId: string | null = s.lancamento_id ?? null;
    const l = lancId ? (abertosPorId.get(lancId) as any) : null;
    if (!l || l.tipo !== (it.valor > 0 ? "receber" : "pagar") || Number(l.saldo_aberto) + 0.01 < Math.abs(it.valor)) lancId = null;
    const ia = {
      categoria_id: cat?.id ?? null, categoria_nome: cat?.nome ?? null, contraparte: s.contraparte ?? null, descricao: s.descricao ?? null,
      transferencia_entre_contas: !!s.transferencia_entre_contas, lancamento_id: lancId, lancamento_descricao: l && lancId ? l.descricao : null,
      confianca: s.confianca, modelo: model,
    };
    await admin.from("extrato_itens").update({ sugestao: { ...(it.sugestao ?? {}), ia } }).eq("id", it.id);
    n++;
  }
  return { sucesso: true, classificados: n };
}

// ---------------------------------------------------------------- análise
const SCHEMA_ANALISE = {
  type: "object",
  properties: {
    saude: { type: "string", enum: ["boa", "atencao", "critica"] },
    resumo: { type: "string" },
    alertas: { type: "array", items: { type: "object", properties: { nivel: { type: "string", enum: ["info", "atencao", "critico"] }, titulo: { type: "string" }, detalhe: { type: "string" } }, required: ["nivel", "titulo", "detalhe"] } },
    acoes: { type: "array", items: { type: "object", properties: { prioridade: { type: "string", enum: ["alta", "media", "baixa"] }, acao: { type: "string" }, impacto: { type: "string" } }, required: ["prioridade", "acao", "impacto"] } },
  },
  required: ["saude", "resumo", "alertas", "acoes"],
};

async function analisar(admin: SupabaseClient, atorId: string) {
  const { data: base, error } = await admin.rpc("fin_resumo_para_ia");
  if (error) throw new Error(error.message);
  const prompt = `Você é o diretor financeiro (CFO) de uma corretora de frete rodoviário pequena (RBR Cargo, Simples Nacional).
Analise os números abaixo (em R$, gerados pelo sistema hoje) e responda em português do Brasil, direto e prático:
- saude: boa / atencao / critica.
- resumo: 2 a 4 frases sobre a situação do caixa e do resultado.
- alertas: o que precisa de atenção (saldo projetado negativo e quando, inadimplência, concentração em poucos clientes, margem real abaixo da prevista, despesas fora do padrão, documentos/extratos pendentes, pagamentos em operações canceladas). Cite valores e datas.
- acoes: até 6 ações concretas priorizadas (ex.: "cobrar X de R$ Y vencido há Z dias", "antecipar recebível", "renegociar prazo com fornecedor", "rever preço da rota W").
Não invente números que não estejam nos dados. Se os dados forem poucos (sistema começando), diga isso e foque no que já dá para fazer.
Dados: ${JSON.stringify(base)}`;
  const { dados, model } = await gemini(admin, [{ text: prompt }], SCHEMA_ANALISE);
  const { data: salvo } = await admin.from("analises_financeiras_ia").insert({ resultado: dados, base, modelo: model, criado_por: atorId }).select().single();
  return { sucesso: true, analise: salvo };
}

// ---------------------------------------------------------------- cobrança
const SCHEMA_COBRANCA = {
  type: "object",
  properties: { mensagem: { type: "string" }, assunto_email: { type: "string" } },
  required: ["mensagem", "assunto_email"],
};

async function mensagemCobranca(admin: SupabaseClient, ids: string[]) {
  if (!ids?.length) throw new Error("Selecione o que cobrar.");
  const [{ data: ls }, { data: params }] = await Promise.all([
    admin.from("v_lancamentos").select("descricao, contraparte, saldo_aberto, data_vencimento, dias_atraso, numero_documento, fatura_numero, linha_digitavel, pix_copia_cola").in("id", ids),
    admin.from("parametros_sistema").select("chave, valor").in("chave", ["dados_bancarios_rbr", "dados_empresa"]),
  ]);
  if (!ls?.length) throw new Error("Lançamentos não encontrados.");
  const p = Object.fromEntries((params ?? []).map((x: any) => [x.chave, x.valor]));
  const prompt = `Escreva uma mensagem de cobrança para WhatsApp, em nome da RBR Cargo, para ${ls[0].contraparte ?? "o cliente"}.
Tom: cordial, profissional e objetivo, proporcional ao atraso (até 5 dias: lembrete gentil; 6–30: firme e educado; mais de 30: firme, pedindo previsão de pagamento). Sem ameaças.
Liste os títulos (descrição, vencimento DD/MM/AAAA, valor em R$ no formato brasileiro) e o total. Inclua a forma de pagamento se houver (linha digitável, Pix copia-e-cola, ou os dados bancários abaixo).
Termine pedindo para enviar o comprovante por aqui. No máximo ~900 caracteres. Não use emojis em excesso (no máximo 1).
Títulos: ${JSON.stringify(ls)}
Dados para pagamento da RBR: ${JSON.stringify(p.dados_bancarios_rbr ?? {})}
Empresa: ${JSON.stringify({ nome: (p.dados_empresa as any)?.razao_social ?? "RBR Cargo", cnpj: (p.dados_empresa as any)?.cnpj })}
Também dê um assunto curto para e-mail.`;
  const { dados } = await gemini(admin, [{ text: prompt }], SCHEMA_COBRANCA);
  return { sucesso: true, ...dados };
}

// ---------------------------------------------------------------- servidor
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: Record<string, any> = {};
  try {
    body = await req.json();
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u, error: ue } = await asUser.auth.getUser();
    if (ue || !u?.user) return json({ sucesso: false, erro: "Não autenticado" }, 401);
    const { data: ator } = await admin.from("pessoas").select("id, papel").eq("auth_user_id", u.user.id).maybeSingle();
    if (!ator || ator.papel !== "gestor_rbr") return json({ sucesso: false, erro: "Só o gestor RBR usa a IA do financeiro." }, 403);

    switch (body.acao) {
      case "ler_documento":
        if (!body.documento_id) return json({ sucesso: false, erro: "Informe documento_id." }, 400);
        return json(await lerDocumento(admin, body.documento_id));
      case "ler_extrato_pdf":
        if (!body.arquivo_path) return json({ sucesso: false, erro: "Informe arquivo_path." }, 400);
        return json(await lerExtratoPdf(admin, body.arquivo_path));
      case "classificar_extrato":
        if (!body.extrato_id) return json({ sucesso: false, erro: "Informe extrato_id." }, 400);
        return json(await classificarExtrato(admin, body.extrato_id));
      case "analisar":
        return json(await analisar(admin, ator.id));
      case "mensagem_cobranca":
        return json(await mensagemCobranca(admin, body.lancamento_ids ?? []));
      default:
        return json({ sucesso: false, erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (body?.acao === "ler_documento" && body.documento_id) {
      await admin.from("documentos_financeiros").update({ status_ia: "erro", erro_ia: msg }).eq("id", body.documento_id);
    }
    return json({ sucesso: false, erro: msg }, 500);
  }
});
