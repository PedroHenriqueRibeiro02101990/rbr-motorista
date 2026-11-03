// node --test supabase/functions/emitir-mdfe/condutorTitular.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mensagemCondutorAusente, opComCondutor, resolverCondutorTitular } from "./condutorTitular.ts";

test("sem condutor e sem titular: tudo igual ao motorista (nada muda)", () => {
  const r = resolverCondutorTitular({ motoristaId: "m1", condutorId: null, titularId: null });
  assert.deepEqual(r, { condutorId: "m1", recebedorId: "m1", condutorDiferente: false, titularDiferente: false });
});

test("condutor igual ao motorista: nada muda mesmo informado", () => {
  const r = resolverCondutorTitular({ motoristaId: "m1", condutorId: "m1", titularId: null });
  assert.equal(r.condutorDiferente, false);
  assert.equal(r.recebedorId, "m1");
});

test("condutor diferente: o MDF-e usa o condutor e o pagamento continua no motorista/titular", () => {
  const r = resolverCondutorTitular({ motoristaId: "m1", condutorId: "c1", titularId: null });
  assert.equal(r.condutorId, "c1");
  assert.equal(r.condutorDiferente, true);
  assert.equal(r.recebedorId, "m1");
});

test("titular informado: o pagamento vai para o titular; o condutor segue o motorista", () => {
  const r = resolverCondutorTitular({ motoristaId: "m1", condutorId: null, titularId: "t1" });
  assert.equal(r.condutorId, "m1");
  assert.equal(r.recebedorId, "t1");
  assert.equal(r.titularDiferente, true);
});

test("condutor e titular diferentes entre si e do motorista", () => {
  const r = resolverCondutorTitular({ motoristaId: "m1", condutorId: "c1", titularId: "t1" });
  assert.deepEqual(r, { condutorId: "c1", recebedorId: "t1", condutorDiferente: true, titularDiferente: true });
});

test("sem motorista e sem condutor: fica vazio (o MDF-e já bloqueia por falta de motorista)", () => {
  const r = resolverCondutorTitular({ motoristaId: null, condutorId: null, titularId: null });
  assert.equal(r.condutorId, null);
  assert.equal(r.condutorDiferente, false);
});

test("opComCondutor troca só id, nome e CPF", () => {
  const op = { motorista_id: "m1", motorista_nome: "A", motorista_cpf: "1", motorista_rntrc_ativo: true, valor_nf: 10 };
  const novo = opComCondutor(op, { id: "c1", nome: "B", cpf: "22222222222" });
  assert.deepEqual(novo, { motorista_id: "c1", motorista_nome: "B", motorista_cpf: "22222222222", motorista_rntrc_ativo: true, valor_nf: 10 });
  assert.equal(op.motorista_id, "m1");
});

test("condutor não encontrado: mensagem clara; sem condutor informado não há mensagem", () => {
  assert.match(mensagemCondutorAusente("c1") ?? "", /Condutor informado/);
  assert.equal(mensagemCondutorAusente(null), null);
});
