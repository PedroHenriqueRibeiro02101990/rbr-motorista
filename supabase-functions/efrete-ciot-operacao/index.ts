// Edge Function: efrete-ciot-operacao  (verify_jwt = true)
//
// Passo 4: CIOT Padrão (Lotação) pela efrete LIGADO À OPERAÇÃO. Usa os dados da operação (motorista, cavalo +
// implementos, rota, condicoes_pagamento_operacao, NF-e do cliente em operacao_nfes), calcula o piso da ANTT
// (piso_antt_coeficientes) e bloqueia abaixo dele, pede confirmação humana (nome e hora) e copia o CIOT para
// operacao_ciot_vpo (ciot_origem 'efrete', ambiente, protocolo, data). CIOT de homologação nunca libera MDF-e em produção
// (mdfe.ts). Se a efrete cair, o caminho manual (digitar o CIOT na etapa CIOT) continua igual.
// Ações: {acao, operacao_id}
//   previa | emitir {confirmar:true} | consultar | pdf | transacoes | cancelar {motivo} | encerrar | status
// Quem chama: gestor RBR (tela Fiscal) ou o banco com a chave interna de teste (EFRETE_TESTE_CHAMADA_INTERNA).
// Trava: nesta fase só roda na homologação (dev.efrete.com.br).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { carregarConfigDoVault, criarClienteEfrete, type ConfigEfrete } from "../_shared/efreteClient.ts";
import {
  dataEfrete,
  emitirComAntiDuplicidade,
  gerarChassi,
  juntarCiot,
  pedidoDaOperacao,
  separarCiot,
  traduzirErroEfrete,
  type CoeficientePiso,
  type DadosOperacaoCiot,
  type EnderecoEfrete,
  type PreviaCiot,
  type RepositorioPedidos,
} from "../_shared/ciotEfrete.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-efrete-chave-interna",
};
const AMBIENTE = "homologacao" as const;

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const segredo = async (nome: string) => {
  const { data, error } = await admin.rpc("efrete_segredo", { p_nome: nome });
  if (error) throw new Error(`Não consegui ler ${nome} do Vault: ${error.message}`);
  return (data as string | null) ?? null;
};
let configCache: Promise<ConfigEfrete> | null = null;
const carregarConfig = () => (configCache ??= carregarConfigDoVault(segredo));

const http1 = (() => {
  try {
    return (Deno as unknown as { createHttpClient?: (o: Record<string, unknown>) => unknown }).createHttpClient?.({ http1: true, http2: false });
  } catch {
    return undefined;
  }
})();
const fetchHttp1: typeof fetch = (entrada, init) => fetch(entrada, http1 ? ({ ...init, client: http1 } as unknown as RequestInit) : init);
const efrete = criarClienteEfrete({ carregarConfig, fetch: fetchHttp1, verboLogin: "POST", verboConsulta: "POST", log: (m) => console.log(m) });

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
// Acentos: a efrete devolveu "??" para texto com acento (passo 3). Até confirmar o charset com a NSTech, tira o acento
// SÓ do endereço; nomes de pessoas vão como estão.
const semAcento = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Ator = { quem: "banco" | "gestor"; pessoaId: string | null; nome: string | null };
async function autorizado(req: Request): Promise<{ ok: true; ator: Ator } | { ok: false; status: number; erro: string }> {
  const interna = req.headers.get("x-efrete-chave-interna") ?? "";
  if (interna) {
    const esperada = (await segredo("EFRETE_TESTE_CHAMADA_INTERNA")) ?? "";
    return iguais(interna, esperada) ? { ok: true, ator: { quem: "banco", pessoaId: null, nome: null } } : { ok: false, status: 403, erro: "Chave interna inválida." };
  }
  const auth = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return { ok: false, status: 401, erro: "Não autenticado." };
  const { data: p } = await admin.from("pessoas").select("id, nome, papel").eq("auth_user_id", data.user.id).maybeSingle();
  if (p?.papel !== "gestor_rbr") return { ok: false, status: 403, erro: "Só um gestor RBR emite CIOT." };
  return { ok: true, ator: { quem: "gestor", pessoaId: p.id, nome: p.nome } };
}

