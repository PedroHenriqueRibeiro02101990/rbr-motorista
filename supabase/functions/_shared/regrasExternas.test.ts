// node --test supabase/functions/_shared/regrasExternas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CNPJ_IPEF_REPOM, condicaoDoContratoCiot, ehTipoReboque, ipefDerivado, normalizarTipoVeiculo, resolverTracaoReboques,
  separarCiotDigitado, situacaoRntrc, sugerirTara, traduzirRejeicaoMdfe,
} from "./regrasExternas.ts";

test("situacaoRntrc: só status explicitamente impeditivo bloqueia", () => {
  assert.equal(situacaoRntrc(null), "nao_consultado");
  assert.equal(situacaoRntrc("  "), "nao_consultado");
  assert.equal(situacaoRntrc("Ativo"), "ativo");
  for (const t of ["inativo", "Cancelado", "SUSPENSO"]) assert.equal(situacaoRntrc(t), "impeditivo");
  assert.equal(situacaoRntrc("pendente"), "desconhecido");
});

test("resolverTracaoReboques: carreta em veiculo_id + cavalo_veiculo_id => cavalo vira tração", () => {
  const carreta = { id: "c", placa: "JAG9B55", tipo_veiculo: "Semirreboque" };
  const cavalo = { id: "v", placa: "AHP3H35", tipo_veiculo: "Cavalo mecânico" };
  const r = resolverTracaoReboques(carreta, cavalo, []);
  assert.equal(r.tracao?.placa, "AHP3H35");
  assert.deepEqual(r.reboques.map((x) => x.placa), ["JAG9B55"]);
  assert.equal(r.corrigido, true);
  // já em operacao_reboques: não duplica
  assert.equal(resolverTracaoReboques(carreta, cavalo, [carreta]).reboques.length, 1);
  // tração correta: nada muda
  const ok = resolverTracaoReboques(cavalo, null, [carreta]);
  assert.equal(ok.corrigido, false);
  assert.equal(ok.erro, null);
  // carreta sem cavalo: mensagem clara
  assert.match(resolverTracaoReboques(carreta, null, []).erro ?? "", /JAG9B55 \(Semirreboque\) está no campo de tração/);
});

test("ehTipoReboque", () => {
  assert.ok(ehTipoReboque("Semirreboque"));
  assert.ok(ehTipoReboque("CARGA SEMI-REBOQUE"));
  assert.ok(!ehTipoReboque("Cavalo mecânico"));
  assert.ok(!ehTipoReboque("CARGA/CAMINHÃO TRATOR"));
});

test("CRLV: normaliza tipo e sugere tara = PBT - capacidade", () => {
  assert.equal(normalizarTipoVeiculo("CARGA SEMI-REBOQUE"), "Semirreboque");
  assert.equal(normalizarTipoVeiculo("CARGA/CAMINHÃO TRATOR"), "Cavalo mecânico");
  assert.equal(normalizarTipoVeiculo("xyz"), null);
  assert.equal(sugerirTara(45000, 30000), 15000);
  assert.equal(sugerirTara(null, 30000), null);
  assert.equal(sugerirTara(20000, 30000), null);
});

test("CIOT digitado: 12 ou 16 dígitos (com ou sem máscara) separam sozinhos", () => {
  assert.deepEqual(separarCiotDigitado("123456789012"), { ciot: "123456789012", verificador: null });
  assert.deepEqual(separarCiotDigitado("1234567890123456"), { ciot: "123456789012", verificador: "3456" });
  assert.deepEqual(separarCiotDigitado("123456789012/3456"), { ciot: "123456789012", verificador: "3456" });
  assert.equal(separarCiotDigitado("12345"), null);
});

test("ipefDerivado: informado vale; Repom deriva o CNPJ da Repom; outros sem nada", () => {
  assert.deepEqual(ipefDerivado("efrete", "11.222.333/0001-81"), { cnpj: "11222333000181", origem: "informado" });
  assert.deepEqual(ipefDerivado("rbr_repom", null), { cnpj: CNPJ_IPEF_REPOM, origem: "repom" });
  assert.equal(ipefDerivado("efrete", null), null);
});

test("condicaoDoContratoCiot: contrato do CIOT manda e avisa da divergência", () => {
  const atual = { valor_total_contrato: 6700, valor_adiantamento: 3000, saldo_prazo_dias: 5 };
  const r = condicaoDoContratoCiot(atual, { valor_frete: 7006.2, valor_adiantamento: 3500 });
  assert.equal(r.condicao?.valor_total_contrato, 7006.2);
  assert.equal(r.condicao?.valor_adiantamento, 3500);
  assert.equal(r.condicao?.saldo_prazo_dias, 5);
  assert.match(r.divergencia ?? "", /6700\.00.*7006\.20/);
  assert.deepEqual(condicaoDoContratoCiot(atual, null), { condicao: atual, divergencia: null });
  assert.equal(condicaoDoContratoCiot(null, { valor_frete: 100 }).divergencia, null);
});

test("traduzirRejeicaoMdfe: pagamento em lotação aponta o campo", () => {
  const r = traduzirRejeicaoMdfe("Rejeição: As informações de pagamento devem ser informadas para carga lotação");
  assert.equal(r?.aba, "pagamento");
  assert.equal(traduzirRejeicaoMdfe("algo desconhecido"), null);
});
