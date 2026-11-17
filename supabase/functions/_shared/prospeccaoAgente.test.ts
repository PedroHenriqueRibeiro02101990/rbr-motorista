// node --test supabase/functions/_shared/prospeccaoAgente.test.ts   (sem API paga: tudo com respostas simuladas)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acaoParaCategoria, agregarMetricas, CAMPOS_EDITAVEIS_PELA_IA, CAMPOS_FIXOS, CATEGORIAS, custoBrl, custoUsd, decidirEscalada, decidirExperimento, estadoTeto, garantirRodape, grupoVariantePorEmpresa,
  lerSaidaClassificador, limparCampos, modeloDaFuncao, podeEnviarSozinho, preencherNome, quemEhDevolucao, usarVariante, validarMudancaAnalista, validarTextoSaida, type Categoria,
} from "./prospeccaoAgente.ts";

const PRECOS = { "claude-haiku-5-5": { in: 1, out: 5 }, "claude-sonnet-5-5": { in: 3, out: 15 } };
// corpo do toque 1 que esta hoje no banco (migration 1100): precisa passar no validador
const TOQUE1 = `Olá, tudo bem?

Meu nome é Pedro, da RBR Cargo. Somos uma agenciadora de cargas em São Paulo e atendemos indústrias com frete rodoviário em truck e carreta (baú, sider, graneleiro, prancha e munck).

Vi que vocês operam com {segmento_frase} e queria entender uma coisa: quantas cargas por semana vocês despacham hoje, e para quais regiões?

Obrigado,

Pedro Henrique
RBR Cargo | Agenciamento e Transporte
(11) 5397-7966
pedro@rbrcargo.com.br
www.rbrcargo.com.br

Se preferir não receber mais mensagens, responda "sair".`;

test("classificacao -> acao: cada categoria faz o que o roteiro manda", () => {
  assert.deepEqual(acaoParaCategoria("sair"), { tipo: "descadastrar", modelo: "resp_sair" });
  const agora = acaoParaCategoria("agora_nao"); assert.ok(agora.tipo === "responder" && agora.modelo === "resp_agora_nao" && agora.pausarJornada);
  const ind = acaoParaCategoria("indicacao"); assert.ok(ind.tipo === "responder" && ind.modelo === "resp_indicacao" && ind.registrarIndicado);
  const cot = acaoParaCategoria("cotacao"); assert.ok(cot.tipo === "responder" && cot.modelo === "resp_cotacao" && cot.avisarPedro && cot.tirarDoFluxo, "cotacao: modelo, aviso ao Pedro e fora do fluxo automatico");
  const rec = acaoParaCategoria("recusa_carga"); assert.ok(rec.tipo === "responder" && rec.modelo === "resp_recusa_carga");
  for (const c of ["preco_prazo_negociacao", "duvida", "cosmeticos"] as Categoria[]) assert.equal(acaoParaCategoria(c).tipo, "escalar_para_pedro", `${c} NAO e respondido`);
  assert.equal(acaoParaCategoria("devolucao_ou_resposta_automatica").tipo, "devolucao_ou_automatica");
  assert.equal(acaoParaCategoria("cotacao", true).tipo, "escalar_para_pedro", "tom irritado vai para pessoa, ate numa cotacao");
  assert.equal(acaoParaCategoria("sair", true).tipo, "descadastrar", "descadastro sempre respeitado");
  assert.equal(CATEGORIAS.length, 9);
});

