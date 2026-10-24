// Edge Function: efrete-ciot-teste  (verify_jwt = true)
//
// Passo 3 da integração efrete (NSTech): roteiro de UM CIOT Padrão (Lotação) com Pix na HOMOLOGAÇÃO.
// Não está ligada à tela da operação e não mexe no MDF-e. Dados: massa da ANTT + dados fictícios válidos.
// Ações (uma chamada por ação, para respeitar o limite de 3 tentativas por chamada):
//   {acao:"tipos-carga"}
//   {acao:"cadastro-proprietario", rntrc}
//   {acao:"cadastro-veiculo", placa, rntrc, tipo:"cavalo"|"semirreboque"}
//   {acao:"cadastro-motorista"}
//   {acao:"emitir", ref, rntrc?, codigoTipoCarga}   -> grava o pedido ANTES; anti-duplicidade pela referência
//   {acao:"consultar-ref", ref} | {acao:"pdf", ref} | {acao:"transacoes", ref} | {acao:"cancelar", ref, motivo?}
// Quem pode chamar: gestor RBR, service_role, ou o banco com a chave interna (igual a efrete-homologacao-teste).
// Trava: recusa rodar se EFRETE_BASE_URL não for a homologação (dev.efrete.com.br).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { carregarConfigDoVault, criarClienteEfrete, type ConfigEfrete } from "../_shared/efreteClient.ts";
import {
  dataEfrete,
  emitirComAntiDuplicidade,
  gerarChassi,
  gerarCnh,
  gerarCpf,
  gerarRenavam,
  type EnderecoEfrete,
  type PedidoCiotPadrao,
  type RepositorioPedidos,
} from "../_shared/ciotEfrete.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-efrete-chave-interna",
};

// Dados fixos do teste. Transportador e placas: massa da ANTT. Motorista e veículos: fictícios válidos.
const RBR = { cnpj: "69115969000104", nome: "RBR CARGO TRANSPORTE DE CARGA E LOGISTICA LTDA" };
const END_RBR: EnderecoEfrete = { Bairro: "Bela Vista", Rua: "Av. Paulista", Numero: "777", CEP: "01311914", CodigoMunicipio: 3550308 };
const TRANSPORTADOR = "48386492000121";
const SEMENTE = 20261024;
const MOTORISTA = { cpf: gerarCpf(SEMENTE), cnh: gerarCnh(SEMENTE), ddd: 11, numero: 912345678 };
const FRETE = { adiantamento: 3000, quitacao: 5000 }; // R$ 8.000; piso da ANTT não calculado neste teste

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

function iguais(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function autorizado(req: Request): Promise<{ ok: true; quem: string } | { ok: false; status: number; erro: string }> {
  const interna = req.headers.get("x-efrete-chave-interna") ?? "";
  if (interna) {
    const esperada = (await segredo("EFRETE_TESTE_CHAMADA_INTERNA")) ?? "";
    return iguais(interna, esperada) ? { ok: true, quem: "banco" } : { ok: false, status: 403, erro: "Chave interna inválida." };
  }
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (jwt && iguais(jwt, serviceKey)) return { ok: true, quem: "service_role" };
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await comoUsuario.auth.getUser();
  if (!data?.user) return { ok: false, status: 401, erro: "Não autenticado." };
  const { data: p } = await admin.from("pessoas").select("papel").eq("auth_user_id", data.user.id).maybeSingle();
  if (p?.papel !== "gestor_rbr") return { ok: false, status: 403, erro: "Só um gestor RBR pode testar a integração efrete." };
  return { ok: true, quem: "gestor" };
}

// Nunca devolve Token/Integrador nem textos longos.
function resumir(d: unknown): unknown {
  if (Array.isArray(d)) return d.slice(0, 20).map(resumir);
  if (d && typeof d === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (/^(token|integrador|senha|usuario|pdf)$/i.test(k)) continue;
      o[k] = resumir(v);
    }
    return o;
  }
  return typeof d === "string" && d.length > 300 ? `${d.slice(0, 300)}…` : d;
}

