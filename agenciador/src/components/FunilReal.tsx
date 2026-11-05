import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { Cartao, Esqueleto, Selo, Vazio, brl } from './ui'

// Funil com dados reais, lido SOMENTE da visao agenciador_cotacoes_v (sem colunas internas da RBR).
// "Aceita" ainda nao existe no banco real (status_cotacao so tem rascunho/enviada/convertida/perdida): fica para a migracao pendente.
const ITENS = [
  { s: 'rascunho', t: 'Rascunho', bg: 'var(--rbr-muted-bg)', c: 'var(--rbr-muted)' },
  { s: 'enviada', t: 'Enviada ao cliente', bg: '#DCE3FF', c: '#1e2761' },
  { s: 'convertida', t: 'Enviada à operação', bg: '#1e2761', c: '#fff' },
  { s: 'perdida', t: 'Perdida', bg: '#FBE9E9', c: '#9b1c1c' },
] as const

export default function FunilReal({ pessoaId }: { pessoaId: string }) {
  const [dados, setDados] = useState<{ status: string; valor_total: number | null }[] | null>(null)
  useEffect(() => {
    supabase.from('agenciador_cotacoes_v' as never).select('status, valor_total').eq('agenciador_id', pessoaId).then(({ data }) => setDados((data ?? []) as never))
  }, [pessoaId])
  if (!dados) return <Esqueleto linhas={1} />
  if (dados.length === 0)
    return <Vazio titulo="Sua primeira cotação começa aqui" texto="Cadastre um cliente e monte a cotação. Você define o seu spread e vê quanto ganha antes de enviar." acao={<Link to="/cotacoes" className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--rbr-gold)', color: '#fff' }}>Nova cotação</Link>} />
  return (
    <div>
      <div className="rbr-display font-bold mb-2">Seu funil</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ITENS.map((i) => {
          const l = dados.filter((d) => d.status === i.s)
          return (
            <Cartao key={i.s}>
              <Selo texto={i.t} bg={i.bg} cor={i.c} />
              <div className="rbr-display font-bold text-2xl mt-2">{l.length}</div>
              <div className="text-[12px] text-[color:var(--rbr-muted)]">{brl(l.reduce((a, d) => a + Number(d.valor_total ?? 0), 0))}</div>
            </Cartao>
          )
        })}
      </div>
    </div>
  )
}