// Procura uma chave em qualquer nível de um JSON (payload enviado do MDF-e).
function buscar(v: unknown, chave: string): unknown {
  if (!v || typeof v !== "object") return undefined;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = buscar(x, chave);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === chave) return x;
    const r = buscar(x, chave);
    if (r !== undefined) return r;
  }
  return undefined;
}

type Pessoa = Record<string, string | null>;
type Contexto = { ehTeste: boolean; dados: DadosOperacaoCiot; titular: Pessoa | null; motorista: Pessoa | null; veiculos: Record<string, unknown>[]; enderecoContratante: EnderecoEfrete };

async function ibgeDe(cidade: string | null, uf: string | null): Promise<number | null> {
  if (!cidade || !uf) return null;
  const { data } = await admin.from("municipios_coordenadas").select("codigo_ibge").eq("uf", uf).eq("nome_norm", semAcento(cidade).trim().toLowerCase()).maybeSingle();
  return data?.codigo_ibge ? Number(data.codigo_ibge) : null;
}
async function coordenadas(ibge: string | null, cidade: string | null, uf: string | null) {
  let q = admin.from("municipios_coordenadas").select("codigo_ibge, lat, lng");
  q = ibge ? q.eq("codigo_ibge", ibge) : q.eq("uf", uf ?? "").eq("nome_norm", semAcento(cidade).trim().toLowerCase());
  const { data } = await q.maybeSingle();
  return data ? { lat: Number(data.lat), lon: Number(data.lng), ibge: Number(data.codigo_ibge) } : null;
}
function enderecoPessoa(p: Pessoa | null, ibge: number | null): EnderecoEfrete | null {
  if (!p?.logradouro || !p?.cep || !ibge) return null;
  return { Rua: semAcento(p.logradouro), Numero: soDigitos(p.numero_endereco) || "0", Bairro: semAcento(p.bairro) || "Centro", CEP: soDigitos(p.cep), CodigoMunicipio: ibge };
}

