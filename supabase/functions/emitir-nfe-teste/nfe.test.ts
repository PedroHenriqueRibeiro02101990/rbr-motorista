// Testes da NF-e de teste (nfe.ts). Rodar na raiz do repositório:
//   node --test supabase-functions/emitir-nfe-teste/nfe.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chaveDaResposta, type DadosNfeTeste, montarNfeTeste, NCM_PADRAO, NOME_DEST_HOMOLOGACAO } from "./nfe.ts";

const RBR = "69115969000104";

function base(sobrescrever: Partial<DadosNfeTeste> = {}): DadosNfeTeste {
  return {
    ambiente: "homologacao",
    emitente: {
      cnpj: RBR,
      ie: "162095813113",
      razao_social: "RBR CARGO LTDA",
      logradouro: "Rua da RBR",
      numero: "100",
      bairro: "Bairro",
      municipio: "São Paulo",
      uf: "SP",
      cep: "01000-000",
    },
    cotacao: {
      nf_remetente_cnpj: RBR,
      nf_destinatario_cnpj: "11444777000161",
      valor_nf: 5000,
      peso_bruto_kg: 1000,
      produto: null,
      ncm: null,
    },
    destinatario: {
      logradouro: "Rua do Cliente",
      numero: "10",
      bairro: "Centro",
      municipio: "Campinas",
      uf: "SP",
      cep: "13010-000",
      telefone: "(11) 99999-9999",
    },
    agora: new Date("2026-10-07T12:00:00Z"),
    ...sobrescrever,
  };
}

test("operação de teste: NF-e de remessa da RBR, Simples Nacional, nome de homologação", () => {
  const { bloqueios, payload } = montarNfeTeste(base());
  assert.deepEqual(bloqueios, []);
  assert.equal(payload.cnpj_emitente, RBR);
  assert.equal(payload.regime_tributario_emitente, 1);
  assert.equal(payload.nome_destinatario, NOME_DEST_HOMOLOGACAO);
  assert.equal(payload.indicador_inscricao_estadual_destinatario, 9);
  assert.equal(payload.consumidor_final, 1);
  assert.equal(payload.local_destino, 1);
  assert.equal(payload.items[0].cfop, "5949");
  assert.equal(payload.items[0].icms_situacao_tributaria, "400");
  assert.equal(payload.items[0].codigo_ncm, NCM_PADRAO);
  assert.equal(payload.valor_total, 5000);
  assert.equal(payload.volumes[0].peso_bruto, 1000);
  assert.equal(payload.cep_destinatario, "13010000");
  assert.equal(payload.telefone_destinatario, "11999999999");
});

test("destino em outro estado usa CFOP 6949 e local_destino 2", () => {
  const { payload } = montarNfeTeste(base({ destinatario: { ...base().destinatario, uf: "MG" } }));
  assert.equal(payload.local_destino, 2);
  assert.equal(payload.items[0].cfop, "6949");
});

test("bloqueia fora de homologação e quando o remetente não é a RBR", () => {
  assert.ok(montarNfeTeste(base({ ambiente: "producao" })).bloqueios.some((b) => b.includes("homologação")));
  const outro = montarNfeTeste(base({ cotacao: { ...base().cotacao, nf_remetente_cnpj: "11222333000181" } }));
  assert.ok(outro.bloqueios.some((b) => b.includes("remetente da cotação não é a RBR")));
});

test("bloqueia sem valor ou peso", () => {
  const r = montarNfeTeste(base({ cotacao: { ...base().cotacao, valor_nf: null, peso_bruto_kg: 0 } }));
  assert.ok(r.bloqueios.some((b) => b.includes("valor da NF")));
  assert.ok(r.bloqueios.some((b) => b.includes("peso bruto")));
});

test("chave da resposta da Focus vira 44 dígitos", () => {
  assert.equal(chaveDaResposta({ chave_nfe: "NFe35261069115969000104550010000000011234567890" }), "35261069115969000104550010000000011234567890");
  assert.equal(chaveDaResposta({ chave_nfe: "NFe123" }), null);
  assert.equal(chaveDaResposta(null), null);
});

// Todo campo enviado (inclusive dos itens e volumes) precisa existir na doc de campos da NF-e da Focus
// (NotaFiscalXML, baixada em 2026-10-07 e salva em campos-focus-nfe.txt). Exceção: a lista de produtos se chama
// "itens" nessa página, mas a referência da API (emitir_nfe, OpenAPI) exige "items" — vale a da API.
test("todos os campos do payload existem na doc da Focus", () => {
  const doc = new Set(
    readFileSync(new URL("./campos-focus-nfe.txt", import.meta.url), "utf8").split("\n").map((l) => l.trim()),
  );
  const { payload } = montarNfeTeste(base());
  const chaves = [
    ...Object.keys(payload),
    ...Object.keys(payload.items[0]),
    ...Object.keys(payload.volumes[0]),
  ];
  assert.deepEqual(chaves.filter((k) => !doc.has(k) && k !== "items"), []);
});