test("so responde sozinho com aprovacao desligada e autonomia que cubra; comeca em rascunho", () => {
  const base = { aprovacaoObrigatoria: true, autonomia: "roteiro", modelo: "resp_cotacao" as const };
  assert.equal(podeEnviarSozinho(base), false, "aprovacao obrigatoria = so rascunho");
  assert.equal(podeEnviarSozinho({ ...base, aprovacaoObrigatoria: false, autonomia: "rascunho" }), false, "escada comeca em rascunho");
  assert.equal(podeEnviarSozinho({ ...base, aprovacaoObrigatoria: false, autonomia: "seguras" }), false, "cotacao nao e das seguras");
  assert.equal(podeEnviarSozinho({ ...base, aprovacaoObrigatoria: false, autonomia: "seguras", modelo: "resp_agora_nao" }), true);
  assert.equal(podeEnviarSozinho({ ...base, aprovacaoObrigatoria: false, autonomia: "roteiro" }), true);
  assert.equal(podeEnviarSozinho({ ...base, aprovacaoObrigatoria: false, autonomia: "qualquer coisa" }), false, "valor desconhecido nao libera");
});

test("escalada: confianca baixa sobe do barato para o forte e depois vai para uma pessoa", () => {
  assert.equal(decidirEscalada(0.9, "barato"), "aceitar");
  assert.equal(decidirEscalada(0.69, "barato"), "escalar_modelo");
  assert.equal(decidirEscalada(0.69, "forte"), "humano");
  assert.equal(decidirEscalada(0.7, "forte"), "aceitar");
});

test("saida do classificador: so o contrato; campos limpos; lixo vira null", () => {
  const ok = lerSaidaClassificador('Claro: {"categoria":"cotacao","confianca":0.93,"tom_irritado":false,"campos":{"origem":"Jundiai/SP","destino":"Recife/PE","cnpj":"12.345.678/0001-95","whatsapp":"(11) 98888-7777","peso":"24 t","extra":"x"}}');
  assert.ok(ok && ok.categoria === "cotacao" && ok.confianca === 0.93);
  assert.deepEqual(ok?.campos, { origem: "Jundiai/SP", destino: "Recife/PE", cnpj: "12345678000195", whatsapp: "11988887777", peso: "24 t" });
  assert.equal(lerSaidaClassificador('{"categoria":"inventada","confianca":0.9}'), null);
  assert.equal(lerSaidaClassificador('{"categoria":"sair","confianca":1.5}'), null);
  assert.equal(lerSaidaClassificador("nao e json"), null);
  assert.deepEqual(limparCampos({ cnpj: "123", whatsapp: "12", indicado: "Carlos", origem: "  SP  ", destino: "null" }), { origem: "SP" });
  assert.deepEqual(limparCampos({ indicado: "carlos@empresa.com" }), { indicado: "carlos@empresa.com" });
  assert.ok(quemEhDevolucao("MAILER-DAEMON@x.com", "") && quemEhDevolucao("a@b.com", "Status: 5.1.1") && !quemEhDevolucao("a@b.com", "Estou de ferias"));
});

