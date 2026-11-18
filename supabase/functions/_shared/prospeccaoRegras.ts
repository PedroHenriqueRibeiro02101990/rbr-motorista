// Prospeccao (agente SDR), Parte B: regras PURAS dos robos de envio e leitura (sem Deno, sem rede). Testes em prospeccaoRegras.test.ts.
// Os robos (prospeccao-enviar / prospeccao-ler) so orquestram: toda decisao de "pode ou nao pode" passa por aqui.

export const FUSO = "America/Sao_Paulo";
export const TETO_ABSOLUTO_DIA = 100; // nunca ultrapassar, mesmo que a rampa/parametro diga mais
export const DOMINIO = "rbrcargo.com.br";
export const ALIAS_DESCADASTRO = `descadastrar@${DOMINIO}`;

// ---- hora de Sao Paulo ---------------------------------------------------------------------------------
export function partesSP(d: Date): { ymd: string; dow: number; hora: number; minuto: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[p.weekday] ?? 0;
  return { ymd: `${p.year}-${p.month}-${p.day}`, dow, hora: Number(p.hour) % 24, minuto: Number(p.minute) };
}

/** Janela de ENVIO: segunda a sexta, 07:00 ate 17:59 (18:00 ja e fora), fora de feriados (datas YYYY-MM-DD). */
export function dentroDaJanelaEnvio(d: Date, feriados: ReadonlySet<string>): boolean {
  const p = partesSP(d);
  return p.dow >= 1 && p.dow <= 5 && p.hora >= 7 && p.hora < 18 && !feriados.has(p.ymd);
}
/** Janela de LEITURA: todos os dias, 07:00 ate 19:59. */
export function dentroDaJanelaLeitura(d: Date): boolean {
  const p = partesSP(d);
  return p.hora >= 7 && p.hora < 20;
}

/** Horas uteis (janela de envio) entre dois instantes, contadas minuto a minuto (usado nos lembretes do lead quente). */
export function horasUteisEntre(de: Date, ate: Date, feriados: ReadonlySet<string>): number {
  let min = 0;
  for (let t = de.getTime(); t < ate.getTime(); t += 60_000) if (dentroDaJanelaEnvio(new Date(t), feriados)) min++;
  return min / 60;
}

// ---- limite diario e rampa -----------------------------------------------------------------------------
export interface LinhaRampa { dia_inicio: number; limite: number }

/** Dia da rampa: 1 = data do primeiro envio real. Sem envio real ainda = dia 1. */
export function diaDaRampa(primeiroEnvio: string | null, hojeYmd: string): number {
  if (!primeiroEnvio) return 1;
  const ms = Date.parse(`${hojeYmd}T00:00:00Z`) - Date.parse(`${primeiroEnvio.slice(0, 10)}T00:00:00Z`);
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}
export function limiteDaRampa(rampa: LinhaRampa[], dia: number): number {
  const ok = rampa.filter((r) => r.dia_inicio <= dia).sort((a, b) => b.dia_inicio - a.dia_inicio)[0];
  return ok ? ok.limite : 0;
}
/** Menor entre o parametro e a rampa, nunca acima de 100. Informa de onde veio. */
export function limiteDoDia(parametro: number | null | undefined, rampa: LinhaRampa[], dia: number): { limite: number; origem: "parametro" | "rampa" | "teto" } {
  const p = parametro != null && Number.isFinite(Number(parametro)) && Number(parametro) >= 0 ? Math.floor(Number(parametro)) : 10;
  const r = limiteDaRampa(rampa, dia);
  const menor = Math.min(p, r);
  if (menor > TETO_ABSOLUTO_DIA) return { limite: TETO_ABSOLUTO_DIA, origem: "teto" };
  return { limite: menor, origem: p <= r ? "parametro" : "rampa" };
}
/** Intervalo aleatorio entre envios: 8 a 25 minutos. `aleatorio` em [0,1). */
export function intervaloEntreEnviosMin(aleatorio: number): number {
  return 8 + Math.floor(Math.min(0.999999, Math.max(0, aleatorio)) * 18); // 8..25
}

