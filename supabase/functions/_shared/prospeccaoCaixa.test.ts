// node --test supabase/functions/_shared/prospeccaoCaixa.test.ts   (IMAP e SMTP simulados; nenhuma rede, nenhuma caixa real)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acaoParaErroSmtp, cabecalhosCaixa, descobrirPastas, ehDsn, enviarComCopia, escolherCaixa, fatorDeRitmo, intervaloDaCaixaSeg, interpretarDiagnostico, lerPastaIncremental,
  limiteDaCaixa, parseDsn, proximoNivelRecuo, recuoSegundos, type CaixaCfg, type Diagnostico, type ImapLike, type MsgCab,
} from "./prospeccaoCaixa.ts";
import { classificarRelevancia } from "./prospeccaoRegras.ts";

const RAMPA = [{ dia_inicio: 1, limite: 10 }, { dia_inicio: 6, limite: 15 }, { dia_inicio: 11, limite: 20 }, { dia_inicio: 16, limite: 30 }];
const caixa = (p: Partial<CaixaCfg> = {}): CaixaCfg => ({
  id: "c1", endereco: "pedro@rbrcargo.com.br", nome_exibicao: "Pedro | RBR Cargo", assinatura: "Pedro | RBR Cargo", ativa: true, limite_diario: 50, rampa: null,
  primeiro_envio_em: null, intervalo_min_seg: 90, proximo_envio_apos: null, recuo_nivel: 0, parada_motivo: null, guardar_copia_enviados: true,
  pasta_enviados: "INBOX.Sent", pasta_spam: null, pasta_lixo: null, pasta_entrada: "INBOX", modo_caixa_completa: false, imap_estado: {}, ...p,
});

test("pastas: usa o atributo especial do LIST e, so sem ele, o nome (sem assumir nomes fixos)", () => {
  assert.deepEqual(descobrirPastas([{ path: "INBOX" }, { path: "INBOX.Sent", specialUse: "\\Sent" }, { path: "INBOX.Junk", specialUse: "\\Junk" }, { path: "INBOX.Trash", specialUse: "\\Trash" }]),
    { entrada: "INBOX", enviados: "INBOX.Sent", spam: "INBOX.Junk", lixo: "INBOX.Trash", rascunhos: null });
  const pt = descobrirPastas([{ path: "INBOX" }, { path: "Itens Enviados" }, { path: "Lixo Eletrônico" }, { path: "Lixeira" }, { path: "Rascunhos" }]);
  assert.equal(pt.enviados, "Itens Enviados"); assert.equal(pt.spam, "Lixo Eletrônico"); assert.equal(pt.lixo, "Lixeira"); assert.equal(pt.rascunhos, "Rascunhos");
  // atributo especial vence o nome
  assert.equal(descobrirPastas([{ path: "Sent" }, { path: "Meus Enviados", specialUse: "\\Sent" }]).enviados, "Meus Enviados");
  // pasta que nao existe = null (nunca inventa)
  assert.equal(descobrirPastas([{ path: "INBOX" }]).enviados, null);
});

test("ritmo: limite da caixa respeita rampa propria, teto de 100 e reducao por recuo", () => {
  assert.equal(limiteDaCaixa(caixa({ primeiro_envio_em: null }), RAMPA, "2026-11-16"), 10, "dia 1 da rampa = 10");
  assert.equal(limiteDaCaixa(caixa({ primeiro_envio_em: "2026-11-01" }), RAMPA, "2026-11-16"), 30, "dia 16");
  assert.equal(limiteDaCaixa(caixa({ limite_diario: 5 }), RAMPA, "2026-11-16"), 5);
  assert.equal(limiteDaCaixa(caixa({ limite_diario: 100, rampa: [{ dia_inicio: 1, limite: 100 }] }), RAMPA, "2026-11-16"), 100);
  assert.equal(limiteDaCaixa(caixa({ recuo_nivel: 2, primeiro_envio_em: "2026-11-01" }), RAMPA, "2026-11-16"), 15, "50% no nivel 2");
  assert.equal(limiteDaCaixa(caixa({ recuo_nivel: 3, primeiro_envio_em: "2026-11-01" }), RAMPA, "2026-11-16"), 7);
});