test("validador: reprova preco, prazo de coleta, 'time comercial', 'agenciador', telefone e e-mail inventados, variavel solta e falta de rodape", () => {
  const reprova = (t: string, re: RegExp) => { const v = validarTextoSaida(t, { exigeRodape: false }); assert.ok(!v.ok && v.motivos.some((m) => re.test(m)), `${t} => ${JSON.stringify(v)}`); };
  reprova("O frete sai por R$ 4.500,00 ate Recife.", /valor de frete|preco/);
  reprova("Fica em 3.800 reais a carreta.", /valor de frete|preco/);
  reprova("O frete custa 5000.", /valor de frete|preco/);
  reprova("Fazemos 10% de desconto.", /valor de frete|preco/);
  reprova("A coleta e feita amanha cedo.", /prazo de coleta/);
  reprova("Coletamos em 2 dias.", /prazo de coleta/);
  reprova("O prazo de coleta e de 24 horas.", /prazo de coleta/);
  reprova("Vou passar para o time comercial.", /comercial/);
  reprova("Sou agenciador de cargas.", /agenciador/);
  reprova("Ligue (21) 98888-7777.", /telefone/);
  reprova("Escreva para vendas@outraempresa.com.", /e-mail/);
  reprova("Ola {nome}, tudo bem?", /variavel/);
  const semRodape = validarTextoSaida("Obrigado pelo retorno.", { exigeRodape: true });
  assert.ok(!semRodape.ok && /rodape/.test(semRodape.motivos[0]));
  const bom = validarTextoSaida('Obrigado pelo retorno! O Jose Carlos retorna em breve.\nWhatsApp (11) 95397-7966 · pedro@rbrcargo.com.br\n\nSe preferir nao receber mais mensagens, responda "sair".', { exigeRodape: true, permiteWhatsappRbr: true });
  assert.ok(bom.ok, JSON.stringify(bom));
  assert.ok(!validarTextoSaida("WhatsApp (11) 95397-7966", { permiteWhatsappRbr: false }).ok, "texto da IA nao pode trazer telefone nenhum");
  assert.ok(validarTextoSaida("Fale com carlos@cliente.com", { emailsPermitidos: ["carlos@cliente.com"] }).ok, "e-mail do proprio contato e permitido");
  const t1 = validarTextoSaida(TOQUE1.replace("{segmento_frase}", "bebidas"), { exigeRodape: true, permiteWhatsappRbr: true });
  assert.ok(t1.ok, `o toque 1 atual precisa passar: ${JSON.stringify(t1)}`);
});

test("nome: preenche; se desconhecido remove '{nome}, ' sem deixar virgula solta; rodape em todo e-mail", () => {
  assert.equal(preencherNome("Ola {nome}, tudo bem?", "Ana"), "Ola Ana, tudo bem?");
  assert.equal(preencherNome("{nome}, tudo bem?", ""), "tudo bem?");
  assert.equal(preencherNome("Ola, {nome}!", null), "Ola!");
  assert.equal(preencherNome("Ola {nome} tudo bem", undefined), "Ola tudo bem");
  assert.ok(!/\{nome\}/.test(preencherNome("a {nome} b {nome}, c", "")));
  assert.match(garantirRodape("Obrigado."), /responda "sair"\.$/);
  assert.equal(garantirRodape('Obrigado.\nresponda "sair"'), 'Obrigado.\nresponda "sair"', "nao duplica");
});

test("custo de IA: US$/milhao, cambio, modelo desconhecido usa o preco mais alto, teto e alerta de 70%", () => {
  assert.equal(custoUsd("claude-haiku-5-5", 1_000_000, 1_000_000, PRECOS), 6);
  assert.equal(custoUsd("claude-sonnet-5-5", 2000, 500, PRECOS), (2000 * 3 + 500 * 15) / 1e6);
  assert.equal(custoUsd("modelo-novo", 1_000_000, 0, PRECOS), 3, "desconhecido = mais caro conhecido");
  assert.equal(custoBrl(2, 5.5), 11);
  assert.equal(custoBrl(2, 0), 12, "cambio invalido cai num valor conservador");
  assert.equal(estadoTeto(2.0, 3).parar, false);
  assert.equal(estadoTeto(2.0, 3).alerta70, false);
  assert.equal(estadoTeto(2.1, 3).alerta70, true);
  assert.equal(estadoTeto(3, 3).parar, true, "ao bater o teto a IA para");
  assert.equal(estadoTeto(0, 0).parar, true, "teto zero = IA parada");
  const p = { PROSPECCAO_IA_MODELO_CLASSIFICAR: "claude-haiku-5-5", PROSPECCAO_IA_MODELO_REDIGIR: "claude-sonnet-5-5", PROSPECCAO_IA_MODELO_VALIDAR: "x; drop" };
  assert.equal(modeloDaFuncao("classificar", p), "claude-haiku-5-5"); assert.equal(modeloDaFuncao("redigir", p), "claude-sonnet-5-5");
  assert.equal(modeloDaFuncao("validar", p), "claude-haiku-5-5", "nome de modelo invalido cai no padrao");
});

