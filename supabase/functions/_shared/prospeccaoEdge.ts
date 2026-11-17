// Prospeccao: pecas comuns dos robos (codigo Deno; a regra esta em prospeccaoRegras.ts e prospeccaoCaixa.ts, testadas).
// Segredos vem do Vault por prospeccao_segredo (so service_role) e NUNCA entram em log, auditoria, resposta ou erro.
// Os robos so rodam com a chave service_role (agendador pg_cron + pg_net); verify_jwt = true no deploy E checagem aqui.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { avisoDeAbuso, motivoParadaAutomatica, type SinaisParada } from "./prospeccaoRegras.ts";
import { enviarComCopia, type CaixaCfg, type ResultadoCopia } from "./prospeccaoCaixa.ts";

export const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export const PAINEL = "https://gestor.rbrcargo.com.br/prospeccao";

export function autorizado(req: Request): boolean {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return !!chave && (req.headers.get("Authorization") ?? "") === `Bearer ${chave}`;
}
export const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "Content-Type": "application/json" } });

// ---- configuracao --------------------------------------------------------------------------------------
export interface Flags {
  envio: boolean; leitura: boolean; aprovacaoObrigatoria: boolean; respostaAutomatica: boolean; modoTeste: boolean; limiteDiario: number | null;
}
export async function lerFlags(): Promise<Flags> {
  const { data } = await admin.from("parametros_sistema").select("chave, valor").like("chave", "PROSPECCAO\\_%");
  const m = new Map<string, string>((data ?? []).map((r: { chave: string; valor: unknown }) => [r.chave, String(r.valor)]));
  const sim = (k: string, padrao: boolean) => (m.has(k) ? m.get(k) === "sim" : padrao);
  const lim = m.get("PROSPECCAO_LIMITE_DIARIO");
  return {
    envio: sim("PROSPECCAO_ENVIO_LIBERADO", false), leitura: sim("PROSPECCAO_LEITURA_LIBERADA", false),
    aprovacaoObrigatoria: sim("PROSPECCAO_APROVACAO_OBRIGATORIA", true), respostaAutomatica: sim("PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA", false),
    modoTeste: sim("PROSPECCAO_MODO_TESTE", true), limiteDiario: lim == null ? null : Number(lim),
  };
}
export async function segredo(nome: string): Promise<string | null> {
  const { data, error } = await admin.rpc("prospeccao_segredo", { p_nome: nome });
  if (error) throw new Error("Nao consegui ler a configuracao de e-mail.");
  return (data as string | null) ?? null;
}
export async function feriados(): Promise<Set<string>> {
  const { data } = await admin.from("feriados").select("data");
  return new Set((data ?? []).map((r: { data: string }) => String(r.data).slice(0, 10)));
}

// ---- log e auditoria -----------------------------------------------------------------------------------
export async function logar(robo: "enviar" | "ler" | "sistema", acao: string, o: { empresa_id?: string | null; resultado?: string; erro?: string; caixa_id?: string | null } = {}) {
  await admin.from("prospeccao_log").insert({ robo, acao, empresa_id: o.empresa_id ?? null, resultado: o.resultado ?? null, erro: o.erro ? o.erro.slice(0, 500) : null, caixa_id: o.caixa_id ?? null });
}
/** Evita 288 linhas por dia dizendo "desligado": so grava de novo depois de 1 hora. */
export async function logarSemRepetir(robo: "enviar" | "ler", acao: string, resultado?: string) {
  const desde = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from("prospeccao_log").select("id", { count: "exact", head: true }).eq("robo", robo).eq("acao", acao).gte("momento", desde);
  if (!count) await logar(robo, acao, { resultado });
}
export async function auditar(acao: string, dado: Record<string, unknown>) {
  await admin.from("auditoria_log").insert({ acao, entidade: "prospeccao", dado_depois: dado });
}

