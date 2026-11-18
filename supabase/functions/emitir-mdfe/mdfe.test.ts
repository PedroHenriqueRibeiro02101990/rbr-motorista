// Testes das regras do MDF-e (mdfe.ts). Rodar na raiz do repositório:
//   node --test supabase/functions/emitir-mdfe/mdfe.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ciotAusenteBloqueia, ciotEfreteSemValidade, cepCarregamentoDe, cepDescarregamentoDe, type DadosMdfe, montarMdfe, testeDaTrava, type VeiculoMdfe } from "./mdfe.ts";

const RBR = "69115969000104";
const CHAVE_CTE = "35261069115969000104570010000000011211536013";

const CAVALO: VeiculoMdfe = {
  placa: "AHP3H35",
  renavam: "00427675499",
  tara_kg: 7500,
  capacidade_carga: null,
  tipo_veiculo: "Cavalo mecânico",
  tipo_carroceria: null,
  uf_licenciamento: "SP",
  is_veiculo_proprio: true, // comodato na frota do RNTRC da RBR
  quantidade_eixos: 2,
  titular: null,
};
const CARRETA: VeiculoMdfe = {
  placa: "ABC1D23",
  renavam: "12345678901",
  tara_kg: 6800,
  capacidade_carga: 30000,
  tipo_veiculo: "Semirreboque",
  tipo_carroceria: "Sider",
  uf_licenciamento: "SP",
  is_veiculo_proprio: true,
  quantidade_eixos: 3,
  titular: null,
};

function base(s: Partial<DadosMdfe> = {}): DadosMdfe {
  return {
    op: {
      ambiente_fiscal: "homologacao",
      ie_configurada: true,
      emitente_cnpj: RBR,
      emitente_ie: "162095813113",
      emitente_razao_social: "RBR CARGO LTDA",
      veiculo_id: "v1",
      veiculo_rntrc_ativo: true,
      motorista_id: "m1",
      motorista_rntrc_ativo: true,
      motorista_nome: "Motorista Teste",
      motorista_cpf: "123.456.789-09",
      cidade_origem: "SAO PAULO",
      uf_origem: "SP",
      cidade_destino: "CAMPINAS",
      uf_destino: "SP",
      valor_nf: 5000,
    },
    pf: {
      responsavel_tecnico_cnpj: RBR,
      responsavel_tecnico_email: "fiscal@rbr.com.br",
      endereco_logradouro: "Rua da RBR",
      endereco_numero: "100",
      endereco_bairro: "Bairro",
      endereco_cep: "01000-000",
      endereco_uf: "SP",
      endereco_codigo_municipio: "3550308",
      rntrc: "012345678",
    },
    municipioEmitente: "São Paulo",
    cte: { status: "emitido", chave_acesso: CHAVE_CTE },
    tracao: CAVALO,
    reboques: [CARRETA],
    carregamento: { codigo_ibge: "3550308", cidade: "São Paulo" },
    descarregamento: { codigo_ibge: "3509502", cidade: "Campinas" },
    cotacao: { peso_bruto_kg: 1000, tipo_carga: "Carga geral", produto: "Mercadoria teste", ncm: "49111090", pedagio: 0 },
    apolice: { seguradora_nome: "Seguradora X", seguradora_cnpj: "11222333000181", numero_apolice: "123", responsavel_seguro: "emitente" },
    motorista: { pix: "chave-pix", banco_codigo: null, banco_agencia: null },
    cliente: { cnpj: "11444777000161", cpf: null, razao_social: "CLIENTE TESTE" },
    ciotVpo: { numero_averbacao: "AVB-123" },
    cepCarregamento: "01000000",
    cepDescarregamento: "13000000",
    condicao: { valor_total_contrato: 1500, valor_adiantamento: 1200, saldo_prazo_dias: 1 },
    agora: new Date("2026-10-07T12:00:00Z"),
    ...s,
  };
}