test("escolha da caixa: so ativa, com credencial, sem parada, fora de intervalo e abaixo do limite; reparte a carga; teto total 100", () => {
  const agora = new Date("2026-11-16T13:00:00Z");
  const a = caixa({ id: "a" }), b = caixa({ id: "b", endereco: "comercial@rbrcargo.com.br" }), c = caixa({ id: "c", endereco: "operacional@rbrcargo.com.br", ativa: false });
  const cred = new Set(["a", "b", "c"]);
  assert.equal(escolherCaixa([a, b, c], {}, cred, RAMPA, "2026-11-16", agora).caixa?.id, "a");
  assert.equal(escolherCaixa([a, b, c], { a: 5 }, cred, RAMPA, "2026-11-16", agora).caixa?.id, "b", "reparte: b enviou menos");
  assert.equal(escolherCaixa([a, b, c], {}, new Set(["b"]), RAMPA, "2026-11-16", agora).caixa?.id, "b", "a sem credencial");
  assert.equal(escolherCaixa([c], {}, cred, RAMPA, "2026-11-16", agora).caixa, null, "operacional inativa nunca envia");
  assert.match(escolherCaixa([caixa({ id: "a", parada_motivo: "erro de autenticacao" })], {}, cred, RAMPA, "2026-11-16", agora).motivo ?? "", /parada/);
  assert.equal(escolherCaixa([caixa({ id: "a", proximo_envio_apos: "2026-11-16T13:05:00Z" })], {}, cred, RAMPA, "2026-11-16", agora).caixa, null, "intervalo");
  assert.equal(escolherCaixa([a], { a: 10 }, cred, RAMPA, "2026-11-16", agora).caixa, null, "limite do dia 1 da rampa = 10");
  assert.match(escolherCaixa([a, b], { a: 60, b: 40 }, cred, RAMPA, "2026-11-16", agora).motivo ?? "", /100/);
});

test("recuo exponencial em erro 4xx e queda gradual quando volta ao normal", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map(recuoSegundos), [0, 300, 900, 1800, 3600, 7200, 14400, 14400]);
  assert.equal(proximoNivelRecuo(0, "erro_temporario"), 1);
  assert.equal(proximoNivelRecuo(6, "erro_temporario"), 6, "teto do recuo");
  assert.equal(proximoNivelRecuo(3, "envio_ok"), 2);
  assert.equal(proximoNivelRecuo(0, "envio_ok"), 0);
  assert.ok(fatorDeRitmo(3) < fatorDeRitmo(1));
  assert.ok(intervaloDaCaixaSeg({ intervalo_min_seg: 90, recuo_nivel: 0 }, 0) >= 90);
  assert.equal(intervaloDaCaixaSeg({ intervalo_min_seg: 2000, recuo_nivel: 0 }, 0), 2000, "o minimo configurado manda se for maior");
  assert.equal(intervaloDaCaixaSeg({ intervalo_min_seg: 90, recuo_nivel: 2 }, 0), 8 * 60 + 900);
});

test("erros de SMTP: autenticacao PARA a caixa; 4xx e rate recuam; spam/bloqueio param tudo; 5xx de limite para tudo", () => {
  assert.equal(acaoParaErroSmtp(535, null, "535 5.7.8 Authentication failed", false), "parar_caixa_autenticacao");
  assert.equal(acaoParaErroSmtp(null, "EAUTH", "Invalid login", false), "parar_caixa_autenticacao");
  assert.equal(acaoParaErroSmtp(451, null, "451 4.7.1 try again later", false), "recuar");
  assert.equal(acaoParaErroSmtp(421, null, "421 too many connections, rate limited", false), "recuar");
  assert.equal(acaoParaErroSmtp(450, null, "450 mailbox busy", false), "recuar");
  assert.equal(acaoParaErroSmtp(554, null, "554 blocked as spam", false), "parada_geral");
  assert.equal(acaoParaErroSmtp(550, null, "550 Account suspended", false), "parada_geral");
  assert.equal(acaoParaErroSmtp(550, null, "550 daily sending limit exceeded", false), "parada_geral");
  assert.equal(acaoParaErroSmtp(550, null, "550 5.1.1 user unknown", true), "destinatario_invalido");
  assert.equal(acaoParaErroSmtp(550, null, "message refused", false), "falhou");
  assert.equal(acaoParaErroSmtp(null, "ETIMEDOUT", "operate timeout", false), "falhou", "'operate' nao e 'rate'");
});

