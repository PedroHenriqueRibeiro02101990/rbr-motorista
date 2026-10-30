// B11: "Finalizar viagem" num botão só. Encerra o MDF-e e o CIOT; se um falhar, mostra qual e, na próxima vez,
// tenta só o que faltou. Regras puras (sem rede), usadas pelo FinalizarViagem.

export type EstadoFinalizacao = {
  mdfeAutorizado: boolean
  mdfeEncerrado: boolean
  // CIOT da efrete desta operação (ciot_origem 'efrete'); null = a operação não tem CIOT para encerrar.
  ciotStatus: string | null
}

export type PassoFinalizacao = { id: 'mdfe' | 'ciot'; rotulo: string }

export function passosPendentes(e: EstadoFinalizacao): PassoFinalizacao[] {
  const passos: PassoFinalizacao[] = []
  if (e.mdfeAutorizado && !e.mdfeEncerrado) passos.push({ id: 'mdfe', rotulo: 'MDF-e' })
  if (e.ciotStatus === 'emitido') passos.push({ id: 'ciot', rotulo: 'CIOT' })
  return passos
}

export type ResultadoPasso = { id: 'mdfe' | 'ciot'; ok: boolean; erro?: string }

export function resumoFinalizacao(resultados: ResultadoPasso[]): { tudoCerto: boolean; mensagem: string } {
  const falhas = resultados.filter((r) => !r.ok)
  if (resultados.length === 0) return { tudoCerto: true, mensagem: 'Nada a encerrar: a viagem já estava finalizada.' }
  if (falhas.length === 0) return { tudoCerto: true, mensagem: `Viagem finalizada. Encerrado: ${resultados.map((r) => (r.id === 'mdfe' ? 'MDF-e' : 'CIOT')).join(' e ')}.` }
  const feitos = resultados.filter((r) => r.ok).map((r) => (r.id === 'mdfe' ? 'MDF-e' : 'CIOT'))
  const quais = falhas.map((r) => `${r.id === 'mdfe' ? 'MDF-e' : 'CIOT'}${r.erro ? ` (${r.erro})` : ''}`).join('; ')
  return {
    tudoCerto: false,
    mensagem: `Não deu para encerrar: ${quais}.${feitos.length ? ` Já encerrado: ${feitos.join(' e ')}.` : ''} Ao tentar de novo, só o que faltou é refeito.`,
  }
}