test("cavalo mecânico com carreta: sem bloqueios, tudo dentro de modal_rodoviario", () => {
  const { bloqueios, payload } = montarMdfe(base());
  assert.deepEqual(bloqueios, []);
  const m = payload.modal_rodoviario;
  assert.equal(payload.veiculo_tracao, undefined);
  assert.equal(m.registro_nacional_transporte, "12345678");
  assert.equal(m.placa_veiculo, "AHP3H35");
  assert.equal(m.renavam_veiculo, "00427675499");
  assert.equal(m.tara_veiculo, 7500);
  assert.equal(m.tipo_rodado_veiculo, "03");
  assert.equal(m.tipo_carroceria_veiculo, "00"); // cavalo não tem carroceria
  assert.equal(m.cpf_proprietario_veiculo, undefined); // frota da RBR: sem grupo de proprietário
  assert.deepEqual(m.condutores, [{ nome: "Motorista Teste", cpf: "12345678909" }]);
  assert.equal(m.veiculos_reboque.length, 1);
  assert.equal(m.veiculos_reboque[0].placa, "ABC1D23");
  assert.equal(m.veiculos_reboque[0].tara, 6800);
  assert.equal(m.veiculos_reboque[0].capacidade_kg, 30000);
  assert.equal(m.veiculos_reboque[0].tipo_carroceria, "05");
  assert.deepEqual(payload.municipios_descarregamento[0].conhecimentos_transporte, [{ chave_cte: CHAVE_CTE }]);
  assert.equal(m.pagamentos[0].forma_pagamento, "1");
});

test("cavalo sem carreta vinculada BLOQUEIA (a SEFAZ rejeitou na OP-0360; decisao de 18/11)", () => {
  const { bloqueios, avisos } = montarMdfe(base({ reboques: [] }));
  assert.ok(bloqueios.some((b) => b.startsWith("Cavalo mecânico sem reboque")));
  assert.ok(!avisos.some((a) => a.startsWith("Cavalo mecânico sem reboque")));
});

test("reboque sem tara/capacidade/carroceria bloqueia", () => {
  const { bloqueios } = montarMdfe(base({ reboques: [{ ...CARRETA, tara_kg: null, capacidade_carga: null, tipo_carroceria: null }] }));
  assert.ok(bloqueios.some((b) => b.includes("sem tara")));
  assert.ok(bloqueios.some((b) => b.includes("sem capacidade")));
  assert.ok(bloqueios.some((b) => b.includes("tipo de carroceria")));
});

const TAC: VeiculoMdfe = {
  ...CARRETA,
  tipo_veiculo: "Truck",
  tipo_carroceria: "Baú",
  is_veiculo_proprio: false,
  // RNTRC como a ANTT mostra: 9 dígitos com zero à esquerda.
  titular: { nome: "Fulano TAC", cpf: "123.456.789-09", cnpj: null, inscricao_estadual: null, uf: "SP", rntrc_numero: "048445388" },
};

test("veículo de terceiro (TAC) leva proprietário com IE e RNTRC de 8 dígitos", () => {
  const r = montarMdfe(base({ tracao: TAC, reboques: [] }));
  const m = r.payload.modal_rodoviario;
  assert.equal(m.cpf_proprietario_veiculo, "12345678909");
  assert.equal(m.rntrc_proprietario_veiculo, "48445388");
  assert.equal(m.inscricao_estadual_proprietario_veiculo, "ISENTO");
  assert.equal(m.tipo_proprietario_veiculo, "1");
  assert.equal(m.tipo_carroceria_veiculo, "02");
  assert.ok(!r.bloqueios.some((b) => b.includes("RNTRC")));
});

test("homologação: CIOT ausente vira aviso; pagamento sem nenhum destino bloqueia (SEFAZ exige em lotação)", () => {
  const r = montarMdfe(base({ tracao: TAC, reboques: [], motorista: { pix: null, banco_codigo: null, banco_agencia: null } }));
  assert.ok(r.avisos.some((a) => a.startsWith("Homologação: CIOT não informado")));
  assert.deepEqual(r.bloqueios.length, 1);
  assert.ok(r.regras.some((x) => x.tipo === "bloqueio" && x.origem === "sefaz" && x.mensagem.startsWith("Falta o destino de pagamento do frete")));
});

test("pagamento: CIOT da Repom sem destino do motorista deriva o CNPJ da Repom (IPEF) e avisa", () => {
  const r = montarMdfe(base({ tracao: TAC, reboques: [], motorista: { pix: null, banco_codigo: null, banco_agencia: null }, ciotVpo: { numero_averbacao: "AVB-123", ciot_origem: "rbr_repom" } }));
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.modal_rodoviario.pagamentos[0].cnpj_instituicao_pagamento, "65697260000103");
  assert.ok(r.avisos.some((a) => a.startsWith("Destino de pagamento preenchido sozinho")));
});

test("pagamento: IPEF informado (efrete/NSTech) é usado sem aviso de derivação", () => {
  const r = montarMdfe(base({ tracao: TAC, reboques: [], motorista: { pix: null, banco_codigo: null, banco_agencia: null }, ciotVpo: { numero_averbacao: "AVB-123", ciot_origem: "efrete", pagto_cnpj_ipef: "11.222.333/0001-81" } }));
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.modal_rodoviario.pagamentos[0].cnpj_instituicao_pagamento, "11222333000181");
});

