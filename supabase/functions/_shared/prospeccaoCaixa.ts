// Prospeccao, Etapa 3: regras PURAS das caixas de e-mail (descoberta de pastas, ritmo, recuo, leitura incremental por UID, copia em Enviados, DSN).
// Sem Deno e sem rede: IMAP e SMTP entram como interfaces (ImapLike / SmtpLike) para os testes usarem simulacoes. Testes em prospeccaoCaixa.test.ts.
// A Hostinger NAO publica varios limites (por minuto, conexoes, IDLE, pastas, retencao...): nada aqui assume nada disso; o diagnostico descobre.
import { ALIAS_DESCADASTRO, TETO_ABSOLUTO_DIA, diaDaRampa, intervaloEntreEnviosMin, limiteDaRampa, type CabecalhoMsg, type LinhaRampa } from "./prospeccaoRegras.ts";

// ---- pastas ---------------------------------------------------------------------------------------------
export interface PastaImap { path: string; specialUse?: string | null; flags?: readonly string[] }
export interface PastasDescobertas { entrada: string; enviados: string | null; spam: string | null; lixo: string | null; rascunhos: string | null }
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const NOMES: Record<"enviados" | "spam" | "lixo" | "rascunhos", RegExp> = {
  enviados: /(^|[./\\ ])(sent( items| messages| mail)?|enviados?|itens enviados|mensagens enviadas)$/,
  spam: /(^|[./\\ ])(spam|junk( e-?mail)?|lixo eletronico|correio nao solicitado)$/,
  lixo: /(^|[./\\ ])(trash|lixeira|deleted( items| messages)?|itens excluidos|excluidos|lixo)$/,
  rascunhos: /(^|[./\\ ])(drafts?|rascunhos?)$/,
};
const USO_ESPECIAL: Record<string, keyof typeof NOMES> = { "\\sent": "enviados", "\\junk": "spam", "\\trash": "lixo", "\\drafts": "rascunhos" };
/** Descobre as pastas pelo atributo especial do LIST (\Sent, \Junk...) e, so na falta dele, pelo nome. NUNCA assume nomes fixos. */
export function descobrirPastas(lista: readonly PastaImap[]): PastasDescobertas {
  const achado: Record<string, string | null> = { enviados: null, spam: null, lixo: null, rascunhos: null };
  for (const p of lista) {
    for (const marca of [p.specialUse ?? "", ...(p.flags ?? [])]) {
      const chave = USO_ESPECIAL[marca.toLowerCase()];
      if (chave && !achado[chave]) achado[chave] = p.path;
    }
  }
  for (const chave of Object.keys(NOMES) as (keyof typeof NOMES)[]) {
    if (achado[chave]) continue;
    achado[chave] = lista.find((p) => NOMES[chave].test(semAcento(p.path)))?.path ?? null;
  }
  const entrada = lista.find((p) => p.path.toUpperCase() === "INBOX")?.path ?? "INBOX";
  return { entrada, enviados: achado.enviados, spam: achado.spam, lixo: achado.lixo, rascunhos: achado.rascunhos };
}

// ---- caixa, limite e escolha ---------------------------------------------------------------------------
export interface CaixaCfg {
  id: string; endereco: string; nome_exibicao: string; assinatura: string; ativa: boolean; limite_diario: number; rampa: LinhaRampa[] | null;
  primeiro_envio_em: string | null; intervalo_min_seg: number; proximo_envio_apos: string | null; recuo_nivel: number; parada_motivo: string | null;
  guardar_copia_enviados: boolean; pasta_enviados: string | null; pasta_spam: string | null; pasta_lixo: string | null; pasta_entrada: string;
  modo_caixa_completa: boolean; imap_estado: Record<string, EstadoPasta>;
}
export interface EstadoPasta { uidvalidity: number | null; ultimo_uid: number }

