import { useEffect, useState } from 'react'

// Mensagem de resultado que some sozinha (toast): igual a useState, mas volta a null depois de `ms`.
// Só para confirmações ("salvo", "enviado"); erros continuam até o usuário agir ou trocar de tela.
export function useMensagemTemporaria<T>(ms = 8000): [T | null, (v: T | null) => void] {
  const [valor, setValor] = useState<T | null>(null)
  useEffect(() => {
    if (valor == null) return
    const t = setTimeout(() => setValor(null), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return [valor, setValor]
}