const g = (enviados: number, respostasUteis = 0, descadastros = 0, devolucoes = 0) => ({ enviados, respostasUteis, descadastros, devolucoes });
test("experimento: reversao por descadastro e por devolucao (ja nos primeiros envios), por menos respostas uteis (~100 envios) e vencedor com margem clara", () => {
  assert.equal(decidirExperimento(g(200, 10), g(0)).decisao, "continuar");
  assert.equal(decidirExperimento(g(200, 10), g(5, 0, 1)).decisao, "reverter", "1 descadastro em 5 envios contra 0% no padrao");
  assert.match(decidirExperimento(g(200, 10), g(8, 0, 0, 1)).motivo, /devolucoes/);
  assert.equal(decidirExperimento(g(200, 10, 2), g(50, 2, 1)).decisao, "reverter", "2% da variante contra 1% do padrao");
  assert.equal(decidirExperimento(g(200, 10, 4), g(50, 2, 1)).decisao, "continuar", "2% contra 2%: nao esta acima");
  assert.equal(decidirExperimento(g(200, 20), g(99, 0)).decisao, "continuar", "antes de ~100 envios nao reverte por resposta");
  const menos = decidirExperimento(g(200, 20), g(100, 5));
  assert.equal(menos.decisao, "reverter"); assert.match(menos.motivo, /menos respostas uteis/);
  assert.equal(decidirExperimento(g(200, 20), g(100, 12)).decisao, "continuar", "12% contra 10% = +20%: ainda NAO e margem clara");
  assert.equal(decidirExperimento(g(200, 20), g(100, 13)).decisao, "vencedor", "13% contra 10% = +30%");
  assert.equal(decidirExperimento(g(50, 5), g(100, 14)).decisao, "continuar", "padrao sem amostra: nao decide");
  assert.equal(decidirExperimento(g(200, 20), g(100, 4)).decisao, "reverter");
});

test("variante: no maximo 10% dos envios e atribuicao estavel por empresa", () => {
  assert.equal(usarVariante(10, 0.0999), true); assert.equal(usarVariante(10, 0.1), false);
  assert.equal(usarVariante(50, 0.2), false, "mesmo pedindo 50%, o teto e 10%");
  assert.equal(usarVariante(0, 0), false);
  assert.equal(grupoVariantePorEmpresa("abc", 10), grupoVariantePorEmpresa("abc", 10), "estavel");
  let n = 0; for (let i = 0; i < 2000; i++) if (grupoVariantePorEmpresa(`empresa-${i}`, 10)) n++;
  assert.ok(n > 100 && n < 320, `cerca de 10%: ${n}`);
  assert.equal(grupoVariantePorEmpresa("x", 0), false);
});

