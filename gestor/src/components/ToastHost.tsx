import { useEffect, useState } from 'react'
import { EVENTO_TOAST, type TipoToast } from '../lib/toast'

type Item = { id: number; texto: string; tipo: TipoToast }

export default function ToastHost() {
  const [itens, setItens] = useState<Item[]>([])
  useEffect(() => {
    let n = 0
    const aoReceber = (e: Event) => {
      const d = (e as CustomEvent<{ texto: string; tipo: TipoToast }>).detail
      const id = ++n
      setItens((l) => [...l, { id, texto: d.texto, tipo: d.tipo }])
      window.setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), d.tipo === 'erro' ? 9000 : 5000)
    }
    window.addEventListener(EVENTO_TOAST, aoReceber)
    return () => window.removeEventListener(EVENTO_TOAST, aoReceber)
  }, [])
  if (itens.length === 0) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 items-center px-3 w-full max-w-md" aria-live="polite" role="status">
      {itens.map((i) => (
        <div
          key={i.id}
          className="rounded-xl px-4 py-3 text-[13px] font-bold w-full"
          style={i.tipo === 'erro' ? { background: '#fbe3e1', color: '#7d1a12', border: '1px solid #f2c4c0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } : { background: '#d6ecdf', color: '#14532d', border: '1px solid #b7dcc6', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
        >
          {i.tipo === 'erro' ? '✕ ' : '✓ '}
          {i.texto}
        </div>
      ))}
    </div>
  )
}
