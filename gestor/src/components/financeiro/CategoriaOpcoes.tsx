import { type Categoria, GRUPO_LABEL } from '../../lib/financeiro'

export const NATUREZA_LABEL: Record<string, string> = {
  fixa: 'Fixa',
  variavel: 'Variável',
  nao_se_aplica: '—',
}

const ORDEM_GRUPOS = [
  'receita_operacional',
  'outras_receitas',
  'receita_financeira',
  'custo_operacional',
  'deducoes',
  'despesa_administrativa',
  'despesa_comercial',
  'despesa_pessoal',
  'despesa_financeira',
  'investimento',
  'retirada_socios',
  'emprestimo',
]

// <option>s agrupados por grupo do DRE (a lista é longa: energia, internet, aluguel, pedágio…).
export function OpcoesCategoria({ categorias, tipo, incluirInativas }: { categorias: Categoria[]; tipo?: 'receita' | 'despesa'; incluirInativas?: string | null }) {
  const lista = categorias.filter((c) => (c.ativa || c.id === incluirInativas) && (!tipo || c.tipo === tipo))
  return (
    <>
      {ORDEM_GRUPOS.map((g) => {
        const cats = lista.filter((c) => c.grupo === g).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
        if (!cats.length) return null
        return (
          <optgroup key={g} label={GRUPO_LABEL[g] ?? g}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.natureza === 'fixa' ? ' · fixa' : c.natureza === 'variavel' ? ' · variável' : ''}
              </option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}