function montarPedido(ref: string, rntrc: string, codigoTipoCarga: number, agora: Date): PedidoCiotPadrao {
  const inicio = new Date(agora.getTime() + 2 * 3600_000);
  const fim = new Date(agora.getTime() + 26 * 3600_000);
  return {
    idOperacaoCliente: ref,
    documentoViagem: `TESTE-${ref}`,
    matrizCnpj: RBR.cnpj,
    dataInicio: inicio,
    dataFim: fim,
    ncm: "3923",
    pesoKg: 1000,
    tipoEmbalagem: "Caixa",
    codigoTipoCarga,
    origem: { lat: -23.561414, lon: -46.655881, codigoMunicipio: 3550308 }, // São Paulo (Av. Paulista)
    destino: { lat: -22.90556, lon: -47.06083, codigoMunicipio: 3509502 }, // Campinas (centro)
    distanciaKm: 100,
    valorFrete: FRETE.adiantamento + FRETE.quitacao,
    pedagio: 0,
    pagamentos: [
      { idPagamentoCliente: `${ref}-AD`, categoria: "Adiantamento", valor: FRETE.adiantamento, dataLiberacao: inicio },
      { idPagamentoCliente: `${ref}-QT`, categoria: "Quitacao", valor: FRETE.quitacao, dataLiberacao: fim },
    ],
    pix: { tipo: "CpfOuCnpj", valor: TRANSPORTADOR },
    cpfCnpjCreditado: TRANSPORTADOR,
    contratado: { cpfOuCnpj: TRANSPORTADOR, rntrc },
    motorista: MOTORISTA,
    contratante: { cnpj: RBR.cnpj, nome: RBR.nome, endereco: END_RBR },
    destinatario: { cnpj: RBR.cnpj, nome: RBR.nome, endereco: END_RBR },
    placas: ["RQW4D58", "RRD5B39"],
    composicaoVeicular: true,
    notaFiscal: { numero: "1", serie: "1", valorTotal: 20000, valorPorUnidade: 20, quantidade: 1000 },
  };
}

