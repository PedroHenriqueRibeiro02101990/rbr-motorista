import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { mensagemClara } from '../../lib/mensagemClara'

// E04 · Gera (ou reaproveita) o link público de aceite da proposta e copia para a área de transferência.
// O link vale 7 dias; o cliente abre sem login em /p/<código>.
type ChamaRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export default function BotaoLinkAceite({ cotacaoId }: { cotacaoId: string }) {
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'copiado' | 'erro'>('parado')
  const [link, setLink] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar() {
    setEstado('gerando')
    setErro(null)
    const rpc = supabase.rpc as unknown as ChamaRpc
    const { data, error } = await rpc.call(supabase, 'gerar_link_proposta', { p_cotacao: cotacaoId, p_dias: 7 })
    if (error || typeof data !== 'string') {
      setErro(mensagemClara(error, 'Não consegui gerar o link agora.'))
      return setEstado('erro')
    }
    const url = `${window.location.origin}/p/${data}`
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setEstado('copiado')
    } catch {
      // Sem permissão para copiar: o link fica visível para copiar à mão.
      setEstado('copiado')
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => void gerar()}
        disabled={estado === 'gerando'}
        className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50"
        style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)', background: '#fff' }}
      >
        {estado === 'gerando' ? 'Gerando…' : estado === 'copiado' ? '✓ Link copiado' : 'Copiar link de aceite'}
      </button>
      {estado === 'copiado' && link && <span className="text-[11px] text-[color:var(--rbr-muted)] break-all max-w-[260px]">{link}</span>}
      {erro && <span className="text-[11px]" style={{ color: 'var(--rbr-danger)' }}>{erro}</span>}
    </div>
  )
}
