// Quem vê o Radar: com PROSPECCAO_UI_LIBERADA = nao só o usuário do Pedro (prospeccao_eh_pedro); com sim, todo gestor_rbr.
import { useEffect, useState } from 'react'
import { db, lerFlag, CHAVE_UI } from '../lib/prospeccaoDb'
import { visibilidadeRadar } from '../lib/radar'

export function useRadarAcesso(papel: string | null | undefined) {
  const [estado, setEstado] = useState<{ carregando: boolean; visivel: boolean; emTeste: boolean; ehPedro: boolean }>({ carregando: true, visivel: false, emTeste: false, ehPedro: false })
  useEffect(() => {
    if (papel !== 'gestor_rbr') { setEstado({ carregando: false, visivel: false, emTeste: false, ehPedro: false }); return }
    let vivo = true
    void Promise.all([lerFlag(CHAVE_UI), Promise.resolve(db.rpc('prospeccao_eh_pedro')).then((r) => r.data === true, () => false)]).then(([flagUi, ehPedro]) => {
      if (vivo) setEstado({ carregando: false, ehPedro, ...visibilidadeRadar({ papel, flagUi, ehPedro }) })
    }, () => { if (vivo) setEstado({ carregando: false, visivel: false, emTeste: false, ehPedro: false }) })
    return () => { vivo = false }
  }, [papel])
  return estado
}
