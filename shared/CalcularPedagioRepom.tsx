import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Botão "Calcular pedágio automático" (Repom). Desligado por padrão: só aparece com VITE_REPOM_ROTEIRIZACAO_HABILITADO=true.
// Usa a cotação JÁ SALVA (cotacoes.ibge_origem, ibge_destino e eixos). Erro, flag do servidor desligada ou cotação sem
// dados: o campo manual segue exatamente como está, só com uma mensagem curta. Nada é gravado sem o usuário aceitar.
interface Resposta {
  ok: boolean
  valor?: number
  descricaoPercurso?: string | null
  consultadoEm?: string
  doCache?: boolean
  emTeste?: boolean
  erro?: string
  desligado?: boolean
}

export const REPOM_FRONT_LIGADO = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_REPOM_ROTEIRIZACAO_HABILITADO === 'true'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Só aparece com a flag do front ligada E a trava do servidor liberada (repom-status.liberada); com a trava desligada nem aparece.
export default function CalcularPedagioRepom({ cotacaoId, onAceitar }: { cotacaoId: string | null | undefined; onAceitar: (valor: number, consultadoEm: string) => void }) {
  const [liberada, setLiberada] = useState(false)
  useEffect(() => {
    if (!REPOM_FRONT_LIGADO) return
    let vivo = true
    void (async () => {
      try {
        const { data } = await supabase.functions.invoke('repom-status', { body: {} })
        if (vivo) setLiberada((data as { liberada?: boolean } | null)?.liberada === true)
      } catch {
        if (vivo) setLiberada(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])
  const [carregando, setCarregando] = useState(false)
  const [res, setRes] = useState<Resposta | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  if (!REPOM_FRONT_LIGADO || !liberada) return null

  async function calcular() {
    if (!cotacaoId) return setMsg('Salve a cotação (com origem, destino e eixos) para calcular o pedágio automático.')
    setCarregando(true)
    setMsg(null)
    setRes(null)
    try {
      const { data, error } = await supabase.functions.invoke('repom-pedagio-rota', { body: { cotacao_id: cotacaoId } })
      const r = data as Resposta | null
      if (error || !r) setMsg('Não foi possível calcular agora. Informe o pedágio manualmente.')
      else if (!r.ok) setMsg(r.erro ?? 'Não foi possível calcular agora. Informe o pedágio manualmente.')
      else setRes(r)
    } catch {
      setMsg('Não foi possível calcular agora. Informe o pedágio manualmente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div>
        <button type="button" onClick={calcular} disabled={carregando} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-60" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
          {carregando ? 'Calculando…' : 'Calcular pedágio automático'}
        </button>
      </div>
      {msg && <div className="text-[11px] text-[color:var(--rbr-muted)]">{msg}</div>}
      {res?.ok && res.valor != null && (
        <div className="rounded-xl border p-2.5 text-[12px]" style={{ borderColor: 'var(--rbr-border)', background: 'var(--rbr-navy-tint)' }}>
          {res.emTeste && <div className="mb-1.5 rounded-lg px-2 py-1 font-bold" style={{ background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}>Repom em teste: valor de homologação, não use como definitivo.</div>}
          <div className="font-bold text-[14px]">{brl(res.valor)} <span className="font-semibold text-[11px] text-[color:var(--rbr-muted)]">origem: Repom</span></div>
          {res.descricaoPercurso && <div className="text-[color:var(--rbr-muted)] mt-0.5">Rodovias: {res.descricaoPercurso}</div>}
          <div className="text-[color:var(--rbr-muted)]">
            Consulta de {res.consultadoEm ? new Date(res.consultadoEm).toLocaleDateString('pt-BR') : '—'}
            {res.doCache ? ' (já consultada antes)' : ''}
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--rbr-btn, #1e2761)', color: '#fff' }} onClick={() => { onAceitar(res.valor!, res.consultadoEm ?? new Date().toISOString()); setRes(null) }}>
              Usar este valor
            </button>
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }} onClick={() => setRes(null)}>
              Manter o manual
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
