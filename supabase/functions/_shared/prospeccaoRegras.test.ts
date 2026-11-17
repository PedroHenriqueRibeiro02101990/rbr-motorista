// node --test supabase/functions/_shared/prospeccaoRegras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  avisoDeAbuso, bloqueiosParaEmail, certezaDeNaoEnviado, classificarPorRegras, classificarRelevancia, cabecalhosEnvio, decidirClassificacao, devolucaoPermanente, dentroDaJanelaEnvio, dentroDaJanelaLeitura,
  diaDaRampa, dominioBloqueavel, emailBloqueado, emailDeIndicacao, erroDeDestinatario, erroSmtpEhBloqueio, escolherProximo, horasUteisEntre, intervaloEntreEnviosMin, limiteDoDia,
  LISTA_PROVEDORES_GRATUITOS, motivoDeNaoEnviar, motivoParadaAutomatica, proximoToque, respostaAutomaticaPodeSair, statusPorMx, tratarErroEnvio, validarModelo,
  type Candidato, type ContextoEnvio,
} from "./prospeccaoRegras.ts";

const escolher = (l: readonly Candidato[], dev: number, teste = true) => escolherProximo(l, dev, teste);
const RAMPA = [{ dia_inicio: 1, limite: 10 }, { dia_inicio: 6, limite: 15 }, { dia_inicio: 11, limite: 20 }, { dia_inicio: 16, limite: 30 }];
const FERIADOS = new Set(["2026-11-20"]); // Consciencia Negra (sexta)
// 2026-11-16 e segunda-feira. Sao Paulo = UTC-3 (sem horario de verao).
const sp = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00-03:00`);

test("janela de envio: seg-sex 07:00 a 17:59, fora de feriado", () => {
  assert.ok(dentroDaJanelaEnvio(sp("2026-11-16", "07:00"), FERIADOS));
  assert.ok(dentroDaJanelaEnvio(sp("2026-11-16", "17:59"), FERIADOS));
  assert.ok(!dentroDaJanelaEnvio(sp("2026-11-16", "06:59"), FERIADOS));
  assert.ok(!dentroDaJanelaEnvio(sp("2026-11-16", "18:00"), FERIADOS));
  assert.ok(!dentroDaJanelaEnvio(sp("2026-11-21", "10:00"), FERIADOS), "sabado");
  assert.ok(!dentroDaJanelaEnvio(sp("2026-11-22", "10:00"), FERIADOS), "domingo");
  assert.ok(!dentroDaJanelaEnvio(sp("2026-11-20", "10:00"), FERIADOS), "feriado numa sexta");
});

test("janela usa hora de Sao Paulo, nao a do servidor (UTC)", () => {
  assert.ok(dentroDaJanelaEnvio(new Date("2026-11-16T10:00:00Z"), FERIADOS), "10:00Z = 07:00 em SP");
  assert.ok(!dentroDaJanelaEnvio(new Date("2026-11-16T09:59:00Z"), FERIADOS), "09:59Z = 06:59 em SP");
  assert.ok(!dentroDaJanelaEnvio(new Date("2026-11-16T21:00:00Z"), FERIADOS), "21:00Z = 18:00 em SP");
});

test("janela de leitura: 07:00 a 19:59, todos os dias", () => {
  assert.ok(dentroDaJanelaLeitura(sp("2026-11-22", "19:59")));
  assert.ok(!dentroDaJanelaLeitura(sp("2026-11-22", "20:00")));
  assert.ok(!dentroDaJanelaLeitura(sp("2026-11-22", "06:59")));
});

test("rampa: dia 1 = primeiro envio; dias 1-5=10, 6-10=15, 11-15=20, 16+=30", () => {
  assert.equal(diaDaRampa(null, "2026-11-16"), 1);
  assert.equal(diaDaRampa("2026-11-16", "2026-11-16"), 1);
  assert.equal(diaDaRampa("2026-11-16", "2026-11-21"), 6);
  assert.equal(diaDaRampa("2026-11-16", "2026-12-01"), 16);
  const lim = (d: number) => limiteDoDia(1000, RAMPA, d).limite;
  assert.deepEqual([1, 5, 6, 10, 11, 15, 16, 40].map(lim), [10, 10, 15, 15, 20, 20, 30, 30]);
});

test("limite do dia: menor entre parametro e rampa; nunca passa de 100", () => {
  assert.deepEqual(limiteDoDia(10, RAMPA, 20), { limite: 10, origem: "parametro" });
  assert.deepEqual(limiteDoDia(50, RAMPA, 20), { limite: 30, origem: "rampa" });
  assert.deepEqual(limiteDoDia(500, [{ dia_inicio: 1, limite: 900 }], 1), { limite: 100, origem: "teto" });
  assert.equal(limiteDoDia(0, RAMPA, 20).limite, 0);
  assert.equal(limiteDoDia(null, RAMPA, 1).limite, 10, "parametro ausente cai no padrao 10");
});

test("intervalo entre envios fica sempre entre 8 e 25 minutos", () => {
  assert.equal(intervaloEntreEnviosMin(0), 8);
  assert.equal(intervaloEntreEnviosMin(0.999999), 25);
  for (let i = 0; i < 200; i++) { const m = intervaloEntreEnviosMin(Math.random()); assert.ok(m >= 8 && m <= 25); }
});

const base = (): ContextoEnvio => ({
  envioLiberado: true, aprovacaoObrigatoria: true, mensagemStatus: "aprovado", contatoEmail: "logistica@a.com", contatoValidacao: "mx_ok",
  empresaStatus: "em_contato", empresaRepousoAte: null, hojeYmd: "2026-11-16", jaRespondeuOuDevolveu: false, enviadosHoje: 0, limiteHoje: 10,
  agora: sp("2026-11-16", "10:00"), feriados: FERIADOS, bloqueios: [], paradaAtiva: false, proximoEnvioApos: null, modoTeste: true,
});

test("reconferencia: caminho feliz e cada trava", () => {
  assert.equal(motivoDeNaoEnviar(base()), null);
  const casos: [Partial<ContextoEnvio>, RegExp][] = [
    [{ envioLiberado: false }, /desligada/],
    [{ paradaAtiva: true }, /parada/],
    [{ mensagemStatus: "rascunho" }, /nao aprovada/],
    [{ bloqueios: [{ tipo: "dominio", valor: "a.com" }] }, /bloqueio/],
    [{ bloqueios: [{ tipo: "email", valor: "logistica@a.com" }] }, /bloqueio/],
    [{ contatoValidacao: "invalido" }, /nao validado/],
    [{ contatoValidacao: "devolvido" }, /nao validado/],
    [{ empresaStatus: "descartado" }, /descartado/],
    [{ empresaStatus: "descadastrado" }, /descadastrado/],
    [{ empresaStatus: "repouso", empresaRepousoAte: "2026-12-01" }, /repouso/],
    [{ empresaStatus: "quente" }, /respondeu/],
    [{ jaRespondeuOuDevolveu: true }, /respondeu/],
    [{ enviadosHoje: 10 }, /limite/],
    [{ agora: sp("2026-11-16", "18:30") }, /janela/],
    [{ agora: sp("2026-11-20", "10:00") }, /janela/],
    [{ proximoEnvioApos: sp("2026-11-16", "10:20") }, /intervalo/],
  ];
  for (const [patch, re] of casos) assert.match(motivoDeNaoEnviar({ ...base(), ...patch }) ?? "", re, JSON.stringify(patch));
  assert.equal(motivoDeNaoEnviar({ ...base(), empresaStatus: "repouso", empresaRepousoAte: "2026-11-10" }), null, "repouso vencido libera");
  assert.equal(motivoDeNaoEnviar({ ...base(), aprovacaoObrigatoria: false, mensagemStatus: "rascunho" }), null, "sem aprovacao obrigatoria");
});

test("bloqueio por e-mail e dominio, sem diferenciar maiusculas", () => {
  const b = [{ tipo: "email", valor: "x@y.com" }, { tipo: "dominio", valor: "ruim.com" }];
  assert.ok(emailBloqueado("X@Y.com", b));
  assert.ok(emailBloqueado("alguem@ruim.com", b));
  assert.ok(!emailBloqueado("alguem@bom.com", b));
});

test("descadastro bloqueia o dominio so quando nao e provedor gratuito", () => {
  assert.deepEqual(bloqueiosParaEmail("Joao@Empresa.com.br"), [{ tipo: "email", valor: "joao@empresa.com.br" }, { tipo: "dominio", valor: "empresa.com.br" }]);
  assert.deepEqual(bloqueiosParaEmail("joao@gmail.com"), [{ tipo: "email", valor: "joao@gmail.com" }]);
  assert.deepEqual(bloqueiosParaEmail("x@rbrcargo.com.br"), [{ tipo: "email", valor: "x@rbrcargo.com.br" }]);
});

const cand = (p: Partial<Candidato>): Candidato => ({ id: "x", toque: 1, classe: "A", tipoEmail: "generico", validacao: "mx_ok", dominioBateComSite: false, seguimentoVencido: false, ...p });
test("escolha: seguimento vencido > classe A > classe B; pessoal so em A com dominio igual ao site; catch-all por ultimo", () => {
  const lista = [cand({ id: "B", classe: "B" }), cand({ id: "A", classe: "A" }), cand({ id: "S", classe: "B", seguimentoVencido: true, toque: 2 })];
  assert.equal(escolher(lista, 0)?.id, "S");
  assert.equal(escolher(lista.slice(0, 2), 0)?.id, "A");
  assert.equal(escolher([cand({ id: "P", tipoEmail: "pessoal" })], 0), null);
  assert.equal(escolher([cand({ id: "P", tipoEmail: "pessoal", dominioBateComSite: true })], 0)?.id, "P");
  assert.equal(escolher([cand({ id: "P", classe: "B", tipoEmail: "pessoal", dominioBateComSite: true })], 0), null);
  assert.equal(escolher([cand({ id: "C", validacao: "catch_all" }), cand({ id: "OK", classe: "B" })], 0)?.id, "OK");
  assert.equal(escolher([cand({ id: "C", validacao: "catch_all" })], 0)?.id, "C");
  assert.equal(escolher([cand({ id: "C", validacao: "catch_all" })], 3), null, "catch-all so em dia de poucas devolucoes");
  assert.equal(escolher([cand({ id: "I", validacao: "invalido" }), cand({ id: "Q", validacao: "pendente" })], 0), null);
  assert.equal(escolher([cand({ classe: "C" })], 0), null);
});

test("erros de SMTP: 4xx tenta de novo ate 3x; 5xx falha; bloqueio/limite/spam para tudo", () => {
  assert.equal(tratarErroEnvio(451, "try again later", 0), "tentar_de_novo");
  assert.equal(tratarErroEnvio(451, "try again later", 2), "falhou");
  assert.equal(tratarErroEnvio(550, "user unknown", 0), "destinatario_invalido");
  assert.equal(tratarErroEnvio(550, "mensagem recusada", 0), "falhou", "550 generico continua falhou");
  for (const m of ["550 sending limit exceeded", "554 blocked as spam", "Account suspended", "policy violation", "Rate limit"]) {
    assert.ok(erroSmtpEhBloqueio(m), m);
    assert.equal(tratarErroEnvio(550, m, 0), "parada_automatica");
  }
});

test("parada automatica: cada gatilho e a ausencia deles", () => {
  const ok = { devolucoesPermanentesHoje: 2, reclamacaoNova: false, erroSmtpBloqueio: false, avisoAbusoHostinger: false, ultimosEnvios: { enviados: 40, devolvidos: 2 } };
  assert.equal(motivoParadaAutomatica(ok), null);
  assert.match(motivoParadaAutomatica({ ...ok, devolucoesPermanentesHoje: 3 })!, /devolucoes/);
  assert.match(motivoParadaAutomatica({ ...ok, reclamacaoNova: true })!, /reclamacao/);
  assert.match(motivoParadaAutomatica({ ...ok, erroSmtpBloqueio: true })!, /SMTP/);
  assert.match(motivoParadaAutomatica({ ...ok, avisoAbusoHostinger: true })!, /Hostinger/);
  assert.match(motivoParadaAutomatica({ ...ok, ultimosEnvios: { enviados: 40, devolvidos: 3 } })!, /5%/);
  assert.match(motivoParadaAutomatica({ ...ok, ultimosEnvios: { enviados: 20, devolvidos: 2 } })!, /5%/, "20 envios ja conta");
  assert.equal(motivoParadaAutomatica({ ...ok, ultimosEnvios: { enviados: 0, devolvidos: 0 } }), null);
});

const NOSSOS = new Set(["abc-1@rbrcargo.com.br"]);
const cab = (p: Partial<{ from: string; to: string; subject: string; inReplyTo: string; references: string }>) => ({ from: "fulano@cliente.com", to: "pedro@rbrcargo.com.br", subject: "x", inReplyTo: "", references: "", ...p });
test("leitura filtrada: so resposta nossa, alias de descadastro e DSN nosso; o resto e ignorado", () => {
  assert.equal(classificarRelevancia(cab({ inReplyTo: "<abc-1@rbrcargo.com.br>" }), NOSSOS), "resposta");
  assert.equal(classificarRelevancia(cab({ references: "<outro@x.com> <ABC-1@rbrcargo.com.br>" }), NOSSOS), "resposta");
  assert.equal(classificarRelevancia(cab({ to: "descadastrar@rbrcargo.com.br" }), NOSSOS), "descadastro_alias");
  assert.equal(classificarRelevancia(cab({ from: "MAILER-DAEMON@mx.com", references: "<abc-1@rbrcargo.com.br>" }), NOSSOS), "devolucao");
  assert.equal(classificarRelevancia(cab({ from: "postmaster@mx.com" }), NOSSOS, () => true), "devolucao", "DSN que cita o id no corpo");
  // ignorados
  assert.equal(classificarRelevancia(cab({}), NOSSOS), null, "e-mail comum");
  assert.equal(classificarRelevancia(cab({ inReplyTo: "<de-outra-pessoa@x.com>" }), NOSSOS), null, "resposta a e-mail que nao e nosso");
  assert.equal(classificarRelevancia(cab({ from: "mailer-daemon@mx.com" }), NOSSOS), null, "DSN de outra coisa");
  assert.equal(classificarRelevancia(cab({ from: "banco@x.com", subject: "Sua fatura", to: "pedro@rbrcargo.com.br" }), NOSSOS), null);
});

test("devolucao permanente (5.x.x) x temporaria (4.x.x)", () => {
  assert.ok(devolucaoPermanente("Status: 5.1.1 User unknown"));
  assert.ok(!devolucaoPermanente("Status: 4.2.2 Mailbox full"));
});

test("classificacao por regras (portugues)", () => {
  const c = (t: string, a = "") => classificarPorRegras(t, a);
  assert.equal(c("Sair"), "sair");
  assert.equal(c("Por favor, me descadastre da lista"), "sair");
  assert.equal(c("Não quero mais receber"), "sair");
  assert.equal(c("Isso é spam, vou denunciar"), "reclamacao");
  assert.equal(c("Como vocês conseguiram meu e-mail? Parem de me enviar"), "reclamacao");
  assert.equal(c("Qual o valor do frete para Recife?"), "preco_prazo");
  assert.equal(c("Qual o prazo de entrega?"), "preco_prazo");
  assert.equal(c("Tenho interesse, podem me enviar uma cotação? Despachamos 12 cargas por semana"), "cotacao");
  assert.equal(c("Não sou eu o responsável, fale com o Carlos: carlos@empresa.com"), "nao_sou_eu");
  assert.equal(c("Agora não, já temos transportadora"), "agora_nao");
  assert.equal(c("Estarei ausente até dia 20", "Resposta automática: ausente"), "fora_do_escritorio");
  assert.equal(c("Obrigado pelo contato."), "outro");
});

test("classificacao ignora o texto citado do nosso proprio e-mail", () => {
  const corpo = "Obrigado, vou ver.\n\nEm seg., 16 de nov. de 2026 07:00, Pedro escreveu:\n> Se preferir nao receber mais mensagens, responda \"sair\".\n> quantas cargas por semana";
  assert.equal(classificarPorRegras(corpo), "outro");
});

test("indicacao: pega o e-mail citado, ignora o proprio e o do dominio RBR", () => {
  assert.equal(emailDeIndicacao("Fale com carlos@empresa.com", "eu@empresa.com"), "carlos@empresa.com");
  assert.equal(emailDeIndicacao("eu@empresa.com e pedro@rbrcargo.com.br", "eu@empresa.com"), null);
});

test("decisao: IA so vale com confianca >= 0.8; sem IA, regra decide; outro vai para pessoa", () => {
  assert.deepEqual(decidirClassificacao("outro", { classe: "cotacao", confianca: 0.9 }), { classe: "cotacao", paraPessoa: false });
  assert.deepEqual(decidirClassificacao("outro", { classe: "cotacao", confianca: 0.5 }), { classe: "outro", paraPessoa: true });
  assert.deepEqual(decidirClassificacao("sair", null), { classe: "sair", paraPessoa: false });
  assert.deepEqual(decidirClassificacao("outro", null), { classe: "outro", paraPessoa: true });
  assert.equal(decidirClassificacao("outro", { classe: "outro", confianca: 0.99 }).paraPessoa, true);
});

test("modelos: HTML e variavel desconhecida sao recusados", () => {
  assert.equal(validarModelo("Frete de {segmento_legivel} em {cidade}", "Ola {nome}, da {empresa} ({veiculo})"), null);
  assert.match(validarModelo("a", "<b>oi</b>")!, /HTML/);
  assert.match(validarModelo("a", "oi {cpf}")!, /desconhecida/);
});

test("jornada: 0/3/7/14 dias depois do toque anterior; depois do 4 acaba", () => {
  const J = [{ toque: 1, atraso_dias: 0, modelo_tipo: "toque1" }, { toque: 2, atraso_dias: 3, modelo_tipo: "toque2" }, { toque: 3, atraso_dias: 7, modelo_tipo: "toque3" }, { toque: 4, atraso_dias: 14, modelo_tipo: "toque4" }];
  const t0 = new Date("2026-11-16T10:00:00Z");
  assert.deepEqual(proximoToque(1, t0, J, new Date("2026-11-19T09:59:00Z")), { toque: 2, vencido: false });
  assert.deepEqual(proximoToque(1, t0, J, new Date("2026-11-19T10:00:00Z")), { toque: 2, vencido: true });
  assert.deepEqual(proximoToque(3, t0, J, new Date("2026-11-30T10:00:00Z")), { toque: 4, vencido: true });
  assert.deepEqual(proximoToque(4, t0, J, t0), { fim: true });
});

test("cabecalhos: List-Unsubscribe mailto, Message-ID proprio e Re: nos seguimentos", () => {
  const p = cabecalhosEnvio({ messageId: "<u1@rbrcargo.com.br>", assunto: "Frete X", toque: 1 });
  assert.equal(p.headers["List-Unsubscribe"], "<mailto:descadastrar@rbrcargo.com.br?subject=sair>");
  assert.ok(!("List-Unsubscribe-Post" in p.headers));
  assert.equal(p.subject, "Frete X");
  assert.equal(p.inReplyTo, undefined);
  const s = cabecalhosEnvio({ messageId: "<u2@rbrcargo.com.br>", assunto: "qualquer", assuntoOriginal: "Frete X", toque: 2, messageIdPrimeiroToque: "<u1@rbrcargo.com.br>" });
  assert.equal(s.subject, "Re: Frete X");
  assert.equal(s.inReplyTo, "<u1@rbrcargo.com.br>");
  assert.equal(s.references, "<u1@rbrcargo.com.br>");
});

test("horas uteis contam so a janela de envio (lembrete do lead quente)", () => {
  assert.equal(horasUteisEntre(sp("2026-11-16", "16:00"), sp("2026-11-17", "08:00"), FERIADOS), 3, "2h ate 18h + 1h depois das 7h");
  assert.equal(horasUteisEntre(sp("2026-11-20", "08:00"), sp("2026-11-20", "12:00"), FERIADOS), 0, "feriado");
});


// ======================= Etapa 2 (noite 16 para 17/11): correcoes dos robos =======================

test("item 2: MX so marca invalido quando o dominio claramente nao existe; erro transitorio nao mexe no contato", () => {
  assert.equal(statusPorMx({ ok: true, registros: 2 }), "mx_ok");
  assert.equal(statusPorMx({ ok: true, registros: 0 }), "invalido", "lista vazia");
  assert.equal(statusPorMx({ ok: false, nome: "NotFound", mensagem: "no record found" }), "invalido");
  assert.equal(statusPorMx({ ok: false, nome: "Error", mensagem: "queryMx ENOTFOUND x" }), "invalido", "NXDOMAIN em texto");
  assert.equal(statusPorMx({ ok: false, nome: "Error", mensagem: "NXDOMAIN" }), "invalido");
  assert.equal(statusPorMx({ ok: false, nome: "TimedOut", mensagem: "request timed out" }), null);
  assert.equal(statusPorMx({ ok: false, nome: "Error", mensagem: "SERVFAIL" }), null);
  assert.equal(statusPorMx({ ok: false, nome: "TypeError", mensagem: "Deno.resolveDns is not a function" }), null, "resolvedor indisponivel no runtime");
});

test("item 3: 'processo' sozinho NAO e reclamacao; expressoes juridicas e de abuso sao", () => {
  const c = (t: string) => classificarPorRegras(t);
  assert.notEqual(c("Nosso processo de cotação passa pelo setor de compras, pode enviar a proposta"), "reclamacao");
  assert.equal(c("Nosso processo de cotação passa pelo setor de compras, pode enviar a proposta"), "cotacao");
  assert.equal(c("Qual o processo para homologar fornecedor?"), "outro");
  assert.equal(c("O processo de compras é por e-mail."), "outro");
  for (const t of ["Vou processar vocês", "Vou entrar com processo judicial", "Já acionei meu advogado", "Vou ao Procon", "Isso é abuso", "Vou fazer uma denúncia", "Ação judicial a caminho", "Isso é spam", "Não autorizei esse contato", "Parem de enviar"])
    assert.equal(c(t), "reclamacao", t);
});

test("item 4: taxa de devolucao so vale com 20+ envios; abaixo disso vale a regra de 3 devolucoes no dia", () => {
  const b = { devolucoesPermanentesHoje: 1, reclamacaoNova: false, erroSmtpBloqueio: false, avisoAbusoHostinger: false };
  assert.equal(motivoParadaAutomatica({ ...b, ultimosEnvios: { enviados: 10, devolvidos: 1 } }), null, "1 em 10 nao para");
  assert.equal(motivoParadaAutomatica({ ...b, ultimosEnvios: { enviados: 19, devolvidos: 2 } }), null);
  assert.match(motivoParadaAutomatica({ ...b, ultimosEnvios: { enviados: 20, devolvidos: 2 } })!, /5%/);
  assert.equal(motivoParadaAutomatica({ ...b, ultimosEnvios: { enviados: 20, devolvidos: 1 } }), null, "exatamente 5% nao passa de 5%");
  assert.match(motivoParadaAutomatica({ ...b, devolucoesPermanentesHoje: 3, ultimosEnvios: { enviados: 5, devolvidos: 3 } })!, /3 ou mais/, "regra das 3 continua valendo");
});

test("item 5: provedores gratuitos (inclui .com.br) e lista IDENTICA a da constraint da migration 1200", () => {
  for (const d of ["hotmail.com.br", "outlook.com.br", "live.com.br", "gmail.com.br"]) assert.ok(!dominioBloqueavel(d), d);
  assert.deepEqual(bloqueiosParaEmail("fulano@hotmail.com.br"), [{ tipo: "email", valor: "fulano@hotmail.com.br" }]);
  assert.ok(dominioBloqueavel("empresa.com.br"));
  const sql = readFileSync(new URL("../../../supabase-migrations/20261116-1200-prospeccao-ajustes.sql", import.meta.url), "utf8");
  const bloco = sql.slice(sql.indexOf("add constraint prospeccao_bloqueio_dominio_publico_ck"));
  const lista = [...bloco.slice(0, bloco.indexOf("));")).matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((x) => x !== "dominio");
  assert.deepEqual([...lista].sort(), [...LISTA_PROVEDORES_GRATUITOS].sort());
});

test("item 6: horasUteisEntre rapido e exato (fim de semana, feriado, varios dias, bordas nao alinhadas)", () => {
  // quinta 12:00 ate segunda 12:00 (sem feriado): quinta 6h + sexta 11h + segunda 5h
  assert.equal(horasUteisEntre(sp("2026-11-12", "12:00"), sp("2026-11-16", "12:00"), new Set()), 6 + 11 + 5);
  // com feriado na sexta 20/11 (consciencia negra): semana de 16 a 23
  assert.equal(horasUteisEntre(sp("2026-11-16", "07:00"), sp("2026-11-23", "07:00"), FERIADOS), 4 * 11);
  // bordas fora do multiplo de 15 min
  assert.equal(horasUteisEntre(sp("2026-11-16", "10:07"), sp("2026-11-16", "10:52"), FERIADOS), 45 / 60);
  assert.equal(horasUteisEntre(sp("2026-11-16", "17:50"), sp("2026-11-16", "18:10"), FERIADOS), 10 / 60);
  assert.equal(horasUteisEntre(sp("2026-11-16", "12:00"), sp("2026-11-16", "12:00"), FERIADOS), 0);
  // referencia minuto a minuto (a versao antiga) bate com a nova
  const de = sp("2026-11-13", "16:43"), ate = sp("2026-11-24", "09:21");
  let min = 0;
  for (let t = de.getTime(); t < ate.getTime(); t += 60_000) if (dentroDaJanelaEnvio(new Date(t), FERIADOS)) min++;
  assert.ok(Math.abs(horasUteisEntre(de, ate, FERIADOS) - min / 60) < 1e-9);
  // 30 dias nao pode demorar (limite de CPU de 2 s por requisicao)
  const t0 = Date.now();
  horasUteisEntre(sp("2026-10-01", "08:00"), sp("2026-11-01", "08:00"), FERIADOS);
  assert.ok(Date.now() - t0 < 500, "lento demais");
});

test("item 7: erro de destinatario inexistente (550/551/553/554 com texto claro) x erros genericos", () => {
  assert.ok(erroDeDestinatario(550, "550 5.1.1 User unknown"));
  assert.ok(erroDeDestinatario(550, "550 5.1.1 <x@y.com>: Recipient address rejected: User unknown in virtual mailbox table"));
  assert.ok(erroDeDestinatario(553, "553 mailbox does not exist"));
  assert.ok(erroDeDestinatario(551, "551 invalid recipient"));
  assert.ok(erroDeDestinatario(554, "554 5.1.1 no such user"));
  assert.ok(erroDeDestinatario(550, "Caixa inexistente"));
  assert.ok(!erroDeDestinatario(550, "550 message refused"), "550 sem texto de usuario");
  assert.ok(!erroDeDestinatario(452, "user unknown"), "4xx nao");
  assert.ok(!erroDeDestinatario(null, "user unknown"), "sem codigo (timeout) nao");
  assert.equal(tratarErroEnvio(null, "Connection timeout", 0), "falhou");
  assert.equal(tratarErroEnvio(550, "5.1.1 user unknown", 0), "destinatario_invalido");
  assert.equal(tratarErroEnvio(554, "554 blocked as spam, user unknown", 0), "parada_automatica", "bloqueio tem prioridade");
});

test("item 8: 'rate' e palavras parecidas so contam como palavra inteira", () => {
  for (const m of ["operate", "separate", "generate a report", "accurate address", "moderate"]) assert.ok(!erroSmtpEhBloqueio(m), m);
  for (const m of ["Rate limit exceeded", "rate-limited", "too many messages, limit reached", "Your account was blocked", "sending quota exceeded"]) assert.ok(erroSmtpEhBloqueio(m), m);
  assert.equal(tratarErroEnvio(421, "Cannot operate right now, try later", 0), "tentar_de_novo");
});

test("item 9: aviso de abuso so de remetente Hostinger com assunto de alerta", () => {
  assert.ok(avisoDeAbuso("Hostinger Abuse <abuse@hostinger.com>", "Notice of abuse report"));
  assert.ok(avisoDeAbuso("postmaster@mail.hostinger.com.br", "Sua conta foi suspensa (suspend)"));
  assert.ok(avisoDeAbuso("no-reply@hostinger.io", "Policy violation detected"));
  assert.ok(!avisoDeAbuso("Hostinger <no-reply@hostinger.com>", "Sua fatura chegou"), "fatura");
  assert.ok(!avisoDeAbuso("promo@hostinger.com", "Black Friday: 80% de desconto"), "promocao");
  assert.ok(!avisoDeAbuso("cliente@empresa.com.br", "Suspend the contract? abuse of hostinger"), "remetente nao e da Hostinger");
  assert.ok(!avisoDeAbuso("x@hostinger.com.evil.com", "abuse"), "dominio falso");
  assert.ok(!avisoDeAbuso("x@nothostinger.com", "abuse"));
});

test("item 10: sem a chave de envio so a confirmacao de descadastro sai", () => {
  for (const t of ["resp_recebimento", "resp_agora_nao", "resp_indicacao", "resp_cotacao", "resp_recusa_carga"]) {
    assert.equal(respostaAutomaticaPodeSair(t, false), false, t);
    assert.equal(respostaAutomaticaPodeSair(t, true), true, t);
  }
  assert.equal(respostaAutomaticaPodeSair("resp_sair", false), true);
});

test("item 11: modo real exige e-mail verificado; mx_ok e catch_all so em modo teste", () => {
  const real = { ...base(), modoTeste: false };
  assert.match(motivoDeNaoEnviar({ ...real, contatoValidacao: "mx_ok" }) ?? "", /verificado/);
  assert.match(motivoDeNaoEnviar({ ...real, contatoValidacao: "catch_all" }) ?? "", /verificado/);
  assert.equal(motivoDeNaoEnviar({ ...real, contatoValidacao: "verificado" }), null);
  assert.equal(motivoDeNaoEnviar({ ...base(), modoTeste: true, contatoValidacao: "mx_ok" }), null);
  assert.equal(escolher([cand({ validacao: "mx_ok" })], 0, false), null);
  assert.equal(escolher([cand({ validacao: "catch_all" })], 0, false), null);
  assert.equal(escolher([cand({ id: "V", validacao: "verificado" })], 0, false)?.id, "V");
  assert.equal(escolher([cand({ id: "M", validacao: "mx_ok" })], 0, true)?.id, "M");
});

test("item 1: so ha certeza de nao-envio com resposta SMTP explicita ou falha de autenticacao/DNS", () => {
  assert.ok(certezaDeNaoEnviado(451, null));
  assert.ok(certezaDeNaoEnviado(null, "EAUTH"));
  assert.ok(!certezaDeNaoEnviado(null, "ETIMEDOUT"), "timeout pode ter enviado");
  assert.ok(!certezaDeNaoEnviado(null, null));
});
