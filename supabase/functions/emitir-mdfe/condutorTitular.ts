// B4 (03/11/2026): condutor = quem dirige (vai no MDF-e e no CIOT); titular/recebedor = dono do veículo e quem recebe o pagamento.
// Sem condutor_id o condutor é o motorista da operação; sem titular_id quem recebe é o motorista (como sempre foi).
// Se o condutor for o mesmo do motorista e não houver titular, nada muda. Sem I/O, para testar.
export interface EntradaCondutorTitular {
  motoristaId: string | null; // operacoes.pessoa_alocada_id
  condutorId: string | null; // operacoes.condutor_id
  titularId: string | null; // operacoes.titular_id
}

export interface CondutorTitular {
  condutorId: string | null;
  recebedorId: string | null;
  condutorDiferente: boolean; // o condutor não é o motorista alocado
  titularDiferente: boolean; // quem recebe não é o motorista alocado
}

export function resolverCondutorTitular(e: EntradaCondutorTitular): CondutorTitular {
  const condutorId = e.condutorId ?? e.motoristaId;
  const recebedorId = e.titularId ?? e.motoristaId;
  return {
    condutorId,
    recebedorId,
    condutorDiferente: Boolean(condutorId && condutorId !== e.motoristaId),
    titularDiferente: Boolean(recebedorId && recebedorId !== e.motoristaId),
  };
}

// Dados da pessoa-condutor sobre a linha da operação (v_checklist_prontidao): só nome e CPF mudam, o resto segue igual.
// deno-lint-ignore no-explicit-any
export function opComCondutor(op: Record<string, any>, condutor: { id: string; nome: string | null; cpf: string | null }): Record<string, any> {
  return { ...op, motorista_id: condutor.id, motorista_nome: condutor.nome, motorista_cpf: condutor.cpf };
}

export function mensagemCondutorAusente(condutorId: string | null): string | null {
  return condutorId ? "Condutor informado na operação não foi encontrado no cadastro — escolha o condutor de novo ou limpe o campo para usar o motorista." : null;
}
