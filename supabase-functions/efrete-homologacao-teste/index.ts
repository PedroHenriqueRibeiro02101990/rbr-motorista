// Edge Function: efrete-homologacao-teste  (verify_jwt = true)
//
// Passo 2 da integração efrete (NSTech): testa a conexão na HOMOLOGAÇÃO. Não emite CIOT nem registra pagamento.
// Ações:
//   {acao:"login", variante?:"original"|"sem_espaco"|"cnpj", verbo?:"GET"|"POST"} -> {ok, motivo}  (nunca o token)
//   {acao:"consultar-situacao", cpfCnpj, rntrc, placas[], dataFimViagem?, interessado?} -> retorno da efrete
//   {acao:"logout"} -> {ok, motivo}
// Quem pode chamar: gestor RBR (sessão do app), service_role, ou o próprio banco com a chave interna
// EFRETE_TESTE_CHAMADA_INTERNA no cabeçalho x-efrete-chave-interna (gerada no banco; ninguém vê).
// Trava: recusa rodar se EFRETE_BASE_URL não for a homologação (dev.efrete.com.br).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { carregarConfigDoVault, criarClienteEfrete, varianteUsuario, type ConfigEfrete, type Verbo } from "../_shared/efreteClient.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-efrete-chave-interna",
};
const CNPJ_RBR = "69115969000104";

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

// A homologação da efrete recusa HTTP/2 ("endpoint requires HTTP/1.1"); o fetch do Deno negocia HTTP/2 por padrão.
// Força HTTP/1.1 com um cliente HTTP próprio.
const http1 = (() => {
  try {
    return (Deno as unknown as { createHttpClient?: (o: Record<string, unknown>) => unknown }).createHttpClient?.({ http1: true, http2: false });
  } catch {
    return undefined;
  }
})();
const fetchHttp1: typeof fetch = (entrada, init) => fetch(entrada, http1 ? ({ ...init, client: http1 } as unknown as RequestInit) : init);

