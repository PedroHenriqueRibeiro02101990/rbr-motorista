import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { STATUS_OPERACAO_LABEL } from '@rbr/shared/format'
import { codigoCurto } from '../lib/painelOperacao'
import { destinosDoServico, type DestinoServico, type OpDoServico, type SecaoServico } from '../lib/navegacaoServico'

// Botões Cotação | Operação | Fiscal do mesmo serviço, no cabeçalho dos três painéis. Trocar de botão abre o painel
// do mesmo serviço na outra tela. Botão sem destino fica desabilitado e diz o motivo (title + texto de apoio).
// confirmarSaida: devolve false para cancelar a troca (ex.: há edição não salva).
export default function NavegacaoServico({
  atual,
  cotacaoId,
  operacaoId,
  confirmarSaida,
}: {
  atual: SecaoServico
  cotacaoId: string | null
  operacaoId: string | null
  confirmarSaida?: () => boolean
}) {
  const navigate = useNavigate()
  // Só o painel da cotação precisa saber quais operações ela gerou; os outros já conhecem a sua.
  const [ops, setOps] = useState<OpDoServico[] | null>(null)
  const [escolhendo, setEscolhendo] = useState<DestinoServico | null>(null)

  useEffect(() => {
    if (operacaoId || !cotacaoId) return
    let vivo = true
    supabase
      .from('operacoes')
      .select('id, status')
      .eq('cotacao_id', cotacaoId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (vivo) setOps((data ?? []) as OpDoServico[])
      })
    return () => {
      vivo = false
      setOps(null)
    }
  }, [cotacaoId, operacaoId])

  const destinos = destinosDoServico({ atual, cotacaoId, operacaoId, ops: operacaoId || !cotacaoId ? [] : ops })

  function ir(url: string) {
    if (confirmarSaida && !confirmarSaida()) return
    setEscolhendo(null)
    navigate(url)
  }

  function aoClicar(d: DestinoServico) {
    if (d.atual) return
    if (d.url) ir(d.url)
    else if (d.escolhas.length > 0) setEscolhendo(escolhendo?.secao === d.secao ? null : d)
  }

  const desligados = destinos.filter((d) => !d.atual && !d.url && d.escolhas.length === 0 && d.motivo)

  return (
    <div className="flex flex-col gap-1.5">
      <nav aria-label="Seções deste serviço" className="flex items-center gap-1 flex-wrap">
        {destinos.map((d) => {
          const desligado = !d.atual && !d.url && d.escolhas.length === 0
          return (
            <button
              key={d.secao}
              type="button"
              aria-current={d.atual ? 'page' : undefined}
              disabled={desligado}
              title={desligado && d.motivo ? d.motivo : undefined}
              onClick={() => aoClicar(d)}
              className="text-xs font-bold px-3.5 py-1.5 rounded-lg border disabled:opacity-45 disabled:cursor-not-allowed"
              style={
                d.atual
                  ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' }
                  : { borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)' }
              }
            >
              {d.rotulo}
              {d.escolhas.length > 1 ? ` (${d.escolhas.length})` : ''}
            </button>
          )
        })}
      </nav>
      {desligados.length > 0 && <div className="text-[11px] text-[color:var(--rbr-muted)]">{desligados[0].motivo}</div>}
      {escolhendo && (
        <div className="rounded-xl border p-2 flex flex-col gap-1 bg-white" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
            Esta cotação tem {escolhendo.escolhas.length} operações. Abrir {escolhendo.rotulo === 'Fiscal' ? 'no Fiscal' : 'a operação'}:
          </div>
          {escolhendo.escolhas.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => ir(escolhendo.secao === 'fiscal' ? `/fiscal?op=${o.id}` : `/operacoes?op=${o.id}`)}
              className="text-left text-xs rounded-lg px-2.5 py-1.5 hover:bg-[color:var(--rbr-muted-bg)]"
            >
              <b className="font-mono">{codigoCurto(o.id)}</b>
              <span className="text-[color:var(--rbr-muted)]"> · {STATUS_OPERACAO_LABEL[o.status as keyof typeof STATUS_OPERACAO_LABEL] ?? o.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
