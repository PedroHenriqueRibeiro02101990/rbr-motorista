// Regras de preenchimento da cotação que valem na hora de ENVIAR ao cliente ou CONVERTER em operação
// (salvar rascunho continua livre). Usado por pages/Cotacao.tsx; testes em gestor/test/cotacaoValidacao.test.ts.

// Tipo de carga (tabela do piso ANTT): o MDF-e precisa dele. Sem ele a emitir-mdfe assume "Carga geral" (05) e só
// avisa — por isso a cotação não segue sem o tipo escolhido.
export const MSG_TIPO_CARGA = 'Escolha o tipo de carga (Composição do preço) antes de enviar ou converter. Ele vai no MDF-e e define o piso ANTT.'

export function erroTipoCarga(tipoCarga: string | null | undefined): string | null {
  return (tipoCarga ?? '').trim() ? null : MSG_TIPO_CARGA
}