/** Limite do dia DESTA caixa: o menor entre o limite da caixa, a rampa (da caixa ou a global, contada desde o 1o envio DA CAIXA) e o reducao por recuo. */
export function limiteDaCaixa(c: Pick<CaixaCfg, "limite_diario" | "rampa" | "primeiro_envio_em" | "recuo_nivel">, rampaGlobal: LinhaRampa[], hojeYmd: string): number {
  const rampa = c.rampa && c.rampa.length ? c.rampa : rampaGlobal;
  const base = Math.min(Math.max(0, Math.floor(c.limite_diario)), limiteDaRampa(rampa, diaDaRampa(c.primeiro_envio_em, hojeYmd)), TETO_ABSOLUTO_DIA);
  return Math.floor(base * fatorDeRitmo(c.recuo_nivel));
}
/** Escolhe a caixa que envia agora: ativa, sem parada, com credencial, fora de intervalo/recuo e abaixo do limite; a total nunca passa de 100/dia. */
export function escolherCaixa(caixas: readonly CaixaCfg[], enviadosHoje: Readonly<Record<string, number>>, comCredencial: ReadonlySet<string>, rampaGlobal: LinhaRampa[], hojeYmd: string, agora: Date):
  { caixa: CaixaCfg | null; motivo: string | null } {
  const total = Object.values(enviadosHoje).reduce((s, n) => s + n, 0);
  if (total >= TETO_ABSOLUTO_DIA) return { caixa: null, motivo: "teto de 100 envios por dia (todas as caixas) atingido" };
  const motivos: string[] = [];
  const elegiveis = caixas.filter((c) => {
    if (!c.ativa) return false;
    if (c.parada_motivo) { motivos.push(`${c.endereco} parada: ${c.parada_motivo}`); return false; }
    if (!comCredencial.has(c.id)) { motivos.push(`${c.endereco} sem credencial`); return false; }
    if (c.proximo_envio_apos && agora < new Date(c.proximo_envio_apos)) { motivos.push(`${c.endereco} aguardando intervalo`); return false; }
    if ((enviadosHoje[c.id] ?? 0) >= limiteDaCaixa(c, rampaGlobal, hojeYmd)) { motivos.push(`${c.endereco} no limite do dia`); return false; }
    return true;
  });
  // a que enviou menos hoje (proporcional ao limite) vai primeiro: reparte a carga entre as caixas
  elegiveis.sort((a, b) => (enviadosHoje[a.id] ?? 0) / Math.max(1, limiteDaCaixa(a, rampaGlobal, hojeYmd)) - (enviadosHoje[b.id] ?? 0) / Math.max(1, limiteDaCaixa(b, rampaGlobal, hojeYmd)));
  return { caixa: elegiveis[0] ?? null, motivo: elegiveis[0] ? null : (motivos.join("; ") || "nenhuma caixa ativa") };
}

// ---- ritmo e recuo --------------------------------------------------------------------------------------
/** Recuo exponencial depois de erro 4xx / "rate": 0, 5, 15, 30, 60, 120, 240 minutos. */
export function recuoSegundos(nivel: number): number { return [0, 300, 900, 1800, 3600, 7200, 14400][Math.min(6, Math.max(0, Math.floor(nivel)))]; }
/** Quanto do limite diario ainda vale em cada nivel de recuo: reduz o ritmo (100%, 75%, 50%, 25%...). */
export function fatorDeRitmo(nivel: number): number { return [1, 0.75, 0.5, 0.25, 0.25, 0.25, 0.25][Math.min(6, Math.max(0, Math.floor(nivel)))]; }
export function proximoNivelRecuo(nivel: number, evento: "erro_temporario" | "envio_ok"): number {
  return evento === "erro_temporario" ? Math.min(6, nivel + 1) : Math.max(0, nivel - 1);
}
/** Segundos ate o proximo envio DESTA caixa: pelo menos o intervalo minimo configurado, o ritmo humano (8 a 25 min) e o recuo. */
export function intervaloDaCaixaSeg(c: Pick<CaixaCfg, "intervalo_min_seg" | "recuo_nivel">, aleatorio: number): number {
  return Math.max(c.intervalo_min_seg, intervaloEntreEnviosMin(aleatorio) * 60) + recuoSegundos(c.recuo_nivel);
}