// ---- caixas --------------------------------------------------------------------------------------------
export type CaixaRow = CaixaCfg & { smtp_host: string; smtp_porta: number; imap_host: string; imap_porta: number; segredo_senha: string; leitura_a_cada_min: number; ultima_leitura_em: string | null; idle_suportado: boolean | null; idle_ligado: boolean; primeiro_envio_em: string | null };
export async function lerCaixas(): Promise<CaixaRow[]> {
  const { data, error } = await admin.from("prospeccao_caixas").select("*").order("papel");
  if (error) throw new Error("Nao consegui ler as caixas.");
  return (data ?? []) as CaixaRow[];
}
/** Senha da caixa: segredo proprio no Vault; so a caixa que e a "legada" (PROSPECCAO_EMAIL_USUARIO) cai no segredo antigo. Nunca vai para log. */
export async function senhaDaCaixa(c: Pick<CaixaRow, "endereco" | "segredo_senha">): Promise<string | null> {
  const propria = await segredo(c.segredo_senha);
  if (propria) return propria;
  const usuarioAntigo = await segredo("PROSPECCAO_EMAIL_USUARIO");
  if (usuarioAntigo && usuarioAntigo.toLowerCase() === c.endereco) return await segredo("PROSPECCAO_EMAIL_SENHA");
  return null;
}
export async function caixasComCredencial(caixas: readonly CaixaRow[]): Promise<Set<string>> {
  const ok = new Set<string>();
  for (const c of caixas) { try { if (await senhaDaCaixa(c)) ok.add(c.id); } catch { /* sem credencial */ } }
  return ok;
}

// ---- e-mail --------------------------------------------------------------------------------------------
export interface Smtp {
  host: string; porta: number; usuario: string; senha: string; nome?: string; caixaId?: string | null;
  copia?: { guardar: boolean; pasta: string | null; imapHost: string; imapPorta: number };
}
/** Caminho antigo (uma caixa so, segredos PROSPECCAO_SMTP_* / PROSPECCAO_EMAIL_*). Mantido para o alerta quando nenhuma caixa nova estiver pronta. */
export async function lerSmtp(): Promise<Smtp | null> {
  const [host, porta, usuario, senha] = await Promise.all([segredo("PROSPECCAO_SMTP_HOST"), segredo("PROSPECCAO_SMTP_PORTA"), segredo("PROSPECCAO_EMAIL_USUARIO"), segredo("PROSPECCAO_EMAIL_SENHA")]);
  if (!host || !porta || !usuario || !senha) return null;
  return { host, porta: Number(porta), usuario, senha };
}
export async function smtpDaCaixa(c: CaixaRow): Promise<Smtp | null> {
  const senha = await senhaDaCaixa(c);
  if (!senha) return null;
  return {
    host: c.smtp_host, porta: c.smtp_porta, usuario: c.endereco, senha, nome: c.nome_exibicao, caixaId: c.id,
    copia: { guardar: c.guardar_copia_enviados, pasta: c.pasta_enviados, imapHost: c.imap_host, imapPorta: c.imap_porta },
  };
}
export interface Anexo { filename: string; content: Uint8Array; contentType?: string }
export interface EmailSaida {
  para: string[]; cc?: string[]; assunto: string; texto: string; messageId?: string; inReplyTo?: string; references?: string; headers?: Record<string, string>; anexos?: Anexo[];
}
/**
 * Envia texto puro (sem HTML, imagem ou rastreador). Em modo teste, vai so para os destinos de teste com [TESTE] no assunto.
 * Uma unica conexao SMTP por envio (pool de 1), porta 465 primeiro e 587 so se a CONEXAO na 465 falhar (nunca depois de ter enviado).
 * Depois de enviar grava a copia em Enviados por IMAP APPEND (a menos que o diagnostico tenha achado que o servidor ja guarda).
 */
