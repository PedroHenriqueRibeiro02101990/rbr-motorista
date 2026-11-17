// Prospeccao, Parte B: pecas comuns dos robos prospeccao-enviar e prospeccao-ler (codigo Deno; a regra esta em prospeccaoRegras.ts, testada).
// Segredos vem do Vault por prospeccao_segredo (so service_role) e NUNCA entram em log, auditoria, resposta ou erro.
// Os robos so rodam com a chave service_role (agendador pg_cron + pg_net); verify_jwt = true no deploy E checagem aqui.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { avisoDeAbuso, DOMINIO, motivoParadaAutomatica, type SinaisParada } from "./prospeccaoRegras.ts";

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
export async function logar(robo: "enviar" | "ler" | "sistema", acao: string, o: { empresa_id?: string | null; resultado?: string; erro?: string } = {}) {
  await admin.from("prospeccao_log").insert({ robo, acao, empresa_id: o.empresa_id ?? null, resultado: o.resultado ?? null, erro: o.erro ? o.erro.slice(0, 500) : null });
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

// ---- e-mail --------------------------------------------------------------------------------------------
export interface Smtp { host: string; porta: number; usuario: string; senha: string }
export async function lerSmtp(): Promise<Smtp | null> {
  const [host, porta, usuario, senha] = await Promise.all([segredo("PROSPECCAO_SMTP_HOST"), segredo("PROSPECCAO_SMTP_PORTA"), segredo("PROSPECCAO_EMAIL_USUARIO"), segredo("PROSPECCAO_EMAIL_SENHA")]);
  if (!host || !porta || !usuario || !senha) return null;
  return { host, porta: Number(porta), usuario, senha };
}
export interface EmailSaida {
  para: string[]; cc?: string[]; assunto: string; texto: string; messageId?: string; inReplyTo?: string; references?: string; headers?: Record<string, string>;
}
/** Envia texto puro (sem HTML, imagem ou rastreador). Em modo teste, vai so para os destinos de teste com [TESTE] no assunto. */
export async function enviarEmail(smtp: Smtp, e: EmailSaida, modoTeste: boolean): Promise<{ destinos: string[] }> {
  let para = e.para, cc = e.cc ?? [], assunto = e.assunto;
  if (modoTeste) {
    const { data } = await admin.from("prospeccao_destinos_teste").select("email");
    para = (data ?? []).map((r: { email: string }) => r.email);
    cc = [];
    assunto = `[TESTE] ${assunto}`;
    if (para.length === 0) throw new Error("Modo teste sem destinos cadastrados em prospeccao_destinos_teste.");
  }
  const transporte = nodemailer.createTransport({ host: smtp.host, port: smtp.porta, secure: smtp.porta === 465, requireTLS: smtp.porta !== 465, auth: { user: smtp.usuario, pass: smtp.senha }, connectionTimeout: 20_000, socketTimeout: 30_000 });
  await transporte.sendMail({
    from: { name: "Pedro Henrique | RBR Cargo", address: `pedro@${DOMINIO}` }, replyTo: `pedro@${DOMINIO}`,
    to: para, cc, subject: assunto, text: e.texto, messageId: e.messageId, inReplyTo: e.inReplyTo, references: e.references, headers: e.headers,
    // sem html, sem anexos, sem rastreador de abertura, sem encurtador de link
  });
  return { destinos: para };
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
  try { await enviarEmail(smtp, { para: [para[0]], cc: para.slice(1), assunto, texto }, modoTeste); }
  catch (e) { await logar("sistema", "alerta_interno_falhou", { erro: e instanceof Error ? e.message : String(e) }); }
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
