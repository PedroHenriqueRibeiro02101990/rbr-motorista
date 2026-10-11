import { useCallback, useRef, useState } from 'react'
import { Aviso } from './financeiro/ui'

// Componente único de confirmação (regra do sistema): toda ação mostra ✓ com o que aconteceu ou ✗ com o motivo.
// Uso: const { confirmacao, rodar } = useConfirmacao(); <>{confirmacao}</>;
// await rodar('Operação #3 criada', async () => { ... })  — marca "em andamento" e evita clique duplo.
export function useConfirmacao() {
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrar = useCallback((tipo: 'ok' | 'erro', texto: string) => {
    if (timer.current) clearTimeout(timer.current)
    setEstado({ tipo, texto })
    if (tipo === 'ok') timer.current = setTimeout(() => setEstado(null), 8000)
  }, [])

  const rodar = useCallback(
    async <T,>(textoOk: string | ((r: T) => string), acao: () => Promise<T>): Promise<T | undefined> => {
      setOcupado(true)
      try {
        const r = await acao()
        mostrar('ok', typeof textoOk === 'function' ? textoOk(r) : textoOk)
        return r
      } catch (e) {
        mostrar('erro', e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e))
        return undefined
      } finally {
        setOcupado(false)
      }
    },
    [mostrar],
  )

  const confirmacao = estado ? (
    <Aviso tipo={estado.tipo} onFechar={() => setEstado(null)}>
      {estado.tipo === 'ok' ? '✓ ' : '✗ '}
      {estado.texto}
    </Aviso>
  ) : null

  return { confirmacao, rodar, ocupado, mostrar }
}