// ---- bloqueio ------------------------------------------------------------------------------------------
export interface Bloqueio { tipo: string; valor: string }
export function emailBloqueado(email: string, bloqueios: readonly Bloqueio[]): boolean {
  const em = email.trim().toLowerCase();
  const dom = em.split("@")[1] ?? "";
  return bloqueios.some((b) => (b.tipo === "email" && b.valor === em) || (b.tipo === "dominio" && b.valor === dom));
}

// Provedores gratuitos: descadastro bloqueia so o e-mail, nunca o dominio inteiro (senao bloquearia todo mundo do gmail).
const PROVEDORES_GRATUITOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "yahoo.com.br", "uol.com.br", "bol.com.br", "terra.com.br", "icloud.com", "ig.com.br", "globo.com", "msn.com", "protonmail.com"]);
export const dominioBloqueavel = (dominio: string) => !!dominio && !PROVEDORES_GRATUITOS.has(dominio.trim().toLowerCase());
/** Entradas de bloqueio para um descadastro/reclamacao: sempre o e-mail; o dominio so se nao for provedor gratuito nem o nosso. */
export function bloqueiosParaEmail(email: string): Bloqueio[] {
  const em = email.trim().toLowerCase();
  const dom = em.split("@")[1] ?? "";
  const lista: Bloqueio[] = [{ tipo: "email", valor: em }];
  if (dominioBloqueavel(dom) && dom !== DOMINIO) lista.push({ tipo: "dominio", valor: dom });
  return lista;
}

// ---- reconferencia antes de enviar ---------------------------------------------------------------------
export interface ContextoEnvio {
  envioLiberado: boolean;
  aprovacaoObrigatoria: boolean;
  mensagemStatus: string;
  contatoEmail: string;
  contatoValidacao: string;
  empresaStatus: string;
  empresaRepousoAte: string | null;
  hojeYmd: string;
  jaRespondeuOuDevolveu: boolean;
  enviadosHoje: number;
  limiteHoje: number;
  agora: Date;
  feriados: ReadonlySet<string>;
  bloqueios: readonly Bloqueio[];
  paradaAtiva: boolean;
  proximoEnvioApos: Date | null;
}
/** Devolve null se PODE enviar; senao o motivo (vai para o log). */
export function motivoDeNaoEnviar(c: ContextoEnvio): string | null {
  if (!c.envioLiberado) return "chave de envio desligada";
  if (c.paradaAtiva) return "parada automatica ativa";
  if (c.aprovacaoObrigatoria && c.mensagemStatus !== "aprovado") return "mensagem nao aprovada";
  if (!c.aprovacaoObrigatoria && !["aprovado", "rascunho"].includes(c.mensagemStatus)) return "mensagem nao esta pendente";
  if (emailBloqueado(c.contatoEmail, c.bloqueios)) return "contato na lista de bloqueio";
  if (["invalido", "devolvido", "pendente"].includes(c.contatoValidacao)) return `e-mail nao validado (${c.contatoValidacao})`;
  if (["descartado", "descadastrado"].includes(c.empresaStatus)) return `empresa ${c.empresaStatus}`;
  if (c.empresaStatus === "repouso" && (!c.empresaRepousoAte || c.empresaRepousoAte > c.hojeYmd)) return "empresa em repouso";
  if (["respondeu", "quente"].includes(c.empresaStatus) || c.jaRespondeuOuDevolveu) return "contato ja respondeu ou devolveu";
  if (c.enviadosHoje >= c.limiteHoje) return "limite do dia atingido";
  if (!dentroDaJanelaEnvio(c.agora, c.feriados)) return "fora da janela de envio";
  if (c.proximoEnvioApos && c.agora < c.proximoEnvioApos) return "aguardando intervalo entre envios";
  return null;
}