test("RNTRC: status nunca consultado (NULL) só avisa; status impeditivo da ANTT bloqueia", () => {
  const b = base();
  const nulo = montarMdfe({ ...b, op: { ...b.op, veiculo_rntrc_status: null, veiculo_rntrc_ativo: false, motorista_rntrc_status: null, motorista_rntrc_ativo: false } });
  assert.ok(!nulo.bloqueios.some((x) => x.includes("RNTRC do")));
  assert.equal(nulo.regras.filter((x) => x.tipo === "aviso" && x.origem === "rbr" && x.mensagem.includes("não foi consultado")).length, 2);
  const cancelado = montarMdfe({ ...b, op: { ...b.op, veiculo_rntrc_status: "cancelado" } });
  assert.ok(cancelado.regras.some((x) => x.tipo === "bloqueio" && x.origem === "antt" && x.mensagem.startsWith("RNTRC do veículo")));
  const ok = montarMdfe({ ...b, op: { ...b.op, veiculo_rntrc_status: "ativo", motorista_rntrc_status: "Ativo" } });
  assert.ok(!ok.regras.some((x) => x.mensagem.includes("RNTRC do")));
});

test("rodado: carreta no campo de tração dá mensagem clara (troque pelo cavalo e coloque a carreta em reboques)", () => {
  const r = montarMdfe(base({ tracao: { ...CARRETA, placa: "JAG9B55" }, reboques: [] }));
  assert.ok(r.bloqueios.includes("O veículo JAG9B55 (Semirreboque) está no campo de tração; troque pelo cavalo e coloque a carreta em reboques."));
  assert.ok(!r.bloqueios.some((x) => x.startsWith("Não consegui identificar")));
});

test("apólice ausente só avisa e o MDF-e vai sem seguros_carga; responsavel_seguro fora do padrão assume emitente", () => {
  const sem = montarMdfe(base({ apolice: null, ciotVpo: null }));
  assert.ok(!sem.bloqueios.some((x) => x.includes("apólice") || x.includes("averbação")));
  assert.equal(sem.payload.seguros_carga, undefined);
  const fora = montarMdfe(base({ apolice: { seguradora_nome: "X", seguradora_cnpj: "11222333000181", numero_apolice: "1", responsavel_seguro: "segurado" } }));
  assert.ok(fora.regras.some((x) => x.tipo === "aviso" && x.origem === "rbr" && x.mensagem.includes("assumido \"emitente\"")));
  assert.equal(fora.payload.seguros_carga[0].responsavel_seguro, "1");
});

test("produção: CIOT do TAC ausente bloqueia (ANTT); pagamento sem destino bloqueia (SEFAZ exige em lotação)", () => {
  const b = base();
  const r = montarMdfe({
    ...b,
    op: { ...b.op, ambiente_fiscal: "producao" },
    tracao: TAC,
    reboques: [],
    motorista: { pix: null, banco_codigo: null, banco_agencia: null },
  });
  assert.ok(r.bloqueios.some((x) => x.startsWith("CIOT não informado")));
  assert.ok(r.regras.some((x) => x.tipo === "bloqueio" && x.origem === "antt" && x.mensagem.startsWith("CIOT não informado")));
  assert.ok(r.regras.some((x) => x.tipo === "bloqueio" && x.origem === "sefaz" && x.mensagem.startsWith("Falta o destino de pagamento")));
  assert.equal(r.payload.modal_rodoviario.pagamentos, undefined);
});

test("C5: produção, operação real com destino de pagamento vazio e CIOT ok: bloqueia por exigência da SEFAZ (não é regra da RBR)", () => {
  const b = base();
  const r = montarMdfe({
    ...b,
    op: { ...b.op, ambiente_fiscal: "producao" },
    tracao: TAC,
    reboques: [],
    motorista: { pix: null, banco_codigo: null, banco_agencia: null },
    ciotVpo: { ciot: "123456789012", numero_averbacao: "AVB-123" },
  });
  assert.equal(r.bloqueios.length, 1);
  assert.equal(r.regras.filter((x) => x.origem === "rbr").length, 0);
});

test("C5: produção sem condição de pagamento (TAC): bloqueia por exigência da SEFAZ", () => {
  const b = base();
  const r = montarMdfe({
    ...b,
    op: { ...b.op, ambiente_fiscal: "producao" },
    tracao: TAC,
    reboques: [],
    condicao: null,
    ciotVpo: { ciot: "123456789012", numero_averbacao: "AVB-123" },
  });
  assert.ok(r.regras.some((x) => x.tipo === "bloqueio" && x.origem === "sefaz" && x.mensagem.startsWith("Falta o valor do contrato de frete")));
});

