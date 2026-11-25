// Quem vê a Central e a Fila do SDR no menu. Quem decide é o banco; a flag CENTRAL_UI_LIBERADA só muda o selo "em teste"
// e libera a Fila do SDR para quem não é o Pedro (ex.: José Carlos).
import { useEffect, useState } from 'react'
import { ehAdmin, ehSdr, lerFlags } from '../lib/centralDb'

export function useCentralAcesso(papel: string | null | undefined) {
  const [estado, setEstado] = useState({ visivel: false, fila: false, emTeste: true })
  useEffect(() => {
    if (papel !== 'gestor_rbr') { setEstado({ visivel: false, fila: false, emTeste: true }); return }
    let vivo = true
    void Promise.all([ehAdmin(), ehSdr(), lerFlags().catch(() => ({} as Record<string, string>))]).then(([adm, sdr, fl]) => {
      const liberada = fl.CENTRAL_UI_LIBERADA === 'sim'
      if (vivo) setEstado({ visivel: adm, fila: adm || (sdr && liberada), emTeste: !liberada })
    }, () => undefined)
    return () => { vivo = false }
  }, [papel])
  return estado
}