// ---- escolha do proximo envio --------------------------------------------------------------------------
export interface Candidato {
  id: string;
  toque: number;
  classe: "A" | "B" | "C";
  tipoEmail: "generico" | "pessoal";
  validacao: string;
  dominioBateComSite: boolean;
  seguimentoVencido: boolean;
}
/**
 * Prioridade: (1) seguimentos vencidos, (2) classe A novas, (3) classe B. Elegibilidade do contato: verificado/mx_ok e generico;
 * pessoal so se a empresa for A e o dominio bater com o site; catch-all por ultimo e so em dia de poucas devolucoes.
 */
export function escolherProximo(cands: readonly Candidato[], devolvidosHoje: number): Candidato | null {
  const pontua = (c: Candidato): number | null => {
    const bom = c.validacao === "verificado" || c.validacao === "mx_ok";
    const catchAll = c.validacao === "catch_all";
    if (!bom && !(catchAll && devolvidosHoje <= 1)) return null;
    if (c.tipoEmail === "pessoal" && !(c.classe === "A" && c.dominioBateComSite)) return null;
    if (c.classe === "C" && !c.seguimentoVencido) return null;
    const base = c.seguimentoVencido ? 0 : c.classe === "A" ? 10 : 20;
    return base + (catchAll ? 100 : 0) + (c.tipoEmail === "pessoal" ? 1 : 0);
  };
  const ok = cands.map((c) => ({ c, p: pontua(c) })).filter((x): x is { c: Candidato; p: number } => x.p !== null).sort((a, b) => a.p - b.p);
  return ok[0]?.c ?? null;
}

// ---- falhas de SMTP ------------------------------------------------------------------------------------
const PALAVRAS_BLOQUEIO = /(limit|spam|block|bloque|suspend|policy|abuse|blacklist|denied by|quota|rate)/i;
export function erroSmtpEhBloqueio(msg: string): boolean { return PALAVRAS_BLOQUEIO.test(msg); }
export type DestinoErro = "parada_automatica" | "tentar_de_novo" | "falhou";
export function tratarErroEnvio(codigo: number | null, msg: string, tentativas: number): DestinoErro {
  if (erroSmtpEhBloqueio(msg)) return "parada_automatica";
  if (codigo !== null && codigo >= 400 && codigo < 500) return tentativas + 1 < 3 ? "tentar_de_novo" : "falhou";
  return "falhou";
}

// ---- parada automatica ---------------------------------------------------------------------------------
export interface SinaisParada {
  devolucoesPermanentesHoje: number;
  reclamacaoNova: boolean;
  erroSmtpBloqueio: boolean;
  avisoAbusoHostinger: boolean;
  ultimosEnvios: { enviados: number; devolvidos: number }; // janela dos ultimos 40 envios
}
export function motivoParadaAutomatica(s: SinaisParada): string | null {
  if (s.devolucoesPermanentesHoje >= 3) return "3 ou mais devolucoes permanentes no mesmo dia";
  if (s.reclamacaoNova) return "reclamacao recebida";
  if (s.erroSmtpBloqueio) return "erro de SMTP de bloqueio, limite, spam ou suspensao";
  if (s.avisoAbusoHostinger) return "aviso de abuso ou suspensao da Hostinger";
  const { enviados, devolvidos } = s.ultimosEnvios;
  if (enviados > 0 && devolvidos / enviados > 0.05) return "taxa de devolucao acima de 5% nos ultimos 40 envios";
  return null;
}
export function avisoDeAbuso(remetente: string, assunto: string): boolean {
  return /(hostinger|abuse|suspend|violation)/i.test(`${remetente} ${assunto}`);
}