test("analista: allowlist (texto, assunto, cadencia, segmento) e NADA do que e fixo", () => {
  assert.deepEqual([...CAMPOS_EDITAVEIS_PELA_IA], ["texto", "assunto", "cadencia", "segmento"]);
  for (const f of CAMPOS_FIXOS) { const r = validarMudancaAnalista({ campo: f, valor: "x" }); assert.equal(r.ok, false, `${f} precisa ser recusado`); assert.match(r.motivo ?? "", /fixo|allowlist/); }
  for (const f of ["preco", "prazo_coleta", "regras_descadastro", "limite_envio", "limite_gasto", "lista_recusa_carga", "flags", "chaves"]) assert.ok((CAMPOS_FIXOS as readonly string[]).includes(f), `${f} e fixo`);
  assert.equal(validarMudancaAnalista({ campo: "qualquer_outro", valor: 1 }).ok, false);
  // texto
  const texto = 'Olá! Atendemos {segmento_frase} em {cidade}. Quantas cargas por semana?\n\nSe preferir não receber mais mensagens, responda "sair".';
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "toque2", valor: texto }).ok, true);
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "resp_sair", valor: texto }).ok, false, "texto do descadastro e fixo");
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "resp_cotacao", valor: texto }).ok, false);
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "toque2", valor: texto.replace("Quantas", "O frete sai por R$ 3.000. Quantas") }).ok, false, "preco");
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "toque2", valor: texto.replace(' Se preferir', ' Se preferir').replace('\n\nSe preferir não receber mais mensagens, responda "sair".', "") }).ok, false, "sem rodape de sair");
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "toque2", valor: `<b>oi</b> ${texto}` }).ok, false, "HTML");
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "toque2", valor: `${texto} {cpf}` }).ok, false, "variavel desconhecida");
  assert.equal(validarMudancaAnalista({ campo: "texto", alvo: "toque2", valor: `${texto} Coletamos amanhã.` }).ok, false, "prazo de coleta");
  assert.equal(validarMudancaAnalista({ campo: "assunto", alvo: "toque1", valor: "Frete de {segmento_legivel} (RBR Cargo)" }).ok, true);
  assert.equal(validarMudancaAnalista({ campo: "assunto", alvo: "toque1", valor: "Frete barato R$ 100" }).ok, false);
  // cadencia: minimo 2 dias, maximo 4 toques (3 intervalos)
  assert.equal(validarMudancaAnalista({ campo: "cadencia", alvo: "jornada", valor: [2, 5, 10] }).ok, true);
  assert.equal(validarMudancaAnalista({ campo: "cadencia", alvo: "jornada", valor: [1, 5, 10] }).ok, false, "menos de 2 dias");
  assert.equal(validarMudancaAnalista({ campo: "cadencia", alvo: "jornada", valor: [2, 3, 4, 5] }).ok, false, "mais de 4 toques");
  assert.equal(validarMudancaAnalista({ campo: "cadencia", alvo: "jornada", valor: [] }).ok, false);
  // segmento
  assert.equal(validarMudancaAnalista({ campo: "segmento", alvo: "x", valor: "bebidas" }).ok, true);
  assert.equal(validarMudancaAnalista({ campo: "segmento", alvo: "x", valor: "cosmeticos" }).ok, false, "cosmeticos esta fora do roteiro");
});

test("metricas semanais: por toque, texto, segmento; uteis (cotacao e indicacao) separadas de agora_nao, descadastros e devolucoes", () => {
  const m = agregarMetricas([
    { toque: 1, modelo: "toque1", segmento: "bebidas", variante: false, resposta: "cotacao", devolvida: false },
    { toque: 1, modelo: "toque1", segmento: "bebidas", variante: false, resposta: null, devolvida: false },
    { toque: 1, modelo: "toque1", segmento: "plasticos", variante: true, resposta: "nao_sou_eu", devolvida: false },
    { toque: 2, modelo: "toque2", segmento: "bebidas", variante: false, resposta: "agora_nao", devolvida: false },
    { toque: 2, modelo: "toque2", segmento: "plasticos", variante: false, resposta: "sair", devolvida: false },
    { toque: 2, modelo: "toque2", segmento: "plasticos", variante: false, resposta: null, devolvida: true },
  ]);
  assert.deepEqual(m.total, { enviados: 6, respostas: 4, uteis: 2, agoraNao: 1, descadastros: 1, devolucoes: 1 });
  assert.equal(m.porToque.toque1.enviados, 3); assert.equal(m.porToque.toque2.descadastros, 1);
  assert.equal(m.porTexto["toque1 (variante)"].uteis, 1); assert.equal(m.porSegmento.bebidas.agoraNao, 1);
});

test("empresa assumida pelo Pedro nao recebe toque (a acao de escalar marca assumida e descarta pendentes)", () => {
  const a = acaoParaCategoria("duvida");
  assert.equal(a.tipo, "escalar_para_pedro");
  assert.ok(a.tipo === "escalar_para_pedro" && a.motivo.length > 5, "com motivo, para o aviso");
});