async function carregar(operacaoId: string): Promise<Contexto> {
  const { data: op, error } = await admin
    .from("operacoes")
    .select("id, cotacao_id, veiculo_id, pessoa_alocada_id, carga_complexa, carga_complexa_eixo1_perigosa, carga_complexa_eixo2_superdimensionada, ncm, coleta_prevista, entrega_prevista, eh_teste, deleted_at")
    .eq("id", operacaoId)
    .maybeSingle();
  if (error || !op || op.deleted_at) throw new Error("Operação não encontrada.");
  const [cot, cond, nfes, reb, vtr, coefs, pf, docs, ciotVpo] = await Promise.all([
    op.cotacao_id
      ? admin.from("cotacoes").select("tipo_carga, distancia_km, tabela_antt, ibge_origem, ibge_destino, cidade_origem, uf_origem, cidade_destino, uf_destino, pedagio, nf_destinatario_endereco").eq("id", op.cotacao_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("condicoes_pagamento_operacao").select("valor_total_contrato, valor_adiantamento").eq("operacao_id", operacaoId).maybeSingle(),
    admin.from("operacao_nfes").select("chave_acesso, numero, serie, valor, peso_kg, ncm, destinatario_cnpj, destinatario_nome").eq("operacao_id", operacaoId).order("created_at"),
    admin.from("operacao_reboques").select("ordem, veiculos(id, placa, quantidade_eixos, renavam, chassi, rntrc_numero, titular_id)").eq("operacao_id", operacaoId).order("ordem"),
    op.veiculo_id ? admin.from("veiculos").select("id, placa, quantidade_eixos, renavam, chassi, rntrc_numero, titular_id, is_veiculo_proprio").eq("id", op.veiculo_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("piso_antt_coeficientes").select("tabela, tipo_carga, eixos, ccd_por_km, cc_fixo, data_vigencia, fonte"),
    admin.from("parametros_fiscais").select("cnpj, razao_social, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cep, endereco_codigo_municipio").eq("ativo", true).maybeSingle(),
    admin.from("documentacao_operacao").select("tipo, status, payload_enviado").eq("operacao_id", operacaoId).in("tipo", ["cte", "mdfe"]),
    admin.from("operacao_ciot_vpo").select("ciot_origem").eq("operacao_id", operacaoId).maybeSingle(),
  ]);
  void ciotVpo;
  const c = cot.data as Record<string, unknown> | null;
  const tracao = vtr.data as Record<string, unknown> | null;
  const implementos = ((reb.data ?? []) as unknown as { veiculos: Record<string, unknown> | null }[]).map((r) => r.veiculos).filter(Boolean) as Record<string, unknown>[];
  const pessoaCols = "id, nome, cpf, cnpj, rntrc_numero, pix, cnh_numero_registro, celular, data_nascimento, logradouro, numero_endereco, bairro, cep, cidade, uf";
  const { data: motorista } = op.pessoa_alocada_id ? await admin.from("pessoas").select(pessoaCols).eq("id", op.pessoa_alocada_id).maybeSingle() : { data: null };
  const titularId = (tracao?.titular_id as string | null) ?? null;
  const { data: titular } = titularId ? await admin.from("pessoas").select(pessoaCols).eq("id", titularId).maybeSingle() : { data: motorista };

  const enderecoContratante: EnderecoEfrete = {
    Rua: semAcento(pf.data?.endereco_logradouro),
    Numero: soDigitos(pf.data?.endereco_numero) || "0",
    Bairro: semAcento(pf.data?.endereco_bairro) || "Centro",
    CEP: soDigitos(pf.data?.endereco_cep),
    CodigoMunicipio: Number(pf.data?.endereco_codigo_municipio ?? 0),
  };
  const destEnd = c?.nf_destinatario_endereco as Record<string, string | null> | null;
  const docMdfe = (docs.data ?? []).find((d) => d.tipo === "mdfe" && d.status === "emitido");
  const docCte = (docs.data ?? []).find((d) => d.tipo === "cte" && d.status === "emitido");
  const mdfeValor = docMdfe ? Number(buscar(docMdfe.payload_enviado, "valor_total_contrato")) : NaN;
  const cteNfes = docCte ? (buscar(docCte.payload_enviado, "nfes") as { chave_nfe?: string }[] | undefined) : undefined;

  const dados: DadosOperacaoCiot = {
    operacaoId,
    ambiente: AMBIENTE,
    agora: new Date(),
    contratante: { cnpj: soDigitos(pf.data?.cnpj), nome: String(pf.data?.razao_social ?? ""), endereco: enderecoContratante },
    motorista: motorista ? { cpf: motorista.cpf, cnh: motorista.cnh_numero_registro, celular: motorista.celular } : null,
    contratado: titular ? { cpfOuCnpj: titular.cnpj ?? titular.cpf, rntrc: titular.rntrc_numero ?? (tracao?.rntrc_numero as string | null) ?? null, pix: titular.pix } : null,
    tracao: tracao ? { placa: String(tracao.placa), eixos: tracao.quantidade_eixos != null ? Number(tracao.quantidade_eixos) : null } : null,
    implementos: implementos.map((v) => ({ placa: String(v.placa), eixos: v.quantidade_eixos != null ? Number(v.quantidade_eixos) : null })),
    rota: {
      origem: c ? await coordenadas((c.ibge_origem as string | null) ?? null, c.cidade_origem as string | null, c.uf_origem as string | null) : null,
      destino: c ? await coordenadas((c.ibge_destino as string | null) ?? null, c.cidade_destino as string | null, c.uf_destino as string | null) : null,
      distanciaKm: c?.distancia_km != null ? Number(c.distancia_km) : null,
    },
    carga: {
      tipoCarga: (c?.tipo_carga as string | null) ?? null,
      ncm: op.ncm ?? null,
      complexa: Boolean(op.carga_complexa || op.carga_complexa_eixo1_perigosa || op.carga_complexa_eixo2_superdimensionada),
      tabelaAntt: (c?.tabela_antt as string | null) ?? null,
    },
    condicao: cond.data ? { valorTotal: cond.data.valor_total_contrato != null ? Number(cond.data.valor_total_contrato) : null, adiantamento: Number(cond.data.valor_adiantamento ?? 0), pedagio: Number(c?.pedagio ?? 0) } : null,
    datas: { inicio: op.coleta_prevista ? new Date(op.coleta_prevista) : null, fim: op.entrega_prevista ? new Date(op.entrega_prevista) : null },
    notas: ((nfes.data ?? []) as Record<string, unknown>[]).map((n) => ({
      chave: String(n.chave_acesso),
      numero: (n.numero as string | null) ?? null,
      serie: (n.serie as string | null) ?? null,
      valor: n.valor != null ? Number(n.valor) : null,
      pesoKg: n.peso_kg != null ? Number(n.peso_kg) : null,
      ncm: (n.ncm as string | null) ?? null,
      destinatarioCnpj: (n.destinatario_cnpj as string | null) ?? null,
      destinatarioNome: (n.destinatario_nome as string | null) ?? null,
    })),
    destinatarioEndereco:
      destEnd?.logradouro && destEnd?.cep && destEnd?.codigo_ibge
        ? { Rua: semAcento(destEnd.logradouro), Numero: soDigitos(destEnd.numero) || "0", Bairro: semAcento(destEnd.bairro) || "Centro", CEP: soDigitos(destEnd.cep), CodigoMunicipio: Number(destEnd.codigo_ibge) }
        : null,
    coeficientes: ((coefs.data ?? []) as Record<string, unknown>[]).map((x) => ({
      tabela: String(x.tabela),
      tipo_carga: String(x.tipo_carga),
      eixos: Number(x.eixos),
      ccd_por_km: Number(x.ccd_por_km),
      cc_fixo: Number(x.cc_fixo),
      data_vigencia: String(x.data_vigencia),
      fonte: (x.fonte as string | null) ?? null,
    })) as CoeficientePiso[],
    documentos: { mdfeValorContrato: Number.isFinite(mdfeValor) ? mdfeValor : null, cteChaves: cteNfes ? cteNfes.map((n) => soDigitos(n.chave_nfe)) : null },
  };
  return { ehTeste: op.eh_teste === true, dados, titular: titular as Pessoa | null, motorista: motorista as Pessoa | null, veiculos: [tracao, ...implementos].filter(Boolean) as Record<string, unknown>[], enderecoContratante };
}

// Cadastros prévios na ordem que funcionou no passo 3: proprietário, cavalo, implementos, motorista.
// O que já está em efrete_cadastros (por ambiente) não é reenviado.
async function garantirCadastros(ctx: Contexto): Promise<{ ok: true; feitos: string[] } | { ok: false; etapa: string; mensagem: string; protocolo: string | null }> {
  const { data: ja } = await admin.from("efrete_cadastros").select("tipo, chave").eq("ambiente", AMBIENTE);
  const tem = (tipo: string, chave: string) => (ja ?? []).some((x) => x.tipo === tipo && x.chave === chave);
  const feitos: string[] = [];
  const registrar = async (tipo: string, chave: string, protocolo: unknown) => {
    await admin.from("efrete_cadastros").upsert({ ambiente: AMBIENTE, tipo, chave, protocolo: protocolo != null ? String(protocolo) : null }, { onConflict: "ambiente,tipo,chave" });
    feitos.push(`${tipo} ${chave}`);
  };
  const t = ctx.titular;
  const docTitular = soDigitos(t?.cnpj ?? t?.cpf);
  const rntrc = soDigitos(t?.rntrc_numero ?? ctx.dados.contratado?.rntrc);
  const endTitular = enderecoPessoa(t, await ibgeDe(t?.cidade ?? null, t?.uf ?? null)) ?? ctx.enderecoContratante;
  if (docTitular && !tem("proprietario", docTitular)) {
    const r = await efrete.gravarCadastro("proprietarios", { Versao: 4, CNPJ: docTitular, Endereco: endTitular, RNTRC: rntrc, RazaoSocial: t?.nome ?? "" });
    if (!r.ok) return { ok: false, etapa: "proprietário", mensagem: traduzirErroEfrete(r.erro.mensagem), protocolo: r.erro.protocolo ?? null };
    await registrar("proprietario", docTitular, r.dados.ProtocoloServico);
  }
  for (const [i, v] of ctx.veiculos.entries()) {
    const placa = String(v.placa).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (tem("veiculo", placa)) continue;
    const chassi = (v.chassi as string | null) || (AMBIENTE === "homologacao" ? gerarChassi(placa.split("").reduce((s, c) => s + c.charCodeAt(0), 0)) : "");
    if (!chassi) return { ok: false, etapa: `veículo ${placa}`, mensagem: "Veículo sem chassi no cadastro.", protocolo: null };
    const r = await efrete.gravarCadastro("veiculos", {
      Versao: 1,
      Veiculo: {
        Chassi: chassi,
        NumeroDeEixos: Number(v.quantidade_eixos ?? 0),
        Placa: placa,
        RNTRC: soDigitos(v.rntrc_numero) || rntrc,
        Renavam: Number(soDigitos(v.renavam)) || 0,
        TipoCarroceria: i === 0 ? "NaoAplicavel" : "FechadaOuBau",
        TipoRodado: i === 0 && ctx.veiculos.length > 1 ? "Cavalo" : "NaoAplicavel",
      },
    });
    if (!r.ok) return { ok: false, etapa: `veículo ${placa}`, mensagem: traduzirErroEfrete(r.erro.mensagem), protocolo: r.erro.protocolo ?? null };
    await registrar("veiculo", placa, r.dados.ProtocoloServico);
  }
  const m = ctx.motorista;
  const cpf = soDigitos(m?.cpf);
  if (cpf && !tem("motorista", cpf)) {
    const cel = soDigitos(m?.celular).replace(/^55(?=\d{10,11}$)/, "");
    const r = await efrete.gravarCadastro("motoristas", {
      Versao: 2,
      CNH: soDigitos(m?.cnh_numero_registro),
      CPF: cpf,
      DataNascimento: m?.data_nascimento ? `${m.data_nascimento}T00:00:00` : "1980-01-01T00:00:00",
      Endereco: enderecoPessoa(m, await ibgeDe(m?.cidade ?? null, m?.uf ?? null)) ?? endTitular,
      Nome: m?.nome ?? "",
      Telefones: { Celular: { DDD: Number(cel.slice(0, 2)) || 0, Numero: Number(cel.slice(2)) || 0 } },
    });
    if (!r.ok) return { ok: false, etapa: "motorista", mensagem: traduzirErroEfrete(r.erro.mensagem), protocolo: r.erro.protocolo ?? null };
    await registrar("motorista", cpf, r.dados.ProtocoloServico);
  }
  return { ok: true, feitos };
}

function repositorio(operacaoId: string, previa: PreviaCiot, ator: Ator, confirmadoPorNome: string): RepositorioPedidos {
  return {
    async obter(ref) {
      const { data, error } = await admin.from("efrete_ciot_pedidos").select("status, ciot, tentativas").eq("id_operacao_cliente", ref).maybeSingle();
      if (error) throw new Error(`Banco: ${error.message}`);
      return data;
    },
    async registrarPendente(p) {
      const agora = new Date().toISOString();
      const { data, error } = await admin
        .from("efrete_ciot_pedidos")
        .insert({
          operacao_id: operacaoId,
          ambiente: AMBIENTE,
          tipo_viagem: "Padrao",
          id_operacao_cliente: p.idOperacaoCliente,
          documento_viagem: p.documentoViagem,
          valor_frete: p.valorFrete,
          data_inicio_viagem: p.dataInicio.toISOString(),
          data_fim_viagem: p.dataFim.toISOString(),
          piso_minimo: previa.piso.ok ? previa.piso.piso : null,
          piso_detalhe: previa.piso,
          confirmado_por: ator.pessoaId,
          confirmado_por_nome: confirmadoPorNome,
          confirmado_em: agora,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Banco: ${error.message}`);
      const { error: e2 } = await admin.from("efrete_ciot_pagamentos").insert(
        p.pagamentos.map((g) => ({ pedido_id: data.id, id_pagamento_cliente: g.idPagamentoCliente, categoria: g.categoria, valor: g.valor, data_liberacao: g.dataLiberacao.toISOString(), meio: "pix" })),
      );
      if (e2) throw new Error(`Banco: ${e2.message}`);
    },
    async marcarTentativa(ref) {
      const { data } = await admin.from("efrete_ciot_pedidos").select("tentativas").eq("id_operacao_cliente", ref).single();
      await admin.from("efrete_ciot_pedidos").update({ tentativas: (data?.tentativas ?? 0) + 1, atualizado_em: new Date().toISOString() }).eq("id_operacao_cliente", ref);
    },
    // Antes de interpretar o retorno: protocolo e código bruto ficam salvos mesmo que o resto falhe.
    async registrarRetorno(ref, r) {
      await admin
        .from("efrete_ciot_pedidos")
        .update({ protocolo: r.protocolo, resumo_retorno: { ciot_bruto: r.ciotBruto, protocolo: r.protocolo, erro: r.erro?.slice(0, 500) ?? null, em: new Date().toISOString() }, atualizado_em: new Date().toISOString() })
        .eq("id_operacao_cliente", ref);
    },
    async marcarEmitido(ref, e, resumo) {
      const agora = new Date().toISOString();
      const c = separarCiot(e.ciot);
      if (!c) throw new Error(`CIOT em formato inesperado: ${e.ciot}`);
      const { data: atual } = await admin.from("efrete_ciot_pedidos").select("id, protocolo, resumo_retorno, data_inicio_viagem, data_fim_viagem").eq("id_operacao_cliente", ref).single();
      const protocolo = atual?.protocolo ?? e.protocolo;
      const { error } = await admin
        .from("efrete_ciot_pedidos")
        .update({ status: "emitido", ciot: c.numero, ciot_verificador: c.verificador, protocolo, emitido_em: agora, ultimo_erro: null, resumo_retorno: { ...(atual?.resumo_retorno ?? {}), ...resumo }, atualizado_em: agora })
        .eq("id", atual!.id);
      if (error) throw new Error(`Banco: ${error.message}`);
      await admin.from("efrete_ciot_pagamentos").update({ status: "registrado", atualizado_em: agora }).eq("pedido_id", atual!.id);
      // Cópia para a operação (é o que o MDF-e e a linha do tempo leem).
      const { error: e3 } = await admin.from("operacao_ciot_vpo").upsert(
        {
          operacao_id: operacaoId,
          ciot: c.numero,
          ciot_verificador: c.verificador,
          ciot_origem: "efrete",
          ciot_ambiente: AMBIENTE,
          ciot_protocolo: protocolo,
          ciot_emitido_em: agora,
          ciot_status: "emitido",
          ciot_inicio_previsto: atual?.data_inicio_viagem ?? null,
          ciot_fim_previsto: atual?.data_fim_viagem ?? null,
          origem: "api",
        },
        { onConflict: "operacao_id" },
      );
      if (e3) throw new Error(`CIOT emitido, mas não consegui copiar para a operação: ${e3.message}`);
    },
    async marcarErro(ref, mensagem) {
      await admin.from("efrete_ciot_pedidos").update({ status: "erro", ultimo_erro: mensagem.slice(0, 1000), atualizado_em: new Date().toISOString() }).eq("id_operacao_cliente", ref);
    },
  };
}

async function pedidoAtual(operacaoId: string) {
  const { data } = await admin
    .from("efrete_ciot_pedidos")
    .select("id, id_operacao_cliente, status, ciot, ciot_verificador, protocolo, valor_frete, piso_minimo, emitido_em, cancelado_em, encerrado_em, cancelamento_protocolo, encerramento_protocolo, confirmado_por_nome, confirmado_em, ultimo_erro, tentativas, data_inicio_viagem, data_fim_viagem")
    .eq("operacao_id", operacaoId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function resumoPrevia(p: PreviaCiot) {
  const x = p.pedido;
  return {
    piso: p.piso,
    diferencaPiso: p.diferencaPiso,
    bloqueios: p.bloqueios,
    avisos: p.avisos,
    pedido: x && {
      referencia: x.idOperacaoCliente,
      inicio: dataEfrete(x.dataInicio),
      fim: dataEfrete(x.dataFim),
      frete: x.valorFrete,
      pagamentos: x.pagamentos.map((g) => ({ categoria: g.categoria, valor: g.valor, liberacao: dataEfrete(g.dataLiberacao) })),
      pix: x.pix.tipo,
      placas: x.placas,
      notas: x.notasFiscais.length,
      pesoKg: x.pesoKg,
      ncm: x.ncm,
      distanciaKm: x.distanciaKm,
      codigoTipoCarga: x.codigoTipoCarga,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  const falha = (e: { codigo: string; mensagem: string; protocolo?: string }) =>
    json({ ok: false, codigo: e.codigo, mensagem: traduzirErroEfrete(e.mensagem), mensagemOriginal: e.mensagem, protocolo: e.protocolo ?? null });
  try {
    const a = await autorizado(req);
    if (!a.ok) return json({ ok: false, motivo: a.erro }, a.status);
    const cfg = await carregarConfig();
    if (!cfg.baseUrl.includes("dev.efrete.com.br")) {
      return json({ ok: false, motivo: "Trava de segurança: a emissão de CIOT pela efrete ainda só roda na homologação (dev.efrete.com.br)." }, 412);
    }
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(corpo.acao ?? "");
    const operacaoId = String(corpo.operacao_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(operacaoId)) return json({ ok: false, motivo: "Informe operacao_id." }, 400);
    console.log(`[efrete-ciot-operacao] acao=${acao} quem=${a.ator.quem}`);

    if (acao === "status") return json({ ok: true, pedido: await pedidoAtual(operacaoId) });

    if (acao === "previa" || acao === "emitir") {
      const ctx = await carregar(operacaoId);
      const previa = pedidoDaOperacao(ctx.dados);
      if (acao === "previa") return json({ ok: true, ambiente: AMBIENTE, ...resumoPrevia(previa), atual: await pedidoAtual(operacaoId) });
      // Confirmação humana: quem confirmou e quando ficam no pedido.
      if (corpo.confirmar !== true) return json({ ok: false, motivo: "Confirme a prévia antes de emitir (confirmar: true)." }, 400);
      const confirmadoPorNome = a.ator.nome ?? String(corpo.confirmado_por_nome ?? "").trim();
      if (!confirmadoPorNome) return json({ ok: false, motivo: "Informe quem confirmou a emissão." }, 400);
      // CIOT de homologação nunca entra em operação real (sobrescreveria o CIOT de verdade em operacao_ciot_vpo).
      if (AMBIENTE === "homologacao" && !ctx.ehTeste) {
        return json({ ok: false, motivo: "Na homologação da efrete só operação de TESTE emite CIOT. Use uma operação de teste." }, 412);
      }
      if (!previa.pedido) return json({ ok: false, etapa: "validacao", ...resumoPrevia(previa) });
      const cad = await garantirCadastros(ctx);
      if (!cad.ok) return json({ ok: false, etapa: `cadastro (${cad.etapa})`, mensagem: cad.mensagem, protocolo: cad.protocolo });
      const r = await emitirComAntiDuplicidade(efrete, repositorio(operacaoId, previa, a.ator, confirmadoPorNome), previa.pedido, ctx.dados.agora);
      console.log(`[efrete-ciot-operacao] emitir ok=${r.ok}${r.ok ? ` jaExistia=${r.jaExistia}` : ` etapa=${r.etapa}`}`);
      return json({ ...r, cadastros: cad.feitos, piso: previa.piso, diferencaPiso: previa.diferencaPiso, atual: await pedidoAtual(operacaoId) });
    }

    const p = await pedidoAtual(operacaoId);
    if (acao === "consultar") {
      if (!p) return json({ ok: false, motivo: "Operação sem pedido de CIOT." }, 404);
      const r = await efrete.obterCiotPorReferencia(Deno.env.get("RBR_CNPJ") ?? "69115969000104", p.id_operacao_cliente);
      return r.ok ? json({ ok: true, encontrado: r.dados }) : falha(r.erro);
    }
    if (!p?.ciot) return json({ ok: false, motivo: "Operação sem CIOT emitido pela efrete." }, 404);
    const codigo = juntarCiot(p.ciot, p.ciot_verificador);

    if (acao === "pdf") {
      const r = await efrete.obterPdfOperacao(codigo);
      if (!r.ok) return falha(r.erro);
      return json({ ok: true, nomeArquivo: `CIOT-${p.ciot}.pdf`, pdfBase64: corpo.so_tamanho === true ? undefined : r.dados.pdfBase64, bytes: Math.floor((r.dados.pdfBase64.length * 3) / 4) });
    }
    if (acao === "transacoes") {
      const desde = new Date(Date.now() - 24 * 3600_000);
      const r = await efrete.obterTransacoes([codigo], `${dataEfrete(desde).slice(0, 10)}T00:00:00`);
      return r.ok ? json({ ok: true, transacoes: r.dados.map((t) => ({ ...t, Token: undefined })) }) : falha(r.erro);
    }
    if (acao === "cancelar") {
      const motivo = String(corpo.motivo ?? "").trim();
      if (motivo.length < 15) return json({ ok: false, motivo: "Escreva o motivo do cancelamento (mín. 15 caracteres)." }, 400);
      const r = await efrete.cancelarOperacaoTransporte(codigo, motivo);
      if (!r.ok) return falha(r.erro);
      const agora = new Date().toISOString();
      await admin.from("efrete_ciot_pedidos").update({ status: "cancelado", cancelado_em: agora, cancelamento_protocolo: r.dados.protocolo, cancelamento_motivo: motivo, atualizado_em: agora }).eq("id", p.id);
      await admin.from("efrete_ciot_pagamentos").update({ status: "cancelado", atualizado_em: agora }).eq("pedido_id", p.id);
      await admin.from("operacao_ciot_vpo").update({ ciot_status: "cancelado", ciot_cancelado_em: agora }).eq("operacao_id", operacaoId);
      return json({ ok: true, protocolo: r.dados.protocolo, data: r.dados.data });
    }
    if (acao === "encerrar") {
      const { data: nfes } = await admin.from("operacao_nfes").select("peso_kg").eq("operacao_id", operacaoId);
      const peso = (nfes ?? []).reduce((s, n) => s + Number(n.peso_kg ?? 0), 0);
      const versao = corpo.versao === 3 ? 3 : 2;
      const r = await efrete.encerrarOperacaoTransporte(codigo, peso > 0 ? peso : null, versao);
      if (!r.ok) return falha(r.erro);
      const agora = new Date().toISOString();
      await admin.from("efrete_ciot_pedidos").update({ status: "encerrado", encerrado_em: agora, encerramento_protocolo: r.dados.protocolo, atualizado_em: agora }).eq("id", p.id);
      await admin.from("operacao_ciot_vpo").update({ ciot_status: "encerrado", ciot_encerrado_em: agora }).eq("operacao_id", operacaoId);
      return json({ ok: true, protocolo: r.dados.protocolo, versao });
    }
    return json({ ok: false, motivo: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("[efrete-ciot-operacao]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, motivo: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