// ---- leitura filtrada (IMAP) ---------------------------------------------------------------------------
export interface CabecalhoMsg { from: string; to: string; subject: string; inReplyTo: string; references: string }
export type TipoRelevante = "resposta" | "descadastro_alias" | "devolucao" | null;
const limpaId = (s: string) => s.replace(/[<>\s]/g, "").toLowerCase();
export function idsNossosCitados(h: CabecalhoMsg, nossos: ReadonlySet<string>): string[] {
  const ids = `${h.inReplyTo} ${h.references}`.split(/\s+/).map(limpaId).filter(Boolean);
  return ids.filter((i) => nossos.has(i));
}
/** Decide se a mensagem interessa. Tudo que nao for (a) resposta nossa, (b) alias de descadastro, (c) DSN nosso e IGNORADO. */
export function classificarRelevancia(h: CabecalhoMsg, nossos: ReadonlySet<string>, corpoCitaIdNosso?: (ids: ReadonlySet<string>) => boolean): TipoRelevante {
  const ehDsn = /(mailer-daemon|postmaster)/i.test(h.from);
  if (ehDsn) return (idsNossosCitados(h, nossos).length > 0 || (corpoCitaIdNosso?.(nossos) ?? false)) ? "devolucao" : null;
  if (h.to.toLowerCase().includes(ALIAS_DESCADASTRO)) return "descadastro_alias";
  if (idsNossosCitados(h, nossos).length > 0) return "resposta";
  return null;
}
/** DSN permanente: codigo 5.x.x no corpo. */
export function devolucaoPermanente(corpoDsn: string): boolean { return /\b5\.\d{1,3}\.\d{1,3}\b/.test(corpoDsn) || /\b55\d\b/.test(corpoDsn); }

// ---- classificacao por palavras-chave ------------------------------------------------------------------
export type Classe = "cotacao" | "preco_prazo" | "nao_sou_eu" | "agora_nao" | "fora_do_escritorio" | "sair" | "reclamacao" | "outro";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Tira o texto citado (">" e "Em ... escreveu:") para classificar so o que a pessoa escreveu. */
export function textoNovo(corpo: string): string {
  const linhas: string[] = [];
  for (const l of corpo.split(/\r?\n/)) {
    if (/^\s*>/.test(l) || /^(em .* escreveu|on .* wrote|-----original|de:|from:)/i.test(l.trim())) break;
    linhas.push(l);
  }
  return linhas.join("\n");
}
export function classificarPorRegras(corpo: string, assunto = "", remetente = ""): Classe {
  const t = norm(textoNovo(corpo));
  const a = norm(assunto);
  if (/(auto.?reply|resposta automatica|fora do escritorio|out of office|ausente|estarei ausente|de ferias|em ferias)/.test(`${a} ${t}`) || /(no-?reply|noreply)/.test(norm(remetente)) && /automatic/.test(`${a} ${t}`)) return "fora_do_escritorio";
  if (/(spam|denunci|vou reportar|abuso|processo|lgpd.*(reclam|denunc)|parem de (me )?(enviar|mandar)|nao autorizei|como (voces )?(conseguiram|obtiveram) (meu|o meu) (e-?mail|contato))/.test(t)) return "reclamacao";
  if (/(^|\W)(sair|descadastr\w*|remover|remova|cancelar (o )?envio|nao quero (mais )?receber|nao envie mais|pare de enviar|unsubscribe|me tire da lista|retirar meu)/.test(t)) return "sair";
  if (/(quanto (custa|fica|sai|cobram)|qual (o )?(valor|preco|prazo)|\bpreco\b|\bvalor\b|\bprazo\b|tabela de (preco|frete)|orcamento de preco)/.test(t)) return "preco_prazo";
  if (/(cotacao|cotar|orcamento|proposta|tenho interesse|queremos (cotar|conhecer)|podem (me )?(enviar|mandar)|pode (me )?(enviar|mandar)|vamos conversar|me liga|ligue|(\d+|\w+) cargas?)/.test(t)) return "cotacao";
  if (/(nao sou (a )?(pessoa|responsavel)|nao sou eu|nao e comigo|nao cuido|encaminh\w+ (para|ao|a)|procure (o|a)|fale com|entre em contato com|quem cuida)/.test(t)) return "nao_sou_eu";
  if (/(agora nao|no momento nao|nao (temos|tenho) (interesse|necessidade|demanda)|ja temos (fornecedor|transportadora|parceiro)|nao precisamos|nao e o momento|talvez (mais )?(adiante|futuramente)|futuramente)/.test(t)) return "agora_nao";
  return "outro";
}
export const classeQuente = (c: Classe | null | undefined) => c === "cotacao" || c === "preco_prazo";
/** Primeiro e-mail encontrado no texto novo (indicacao em "nao_sou_eu"). */
export function emailDeIndicacao(corpo: string, proprio: string): string | null {
  const m = textoNovo(corpo).match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? [];
  return m.map((x) => x.toLowerCase()).find((x) => x !== proprio.toLowerCase() && !x.endsWith(`@${DOMINIO}`)) ?? null;
}
/** Decide quem trata: IA so vale com confianca >= 0.8 e classe diferente de "outro". */
export function decidirClassificacao(regra: Classe, ia: { classe: Classe; confianca: number } | null): { classe: Classe; paraPessoa: boolean } {
  if (ia && ia.confianca >= 0.8 && ia.classe !== "outro") return { classe: ia.classe, paraPessoa: false };
  if (!ia && regra !== "outro") return { classe: regra, paraPessoa: false };
  return { classe: regra, paraPessoa: true };
}

