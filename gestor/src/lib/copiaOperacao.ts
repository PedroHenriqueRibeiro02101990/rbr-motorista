import type { DetalheOperacao } from './operacaoDetalhe'

// Dados do motorista e do veículo que a GR (Shogun) e a Repom pedem. Valor null = falta no cadastro.
export interface LinhaCopia {
  rotulo: string
  valor: string | null
}

const vazio = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null)

export function dadosMotoristaVeiculo(d: DetalheOperacao): LinhaCopia[] {
  const placas = [d.veiculo?.placa, ...d.reboques.map((r) => r.placa)].map(vazio).filter((p): p is string => !!p)
  return [
    { rotulo: 'Motorista', valor: vazio(d.motorista?.nome) },
    { rotulo: 'CPF', valor: vazio(d.motorista?.cpf) },
    { rotulo: 'CNH', valor: vazio(d.motorista?.cnh_numero_registro) },
    { rotulo: 'Placas', valor: placas.length ? placas.join(' / ') : null },
    { rotulo: 'Proprietário', valor: vazio(d.titular?.nome) },
  ]
}

// Campos que faltam no cadastro (para avisar antes de copiar).
export function faltandoCopia(linhas: LinhaCopia[]): string[] {
  return linhas.filter((l) => !l.valor).map((l) => l.rotulo)
}

// Texto pronto para colar: uma linha por campo; o que falta sai como "(faltando)".
export function textoCopia(linhas: LinhaCopia[]): string {
  return linhas.map((l) => `${l.rotulo}: ${l.valor ?? '(faltando)'}`).join('\n')
}
