import { useCallback, useRef, useState, type ReactNode } from 'react'
import { mostrarToast } from '../lib/toast'
import { linhaConfirmacao, type EstadoAcao } from '../lib/statusAcao'
import { mensagemClara } from '../lib/mensagemClara'

// Componente UNICO de confirmacao (regra G5) para upload, leitura, lancamento, emissao e cancelamento: estados enviando, ok e erro.
// - "ok" so aparece depois que `verificar` reler o registro gravado (nada parece ter funcionado sem ter sido gravado);
// - ok fica como linha permanente (data, hora, quem); o toast some em 4 s;
// - erro fica enquanto existir e traz "Tentar de novo" (ou "Corrigir").
export function useStatusAcao(quem?: string | null) {
  const [estado, setEstado] = useState<EstadoAcao>({ fase: 'parado' })
  const ultima = useRef<(() => Promise<unknown>) | null>(null)
  const ocupado = useRef(false)

  const rodar = useCallback(
    async <T,>(opts: { verbo: string; enviando?: string; acao: () => Promise<T>; verificar?: (r: T) => Promise<boolean> }): Promise<T | undefined> => {
      if (ocupado.current) return undefined // duplo clique nao repete (G: idempotencia no cliente)
      ocupado.current = true
      ultima.current = () => rodar(opts)
      setEstado({ fase: 'enviando', texto: opts.enviando ?? 'Enviando...' })
      try {
        const r = await opts.acao()
        if (opts.verificar && !(await opts.verificar(r))) throw new Error('Nao consegui confirmar a gravacao ao reler o registro.')
        const quando = new Date().toISOString()
        setEstado({ fase: 'ok', texto: linhaConfirmacao(opts.verbo, quando, quem), quando, quem })
        mostrarToast(opts.verbo, 'sucesso')
        return r
      } catch (e) {
        setEstado({ fase: 'erro', texto: mensagemClara(e) })
        return undefined
      } finally {
        ocupado.current = false
      }
    },
    [quem],
  )
  const tentarDeNovo = useCallback(() => { void ultima.current?.() }, [])
  /** Estado permanente vindo do banco (ex.: ao reabrir a tela): mostra a mesma linha sem precisar de nova acao. */
  const definirDoBanco = useCallback((verbo: string, quando: string | null | undefined, quemFez?: string | null) => {
    setEstado(quando ? { fase: 'ok', texto: linhaConfirmacao(verbo, quando, quemFez), quando, quem: quemFez } : { fase: 'parado' })
  }, [])
  return { estado, rodar, tentarDeNovo, definirDoBanco, enviando: estado.fase === 'enviando' }
}

export function LinhaStatus({ estado, onTentarDeNovo, rotuloCorrigir = 'Tentar de novo', extra }: { estado: EstadoAcao; onTentarDeNovo?: () => void; rotuloCorrigir?: string; extra?: ReactNode }) {
  if (estado.fase === 'parado') return null
  const cor = estado.fase === 'erro' ? 'var(--rbr-danger)' : estado.fase === 'ok' ? 'var(--rbr-success, #15803d)' : 'var(--rbr-muted)'
  return (
    <div role={estado.fase === 'erro' ? 'alert' : 'status'} style={{ fontSize: 12, fontWeight: 600, color: cor, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{estado.fase === 'ok' ? '✓ ' : estado.fase === 'erro' ? '✗ ' : '… '}{estado.texto}</span>
      {estado.fase === 'erro' && onTentarDeNovo && (
        <button type="button" onClick={onTentarDeNovo} style={{ textDecoration: 'underline', fontWeight: 700 }}>{rotuloCorrigir}</button>
      )}
      {extra}
    </div>
  )
}
