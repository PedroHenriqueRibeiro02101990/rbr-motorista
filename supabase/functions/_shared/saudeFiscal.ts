// G02/G03/G09: checagens da saúde fiscal. Puras (sem rede, sem banco): recebem linhas já lidas e devolvem achados.
// Não emitem, não cancelam e não averbam nada. A função saude-fiscal lê o banco, chama isto e grava em saude_fiscal_achados.

const MIN = 60_000
const DIA = 24 * 60 * MIN

export type Gravidade = 'verde' | 'amarelo' | 'vermelho' | 'precisa_de_voce'
export type Achado = { robo: 'reconciliador'; operacao_id: string; gravidade: Gravidade; mensagem: string }

export type LinhaOperacao = { id: string; status: string; entregue_em: string | null; eh_teste?: boolean }
export type LinhaDocumento = { operacao_id: string; tipo: string; status: string; emitido_em: string | null; atualizado_em: string | null }
export type LinhaCiot = { operacao_id: string; ciot_status: string | null; ciot_fim_previsto: string | null; vpo_idvpo: string | null }

const t = (v: string | null | undefined) => (v ? Date.parse(v) : null)

export function avaliarSaudeFiscal(entrada: { operacoes: LinhaOperacao[]; documentos: LinhaDocumento[]; ciot: LinhaCiot[]; agora: number }): Achado[] {
  const { operacoes, documentos, ciot, agora } = entrada
  const achados: Achado[] = []
  const add = (operacao_id: string, gravidade: Gravidade, mensagem: string) => achados.push({ robo: 'reconciliador', operacao_id, gravidade, mensagem })
  const docsDe = (id: string) => documentos.filter((d) => d.operacao_id === id)

  for (const op of operacoes) {
    if (op.eh_teste) continue
    const docs = docsDe(op.id)
    const cancelada = op.status === 'cancelada'

    // Documento pendente há mais de 10 min (consultar a fonte antes de qualquer reenvio).
    for (const d of docs.filter((x) => x.status === 'pendente' && ['cte', 'mdfe', 'nfse'].includes(x.tipo))) {
      const desde = t(d.atualizado_em)
      if (desde != null && agora - desde > 10 * MIN) add(op.id, 'amarelo', `${d.tipo.toUpperCase()} pendente há mais de 10 minutos: consulte a fonte antes de reenviar.`)
    }
    // CT-e emitido sem averbação há mais de 30 min.
    const cte = docs.find((d) => d.tipo === 'cte' && d.status === 'emitido')
    const atm = docs.find((d) => d.tipo === 'atm' && d.status === 'emitido')
    const cteEm = t(cte?.emitido_em)
    if (cte && !atm && cteEm != null && agora - cteEm > 30 * MIN) add(op.id, 'vermelho', 'CT-e emitido sem averbação há mais de 30 minutos.')
    // MDF-e aberto depois da entrega.
    const mdfe = docs.find((d) => d.tipo === 'mdfe' && d.status === 'emitido')
    const entregue = t(op.entregue_em)
    if (mdfe && entregue != null && agora - entregue > DIA && !cancelada) add(op.id, 'amarelo', 'MDF-e continua aberto mais de 24 horas depois da entrega.')

    const c = ciot.find((x) => x.operacao_id === op.id)
    // CIOT sem encerrar perto dos 5 dias do fim previsto.
    const fim = t(c?.ciot_fim_previsto)
    if (c && c.ciot_status === 'emitido' && fim != null && agora - fim > 4 * DIA) add(op.id, 'amarelo', 'CIOT sem encerrar, perto do prazo de 5 dias do fim previsto.')
    // VPO comprado em operação cancelada.
    if (cancelada && c?.vpo_idvpo) add(op.id, 'precisa_de_voce', 'Operação cancelada, mas há vale-pedágio comprado: confira se foi cancelado.')
  }
  return achados
}

export function corGeral(achados: Achado[]): Gravidade {
  if (achados.some((a) => a.gravidade === 'precisa_de_voce')) return 'precisa_de_voce'
  if (achados.some((a) => a.gravidade === 'vermelho')) return 'vermelho'
  if (achados.some((a) => a.gravidade === 'amarelo')) return 'amarelo'
  return 'verde'
}
