// Condição de existência dos avisos (2026-10-16): todo aviso, dica, selo ou banner só aparece enquanto for acionável.
// Concluído (emitido, averbado, pago, cancelado, encerrado, preenchido) = o aviso não é renderizado.
// Erros, bloqueios e regras da RBR ainda não resolvidos continuam (inclui risco e conformidade ativos).
// Usado por Fiscal, Operações e componentes da operação; testes em gestor/test/avisos.test.ts.

type Doc = { status?: string | null; ambiente?: string | null } | null | undefined

const emitido = (d: Doc) => d?.status === 'emitido'
const cancelado = (d: Doc) => d?.status === 'cancelado'

// "A averbação só pode ser enviada depois que o CT-e for autorizado": só enquanto o CT-e não foi autorizado nem
// cancelado e a averbação ainda não saiu.
export function mostrarAvisoAguardandoCte(cte: Doc, atm: Doc): boolean {
  return !!cte && !emitido(cte) && !cancelado(cte) && !emitido(atm)
}

// Selo "Homologação — sem validade fiscal": só no documento de homologação ainda ativo (não cancelado).
export function mostrarSeloHomologacao(doc: Doc): boolean {
  return doc?.ambiente === 'homologacao' && !cancelado(doc)
}

// Faixa "1. CT-e → 2. Allianz → 3. MDF-e → 4. Sompo": guia enquanto falta algum passo; some com tudo feito ou com
// CT-e/MDF-e cancelado.
export function mostrarOrdemDocumentos(cte: Doc, atm: Doc, mdfe: Doc, rcvStatus: string | null | undefined): boolean {
  if (cancelado(cte) || cancelado(mdfe)) return false
  return !(emitido(cte) && emitido(atm) && emitido(mdfe) && rcvStatus === 'emitido')
}

// Operação de teste terminou: nada fiscal ativo (NF-e de teste cancelada = chave limpa na cotação; CT-e e MDF-e sem
// nenhum autorizado) e pelo menos um documento cancelado. Aí o quadro vira uma linha "Teste encerrado".
export function testeEncerrado(o: { nfeChave: string | null | undefined; cte: Doc; mdfe: Doc }): boolean {
  if (o.nfeChave) return false
  if (emitido(o.cte) || emitido(o.mdfe)) return false
  return cancelado(o.cte) || cancelado(o.mdfe)
}

// "A origem ou o destino mudou… confira antes de emitir": só enquanto nenhum documento ao cliente foi emitido e a
// operação ainda não saiu para coleta.
export function mostrarAvisoMudancaDocumento(mudouEm: string | null | undefined, statusOperacao: string, docs: { tipo: string; status?: string | null }[]): boolean {
  if (!mudouEm) return false
  if (!['alocando_motorista', 'aguardando_liberacao_fiscal'].includes(statusOperacao)) return false
  return !docs.some((d) => ['cte', 'mdfe', 'nfse'].includes(d.tipo) && (d.status === 'emitido' || d.status === 'cancelado'))
}

// Incidentes da carga no card da operação: só os abertos (os encerrados, com dossiê, ficam em Conformidade › Escudo).
export function incidentesAcionaveis<T extends { status: string }>(lista: T[]): T[] {
  return lista.filter((i) => i.status === 'aberto')
}