for (const [nome, ajuste] of [
  ["sem NCM", (b: DadosMdfe): DadosMdfe => ({ ...b, cotacao: { ...b.cotacao, ncm: null } })],
  ["sem CEP", (b: DadosMdfe): DadosMdfe => ({ ...b, cepCarregamento: null })],
  ["sem número da averbação", (b: DadosMdfe): DadosMdfe => ({ ...b, ciotVpo: null })],
] as const) {
  test(`C5: ${nome} continua bloqueando (SEFAZ), inclusive no modo teste e em homologação`, () => {
    const b = base();
    for (const d of [
      ajuste({ ...b, op: { ...b.op, ambiente_fiscal: "producao" }, cotacao: { ...b.cotacao, teste_producao: true } }),
      ajuste({ ...b, op: { ...b.op, ambiente_fiscal: "producao" } }),
      ajuste(b),
    ]) {
      const r = montarMdfe(d);
      assert.ok(r.regras.some((x) => x.tipo === "bloqueio" && x.origem === "sefaz"), `${nome}: ${JSON.stringify(r.bloqueios)}`);
    }
  });
}

test("produção sem teste (trava devolve teste=false): CIOT e pagamento sem destino bloqueiam", () => {
  const b = base();
  const r = montarMdfe({
    ...b,
    op: { ...b.op, ambiente_fiscal: "producao" },
    tracao: TAC,
    reboques: [],
    motorista: { pix: null, banco_codigo: null, banco_agencia: null },
    cotacao: { ...b.cotacao, teste_producao: testeDaTrava({ teste: false, bloqueios: [] }) },
  });
  assert.ok(r.bloqueios.some((x) => x.startsWith("CIOT não informado")));
});

test("produção com teste vindo da trava (teste=true): CIOT vira aviso de teste", () => {
  const b = base();
  const r = montarMdfe({
    ...b,
    op: { ...b.op, ambiente_fiscal: "producao" },
    tracao: TAC,
    reboques: [],
    cotacao: { ...b.cotacao, teste_producao: testeDaTrava({ teste: true, bloqueios: [] }) },
  });
  assert.ok(!r.bloqueios.some((x) => x.startsWith("CIOT não informado")));
  assert.ok(r.avisos.some((a) => a.startsWith("Teste em produção: CIOT não informado") && a.includes("Dispensa de teste")));
});

test("testeDaTrava só aceita teste === true (erro, nulo ou texto não relaxam)", () => {
  assert.equal(testeDaTrava(null), false);
  assert.equal(testeDaTrava(undefined), false);
  assert.equal(testeDaTrava({ teste: "true" }), false);
  assert.equal(testeDaTrava({ teste: false }), false);
  assert.equal(testeDaTrava({ teste: true, bloqueios: [] }), true);
});

test("CEP de carregamento: endereço da NF-e; remetente RBR sem CEP usa o CEP da RBR; terceiro sem CEP fica vazio", () => {
  assert.equal(cepCarregamentoDe("11444777000161", RBR, { cep: "13000-000" }, "01000-000"), "13000000");
  assert.equal(cepCarregamentoDe("69.115.969/0001-04", RBR, null, "01000-000"), "01000000");
  assert.equal(cepCarregamentoDe("11444777000161", RBR, null, "01000-000"), null);
  assert.equal(cepCarregamentoDe(null, RBR, {}, "01000-000"), null);
});

test("data_emissao sai no fuso de Brasília (-03:00)", () => {
  const { payload } = montarMdfe(base());
  assert.equal(payload.data_emissao, "2026-10-07T09:00:00-03:00");
});

test("sem CT-e autorizado bloqueia", () => {
  const { bloqueios } = montarMdfe(base({ cte: { status: "erro", chave_acesso: null } }));
  assert.ok(bloqueios.some((b) => b.startsWith("O CT-e desta operação ainda não está autorizado")));
});

