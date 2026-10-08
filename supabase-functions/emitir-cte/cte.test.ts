// Testes das regras do CT-e (cte.ts). Rodar na raiz do repositório:
//   node --test supabase-functions/emitir-cte/cte.test.ts
// (Node 22+ executa TypeScript direto; não precisa instalar nada.)
//
// O caso "operação de teste" usa os mesmos dados da operação de homologação 72dc89d2 (São Paulo -> Campinas),
// para comparar com o que a SEFAZ responder quando a IE da RBR for liberada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chaveNfeValida, type ClienteCte, cnpjValido, montarCte, NOME_HOMOLOGACAO, type DadosCte } from "./cte.ts";

const CHAVE_TESTE = "35260969115969000104550010000000011123456789"; // DV correto, NF-e inventada
const RBR = "69115969000104";
const CLIENTE = "11444777000161";

function base(sobrescrever: Partial<DadosCte> & { op?: Record<string, unknown> } = {}): DadosCte {
  const { op, ...resto } = sobrescrever;
  return {
    op: {
      operacao_id: "72dc89d2-8a6d-4ee9-b829-517fedb9c8b2",
      ambiente_fiscal: "homologacao",
      ie_configurada: true,
      emitente_cnpj: RBR,
      emitente_ie: "162095813113",
      emitente_razao_social: "RBR CARGO LTDA",
      veiculo_id: "v1",
      veiculo_rntrc_ativo: true,
      motorista_id: "m1",
      motorista_rntrc_ativo: true,
      cotacao_id: "c1",
      cidade_origem: "SAO PAULO",
      uf_origem: "SP",
      cidade_destino: "CAMPINAS",
      uf_destino: "SP",
      nf_remetente_cnpj: RBR,
      nf_remetente_razao_social: "RBR CARGO LTDA",
      nf_destinatario_cnpj: CLIENTE,
      nf_destinatario_razao_social: "CLIENTE TESTE HOMOLOGACAO LTDA",
      nf_chave_acesso: CHAVE_TESTE,
      valor_total_cotacao: 2399.56,
      valor_nf: 5000,
      destinatario_logradouro: "Rua do Cliente",
      destinatario_numero: "10",
      destinatario_bairro: "Centro",
      destinatario_cep: "13010000",
      destinatario_cidade: "Campinas",
      destinatario_uf: "SP",
      destinatario_telefone: "11999999999",
      ...op,
    },
    pf: {
      endereco_logradouro: "Rua da RBR",
      endereco_numero: "100",
      endereco_bairro: "Bairro",
      endereco_cep: "01000000",
      endereco_codigo_municipio: "3550308",
      endereco_uf: "SP",
      responsavel_tecnico_cnpj: RBR,
      responsavel_tecnico_email: "fiscal@rbr.com.br",
      responsavel_tecnico_contato: "Fulano",
      responsavel_tecnico_telefone: "(11) 3333-4444",
      rntrc: "012345678",
      telefone_contato: "1133334444",
    },
    cotacao: {
      peso_bruto_kg: 1000,
      nf_remetente_endereco: null,
      nf_remetente_ie: null,
      nf_destinatario_endereco: null,
      nf_destinatario_ie: null,
      tomador_papel: null,
    },
    cliente: null,
    ibge: { inicio: "3550308", fim: "3509502" },
    municipioEmitente: "São Paulo",
    agora: new Date("2026-10-07T12:00:00Z"),
    ...resto,
  };
}

test("validadores: chave da NF-e e CNPJ", () => {
  assert.equal(chaveNfeValida(CHAVE_TESTE), true);
  assert.equal(chaveNfeValida(CHAVE_TESTE.slice(0, 43) + "0"), false); // DV errado
  assert.equal(chaveNfeValida(CHAVE_TESTE.slice(0, 20) + "57" + CHAVE_TESTE.slice(22)), false); // modelo 57
  assert.equal(cnpjValido(RBR), true);
  assert.equal(cnpjValido(CLIENTE), true);
  assert.equal(cnpjValido("11444777000162"), false);
  assert.equal(cnpjValido("00000000000000"), false);
});

