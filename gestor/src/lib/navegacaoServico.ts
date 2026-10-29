// Navegação Cotação | Operação | Fiscal do mesmo serviço. Só decide para onde cada botão leva (ou por que está desligado).
// Testes: node --test gestor/test/navegacaoServico.test.ts

export type SecaoServico = 'cotacao' | 'operacao' | 'fiscal'
export type OpDoServico = { id: string; status: string }

export type DestinoServico = {
  secao: SecaoServico
  rotulo: string
  atual: boolean
  url: string | null // null = desligado (ver motivo) ou depende de escolha (ver escolhas)
  escolhas: OpDoServico[] // cotação com mais de uma operação: o gestor escolhe
  motivo: string | null // por que o botão está desabilitado
}

const ROTULO: Record<SecaoServico, string> = { cotacao: 'Cotação', operacao: 'Operação', fiscal: 'Fiscal' }

export function urlSecao(secao: SecaoServico, id: string): string {
  if (secao === 'cotacao') return `/cotacao?id=${id}`
  if (secao === 'operacao') return `/operacoes?op=${id}`
  return `/fiscal?op=${id}`
}

// atual: em qual dos três painéis o gestor está. operacaoId: a operação do painel (null no painel da cotação).
// ops: operações geradas pela cotação (só importa quando operacaoId é null).
export function destinosDoServico(p: { atual: SecaoServico; cotacaoId: string | null; operacaoId: string | null; ops: OpDoServico[] | null }): DestinoServico[] {
  return (['cotacao', 'operacao', 'fiscal'] as SecaoServico[]).map((secao) => {
    const base = { secao, rotulo: ROTULO[secao], atual: p.atual === secao, url: null, escolhas: [] as OpDoServico[], motivo: null as string | null }
    if (secao === 'cotacao') {
      if (!p.cotacaoId) return { ...base, motivo: 'Esta operação não nasceu de uma cotação.' }
      return { ...base, url: urlSecao('cotacao', p.cotacaoId) }
    }
    if (p.operacaoId) return { ...base, url: urlSecao(secao, p.operacaoId) }
    if (p.ops === null) return { ...base, motivo: 'Carregando as operações desta cotação…' }
    if (p.ops.length === 0) return { ...base, motivo: 'Esta cotação ainda não virou operação.' }
    if (p.ops.length === 1) return { ...base, url: urlSecao(secao, p.ops[0].id) }
    return { ...base, escolhas: p.ops }
  })
}
