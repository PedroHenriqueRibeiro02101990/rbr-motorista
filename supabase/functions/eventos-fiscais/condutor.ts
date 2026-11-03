// Regras do evento "incluir condutor no MDF-e" (sem I/O, para testar). O index.ts usa estas funções; a regra é a mesma de antes.
export function validarCondutor(nomeBruto: unknown, cpfBruto: unknown): { ok: true; nome: string; cpf: string } | { ok: false; erro: string } {
  const nome = String(nomeBruto ?? "").trim();
  const cpf = String(cpfBruto ?? "").replace(/\D/g, "");
  if (nome.length < 2 || cpf.length !== 11) return { ok: false, erro: "Informe o nome e o CPF (11 dígitos) do condutor." };
  return { ok: true, nome, cpf };
}

export function mdfeAceitaCondutor(doc: { referencia?: string | null; status?: string | null; encerrado_em?: string | null } | null | undefined): boolean {
  return Boolean(doc?.referencia && doc.status === "emitido" && !doc.encerrado_em);
}