test("operação de teste em homologação: sem bloqueios e com os nomes exigidos pela SEFAZ", () => {
  const r = montarCte(base());
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.ambiente, "homologacao");
  assert.equal(r.payload.nome_remetente, NOME_HOMOLOGACAO);
  assert.equal(r.payload.nome_destinatario, NOME_HOMOLOGACAO);
  assert.equal(r.payload.nome_emitente, "RBR CARGO LTDA"); // o emitente continua com o nome real
  assert.equal(r.payload.codigo_municipio_inicio, "3550308");
  assert.equal(r.payload.codigo_municipio_fim, "3509502");
  assert.equal(r.payload.municipio_envio, "São Paulo");
  assert.equal(r.payload.cfop, "5353");
  assert.equal(r.payload.tomador, "0");
  assert.equal(r.payload.indicador_inscricao_estadual_tomador, "1");
  assert.equal(r.payload.inscricao_estadual_remetente, "162095813113");
  assert.equal(r.payload.modal_rodoviario.rntrc, "12345678");
  assert.deepEqual(r.payload.nfes, [{ chave_nfe: CHAVE_TESTE }]);
  assert.equal(r.payload.quantidades[0].quantidade, 1000);
  assert.equal(r.payload.municipio_emitente, "São Paulo");
  assert.equal(r.payload.telefone_remetente, "1133334444");
  assert.equal(r.payload.telefone_destinatario, "11999999999");
  assert.equal(r.payload.cnpj_responsavel_tecnico, RBR);
  assert.equal(r.payload.telefone_responsavel_tecnico, "1133334444");
  assert.equal(r.payload.responsavel_tecnico, undefined);
  assert.equal(r.payload.icms_origem, undefined);
  assert.ok(r.avisos.some((a) => a.includes("646/649")));
  assert.ok(r.avisos.some((a) => a.includes("661") && a.includes("HOMOLOGAÇÃO")));
});

test("produção usa o mesmo caminho, só com os nomes reais", () => {
  const homolog = montarCte(base()).payload;
  const prod = montarCte(base({ op: { ambiente_fiscal: "producao" } }));
  assert.deepEqual(prod.bloqueios, []);
  assert.equal(prod.payload.nome_remetente, "RBR CARGO LTDA");
  assert.equal(prod.payload.nome_destinatario, "CLIENTE TESTE HOMOLOGACAO LTDA");
  assert.ok(!prod.avisos.some((a) => a.includes("646/649")));
  // Fora os dois nomes, o payload é idêntico ao de homologação.
  const semNomes = (p: Record<string, unknown>) => ({ ...p, nome_remetente: null, nome_destinatario: null });
  assert.deepEqual(semNomes(prod.payload), semNomes(homolog));
});

test("remetente terceiro: usa endereço e IE da aba NF-e da cotação", () => {
  const remetente = "11222333000181";
  const r = montarCte(
    base({
      op: { nf_remetente_cnpj: remetente, nf_remetente_razao_social: "INDUSTRIA X", nf_chave_acesso: CHAVE_TESTE },
      cotacao: {
        peso_bruto_kg: 900,
        nf_remetente_endereco: {
          logradouro: "RUA DAS INDUSTRIAS",
          numero: "1500",
          bairro: "DISTRITO INDUSTRIAL",
          cep: "04567-000",
          municipio: "SAO PAULO",
          uf: "SP",
          codigo_ibge: "3550308",
          telefone: "1155556666",
        },
        nf_remetente_ie: "123456789012",
        nf_destinatario_endereco: null,
        nf_destinatario_ie: null,
        tomador_papel: "remetente",
      },
    }),
  );
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.logradouro_remetente, "RUA DAS INDUSTRIAS");
  assert.equal(r.payload.cep_remetente, "04567000");
  assert.equal(r.payload.inscricao_estadual_remetente, "123456789012");
  assert.equal(r.payload.telefone_remetente, "1155556666");
  assert.equal(r.payload.codigo_municipio_remetente, "3550308");
  // A chave de teste é de uma NF-e "emitida" pela RBR, não por esse remetente: avisa para conferir.
  assert.ok(r.avisos.some((a) => a.includes("CNPJ dentro da chave")));
});

test("remetente terceiro sem endereço nem telefone bloqueia", () => {
  const r = montarCte(base({ op: { nf_remetente_cnpj: "11222333000181" } }));
  assert.ok(r.bloqueios.some((b) => b.startsWith("Endereço do remetente incompleto")));
  assert.ok(r.bloqueios.some((b) => b.startsWith("Telefone do remetente")));
});

test("origem fora de São Paulo funciona quando o IBGE é encontrado", () => {
  const r = montarCte(
    base({ op: { cidade_origem: "Itupeva", uf_origem: "SP" }, ibge: { inicio: "3524006", fim: "3509502" } }),
  );
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.codigo_municipio_inicio, "3524006");
  assert.equal(r.payload.municipio_envio, "São Paulo"); // envio continua sendo a sede da RBR
});

test("cidade não encontrada no IBGE bloqueia", () => {
  const r = montarCte(base({ ibge: { inicio: null, fim: "3509502" } }));
  assert.ok(r.bloqueios.some((b) => b.includes("cMunIni")));
});

test("chave da NF-e e CNPJ inválidos bloqueiam antes de chegar na SEFAZ", () => {
  const r = montarCte(base({ op: { nf_chave_acesso: CHAVE_TESTE.slice(0, 43) + "0", nf_destinatario_cnpj: "11444777000162" } }));
  assert.ok(r.bloqueios.some((b) => b.startsWith("Chave de acesso da NF-e inválida")));
  assert.ok(r.bloqueios.some((b) => b.startsWith("CNPJ do destinatário inválido")));
});

