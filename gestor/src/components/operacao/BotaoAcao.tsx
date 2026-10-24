import { useState } from 'react'

type Estado = { tipo: 'ocioso' } | { tipo: 'enviando' } | { tipo: 'ok'; msg: string } | { tipo: 'erro'; msg: string }

// Componente único de ação da Operação: botão que fica "enviando…" e desabilitado enquanto roda; depois ✓ com o que
// aconteceu, ou ✗ com a falha. Todo botão novo da tela usa este, para o feedback ser igual em todo lugar.
export default function BotaoAcao({ rotulo, fazer }: { rotulo: string; fazer: () => Promise<string | void> }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' })

  async function clicar() {
    setEstado({ tipo: 'enviando' })
    try {
      const msg = await fazer()
      setEstado({ tipo: 'ok', msg: msg || 'Feito.' })
    } catch (e) {
      setEstado({ tipo: 'erro', msg: (e as { message?: string })?.message || 'Não deu certo. Tente de novo.' })
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={estado.tipo === 'enviando'}
        onClick={() => void clicar()}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-60"
        style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy)', background: '#fff' }}
      >
        {estado.tipo === 'enviando' ? 'enviando…' : rotulo}
      </button>
      {estado.tipo === 'ok' && (
        <span className="text-xs font-semibold" style={{ color: '#137A45' }}>
          ✓ {estado.msg}
        </span>
      )}
      {estado.tipo === 'erro' && (
        <span className="text-xs font-semibold" style={{ color: 'var(--rbr-danger)' }}>
          ✗ {estado.msg}
        </span>
      )}
    </div>
  )
}
