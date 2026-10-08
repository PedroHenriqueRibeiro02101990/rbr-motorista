// Testes das regras do MDF-e (mdfe.ts). Rodar na raiz do repositório:
//   node --test supabase-functions/emitir-mdfe/mdfe.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type DadosMdfe, montarMdfe, type VeiculoMdfe } from "./mdfe.ts";

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
    cotacao: { peso_bruto_kg: 1000, tipo_carga: "Carga geral", produto: "Mercadoria teste", ncm: null, pedagio: 0 },
    apolice: { seguradora_nome: "Seguradora X", seguradora_cnpj: "11222333000181", numero_apolice: "123", responsavel_seguro: "emitente" },
    motorista: { pix: "chave-pix", banco_codigo: null, banco_agencia: null },
    cliente: { cnpj: "11444777000161", cpf: null, razao_social: "CLIENTE TESTE" },
    ciotVpo: null,
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
  assert.deepEqual(payload.conhecimentos_transporte, [{ chave_cte: CHAVE_CTE }]);
  assert.equal(m.pagamentos[0].forma_pagamento, "1");
});

test("cavalo sem carreta vinculada bloqueia", () => {
  const { bloqueios } = montarMdfe(base({ reboques: [] }));
  assert.ok(bloqueios.some((b) => b.startsWith("Cavalo mecânico sem reboque")));
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

test("homologação: CIOT ausente e pagamento sem destino viram aviso, e pagamentos é omitido", () => {
  const r = montarMdfe(base({ tracao: TAC, reboques: [], motorista: { pix: null, banco_codigo: null, banco_agencia: null } }));
  assert.deepEqual(r.bloqueios, []);
  assert.ok(r.avisos.some((a) => a.startsWith("Homologação: CIOT não informado")));
  assert.ok(r.avisos.some((a) => a.startsWith("Homologação: Pagamento do frete sem destino")));
  assert.equal(r.payload.modal_rodoviario.pagamentos, undefined);
});

test("produção: CIOT ausente e pagamento sem destino continuam bloqueando", () => {
  const b = base();
  const r = montarMdfe({
    ...b,
    op: { ...b.op, ambiente_fiscal: "producao" },
    tracao: TAC,
    reboques: [],
    motorista: { pix: null, banco_codigo: null, banco_agencia: null },
  });
  assert.ok(r.bloqueios.some((x) => x.startsWith("CIOT não informado")));
  assert.ok(r.bloqueios.some((x) => x.startsWith("Pagamento do frete sem destino")));
  assert.equal(r.payload.modal_rodoviario.pagamentos.length, 1);
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