export async function enviarEmail(smtp: Smtp, e: EmailSaida, modoTeste: boolean): Promise<{ destinos: string[]; copia: ResultadoCopia }> {
  let para = e.para, cc = e.cc ?? [], assunto = e.assunto;
  if (modoTeste) {
    const { data } = await admin.from("prospeccao_destinos_teste").select("email");
    para = (data ?? []).map((r: { email: string }) => r.email);
    cc = [];
    assunto = `[TESTE] ${assunto}`;
    if (para.length === 0) throw new Error("Modo teste sem destinos cadastrados em prospeccao_destinos_teste.");
  }
  const compositor = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const info = await compositor.sendMail({
    from: { name: smtp.nome ?? "Pedro | RBR Cargo", address: smtp.usuario }, replyTo: smtp.usuario,
    to: para, cc, subject: assunto, text: e.texto, messageId: e.messageId, inReplyTo: e.inReplyTo, references: e.references, headers: e.headers,
    attachments: (e.anexos ?? []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    // sem html, sem rastreador de abertura, sem encurtador de link
  });
  const raw = new Uint8Array(info.message as Uint8Array);
  const envelope = { from: smtp.usuario, to: [...para, ...cc] };
  const portas = smtp.porta === 465 ? [465, 587] : [smtp.porta];
  let falhaConexao: unknown = null;
  for (const porta of portas) {
    const transporte = nodemailer.createTransport({
      host: smtp.host, port: porta, secure: porta === 465, requireTLS: porta !== 465, auth: { user: smtp.usuario, pass: smtp.senha },
      pool: true, maxConnections: 1, maxMessages: 5, connectionTimeout: 20_000, socketTimeout: 30_000,
    });
    try {
      const copia = await enviarComCopia(
        { enviarRaw: async (r, env) => { await transporte.sendMail({ envelope: env, raw: r as unknown as string }); } },
        raw, envelope,
        { guardar: smtp.copia?.guardar ?? false, pasta: smtp.copia?.pasta ?? null, imap: smtp.copia ? anexadorImap(smtp) : null },
      );
      if (copia.motivo && !copia.copiado && smtp.copia?.guardar) await logar("sistema", "copia_enviados_nao_gravada", { caixa_id: smtp.caixaId ?? null, resultado: copia.motivo });
      return { destinos: para, copia };
    } catch (err) {
      // so tenta a outra porta se a falha foi ao CONECTAR (nada foi enviado)
      if (porta === 465 && portas.length > 1 && (err as { command?: string }).command === "CONN") { falhaConexao = err; continue; }
      throw err;
    } finally { transporte.close(); }
  }
  throw falhaConexao ?? new Error("Nao foi possivel conectar ao servidor de e-mail.");
}
function anexadorImap(smtp: Smtp) {
  return {
    async anexar(pasta: string, raw: Uint8Array) {
      const c = abrirImap({ host: smtp.copia!.imapHost, porta: smtp.copia!.imapPorta, usuario: smtp.usuario, senha: smtp.senha });
      await c.connect();
      try { await c.append(pasta, raw as unknown as Buffer, ["\\Seen"]); } finally { try { await c.logout(); } catch { /* ignora */ } }
    },
  };
}
export function abrirImap(o: { host: string; porta: number; usuario: string; senha: string }): ImapFlow {
  return new ImapFlow({ host: o.host, port: o.porta, secure: o.porta === 993, auth: { user: o.usuario, pass: o.senha }, logger: false, socketTimeout: 40_000 });
}

/** Pessoas da equipe pelo nome (gestor_rbr). "Jos% Carlos" cobre com e sem acento. */
export async function emailDaEquipe(padraoNome: string): Promise<string | null> {
  const { data } = await admin.from("pessoas").select("email").eq("papel", "gestor_rbr").ilike("nome", padraoNome).limit(1);
  return (data?.[0] as { email: string | null } | undefined)?.email ?? null;
}
export async function alertarInterno(smtp: Smtp | null, modoTeste: boolean, assunto: string, texto: string, destinatarios: { jose: boolean; pedro: boolean }) {
  if (!smtp) return;
  const [jose, pedro] = await Promise.all([emailDaEquipe("Jos% Carlos%"), emailDaEquipe("Pedro%")]);
  const para = [destinatarios.jose ? jose : null, destinatarios.pedro ? pedro : null].filter(Boolean) as string[];
  if (para.length === 0) return;
  try { await enviarEmail({ ...smtp, copia: undefined }, { para: [para[0]], cc: para.slice(1), assunto, texto }, modoTeste); }
  catch (e) { await logar("sistema", "alerta_interno_falhou", { erro: e instanceof Error ? e.message : String(e) }); }
}
/** Uma caixa que funciona para mandar alertas internos (a primeira ativa, com credencial e sem parada, diferente da que falhou). */
export async function smtpParaAlertas(caixas: readonly CaixaRow[], exceto?: string): Promise<Smtp | null> {
  for (const c of caixas) {
    if (!c.ativa || c.parada_motivo || c.id === exceto) continue;
    const s = await smtpDaCaixa(c).catch(() => null);
    if (s) return s;
  }
  return await lerSmtp().catch(() => null);
}

// ---- parada automatica ---------------------------------------------------------------------------------
export async function pararAutomaticamente(motivo: string, smtp: Smtp | null, modoTeste: boolean) {
  await admin.from("parametros_sistema").update({ valor: "nao", updated_at: new Date().toISOString() }).eq("chave", "PROSPECCAO_ENVIO_LIBERADO");
  await admin.from("prospeccao_estado").update({ parada_motivo: motivo, parada_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", 1);
  await auditar("prospeccao_parada_automatica", { motivo });
  await logar("sistema", "parada_automatica", { resultado: motivo });
  await alertarInterno(smtp, modoTeste, "[Prospeccao] PARADA AUTOMATICA do envio", `O envio da prospeccao foi desligado automaticamente.\n\nMotivo: ${motivo}\n\nPara religar, entre no painel (Saude do envio) e digite LIGAR com o usuario do Pedro.\n${PAINEL}`, { jose: true, pedro: true });
}

export async function sinaisDeParada(hojeYmd: string, extra: Partial<SinaisParada> = {}): Promise<SinaisParada> {
  const { data: d } = await admin.from("prospeccao_envio_diario").select("devolvidos").eq("data", hojeYmd).maybeSingle();
  const { data: ult } = await admin.from("prospeccao_mensagens").select("contato_id").eq("status", "enviado").order("enviado_em", { ascending: false }).limit(40);
  const ids = (ult ?? []).map((r: { contato_id: string }) => r.contato_id);
  let devolvidos = 0;
  if (ids.length) {
    const { count } = await admin.from("prospeccao_contatos").select("id", { count: "exact", head: true }).in("id", ids).eq("validacao_status", "devolvido");
    devolvidos = count ?? 0;
  }
  return {
    devolucoesPermanentesHoje: (d as { devolvidos: number } | null)?.devolvidos ?? 0, reclamacaoNova: false, erroSmtpBloqueio: false, avisoAbusoHostinger: false,
    ultimosEnvios: { enviados: ids.length, devolvidos }, ...extra,
  };
}
export async function avaliarParada(hojeYmd: string, smtp: Smtp | null, modoTeste: boolean, extra: Partial<SinaisParada> = {}): Promise<string | null> {
  const motivo = motivoParadaAutomatica(await sinaisDeParada(hojeYmd, extra));
  if (motivo) await pararAutomaticamente(motivo, smtp, modoTeste);
  return motivo;
}
export { avisoDeAbuso };

/** Bloqueia SO o e-mail (nunca o dominio): usado quando o SMTP recusa um destinatario na hora. Duplicidade (23505) e ignorada. */
export async function bloquearSoEmail(email: string, motivo: "sair" | "reclamacao" | "devolvido") {
  const { error } = await admin.from("prospeccao_bloqueio").insert({ tipo: "email", valor: email.trim().toLowerCase(), motivo });
  if (error && error.code !== "23505") await logar("sistema", "bloqueio_falhou", { erro: error.message });
}

export async function somarDia(hojeYmd: string, campo: "enviados" | "devolvidos" | "descadastros" | "respostas") {
  const { data } = await admin.from("prospeccao_envio_diario").select("*").eq("data", hojeYmd).maybeSingle();
  const atual = (data as Record<string, number> | null) ?? { enviados: 0, devolvidos: 0, descadastros: 0, respostas: 0 };
  await admin.from("prospeccao_envio_diario").upsert({ data: hojeYmd, enviados: atual.enviados, devolvidos: atual.devolvidos, descadastros: atual.descadastros, respostas: atual.respostas, [campo]: (atual[campo] ?? 0) + 1 });
}

// ---- caixa de entrada (conversas e e-mails guardados no banco) -----------------------------------------
const soId = (s: string | null | undefined) => (s ?? "").replace(/[<>\s]/g, "").toLowerCase();
/** Acha a conversa pelo e-mail que estamos respondendo (In-Reply-To/References) ou pela raiz do fio; null se nao houver. */
export async function acharConversa(caixaId: string, ids: string[]): Promise<{ id: string; empresa_id: string | null } | null> {
  const lista = ids.map(soId).filter(Boolean);
  if (lista.length === 0) return null;
  const com = (v: string) => [v, `<${v}>`];
  const { data: porRaiz } = await admin.from("prospeccao_conversas").select("id, empresa_id, thread_raiz").eq("caixa_id", caixaId).in("thread_raiz", lista.flatMap(com)).limit(1);
  if (porRaiz?.length) return porRaiz[0] as { id: string; empresa_id: string | null };
  const { data: porEmail } = await admin.from("prospeccao_emails").select("conversa_id").eq("caixa_id", caixaId).in("message_id", lista.flatMap(com)).limit(1);
  const cid = (porEmail?.[0] as { conversa_id: string } | undefined)?.conversa_id;
  if (!cid) return null;
  const { data: c } = await admin.from("prospeccao_conversas").select("id, empresa_id").eq("id", cid).maybeSingle();
  return (c as { id: string; empresa_id: string | null } | null) ?? null;
}
/** Registra um e-mail NOSSO enviado (toque da jornada) na Caixa de entrada: cria a conversa no 1o toque e anexa nos seguintes. Falha aqui so vai para o log. */
export async function registrarSaida(o: { caixaId: string; empresaId: string; mensagemId: string; messageId: string; raizMessageId: string; assunto: string; para: string; de: string; texto: string; toque: number; quando: Date }) {
  try {
    let conv = await acharConversa(o.caixaId, [o.raizMessageId]);
    if (!conv) {
      const { data, error } = await admin.from("prospeccao_conversas").insert({ empresa_id: o.empresaId, caixa_id: o.caixaId, assunto: o.assunto, thread_raiz: o.raizMessageId, status: "aguardando_cliente", ultima_mensagem_em: o.quando.toISOString() }).select("id, empresa_id").single();
      if (error) throw new Error(error.message);
      conv = data as { id: string; empresa_id: string | null };
    }
    const { error: e2 } = await admin.from("prospeccao_emails").insert({
      conversa_id: conv.id, caixa_id: o.caixaId, direcao: "saida", message_id: o.messageId, in_reply_to: o.toque > 1 ? o.raizMessageId : null, referencias: o.toque > 1 ? o.raizMessageId : null,
      de: o.de, para: o.para, assunto: o.assunto, corpo_texto: o.texto, recebido_em: o.quando.toISOString(), lido: true, status_envio: "enviado", mensagem_id: o.mensagemId,
    });
    if (e2) throw new Error(e2.message);
  } catch (e) { await logar("sistema", "registrar_saida_falhou", { caixa_id: o.caixaId, erro: e instanceof Error ? e.message : String(e) }); }
}