const CLIENTE_CADASTRO: ClienteCte = {
  cnpj: "11444777000161",
  cpf: null,
  razao_social: "CLIENTE TESTE HOMOLOGACAO LTDA",
  nome_fantasia: "TESTE",
  inscricao_estadual: "111222333444",
  celular_whatsapp: "+55 (11) 98888-7777",
  email: "cliente@teste.com",
  logradouro: "Rua do Cliente",
  numero_endereco: "10",
  complemento: null,
  bairro: "Centro",
  cidade: "Campinas",
  uf: "SP",
  cep: "13010-000",
};

test("tomador: destinatário vira 3", () => {
  const dest = montarCte(
    base({ cotacao: { ...base().cotacao!, tomador_papel: "destinatario", nf_destinatario_ie: "987654321000" } }),
  );
  assert.deepEqual(dest.bloqueios, []);
  assert.equal(dest.payload.tomador, "3");
  assert.equal(dest.payload.indicador_inscricao_estadual_tomador, "1");
  assert.equal(dest.payload.cnpj_tomador, undefined);
});

test("tomador terceiro (cliente da cotação) vira 4 com os dados do cadastro", () => {
  const dados = base({ cotacao: { ...base().cotacao!, tomador_papel: "terceiro" }, cliente: CLIENTE_CADASTRO });
  const r = montarCte(dados);
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.tomador, "4");
  assert.equal(r.payload.cnpj_tomador, "11444777000161");
  assert.equal(r.payload.inscricao_estadual_tomador, "111222333444");
  assert.equal(r.payload.indicador_inscricao_estadual_tomador, "1");
  assert.equal(r.payload.telefone_tomador, "5511988887777");
  assert.equal(r.payload.cep_tomador, "13010000");
  assert.equal(r.payload.nome_tomador, NOME_HOMOLOGACAO); // homologação
  const prod = montarCte({ ...dados, op: { ...dados.op, ambiente_fiscal: "producao" } });
  assert.equal(prod.payload.nome_tomador, "CLIENTE TESTE HOMOLOGACAO LTDA");
});

test("tomador terceiro com cadastro incompleto bloqueia", () => {
  const r = montarCte(
    base({ cotacao: { ...base().cotacao!, tomador_papel: "terceiro" }, cliente: { ...CLIENTE_CADASTRO, celular_whatsapp: null } }),
  );
  assert.ok(r.bloqueios.some((b) => b.startsWith("Tomador é o cliente da cotação")));
});

test("destinatário: endereço e telefone da NF-e têm prioridade", () => {
  const r = montarCte(
    base({
      op: { destinatario_telefone: null },
      cotacao: {
        ...base().cotacao!,
        nf_destinatario_endereco: {
          logradouro: "AVENIDA CENTRAL",
          numero: "200",
          bairro: "CENTRO",
          cep: "13010000",
          municipio: "CAMPINAS",
          uf: "SP",
          codigo_ibge: "3509502",
          telefone: "1932221111",
        },
      },
    }),
  );
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.logradouro_destinatario, "AVENIDA CENTRAL");
  assert.equal(r.payload.telefone_destinatario, "1932221111");
  assert.equal(r.payload.codigo_municipio_destinatario, "3509502");
});

test("destinatário sem telefone não bloqueia, só avisa (CT-e real autorizado em SP saiu sem)", () => {
  const r = montarCte(base({ op: { destinatario_telefone: null } }));
  assert.deepEqual(r.bloqueios, []);
  assert.equal(r.payload.telefone_destinatario, undefined);
  assert.ok(r.avisos.some((a) => a.startsWith("Destinatário sem telefone")));
});

test("componentes do valor: frete inteiro", () => {
  assert.deepEqual(montarCte(base()).payload.componentes_valor, [{ nome: "Frete", valor: 2399.56 }]);
});

// Todo campo enviado precisa existir na doc de campos da Focus (ConhecimentoTransporteXML, baixada em
// 2026-10-07 e salva em campos-focus-cte.txt). modal_rodoviario é descrito em outra página
// (TransporteRodoviarioXML, tag <rodo>): só rntrc é obrigatório, String[8] — conferido no teste abaixo.
test("todos os campos do payload existem na doc da Focus", () => {
  const doc = new Set(
    readFileSync(new URL("./campos-focus-cte.txt", import.meta.url), "utf8").split("\n").map((l) => l.trim()),
  );
  const pendentes = new Set(["modal_rodoviario"]);
  const completo = montarCte(
    base({ cotacao: { ...base().cotacao!, tomador_papel: "terceiro" }, cliente: CLIENTE_CADASTRO }),
  ).payload;
  const fora = Object.keys(completo).filter((k) => !doc.has(k) && !pendentes.has(k));
  assert.deepEqual(fora, []);
  assert.deepEqual(Object.keys(completo.modal_rodoviario), ["rntrc"]);
  assert.match(completo.modal_rodoviario.rntrc, /^\d{8}$/);
});

test("frete na mesma cidade continua indo para NFS-e", () => {
  const r = montarCte(base({ op: { cidade_destino: "São Paulo" } }));
  assert.equal(r.intramunicipal, true);
  assert.ok(r.bloqueios.some((b) => b.startsWith("Frete intramunicipal")));
});