// Todo campo enviado precisa existir na doc de campos da Focus (MDFeXML + TransporteRodoviarioXML, baixadas em
// 2026-10-07 e salvas em campos-focus-mdfe.txt). Exceções: "data_emissao" (exigido pela referência da API,
// emitir_mdfe/OpenAPI, mas não listado na página de campos) e o próprio "modal_rodoviario" (nome do grupo, que a
// página emitir_mdfe cita).
test("todos os campos do payload existem na doc da Focus", () => {
  const doc = new Set(readFileSync(new URL("./campos-focus-mdfe.txt", import.meta.url), "utf8").split("\n").map((l) => l.trim()));
  const tac: VeiculoMdfe = {
    ...CARRETA,
    tipo_veiculo: "Truck",
    is_veiculo_proprio: false,
    titular: { nome: "Fulano", cpf: "12345678909", cnpj: null, inscricao_estadual: null, uf: "SP", rntrc_numero: "87654321" },
  };
  const { payload } = montarMdfe(
    base({
      reboques: [{ ...CARRETA, is_veiculo_proprio: false, titular: tac.titular }],
      ciotVpo: { ciot: "123456789012", vpo_idvpo: "999", vpo_valor: 50, vpo_cnpj_fornecedora: "11222333000181" },
      cotacao: { ...base().cotacao, pedagio: 50, ncm: "49111090" },
    }),
  );
  const m = payload.modal_rodoviario;
  const chaves = [
    ...Object.keys(payload),
    ...Object.keys(m),
    ...m.veiculos_reboque.flatMap((r: object) => Object.keys(r)),
    ...m.pagamentos.flatMap((p: object) => Object.keys(p)),
    ...m.dispositivos_vale_pedagio.flatMap((p: object) => Object.keys(p)),
    ...m.ciot.flatMap((p: object) => Object.keys(p)),
    ...payload.seguros_carga.flatMap((p: object) => Object.keys(p)),
  ];
  const excecoes = new Set(["data_emissao", "modal_rodoviario"]);
  assert.deepEqual([...new Set(chaves)].filter((k) => !doc.has(k) && !excecoes.has(k)), []);
});

test("Passo 4: CIOT da homologação da efrete não libera MDF-e em produção (TAC bloqueia como se não houvesse CIOT)", () => {
  const b = base();
  const comum = { ...b, op: { ...b.op, ambiente_fiscal: "producao" }, tracao: TAC, reboques: [] };
  const homolog = montarMdfe({ ...comum, ciotVpo: { ciot: "560000596706", ciot_ambiente: "homologacao", numero_averbacao: "AVB-123" } });
  assert.ok(homolog.bloqueios.some((x) => /CIOT não informado/.test(x)));
  assert.ok(homolog.avisos.some((x) => /HOMOLOGAÇÃO da efrete/.test(x)));
  assert.equal(homolog.payload.modal_rodoviario.ciot, undefined);
  const prod = montarMdfe({ ...comum, ciotVpo: { ciot: "560000596706", ciot_ambiente: "producao", numero_averbacao: "AVB-123" } });
  assert.ok(!prod.bloqueios.some((x) => /CIOT/.test(x)));
  assert.equal(prod.payload.modal_rodoviario.ciot[0].ciot, "560000596706");
});

test("B09: CIOT da efrete só vale com status emitido", () => {
  assert.equal(ciotEfreteSemValidade("efrete", "emitido"), null);
  assert.match(String(ciotEfreteSemValidade("efrete", "cancelado")), /cancelado/);
  assert.match(String(ciotEfreteSemValidade("efrete", "encerrado")), /encerrado/);
  assert.match(String(ciotEfreteSemValidade("efrete", null)), /sem status/);
  assert.equal(ciotEfreteSemValidade("rbr_repom", "pendente"), null);
  assert.equal(ciotEfreteSemValidade(null, null), null);
});

test("CIOT ausente: aviso antes de 23/11/2026, bloqueio depois (só em produção real)", () => {
  const antes = Date.UTC(2026, 10, 20), depois = Date.UTC(2026, 10, 24);
  assert.equal(ciotAusenteBloqueia(antes, false, false), false);
  assert.equal(ciotAusenteBloqueia(depois, false, false), true);
  assert.equal(ciotAusenteBloqueia(depois, true, false), false);
  assert.equal(ciotAusenteBloqueia(depois, false, true), false);
});

// --- 03/11/2026: regras publicadas na v26 (percurso, pagamento sem VPO, CIOT de 12 dígitos) ---
import { ufsPercurso } from "./mdfe.ts";
import { ciotObrigatorioNoMdfe } from "../_shared/prazos.ts";

test("ufsPercurso: UFs iguais ou limítrofes não precisam de percurso", () => {
  assert.deepEqual(ufsPercurso("SP", "SP"), []);
  assert.deepEqual(ufsPercurso("SP", "MG"), []);
  assert.deepEqual(ufsPercurso("DF", "GO"), []);
});

