// Filas da tela Operações: "Sem motorista", "Sem nota", "Para revisar", "Prontas para o fiscal".
// Só classifica e filtra o que a tela já carrega; não decide nada fiscal. Sem React e sem rede (node --test).

export type FilaId = 'para_assumir' | 'devolvidas' | 'sem_motorista' | 'sem_nota' | 'para_revisar' | 'prontas_fiscal'

export const FILAS: { id: FilaId; rotulo: string; ajuda: string }[] = [
  { id: 'para_assumir', rotulo: 'Para assumir', ajuda: 'Esperando alguém da operação assumir.' },
  { id: 'devolvidas', rotulo: 'Devolvidas pelo fiscal', ajuda: 'O fiscal devolveu para a operação corrigir.' },
  { id: 'sem_motorista', rotulo: 'Sem motorista', ajuda: 'Ainda sem motorista alocado.' },
  { id: 'sem_nota', rotulo: 'Sem nota', ajuda: 'Tem motorista, mas nenhuma NF-e do cliente.' },
  { id: 'para_revisar', rotulo: 'Para revisar', ajuda: 'Bloqueio fiscal ou documento com problema.' },
  { id: 'prontas_fiscal', rotulo: 'Prontas para o fiscal', ajuda: 'Motorista, notas e sem pendência: pode emitir os documentos.' },
]

export type DadosFila = {
  id: string
  status: string
  pessoaAlocada: boolean
  bloqueioFiscal: boolean
  ehTeste: boolean
  nfes: number
  docsComProblema: number
}

const ENCERRADAS = ['cancelada', 'fechada', 'entregue']

export function filasDe(d: DadosFila): FilaId[] {
  if (ENCERRADAS.includes(d.status)) return []
  const f: FilaId[] = []
  if (d.status === 'aguardando_assumir') f.push('para_assumir')
  if (d.status === 'devolvida_pelo_fiscal') f.push('devolvidas')
  if (!d.pessoaAlocada) f.push('sem_motorista')
  else if (d.nfes === 0) f.push('sem_nota')
  if (d.bloqueioFiscal || d.docsComProblema > 0) f.push('para_revisar')
  else if (d.pessoaAlocada && d.nfes > 0 && d.status === 'aguardando_liberacao_fiscal') f.push('prontas_fiscal')
  return f
}

export function contarFilas(lista: DadosFila[], ocultarTestes: boolean): Record<FilaId, number> {
  const c: Record<FilaId, number> = { para_assumir: 0, devolvidas: 0, sem_motorista: 0, sem_nota: 0, para_revisar: 0, prontas_fiscal: 0 }
  for (const d of lista) {
    if (ocultarTestes && d.ehTeste) continue
    for (const f of filasDe(d)) c[f]++
  }
  return c
}

export function passaFila(d: DadosFila, fila: FilaId | null, ocultarTestes: boolean): boolean {
  if (ocultarTestes && d.ehTeste) return false
  return fila === null || filasDe(d).includes(fila)
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Busca por cliente, cidade, código (início do id), placa e número/chave de NF-e.
export function casaBusca(termo: string, campos: { texto: string[]; placas: string[]; nfes: string[] }): boolean {
  const t = norm(termo.trim())
  if (!t) return true
  if (campos.texto.some((c) => norm(c).includes(t))) return true
  const alfa = t.replace(/[^a-z0-9]/g, '')
  if (alfa && campos.placas.some((p) => norm(p).replace(/[^a-z0-9]/g, '').includes(alfa))) return true
  const dig = t.replace(/\D/g, '')
  // Só procura em NF-e quando o termo é número (sem letras), para "zzz999" não casar com chave que tenha 999.
  return dig.length >= 3 && dig === alfa && campos.nfes.some((n) => n.replace(/\D/g, '').includes(dig))
}