// Repositório no banco (service_role). O pedido e os pagamentos são gravados ANTES de chamar a efrete.
const repo: RepositorioPedidos = {
  async obter(ref) {
    const { data, error } = await admin.from("efrete_ciot_pedidos").select("status, ciot, tentativas").eq("id_operacao_cliente", ref).maybeSingle();
    if (error) throw new Error(`Banco: ${error.message}`);
    return data;
  },
  async registrarPendente(p) {
    const { data, error } = await admin
      .from("efrete_ciot_pedidos")
      .insert({
        ambiente: "homologacao",
        tipo_viagem: "Padrao",
        id_operacao_cliente: p.idOperacaoCliente,
        documento_viagem: p.documentoViagem,
        valor_frete: p.valorFrete,
        data_inicio_viagem: p.dataInicio.toISOString(),
        data_fim_viagem: p.dataFim.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`Banco: ${error.message}`);
    const { error: e2 } = await admin.from("efrete_ciot_pagamentos").insert(
      p.pagamentos.map((g) => ({
        pedido_id: data.id,
        id_pagamento_cliente: g.idPagamentoCliente,
        categoria: g.categoria,
        valor: g.valor,
        data_liberacao: g.dataLiberacao.toISOString(),
        meio: "pix",
      })),
    );
    if (e2) throw new Error(`Banco: ${e2.message}`);
  },
  async marcarTentativa(ref) {
    const { data } = await admin.from("efrete_ciot_pedidos").select("tentativas").eq("id_operacao_cliente", ref).single();
    await admin.from("efrete_ciot_pedidos").update({ tentativas: (data?.tentativas ?? 0) + 1, atualizado_em: new Date().toISOString() }).eq("id_operacao_cliente", ref);
  },
  async marcarEmitido(ref, e, resumo) {
    const agora = new Date().toISOString();
    const { data, error } = await admin
      .from("efrete_ciot_pedidos")
      .update({ status: "emitido", ciot: e.ciot, protocolo: e.protocolo, emitido_em: agora, ultimo_erro: null, resumo_retorno: resumo, atualizado_em: agora })
      .eq("id_operacao_cliente", ref)
      .select("id")
      .single();
    if (error) throw new Error(`Banco: ${error.message}`);
    await admin.from("efrete_ciot_pagamentos").update({ status: "registrado", atualizado_em: agora }).eq("pedido_id", data.id);
  },
  async marcarErro(ref, mensagem) {
    await admin.from("efrete_ciot_pedidos").update({ status: "erro", ultimo_erro: mensagem.slice(0, 1000), atualizado_em: new Date().toISOString() }).eq("id_operacao_cliente", ref);
  },
};

async function pedidoEmitido(ref: string) {
  const { data } = await admin.from("efrete_ciot_pedidos").select("id, status, ciot, emitido_em").eq("id_operacao_cliente", ref).maybeSingle();
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  const falha = (e: { codigo: string; mensagem: string; http?: number; protocolo?: string }) =>
    json({ ok: false, codigo: e.codigo, mensagem: e.mensagem, protocolo: e.protocolo ?? null, http: e.http ?? null });
  try {
    const a = await autorizado(req);
    if (!a.ok) return json({ ok: false, motivo: a.erro }, a.status);

    const cfg = await carregarConfig();
    if (!cfg.baseUrl.includes("dev.efrete.com.br")) {
      return json({ ok: false, motivo: "Trava de segurança: EFRETE_BASE_URL não é a homologação (dev.efrete.com.br). Este teste só roda na homologação." }, 412);
    }

    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(corpo.acao ?? "");
    const ref = String(corpo.ref ?? "");
    const rntrc = String(corpo.rntrc ?? "56802388").replace(/\D/g, "");
    console.log(`[efrete-ciot] acao=${acao} quem=${a.quem} modo=${await efrete.modo()}`);

    if (acao === "tipos-carga") {
      const r = await efrete.consultarTiposCarga();
      return r.ok ? json({ ok: true, tipos: r.dados }) : falha(r.erro);
    }

    if (acao === "cadastro-proprietario") {
      const r = await efrete.gravarCadastro("proprietarios", {
        Versao: 4,
        CNPJ: TRANSPORTADOR,
        Endereco: { Bairro: "Centro", CEP: "01310930", CodigoMunicipio: 3550308, Rua: "Rua Fictícia de Teste", Numero: "100" },
        RNTRC: rntrc,
        RazaoSocial: "TRANSPORTADOR MASSA ANTT HOMOLOGACAO",
      });
      return r.ok ? json({ ok: true, rntrcEnviado: rntrc, retorno: resumir(r.dados) }) : falha(r.erro);
    }

    if (acao === "cadastro-veiculo") {
      const placa = String(corpo.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) return json({ ok: false, motivo: "Placa inválida." }, 400);
      const cavalo = corpo.tipo === "cavalo";
      const semente = SEMENTE + placa.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
      const r = await efrete.gravarCadastro("veiculos", {
        Versao: 1,
        Veiculo: {
          Chassi: gerarChassi(semente),
          NumeroDeEixos: 3,
          Placa: placa,
          RNTRC: rntrc,
          Renavam: Number(gerarRenavam(semente)),
          TipoCarroceria: cavalo ? "NaoAplicavel" : "FechadaOuBau",
          TipoRodado: cavalo ? "Cavalo" : "NaoAplicavel",
        },
      });
      return r.ok ? json({ ok: true, placa, retorno: resumir(r.dados) }) : falha(r.erro);
    }

    if (acao === "cadastro-motorista") {
      const r = await efrete.gravarCadastro("motoristas", {
        Versao: 2,
        CNH: MOTORISTA.cnh,
        CPF: MOTORISTA.cpf,
        DataNascimento: "1985-06-15T00:00:00",
        Endereco: { Bairro: "Centro", CEP: "01310930", CodigoMunicipio: 3550308, Rua: "Rua Fictícia de Teste", Numero: "200" },
        Nome: "MOTORISTA FICTICIO TESTE RBR",
        Telefones: { Celular: { DDD: MOTORISTA.ddd, Numero: MOTORISTA.numero } },
      });
      return r.ok ? json({ ok: true, retorno: resumir(r.dados) }) : falha(r.erro);
    }

    if (!/^RBR-HML-[A-Z0-9-]{1,40}$/.test(ref)) return json({ ok: false, motivo: "Informe ref no formato RBR-HML-…" }, 400);

    if (acao === "emitir") {
      const codigoTipoCarga = Number(corpo.codigoTipoCarga);
      if (!Number.isInteger(codigoTipoCarga)) return json({ ok: false, motivo: "Informe codigoTipoCarga (de tipos-carga)." }, 400);
      const agora = new Date();
      const r = await emitirComAntiDuplicidade(efrete, repo, montarPedido(ref, rntrc, codigoTipoCarga, agora), agora);
      console.log(`[efrete-ciot] emitir ref=${ref} ok=${r.ok}${r.ok ? ` jaExistia=${r.jaExistia}` : ` etapa=${r.etapa}`}`);
      return json(r);
    }

    if (acao === "consultar-ref") {
      const r = await efrete.obterCiotPorReferencia(RBR.cnpj, ref);
      return r.ok ? json({ ok: true, encontrado: r.dados }) : falha(r.erro);
    }

    const p = await pedidoEmitido(ref);
    if (!p?.ciot) return json({ ok: false, motivo: "Pedido sem CIOT registrado." }, 404);

    if (acao === "pdf") {
      const r = await efrete.obterPdfOperacao(p.ciot);
      if (!r.ok) return falha(r.erro);
      let bytes = new Uint8Array();
      try {
        bytes = Uint8Array.from(atob(r.dados.pdfBase64), (c) => c.charCodeAt(0));
      } catch { /* base64 inválido: tamanho 0 */ }
      const txt = new TextDecoder("latin1").decode(bytes);
      return json({
        ok: true,
        bytes: bytes.length,
        cabecalho: txt.slice(0, 8),
        terminaComEOF: /%%EOF\s*$/.test(txt),
        paginas: (txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
      });
    }

    if (acao === "transacoes") {
      const desde = new Date(Date.now() - 24 * 3600_000);
      const r = await efrete.obterTransacoes([p.ciot], `${dataEfrete(desde).slice(0, 10)}T00:00:00`);
      return r.ok ? json({ ok: true, transacoes: resumir(r.dados) }) : falha(r.erro);
    }

    if (acao === "cancelar") {
      const motivo = String(corpo.motivo ?? "Teste de homologacao RBR - cancelamento do ciclo");
      const r = await efrete.cancelarOperacaoTransporte(p.ciot, motivo);
      if (!r.ok) return falha(r.erro);
      const agora = new Date().toISOString();
      await admin
        .from("efrete_ciot_pedidos")
        .update({ status: "cancelado", cancelado_em: agora, cancelamento_protocolo: r.dados.protocolo, cancelamento_motivo: motivo, atualizado_em: agora })
        .eq("id", p.id);
      await admin.from("efrete_ciot_pagamentos").update({ status: "cancelado", atualizado_em: agora }).eq("pedido_id", p.id);
      return json({ ok: true, protocolo: r.dados.protocolo, data: r.dados.data });
    }

    return json({ ok: false, motivo: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("[efrete-ciot]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, motivo: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