test("ufsPercurso: DF para SP passa por GO ou MG (caminho mais curto) e respeita o percurso informado", () => {
  const calculado = ufsPercurso("DF", "SP");
  assert.equal(calculado.length, 1);
  assert.ok(["GO", "MG"].includes(calculado[0]));
  assert.deepEqual(ufsPercurso("DF", "SP", ["MG"]), ["MG"]);
  assert.deepEqual(ufsPercurso("DF", "SP", ["GO", "MG"]), ["GO", "MG"]);
  // GO não faz divisa com SP: ["GO"] sozinho não é cadeia válida e cai no caminho calculado
  assert.deepEqual(ufsPercurso("DF", "SP", ["GO"]), ["MG"]);
  // percurso informado que não forma cadeia de UFs limítrofes é ignorado e o caminho é calculado
  const invalido = ufsPercurso("DF", "SP", ["BA", "RS"]);
  assert.ok(["GO", "MG"].includes(invalido[0]) && invalido.length === 1);
});

test("MDF-e: UFs não limítrofes levam percursos[].uf_percurso; limítrofes não levam", () => {
  const longe = montarMdfe(base({ op: { ...base().op, uf_origem: "DF", uf_destino: "SP" } }));
  assert.equal(longe.payload.percursos.length, 1);
  assert.ok(["GO", "MG"].includes(longe.payload.percursos[0].uf_percurso));
  const perto = montarMdfe(base());
  assert.deepEqual(perto.payload.percursos, []);
});

test("pagamento: parcelas + adiantamento = valor do contrato, com e sem VPO (o VPO não entra no contrato)", () => {
  const semVpo = montarMdfe(base());
  const comVpo = montarMdfe(
    base({
      cotacao: { ...base().cotacao!, pedagio: 300 },
      ciotVpo: { numero_averbacao: "AVB-123", vpo_idvpo: "123456789", vpo_valor: 300, vpo_cnpj_fornecedora: "11222333000181" },
    }),
  );
  for (const r of [semVpo, comVpo]) {
    const p = r.payload.modal_rodoviario.pagamentos[0];
    const contrato = Number(p.valor_total_contrato);
    assert.equal(contrato, 1500);
    const componentes = p.componentes.reduce((a: number, c: { valor: string | number }) => a + Number(c.valor), 0);
    assert.equal(Math.round(componentes * 100) / 100, contrato);
    assert.ok(!p.componentes.some((c: { tipo: string }) => c.tipo === "01"), "VPO não pode ser componente do contrato");
    if (p.parcelas) {
      const parcelas = p.parcelas.reduce((a: number, x: { valor: string | number }) => a + Number(x.valor), 0);
      assert.equal(Math.round((parcelas + Number(p.valor_adiantamento ?? 0)) * 100) / 100, contrato);
    }
  }
  const disp = comVpo.payload.modal_rodoviario.dispositivos_vale_pedagio;
  assert.equal(disp.length, 1);
  assert.equal(Number(disp[0].valor_vale_pedagio), 300);
});

test("CIOT: com 12 dígitos vai no MDF-e; sem ele, veículo de TAC em produção real bloqueia", () => {
  const tac = { ...CARRETA, is_veiculo_proprio: false };
  const comCiot = montarMdfe(base({ tracao: { ...CAVALO, is_veiculo_proprio: false }, reboques: [tac], ciotVpo: { ciot: "560000596706", ciot_ambiente: "producao", numero_averbacao: "AVB-123" } }));
  assert.equal(comCiot.payload.modal_rodoviario.ciot[0].ciot, "560000596706");
  const curto = montarMdfe(base({ tracao: { ...CAVALO, is_veiculo_proprio: false }, ciotVpo: { ciot: "12345", ciot_ambiente: "producao", numero_averbacao: "AVB-123" } }));
  assert.equal(curto.payload.modal_rodoviario.ciot, undefined);
});

