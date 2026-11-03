// node --test supabase/functions/eventos-fiscais/condutor.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mdfeAceitaCondutor, validarCondutor } from "./condutor.ts";

test("incluir condutor: nome e CPF de 11 dígitos são obrigatórios; o CPF é limpo", () => {
  assert.deepEqual(validarCondutor(" Fulano de Tal ", "123.456.789-09"), { ok: true, nome: "Fulano de Tal", cpf: "12345678909" });
  assert.equal(validarCondutor("", "12345678909").ok, false);
  assert.equal(validarCondutor("Fulano", "123").ok, false);
  assert.equal(validarCondutor(undefined, undefined).ok, false);
});

test("incluir condutor: só em MDF-e autorizado, com referência e ainda não encerrado", () => {
  assert.equal(mdfeAceitaCondutor({ referencia: "rbr-mdfe-1", status: "emitido", encerrado_em: null }), true);
  assert.equal(mdfeAceitaCondutor({ referencia: "rbr-mdfe-1", status: "emitido", encerrado_em: "2026-11-03T10:00:00Z" }), false);
  assert.equal(mdfeAceitaCondutor({ referencia: "rbr-mdfe-1", status: "pendente", encerrado_em: null }), false);
  assert.equal(mdfeAceitaCondutor({ referencia: null, status: "emitido", encerrado_em: null }), false);
  assert.equal(mdfeAceitaCondutor(null), false);
});
