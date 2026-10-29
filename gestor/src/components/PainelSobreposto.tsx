import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { IconX } from '../icons-local'

// Painel que abre por cima da tela (padrão visual da Cotação): fundo desfocado, scroll do fundo travado,
// fecha SÓ no X, no botão "Fechar" e no Esc. Clicar fora NÃO fecha (fechava sem querer e perdia o que
// estava preenchido). O Esc é ignorado quando há outro modal (role="dialog") aberto por cima.
export function PainelSobreposto({
  titulo,
  cabecalho,
  onFechar,
  largura = 760,
  rodape = true,
  fixo,
  cartaoProps,
  children,
}: {
  titulo?: ReactNode
  // Conteúdo extra do cabeçalho (badge de status etc.), ao lado do título.
  cabecalho?: ReactNode
  // Chamado pelo X, pelo botão Fechar e pelo Esc; quem usa decide se pede confirmação.
  onFechar: () => void
  largura?: number
  rodape?: boolean
  // Linhas extras do cabeçalho (resumo, navegação). O cabeçalho inteiro fica fixo no topo ao rolar o painel.
  fixo?: ReactNode
  cartaoProps?: HTMLAttributes<HTMLDivElement>
  children: ReactNode
}) {
  const fecharRef = useRef(onFechar)
  useEffect(() => {
    fecharRef.current = onFechar
  })

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowAnterior
    }
  }, [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      fecharRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-0 py-0 md:px-3 md:py-10"
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div
        {...cartaoProps}
        className="w-full bg-white border md:rounded-[20px] p-[18px] flex flex-col gap-4 min-h-full md:min-h-0 md:my-auto"
        style={{
          borderColor: 'var(--rbr-border)',
          boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)',
          maxWidth: largura,
        }}
      >
        <div className="sticky top-0 z-10 bg-white -mx-[18px] -mt-[18px] px-[18px] pt-[18px] pb-3 md:rounded-t-[20px] flex flex-col gap-2.5 border-b" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            {titulo != null && <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">{titulo}</div>}
            {cabecalho}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}
          >
            <IconX width={14} height={14} />
          </button>
        </div>
        {fixo}
        </div>
        {children}
        {rodape && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onFechar}
              className="text-xs font-bold px-4 py-2 rounded-lg border"
              style={{ borderColor: 'var(--rbr-border)' }}
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