// ---- erros de SMTP --------------------------------------------------------------------------------------
export type AcaoErroCaixa = "parar_caixa_autenticacao" | "parada_geral" | "recuar" | "destinatario_invalido" | "falhou";
const RE_AUTH = /(\beauth\b|authentication (failed|unsuccessful|required)|invalid (login|credentials)|username and password not accepted|auth(entication)? (rejected|error))/i;
const RE_DURO = /(\bspam\w*|\bblock\w*|\bbloque\w*|\bsuspen\w*|\bpolicy\b|\babuse\w*|\bblacklist\w*|\bdenied by\b)/i;
const RE_RITMO = /(\blimit\w*|\bquota\b|\brate\b|too many|throttl\w*|try again|temporar\w*)/i;
/**
 * Decide o que fazer com um erro de SMTP:
 *  - autenticacao permanente (EAUTH, 535, 534, 530 com texto de login): PARA A CAIXA e avisa (nao insiste);
 *  - spam/bloqueio/suspensao/abuso: parada geral do envio;
 *  - 4xx ou "rate/limit" temporario: RECUA (exponencial) e reduz o ritmo; "limit/quota" com 5xx e limite estourado: parada geral;
 *  - destinatario inexistente: marca o contato; o resto: falhou.
 */
export function acaoParaErroSmtp(codigoSmtp: number | null, codigoErro: string | null, msg: string, ehDestinatario: boolean): AcaoErroCaixa {
  if (codigoErro === "EAUTH" || (codigoSmtp !== null && [530, 534, 535].includes(codigoSmtp) && RE_AUTH.test(msg)) || (codigoSmtp === null && RE_AUTH.test(msg))) return "parar_caixa_autenticacao";
  if (RE_DURO.test(msg)) return "parada_geral";
  if (codigoSmtp !== null && codigoSmtp >= 500 && RE_RITMO.test(msg) && !ehDestinatario) return "parada_geral";
  if ((codigoSmtp !== null && codigoSmtp >= 400 && codigoSmtp < 500) || RE_RITMO.test(msg)) return "recuar";
  if (ehDestinatario) return "destinatario_invalido";
  return "falhou";
}

// ---- cabecalhos -----------------------------------------------------------------------------------------
export interface CabecalhosCaixa { messageId: string; headers: Record<string, string>; inReplyTo?: string; references?: string }
/**
 * Message-ID proprio, List-Unsubscribe (mailto do alias + link de um clique, se houver) e List-Unsubscribe-Post (so existe com link https).
 * Em resposta, In-Reply-To e References apontam para a cadeia.
 */
export function cabecalhosCaixa(o: { messageId: string; linkDescadastro?: string | null; emResposta?: { messageId: string; referencias?: string | null } }): CabecalhosCaixa {
  const itens = [`<mailto:${ALIAS_DESCADASTRO}?subject=sair>`];
  const headers: Record<string, string> = {};
  if (o.linkDescadastro && /^https:\/\//.test(o.linkDescadastro)) {
    itens.push(`<${o.linkDescadastro}>`);
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  headers["List-Unsubscribe"] = itens.join(", ");
  const base: CabecalhosCaixa = { messageId: o.messageId, headers };
  if (o.emResposta) {
    base.inReplyTo = o.emResposta.messageId;
    const cadeia = (o.emResposta.referencias ?? "").split(/\s+/).filter(Boolean);
    if (!cadeia.includes(o.emResposta.messageId)) cadeia.push(o.emResposta.messageId);
    base.references = cadeia.join(" ");
  }
  return base;
}

// ---- DSN (devolucoes) -----------------------------------------------------------------------------------
export interface DsnInfo { destinatario: string | null; codigo: string | null; permanente: boolean; transitoria: boolean }
/** Le um aviso de entrega (multipart/report): destinatario final e codigo de status (5.x.x permanente, 4.x.x transitorio). */
export function parseDsn(raw: string): DsnInfo {
  const dest = raw.match(/^final-recipient:\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)>?/im)?.[1] ?? raw.match(/^original-recipient:\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)>?/im)?.[1] ?? null;
  const status = raw.match(/^status:\s*([245]\.\d{1,3}\.\d{1,3})/im)?.[1]
    ?? raw.match(/^diagnostic-code:[^\n]*?\b([245]\d\d)\b/im)?.[1]
    ?? raw.match(/\b([45]\.\d{1,3}\.\d{1,3})\b/)?.[1] ?? null;
  const permanente = !!status && (status.startsWith("5") );
  const transitoria = !!status && status.startsWith("4");
  return { destinatario: dest ? dest.toLowerCase() : null, codigo: status, permanente, transitoria };
}
/** Mensagem de DSN? multipart/report ou remetente do sistema de correio. */
export function ehDsn(h: { from: string; contentType?: string }): boolean {
  return /multipart\/report/i.test(h.contentType ?? "") || /(mailer-daemon|postmaster)@/i.test(h.from) || /mailer-daemon/i.test(h.from);
}