// Um cliente por isolate: o token fica na memória e é reaproveitado entre chamadas do mesmo isolate.
const clientes = new Map<Verbo, ReturnType<typeof criarClienteEfrete>>();
const cliente = (verboLogin: Verbo = "GET") => {
  if (!clientes.has(verboLogin)) {
    clientes.set(verboLogin, criarClienteEfrete({ carregarConfig, fetch: fetchHttp1, verboLogin, verboConsulta: verboLogin, log: (m) => console.log(m) }));
  }
  return clientes.get(verboLogin)!;
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  try {
    const a = await autorizado(req);
    if (!a.ok) return json({ ok: false, motivo: a.erro }, a.status);

    const cfg = await carregarConfig();
    if (!cfg.baseUrl.includes("dev.efrete.com.br")) {
      return json({ ok: false, motivo: "Trava de segurança: EFRETE_BASE_URL não é a homologação (dev.efrete.com.br). Este teste só roda na homologação." }, 412);
    }

    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = String(corpo.acao ?? "");
    const verbo: Verbo = corpo.verbo === "POST" ? "POST" : "GET";

    if (acao === "login") {
      const variante = (["original", "sem_espaco", "cnpj"].includes(String(corpo.variante)) ? corpo.variante : "original") as "original" | "sem_espaco" | "cnpj";
      const r = await cliente(verbo).login({ usuario: varianteUsuario(cfg.usuario, variante, CNPJ_RBR), forcar: true });
      console.log(`[efrete-teste] login variante=${variante} verbo=${verbo} quem=${a.quem} http1=${Boolean(http1)} ok=${r.ok}${r.ok ? "" : ` codigo=${r.erro.codigo}`}`);
      return json(r.ok ? { ok: true, motivo: "Login aceito pela efrete (token guardado só na memória da função)." } : { ok: false, motivo: `${r.erro.codigo}: ${r.erro.mensagem}`, http: r.erro.http ?? null });
    }

    if (acao === "consultar-situacao") {
      const placas = Array.isArray(corpo.placas) ? corpo.placas.map(String) : [];
      if (!corpo.cpfCnpj || !corpo.rntrc || placas.length === 0) return json({ ok: false, motivo: "Informe cpfCnpj, rntrc e placas." }, 400);
      const r = await cliente(verbo).consultarSituacaoTransportador({
        interessadoCpfCnpj: String(corpo.interessado ?? CNPJ_RBR),
        transportadorCpfCnpj: String(corpo.cpfCnpj),
        rntrc: String(corpo.rntrc),
        placas,
        dataPrevistaFimViagem: corpo.dataFimViagem ? String(corpo.dataFimViagem) : undefined,
      });
      console.log(`[efrete-teste] consulta ${String(corpo.cpfCnpj).slice(0, 4)}… ok=${r.ok}`);
      return json(r.ok ? { ok: true, situacao: r.dados } : { ok: false, motivo: `${r.erro.codigo}: ${r.erro.mensagem}`, http: r.erro.http ?? null });
    }

    // Diagnóstico de rede SEM credenciais: POST {} no Login (a efrete responde "Integrador não cadastrado").
    if (acao === "sondar") {
      const alvo = `${cfg.baseUrl.replace(/\/+$/, "").replace(/\/services$/i, "")}/services/Logon/Login`;
      const tentar = async (nome: string, f: typeof fetch) => {
        const inicio = Date.now();
        try {
          const r = await f(alvo, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          const t = (await r.text()).slice(0, 200);
          return { modo: nome, http: r.status, ms: Date.now() - inicio, resposta: t };
        } catch (e) {
          return { modo: nome, erro: String((e as Error)?.message ?? e).slice(0, 300), ms: Date.now() - inicio };
        }
      };
      const tls = async () => {
        const inicio = Date.now();
        try {
          const host = new URL(alvo).hostname;
          const conn = await Deno.connectTls({ hostname: host, port: 443, alpnProtocols: ["http/1.1"] });
          const req = `POST /services/Logon/Login HTTP/1.1\r\nHost: ${host}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`;
          await conn.write(new TextEncoder().encode(req));
          const buf = new Uint8Array(4096);
          let txt = "";
          for (;;) {
            const n = await conn.read(buf);
            if (n === null) break;
            txt += new TextDecoder().decode(buf.subarray(0, n));
            if (txt.length > 3000) break;
          }
          try { conn.close(); } catch { /* já fechada */ }
          return { modo: "tls-direto-http1.1", ms: Date.now() - inicio, resposta: txt.slice(0, 400) };
        } catch (e) {
          return { modo: "tls-direto-http1.1", erro: String((e as Error)?.message ?? e).slice(0, 300), ms: Date.now() - inicio };
        }
      };
      // TLS com HTTP/1.1 em cada IP do domínio (SNI e certificado continuam os de dev.efrete.com.br).
      const porIp = async (ip: string) => {
        const inicio = Date.now();
        try {
          const host = new URL(alvo).hostname;
          const tcp = await Deno.connect({ hostname: ip, port: 443 });
          const conn = await Deno.startTls(tcp, { hostname: host, alpnProtocols: ["http/1.1"] });
          const req = `POST /services/Logon/Login HTTP/1.1\r\nHost: ${host}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`;
          await conn.write(new TextEncoder().encode(req));
          const buf = new Uint8Array(4096);
          let txt = "";
          for (;;) {
            const n = await conn.read(buf);
            if (n === null) break;
            txt += new TextDecoder().decode(buf.subarray(0, n));
            if (txt.length > 3000) break;
          }
          try { conn.close(); } catch { /* já fechada */ }
          return { modo: `tls-ip-${ip}`, ms: Date.now() - inicio, resposta: txt.slice(0, 300) };
        } catch (e) {
          return { modo: `tls-ip-${ip}`, erro: String((e as Error)?.message ?? e).slice(0, 200), ms: Date.now() - inicio };
        }
      };
      let ips: string[] = [];
      try {
        ips = await Deno.resolveDns(new URL(alvo).hostname, "A");
      } catch { /* sem DNS */ }
      const resultados = [await tentar("fetch-padrao", fetch), await tentar("fetch-http1", fetchHttp1), await tls()];
      for (const ip of ips) resultados.push(await porIp(ip));
      return json({ ok: true, alvo, ips, http1Disponivel: Boolean(http1), resultados });
    }

    if (acao === "logout") {
      const r = await cliente(verbo).logout();
      return json(r.ok ? { ok: true, motivo: "Logout feito (ou não havia sessão neste isolate)." } : { ok: false, motivo: `${r.erro.codigo}: ${r.erro.mensagem}` });
    }

    return json({ ok: false, motivo: "Ação desconhecida. Use login, consultar-situacao ou logout." }, 400);
  } catch (e) {
    console.error("[efrete-teste]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, motivo: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