test("cabecalhos: List-Unsubscribe com mailto do alias e, com link https, de um clique + List-Unsubscribe-Post; resposta traz In-Reply-To e References", () => {
  const s = cabecalhosCaixa({ messageId: "<a@rbrcargo.com.br>" });
  assert.equal(s.headers["List-Unsubscribe"], "<mailto:descadastrar@rbrcargo.com.br?subject=sair>");
  assert.ok(!("List-Unsubscribe-Post" in s.headers), "sem link https nao ha one-click");
  const c = cabecalhosCaixa({ messageId: "<b@rbrcargo.com.br>", linkDescadastro: "https://x.supabase.co/functions/v1/d?t=abc" });
  assert.equal(c.headers["List-Unsubscribe"], "<mailto:descadastrar@rbrcargo.com.br?subject=sair>, <https://x.supabase.co/functions/v1/d?t=abc>");
  assert.equal(c.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(!("List-Unsubscribe-Post" in cabecalhosCaixa({ messageId: "<b@x>", linkDescadastro: "http://inseguro" }).headers), "http nao vale");
  const r = cabecalhosCaixa({ messageId: "<n@rbrcargo.com.br>", emResposta: { messageId: "<cli@x.com>", referencias: "<a@rbrcargo.com.br>" } });
  assert.equal(r.inReplyTo, "<cli@x.com>");
  assert.equal(r.references, "<a@rbrcargo.com.br> <cli@x.com>");
});

test("DSN: permanente (5.x.x) x transitorio (4.x.x), com o destinatario", () => {
  const perm = "Content-Type: multipart/report\r\n\r\nFinal-Recipient: rfc822; Fulano@Empresa.com\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 5.1.1 user unknown";
  const d = parseDsn(perm);
  assert.deepEqual([d.destinatario, d.codigo, d.permanente, d.transitoria], ["fulano@empresa.com", "5.1.1", true, false]);
  const temp = parseDsn("Final-Recipient: rfc822; x@y.com\nAction: delayed\nStatus: 4.2.2\nDiagnostic-Code: smtp; 452 mailbox full");
  assert.deepEqual([temp.codigo, temp.permanente, temp.transitoria], ["4.2.2", false, true]);
  assert.equal(parseDsn("Diagnostic-Code: smtp; 550 no such user").permanente, true, "sem Status, usa o codigo SMTP");
  assert.equal(parseDsn("texto qualquer").codigo, null);
  assert.ok(ehDsn({ from: "MAILER-DAEMON@mx.hostinger.com" }));
  assert.ok(ehDsn({ from: "x@y.com", contentType: "multipart/report; report-type=delivery-status" }));
  assert.ok(!ehDsn({ from: "cliente@empresa.com", contentType: "text/plain" }));
});

function imapSimulado(uidValidity: number, mensagens: MsgCab[]): ImapLike & { chamadas: number[] } {
  const chamadas: number[] = [];
  return {
    chamadas,
    abrirPasta: async () => ({ uidValidity, uidNext: Math.max(0, ...mensagens.map((m) => m.uid)) + 1 }),
    buscarCabecalhos: async (de) => { chamadas.push(de); return mensagens.filter((m) => m.uid >= de); },
  };
}
const cab = (uid: number, p: Partial<MsgCab["cab"]> = {}): MsgCab => ({ uid, cab: { from: "a@b.com", to: "pedro@rbrcargo.com.br", subject: "s", inReplyTo: "", references: "", ...p } });

test("leitura incremental: primeira leitura so marca o ponto de partida; depois le apenas UIDs novos", async () => {
  const msgs = [cab(1), cab(2), cab(3)];
  const imap = imapSimulado(77, msgs);
  const r1 = await lerPastaIncremental(imap, "INBOX", undefined);
  assert.equal(r1.pontoDePartida, true); assert.equal(r1.novos.length, 0); assert.deepEqual(r1.estado, { uidvalidity: 77, ultimo_uid: 3 });
  assert.deepEqual(imap.chamadas, [], "nao baixou nada do que ja estava na caixa");
  msgs.push(cab(4), cab(5));
  const r2 = await lerPastaIncremental(imap, "INBOX", r1.estado);
  assert.deepEqual(r2.novos.map((m) => m.uid), [4, 5]); assert.equal(r2.estado.ultimo_uid, 5); assert.deepEqual(imap.chamadas, [4]);
  const r3 = await lerPastaIncremental(imap, "INBOX", r2.estado);
  assert.equal(r3.novos.length, 0); assert.deepEqual(imap.chamadas, [4], "sem novidade nem consulta");
  // caixa recriada (uidvalidity diferente): recomeca do ponto de partida, sem reprocessar tudo
  const r4 = await lerPastaIncremental(imapSimulado(99, msgs), "INBOX", r3.estado);
  assert.equal(r4.pontoDePartida, true); assert.equal(r4.novos.length, 0); assert.equal(r4.estado.uidvalidity, 99);
});

test("resposta casada por In-Reply-To/References; o resto da caixa e ignorado; DSN nosso vira devolucao", async () => {
  const nossos = new Set(["abc-1@rbrcargo.com.br"]);
  const imap = imapSimulado(1, [cab(1), cab(2), cab(3, { inReplyTo: "<ABC-1@rbrcargo.com.br>" }), cab(4, { subject: "Fatura", from: "banco@x.com" }), cab(5, { from: "MAILER-DAEMON@mx.com", references: "<abc-1@rbrcargo.com.br>" }), cab(6, { inReplyTo: "<de-outro@x.com>" })]);
  const r = await lerPastaIncremental(imap, "INBOX", { uidvalidity: 1, ultimo_uid: 2 });
  const tipos = r.novos.map((m) => classificarRelevancia(m.cab, nossos));
  assert.deepEqual(tipos, ["resposta", null, "devolucao", null]);
});

test("copia em Enviados: grava quando o servidor nao guarda; nao duplica quando guarda; falha na copia nao desfaz o envio", async () => {
  const eventos: string[] = [];
  const smtp = { enviarRaw: async () => { eventos.push("enviou"); } };
  const imapOk = { anexar: async (pasta: string) => { eventos.push(`copiou:${pasta}`); } };
  const raw = new TextEncoder().encode("Message-ID: <x@rbrcargo.com.br>\r\n\r\nola");
  const env = { from: "pedro@rbrcargo.com.br", to: ["a@b.com"] };
  assert.deepEqual(await enviarComCopia(smtp, raw, env, { guardar: true, pasta: "INBOX.Sent", imap: imapOk }), { copiado: true, motivo: null });
  assert.deepEqual(eventos, ["enviou", "copiou:INBOX.Sent"]);
  eventos.length = 0;
  assert.equal((await enviarComCopia(smtp, raw, env, { guardar: false, pasta: "INBOX.Sent", imap: imapOk })).copiado, false);
  assert.deepEqual(eventos, ["enviou"], "servidor ja guarda: nao duplica");
  eventos.length = 0;
  assert.match((await enviarComCopia(smtp, raw, env, { guardar: true, pasta: null, imap: imapOk })).motivo ?? "", /nao descoberta/);
  const quebrado = { anexar: async () => { throw new Error("APPEND failed"); } };
  const r = await enviarComCopia(smtp, raw, env, { guardar: true, pasta: "Sent", imap: quebrado });
  assert.equal(r.copiado, false); assert.match(r.motivo ?? "", /falha ao gravar copia/); assert.ok(eventos.includes("enviou"), "o envio ja tinha saido");
  // falha no SMTP: nada de copia
  eventos.length = 0;
  await assert.rejects(enviarComCopia({ enviarRaw: async () => { throw new Error("535 auth"); } }, raw, env, { guardar: true, pasta: "Sent", imap: imapOk }));
  assert.deepEqual(eventos, []);
});

test("diagnostico em linguagem simples: verde, amarelo e vermelho", () => {
  const bom: Diagnostico = { conexao_nuvem_ok: true, smtp_ok: true, imap_ok: true, idle_suportado: true, append_ok: true, flags_ok: true, mover_ok: true,
    cabecalhos_preservados: { message_id: true, in_reply_to: true, references: true, list_unsubscribe: true, list_unsubscribe_post: true }, servidor_guarda_enviados: false,
    pastas: { entrada: "INBOX", enviados: "Sent", spam: "Junk", lixo: "Trash", rascunhos: null } };
  assert.equal(interpretarDiagnostico(bom).resumo, "verde");
  assert.equal(interpretarDiagnostico({ ...bom, idle_suportado: false }).resumo, "amarelo");
  assert.equal(interpretarDiagnostico({ ...bom, cabecalhos_preservados: { ...bom.cabecalhos_preservados!, list_unsubscribe_post: false } }).resumo, "amarelo");
  const semRef = interpretarDiagnostico({ ...bom, cabecalhos_preservados: { ...bom.cabecalhos_preservados!, references: false } });
  assert.equal(semRef.resumo, "vermelho"); assert.match(semRef.achados.find((x) => x.item.startsWith("Cabe"))!.explicacao, /não reconhece respostas/);
  const nuvem = interpretarDiagnostico({ ...bom, conexao_nuvem_ok: false });
  assert.equal(nuvem.resumo, "vermelho"); assert.match(nuvem.achados[0].explicacao, /nuvem/);
  assert.equal(interpretarDiagnostico({ ...bom, smtp_ok: false }).resumo, "vermelho");
  assert.equal(interpretarDiagnostico({ ...bom, append_ok: null }).resumo, "amarelo");
});