// ---- Etapa 6b (18/11/2026): tara em tres niveis no emissor, sem reescrever o cadastro ----
test("tara absurda (25.5) do cavalo de 3 eixos: usa a aproximada 9.500 com aviso, nao bloqueia, e o cadastro fica como esta", () => {
  const cavalo = { ...CAVALO, tara_kg: 25.5, quantidade_eixos: 3 };
  const r = montarMdfe(base({ tracao: cavalo, reboques: [CARRETA] }));
  assert.equal(r.payload.modal_rodoviario.tara_veiculo, 9500);
  assert.ok(r.avisos.some((a) => /Veículo de tração: .*ignorada/.test(a) && /aproximada/.test(a)));
  assert.ok(!r.bloqueios.some((b) => /tara/.test(b)));
  assert.equal(cavalo.tara_kg, 25.5);
});
test("carreta com tara 9.8 e CRLV (PBT 25500, capacidade 16330): usa a derivada 9.170", () => {
  const car = { ...CARRETA, tara_kg: 9.8, capacidade_carga: 16330, e_reboque: true, pbt_kg: 25500 };
  const r = montarMdfe(base({ reboques: [car] }));
  assert.equal(r.payload.modal_rodoviario.veiculos_reboque[0].tara, 9170);
  assert.ok(r.avisos.some((a) => /derivada do CRLV/.test(a)));
});
test("capacidade em toneladas (25.5) vai como 25.500 kg so no payload, com aviso", () => {
  const car = { ...CARRETA, capacidade_carga: 25.5 };
  const r = montarMdfe(base({ reboques: [car] }));
  assert.equal(r.payload.modal_rodoviario.veiculos_reboque[0].capacidade_kg, 25500);
  assert.ok(r.avisos.some((a) => /toneladas/.test(a)));
  assert.equal(car.capacidade_carga, 25.5);
});
test("caminhao de chassi sem tara: so bloqueia aqui, apontando o veiculo e pedindo a tara em kg", () => {
  const truck = { ...CAVALO, tipo_veiculo: "Truck", tara_kg: null, quantidade_eixos: 3 };
  const r = montarMdfe(base({ tracao: truck, reboques: [] }));
  assert.ok(r.bloqueios.some((b) => /Veículo de tração: sem tara .*informe a tara em kg/.test(b)));
});

// ---- Etapa 13 (Parte B): MDF-e le o vale e o CIOT do cartao manual (operacao_ciot_vpo), sem efrete/NSPEDAGIO ----
test("operacao manual: vale-pedagio e CIOT vem de operacao_ciot_vpo; payload nao leva tipo_vale_pedagio (731) e leva a categoria", () => {
  const { payload, bloqueios } = montarMdfe(base({
    ciotVpo: { ciot: "520048038432", ciot_verificador: "1483", ciot_origem: "rbr_repom", ciot_ambiente: "producao", numero_averbacao: "AVB-123", vpo_idvpo: "96670000000000000001", vpo_valor: 236.27, vpo_cnpj_fornecedora: "11222333000181", vpo_tipo: "01", vpo_categoria_combinacao: "08" },
    cotacao: { ...base().cotacao, pedagio: 236.27 },
  }));
  const vale = payload.modal_rodoviario.dispositivos_vale_pedagio[0];
  assert.equal(vale.numero_comprovante_compra, "96670000000000000001");
  assert.equal(vale.valor_vale_pedagio, "236.27");
  assert.equal(vale.categoria_combinacao_veicular, "08");
  assert.equal("tipo_vale_pedagio" in vale && vale.tipo_vale_pedagio !== undefined, false);
  assert.equal(payload.modal_rodoviario.ciot[0].ciot, "520048038432");
  assert.ok(!bloqueios.some((b) => /efrete|NSPEDAGIO/i.test(b)));
});
test("grupo ciot entra no payload a partir de 23/11/2026 (12 digitos); antes dessa data o CIOT continua opcional para frota propria", () => {
  assert.equal(ciotObrigatorioNoMdfe(new Date("2026-11-22T12:00:00Z")), false);
  assert.equal(ciotObrigatorioNoMdfe(new Date("2026-11-23T12:00:00Z")), true);
});

// ---- Parte C (18/11/2026): um teste por erro do historico de 16 e 17/11 ----
const CIOT_REPOM = { ciot: "520048038432", ciot_verificador: "1483", ciot_origem: "rbr_repom", ciot_ambiente: "producao", numero_averbacao: "AVB-123", pagto_cnpj_ipef: "65697260000103" };
const prodRepom = (s: Partial<DadosMdfe> = {}) => {
  const b = base();
  return base({ op: { ...b.op, ambiente_fiscal: "producao" }, tracao: { ...CAVALO, is_veiculo_proprio: false, titular: { nome: "Fulano", cpf: "12345678909", cnpj: null, inscricao_estadual: null, uf: "SP", rntrc_numero: "87654321" } }, ciotVpo: CIOT_REPOM, ...s });
};

