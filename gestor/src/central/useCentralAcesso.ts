// Quem vê a Central no menu: só quem o banco diz ser o administrador (Pedro). A flag CENTRAL_UI_LIBERADA só muda o selo "em teste".
import { useEffect, useState } from 'react'
import { ehAdmin, lerFlags } from '../lib/centralDb'

export function useCentralAcesso(papel: string | null | undefined) {
  const [estado, setEstado] = useState({ visivel: false, emTeste: true })
  useEffect(() => {
    if (papel !== 'gestor_rbr') { setEstado({ visivel: false, emTeste: true }); return }
    let vivo = true
    void Promise.all([ehAdmin(), lerFlags().catch(() => ({} as Record<string, string>))]).then(([adm, fl]) => {
      if (vivo) setEstado({ visivel: adm, emTeste: fl.CENTRAL_UI_LIBERADA !== 'sim' })
    }, () => undefined)
    return () => { vivo = false }
  }, [papel])
  return estado
}
