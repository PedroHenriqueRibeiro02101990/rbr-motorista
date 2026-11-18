// node --test supabase/functions/_shared/prospeccaoRegras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bloqueiosParaEmail, classificarPorRegras, classificarRelevancia, cabecalhosEnvio, decidirClassificacao, devolucaoPermanente, dentroDaJanelaEnvio, dentroDaJanelaLeitura,
  diaDaRampa, emailBloqueado, emailDeIndicacao, erroSmtpEhBloqueio, escolherProximo, horasUteisEntre, intervaloEntreEnviosMin, limiteDoDia,
  motivoDeNaoEnviar, motivoParadaAutomatica, proximoToque, tratarErroEnvio, validarModelo, type Candidato, type ContextoEnvio,
} from "./prospeccaoRegras.ts";

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
  agora: sp("2026-11-16", "10:00"), feriados: FERIADOS, bloqueios: [], paradaAtiva: false, proximoEnvioApos: null,
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
  assert.equal(escolherProximo(lista, 0)?.id, "S");
  assert.equal(escolherProximo(lista.slice(0, 2), 0)?.id, "A");
  assert.equal(escolherProximo([cand({ id: "P", tipoEmail: "pessoal" })], 0), null);
  assert.equal(escolherProximo([cand({ id: "P", tipoEmail: "pessoal", dominioBateComSite: true })], 0)?.id, "P");
  assert.equal(escolherProximo([cand({ id: "P", classe: "B", tipoEmail: "pessoal", dominioBateComSite: true })], 0), null);
  assert.equal(escolherProximo([cand({ id: "C", validacao: "catch_all" }), cand({ id: "OK", classe: "B" })], 0)?.id, "OK");
  assert.equal(escolherProximo([cand({ id: "C", validacao: "catch_all" })], 0)?.id, "C");
  assert.equal(escolherProximo([cand({ id: "C", validacao: "catch_all" })], 3), null, "catch-all so em dia de poucas devolucoes");
  assert.equal(escolherProximo([cand({ id: "I", validacao: "invalido" }), cand({ id: "Q", validacao: "pendente" })], 0), null);
  assert.equal(escolherProximo([cand({ classe: "C" })], 0), null);
});

test("erros de SMTP: 4xx tenta de novo ate 3x; 5xx falha; bloqueio/limite/spam para tudo", () => {
  assert.equal(tratarErroEnvio(451, "try again later", 0), "tentar_de_novo");
  assert.equal(tratarErroEnvio(451, "try again later", 2), "falhou");
  assert.equal(tratarErroEnvio(550, "user unknown", 0), "falhou");
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