/** O UID do IMAP se repete entre caixas; prospeccao_respostas.uid_imap tem indice unico global. Esta codificacao (caixa 1..3 x 1 bilhao + uid) evita colisao sem mexer na tabela. */
export const uidGlobal = (ordemCaixa: number, uid: number): number => Math.max(0, Math.floor(ordemCaixa)) * 1_000_000_000 + uid;

// ---- leitura incremental por UID (IMAP simulavel) -------------------------------------------------------
export interface MsgCab { uid: number; cab: CabecalhoMsg & { contentType?: string; messageId?: string; data?: string } }
export interface ImapLike {
  abrirPasta(path: string): Promise<{ uidValidity: number; uidNext: number }>;
  buscarCabecalhos(aPartirDoUid: number): Promise<MsgCab[]>;
}
export interface ResultadoLeitura { novos: MsgCab[]; estado: EstadoPasta; pontoDePartida: boolean }
/**
 * Le SO o que e novo: guarda uidvalidity e o ultimo UID. Primeira leitura (ou caixa recriada = uidvalidity mudou) so marca o ponto de partida
 * e nao le nada que ja estava la. Sem IDLE: o robo consulta por polling.
 */
export async function lerPastaIncremental(imap: ImapLike, path: string, estado: EstadoPasta | undefined): Promise<ResultadoLeitura> {
  const { uidValidity, uidNext } = await imap.abrirPasta(path);
  if (!estado || estado.uidvalidity == null || estado.uidvalidity !== uidValidity) {
    return { novos: [], estado: { uidvalidity: uidValidity, ultimo_uid: Math.max(0, uidNext - 1) }, pontoDePartida: true };
  }
  if (uidNext - 1 <= estado.ultimo_uid) return { novos: [], estado, pontoDePartida: false };
  const todos = (await imap.buscarCabecalhos(estado.ultimo_uid + 1)).filter((m) => m.uid > estado.ultimo_uid).sort((a, b) => a.uid - b.uid);
  const maior = todos.reduce((m, x) => Math.max(m, x.uid), estado.ultimo_uid);
  return { novos: todos, estado: { uidvalidity: uidValidity, ultimo_uid: maior }, pontoDePartida: false };
}

// ---- envio com copia em Enviados -----------------------------------------------------------------------
export interface SmtpLike { enviarRaw(raw: Uint8Array, envelope: { from: string; to: string[] }): Promise<void> }
export interface AnexadorEnviados { anexar(pasta: string, raw: Uint8Array): Promise<void> }
export interface ResultadoCopia { copiado: boolean; motivo: string | null }
/** Envia a mensagem pronta (raw) e, se o servidor NAO guarda sozinho, grava a copia na pasta Enviados descoberta. Falha na copia nunca desfaz o envio. */
export async function enviarComCopia(
  smtp: SmtpLike, raw: Uint8Array, envelope: { from: string; to: string[] },
  copia: { guardar: boolean; pasta: string | null; imap: AnexadorEnviados | null },
): Promise<ResultadoCopia> {
  await smtp.enviarRaw(raw, envelope); // se isto falhar, o erro sobe e NADA e copiado
  if (!copia.guardar) return { copiado: false, motivo: "servidor ja guarda a copia (diagnostico) ou copia desligada" };
  if (!copia.pasta) return { copiado: false, motivo: "pasta Enviados nao descoberta" };
  if (!copia.imap) return { copiado: false, motivo: "IMAP indisponivel" };
  try { await copia.imap.anexar(copia.pasta, raw); return { copiado: true, motivo: null }; }
  catch (e) { return { copiado: false, motivo: `falha ao gravar copia: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}` }; }
}