test("etapa 17: CIOT rbr_repom paga pela IPEF da Repom mesmo com Pix cadastrado no motorista", () => {
  const r = montarMdfe(prodRepom({ motorista: { pix: "chave-pix-do-motorista", banco_codigo: null, banco_agencia: null } }));
  const pag = r.payload.modal_rodoviario.pagamentos[0];
  assert.equal(pag.cnpj_instituicao_pagamento, "65697260000103");
  assert.equal(pag.pix, undefined);
  assert.ok(!r.avisos.some((a) => /Destino de pagamento do motorista nao definido|Destino de pagamento do motorista não definido/.test(a)));
});
test("etapa 17: outras origens de CIOT mantem pix > banco > IPEF", () => {
  const r = montarMdfe(prodRepom({ ciotVpo: { ...CIOT_REPOM, ciot_origem: "parceiro", pagto_cnpj_ipef: "65697260000103" }, motorista: { pix: "chave", banco_codigo: null, banco_agencia: null } }));
  assert.equal(r.payload.modal_rodoviario.pagamentos[0].pix, "chave");
});
test("etapa 18: CEP de descarregamento e o do destinatario da NF-e, nao o do tomador (OP-3ec3: 35180018; OP-0360: 65285000)", () => {
  assert.equal(cepDescarregamentoDe("11222333000181", { cep: "35180-018" }, "99888777000166", "13295274"), "35180018");
  assert.equal(cepDescarregamentoDe("11222333000181", { cep: "65285000" }, "99888777000166", "13295274"), "65285000");
  assert.equal(cepDescarregamentoDe("99888777000166", {}, "99888777000166", "13295-274"), "13295274"); // destinatario = o proprio cliente
  assert.equal(cepDescarregamentoDe("11222333000181", {}, "99888777000166", "13295274"), null); // nao cai no CEP do tomador
});
test("etapa 19: nao envia tipo_vale_pedagio; categoria pelos eixos (cavalo 3 + carreta 3 = 08)", () => {
  const t3 = { ...prodRepom().tracao!, quantidade_eixos: 3 };
  const r = montarMdfe(prodRepom({ tracao: t3, ciotVpo: { ...CIOT_REPOM, vpo_idvpo: "96670000000000000001", vpo_valor: 236.27, vpo_cnpj_fornecedora: "11222333000181", vpo_tipo: "01" }, cotacao: { ...base().cotacao, pedagio: 236.27 } }));
  const vale = r.payload.modal_rodoviario.dispositivos_vale_pedagio[0];
  assert.equal(vale.tipo_vale_pedagio, undefined); assert.equal(vale.categoria_combinacao_veicular, "08");
});
test("etapa 20 (OP-0360): CIOT de 16 digitos gravado vira 12 no payload com aviso, e o grupo de pagamento sai sem tipo_vale_pedagio", () => {
  const r = montarMdfe(prodRepom({ ciotVpo: { ...CIOT_REPOM, ciot: "5200480384321483", ciot_verificador: null } }));
  assert.equal(r.payload.modal_rodoviario.ciot[0].ciot, "520048038432");
  assert.ok(r.avisos.some((a) => /16 digitos/.test(a)));
  assert.ok(r.payload.modal_rodoviario.pagamentos.length === 1);
});
test("etapa 20: CIOT com tamanho errado bloqueia (nunca some em silencio); contrato Repom sem CIOT bloqueia; refazer avisa; homologacao bloqueia", () => {
  assert.ok(montarMdfe(prodRepom({ ciotVpo: { ...CIOT_REPOM, ciot: "12345" } })).bloqueios.some((b) => /CIOT com 5 digitos/.test(b)));
  assert.ok(montarMdfe(prodRepom({ ciotVpo: { ...CIOT_REPOM, ciot: null } })).bloqueios.some((b) => /CIOT/.test(b)));
  assert.ok(montarMdfe(prodRepom({ ciotVpo: { ...CIOT_REPOM, ciot_status: "refazer_troca_veiculo" } })).avisos.some((a) => /refazer/.test(a)));
});
test("etapa 21: carreta cadastrada como e_reboque=false e cavalo sem carreta: cavalo sem reboque bloqueia com instrucao de vincular", () => {
  const r = montarMdfe(prodRepom({ reboques: [] }));
  assert.ok(r.bloqueios.some((b) => /Vincule a carreta/.test(b)));
});
test("etapa 22: aviso (nao bloqueio) quando tara do conjunto + carga passa do CMT do CRLV do cavalo", () => {
  const b = base();
  const r = montarMdfe(base({ tracao: { ...CAVALO, cmt_kg: 20000 }, cotacao: { ...b.cotacao, peso_bruto_kg: 30000 } }));
  assert.ok(r.avisos.some((a) => /passa do CMT/.test(a))); assert.ok(!r.bloqueios.some((x) => /CMT/.test(x)));
});
