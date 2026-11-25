// Janela de confirmação em português simples (usa o <dialog> do navegador: foco preso e Esc fecha).
import { useEffect, useRef } from 'react'
import type { Pedido } from './ctx'

export function Confirmar({ pedido, onResp }: { pedido: Pedido | null; onResp: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (pedido && !d.open) d.showModal()
    if (!pedido && d.open) d.close()
  }, [pedido])
  return (
    <dialog ref={ref} aria-labelledby="ctr-dlg-t" onCancel={(e) => { e.preventDefault(); onResp(false) }}>
      {pedido && (
        <>
          <h3 id="ctr-dlg-t">{pedido.titulo}</h3>
          <p>{pedido.texto}</p>
          <div className="bt">
            <button onClick={() => onResp(false)}>Cancelar</button>
            <button className={pedido.perigoso ? 'dng' : 'pri'} onClick={() => onResp(true)}>{pedido.ok}</button>
          </div>
        </>
      )}
    </dialog>
  )
}
