import { supabase } from '@rbr/shared/supabaseClient'
import { useEffect, useState } from 'react'
import { brl, dataBr } from '../../lib/novoDb'

type Sugestao = { valor: number | null; registrado_em: string | null; fonte: string | null; amostras: number | null }

// Sugestão de pedágio pelo histórico (RPC sugerir_pedagio). Só aparece com rota/eixos preenchidos e pedágio vazio.
export default function PedagioSugerido({
  cidadeOrigem,
  ufOrigem,
  cidadeDestino,
  ufDestino,
  eixos,
  pedagioAtual,
  onUsar,
}: {
  cidadeOrigem: string
  ufOrigem: string
  cidadeDestino: string
  ufDestino: string
  eixos: string
  pedagioAtual: string
  onUsar: (valor: number) => void
}) {
  const [sug, setSug] = useState<Sugestao | null>(null)
  const [consultado, setConsultado] = useState(false)
  const vazio = pedagioAtual.trim() === '' || Number(pedagioAtual) === 0
  const pronto = Boolean(cidadeOrigem.trim() && ufOrigem.trim() && cidadeDestino.trim() && ufDestino.trim() && Number(eixos) > 0)

  useEffect(() => {
    setSug(null)
    setConsultado(false)
    if (!pronto || !vazio) return
    let vivo = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('sugerir_pedagio', {
        p_cidade_origem: cidadeOrigem.trim(),
        p_uf_origem: ufOrigem.trim().toUpperCase(),
        p_cidade_destino: cidadeDestino.trim(),
        p_uf_destino: ufDestino.trim().toUpperCase(),
        p_eixos: Number(eixos),
      })
      if (!vivo) return
      if (error) return
      const r = (Array.isArray(data) ? data[0] : data) as Sugestao | null
      setSug(r ?? null)
      setConsultado(true)
    }, 500)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [pronto, vazio, cidadeOrigem, ufOrigem, cidadeDestino, ufDestino, eixos])

  if (!pronto || !vazio || !consultado) return null
  if (!sug || sug.valor == null) {
    return <div className="text-[11px] text-[color:var(--rbr-muted)] mt-1">Pedágio não incluído (rota sem histórico).</div>
  }
  const valor = sug.valor
  return (
    <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap text-[color:var(--rbr-navy-dark)]">
      <span>
        Sugerido pelo histórico: <strong>{brl(valor)}</strong>
        {sug.registrado_em ? ` (${dataBr(sug.registrado_em)})` : ''}
      </span>
      <button type="button" onClick={() => onUsar(valor)} className="font-bold underline" style={{ color: 'var(--rbr-navy)' }}>
        Usar
      </button>
    </div>
  )
}