// ---- diagnostico ----------------------------------------------------------------------------------------
export interface Diagnostico {
  conexao_nuvem_ok: boolean | null; smtp_ok: boolean | null; imap_ok: boolean | null; idle_suportado: boolean | null; append_ok: boolean | null; flags_ok: boolean | null;
  mover_ok: boolean | null; cabecalhos_preservados: Record<string, boolean> | null; servidor_guarda_enviados: boolean | null; pastas: PastasDescobertas | null;
}
export type Cor = "verde" | "amarelo" | "vermelho";
export interface Achado { item: string; cor: Cor; explicacao: string }
const CAB_ROTULO: Record<string, string> = { message_id: "Message-ID", in_reply_to: "In-Reply-To", references: "References", list_unsubscribe: "List-Unsubscribe", list_unsubscribe_post: "List-Unsubscribe-Post" };
/** Traduz o diagnostico para linguagem simples (verde, amarelo, vermelho) e diz o que cada achado significa. */
export function interpretarDiagnostico(d: Diagnostico): { resumo: Cor; achados: Achado[] } {
  const a: Achado[] = [];
  const add = (item: string, ok: boolean | null, okTxt: string, ruimTxt: string, corRuim: Cor) => a.push({ item, cor: ok === null ? "amarelo" : ok ? "verde" : corRuim, explicacao: ok === null ? "Não foi possível testar." : ok ? okTxt : ruimTxt });
  add("Conexão a partir da nuvem", d.conexao_nuvem_ok, "O servidor da Hostinger aceitou a conexão vinda da nuvem (onde os robôs rodam).", "A Hostinger não aceitou a conexão vinda da nuvem. Sem isso os robôs não funcionam; fale com o suporte ou use outro servidor de envio.", "vermelho");
  add("Envio (SMTP)", d.smtp_ok, "A caixa consegue enviar e-mails.", "Não foi possível enviar: confira a senha da caixa.", "vermelho");
  add("Leitura (IMAP)", d.imap_ok, "A caixa consegue ser lida.", "Não foi possível ler a caixa: confira a senha da caixa.", "vermelho");
  add("Aviso instantâneo (IDLE)", d.idle_suportado, "O servidor aceita IDLE (opcional; o robô continua lendo a cada poucos minutos).", "Sem IDLE: o robô lê por consulta a cada 3 a 5 minutos. Sem problema.", "amarelo");
  add("Cópia em Enviados (APPEND)", d.append_ok, "Dá para gravar a cópia dos e-mails enviados.", "Não deu para gravar a cópia em Enviados: os e-mails saem, mas não aparecem na pasta Enviados.", "amarelo");
  add("Marcar como lido (flags)", d.flags_ok, "Dá para marcar mensagens como lidas.", "Não deu para marcar como lido por IMAP.", "amarelo");
  add("Mover mensagens", d.mover_ok, "Dá para mover mensagens entre pastas.", "Não deu para mover mensagens por IMAP.", "amarelo");
  if (d.servidor_guarda_enviados !== null) a.push({ item: "Enviados automático", cor: "verde", explicacao: d.servidor_guarda_enviados ? "O servidor já guarda a cópia do que é enviado; o robô não vai duplicar." : "O servidor não guarda cópia sozinho; o robô grava a cópia em Enviados." });
  if (d.cabecalhos_preservados) {
    const faltando = Object.entries(d.cabecalhos_preservados).filter(([, ok]) => !ok).map(([k]) => CAB_ROTULO[k] ?? k);
    a.push({ item: "Cabeçalhos preservados", cor: faltando.length === 0 ? "verde" : faltando.every((f) => f.startsWith("List-")) ? "amarelo" : "vermelho",
      explicacao: faltando.length === 0 ? "Message-ID, In-Reply-To, References e List-Unsubscribe chegaram intactos." : `Não chegaram intactos: ${faltando.join(", ")}.${faltando.some((f) => !f.startsWith("List-")) ? " Sem eles o robô não reconhece respostas." : " O descadastro de um clique pode não aparecer no Gmail/Outlook."}` });
  } else a.push({ item: "Cabeçalhos preservados", cor: "amarelo", explicacao: "Não foi possível provar se os cabeçalhos sobrevivem." });
  if (d.pastas) a.push({ item: "Pastas descobertas", cor: d.pastas.enviados ? "verde" : "amarelo", explicacao: `Entrada: ${d.pastas.entrada}; Enviados: ${d.pastas.enviados ?? "não achei"}; Spam: ${d.pastas.spam ?? "não achei"}; Lixo: ${d.pastas.lixo ?? "não achei"}. Ajuste no painel se estiver errado.` });
  const resumo: Cor = a.some((x) => x.cor === "vermelho") ? "vermelho" : a.some((x) => x.cor === "amarelo") ? "amarelo" : "verde";
  return { resumo, achados: a };
}
