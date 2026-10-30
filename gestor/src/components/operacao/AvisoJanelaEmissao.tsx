import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { dentroDaJanelaDeEmissao } from '@rbr/shared/regrasFluxo'

// B14 · Emitir antes da chegada do caminhão: o CT-e/MDF-e vai até a véspera da coleta (Brasília). No dia da coleta, ou depois,
// o aviso fica amarelo; é aviso e não trava (o gestor pode ter motivo para emitir no dia). Sem coleta prevista, não mostra nada.
export default function AvisoJanelaEmissao({ operacaoId }: { operacaoId: string }) {
  const [coleta, setColeta] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    void supabase
      .from('operacoes')
      .select('coleta_prevista')
      .eq('id', operacaoId)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setColeta((data as { coleta_prevista: string | null } | null)?.coleta_prevista ?? null)
      })
    return () => {
      vivo = false
    }
  }, [operacaoId])

  if (!coleta || dentroDaJanelaDeEmissao(new Date(coleta).getTime(), Date.now())) return null
  return (
    <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FDF1DC', color: '#8A5A00' }} role="status">
      Atenção: a coleta prevista é {new Date(coleta).toLocaleDateString('pt-BR')}. O combinado é emitir até a véspera, antes de o caminhão chegar.
    </div>
  )
}