// ---- modelos editaveis ---------------------------------------------------------------------------------
export const VARIAVEIS_MODELO = ["segmento_legivel", "segmento_frase", "cidade", "nome", "empresa", "veiculo"] as const;
export function validarModelo(assunto: string, corpo: string): string | null {
  for (const txt of [assunto, corpo]) {
    if (/<\/?[a-z][\s\S]*?>/i.test(txt)) return "O texto nao pode conter HTML.";
    for (const m of txt.matchAll(/\{([^{}]*)\}/g)) if (!(VARIAVEIS_MODELO as readonly string[]).includes(m[1])) return `Variavel desconhecida: {${m[1]}}.`;
  }
  return null;
}
export function preencherModelo(txt: string, v: Record<string, string>): string {
  return txt.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in v ? v[k] : m));
}
export const modeloPendente = (m: { corpo: string; ativo: boolean }) => !m.ativo || /A DEFINIR/.test(m.corpo);

// ---- jornada -------------------------------------------------------------------------------------------
export interface PassoJornada { toque: number; atraso_dias: number; modelo_tipo: string }
/** Proximo toque devido: data do ultimo envio + atraso. Devolve null se nada vencido, ou { fim: true } depois do toque 4. */
export function proximoToque(ultimoToque: number, ultimoEnvio: Date, jornada: readonly PassoJornada[], agora: Date): { toque: number; vencido: boolean } | { fim: true } | null {
  if (ultimoToque >= 4) return { fim: true };
  const passo = jornada.find((j) => j.toque === ultimoToque + 1);
  if (!passo) return null;
  const quando = ultimoEnvio.getTime() + passo.atraso_dias * 86_400_000;
  return { toque: passo.toque, vencido: agora.getTime() >= quando };
}

// ---- cabecalhos ----------------------------------------------------------------------------------------
export function novoMessageId(uuid: string): string { return `<${uuid}@${DOMINIO}>`; }
export function cabecalhosEnvio(opts: { messageId: string; assunto: string; toque: number; assuntoOriginal?: string; messageIdPrimeiroToque?: string }) {
  const seguimento = opts.toque > 1 && opts.messageIdPrimeiroToque;
  return {
    messageId: opts.messageId,
    subject: seguimento ? `Re: ${(opts.assuntoOriginal ?? opts.assunto).replace(/^re:\s*/i, "")}` : opts.assunto,
    headers: { "List-Unsubscribe": `<mailto:${ALIAS_DESCADASTRO}?subject=sair>` } as Record<string, string>,
    inReplyTo: seguimento ? opts.messageIdPrimeiroToque : undefined,
    references: seguimento ? opts.messageIdPrimeiroToque : undefined,
  };
}
