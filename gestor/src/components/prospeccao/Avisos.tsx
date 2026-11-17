import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/prospeccaoDb'
import './prospeccaoUi.css'

type Aviso = { id: string; criado_em: string; tipo: string; texto: string }
const ROTULO: Record<string, string> = { cotacao: 'Cotação', escalada: 'Precisa de você', teto_ia: 'Teto da IA', teto_ia_70: 'IA em 70% do teto', reversao: 'Experimento revertido', experimento: 'Experimento', validador: 'Validador', modelo_inativo: 'Modelo inativo' }

/** Avisos do agente no topo (cotacao, escalada, teto de IA, reversao, validador). "Visto" some com o aviso. */
export default function Avisos() {
  const [lista, setLista] = useState<Aviso[]>([])
  const carregar = useCallback(async () => {
    const { data } = await db.from('prospeccao_avisos').select('id, criado_em, tipo, texto').is('visto_em', null).order('criado_em', { ascending: false }).limit(6)
    setLista((data ?? []) as Aviso[])
  }, [])
  useEffect(() => { void carregar(); const t = setInterval(() => { if (!document.hidden) void carregar() }, 60_000); return () => clearInterval(t) }, [carregar])
  if (lista.length === 0) return null
  return (
    <div className="pr flex flex-col gap-1.5" role="status" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={`pr-aviso flex items-start gap-2 ${a.tipo === 'reversao' || a.tipo === 'teto_ia' ? 'bad' : a.tipo === 'cotacao' ? 'ok' : ''}`}>
          <span className="pr-badge ouro">{ROTULO[a.tipo] ?? a.tipo}</span>
          <div className="flex-1 min-w-0">{a.texto} <span className="pr-muted pr-num">· {new Date(a.criado_em).toLocaleString('pt-BR')}</span></div>
          <button className="pr-btn" onClick={() => void db.from('prospeccao_avisos').update({ visto_em: new Date().toISOString() }).eq('id', a.id).then(() => carregar())}>Visto</button>
        </div>
      ))}
    </div>
  )
}
