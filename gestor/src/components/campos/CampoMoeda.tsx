import { useState, type CSSProperties } from 'react'
import { formatarMoeda, TETO_MOEDA_PADRAO, centavosDeDigitos, paraNumeroBR, precisaConfirmarTeto, textoConfirmacaoTeto } from '../../../../supabase/functions/_shared/unidades-br.ts'

// Regra G2: unico componente para valor em reais. Mascara de CENTAVOS: digitar 150025 mostra R$ 1.500,25; ninguem digita ponto nem virgula.
// Troca direta de <input type="number">: `value` e `onChange(e)` continuam texto decimal ("1500.25"), entao o estado das telas nao muda.
// Valor acima do teto (padrao R$ 100.000,00) pede "Confirma R$ 100.000,00?" ao sair do campo.
interface Props {
  value: string | number | null | undefined
  onChange: (e: { target: { value: string } }) => void
  teto?: number
  placeholder?: string
  className?: string
  style?: CSSProperties
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function valorDecimalTexto(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const n = paraNumeroBR(v) // aceita "1500.25" e tambem o formato brasileiro "1.500,25" de estados antigos
  return n !== null ? n.toFixed(2) : ''
}

export default function CampoMoeda({ value, onChange, teto = TETO_MOEDA_PADRAO, placeholder = 'R$ 0,00', className, style, disabled, id, ...rest }: Props) {
  const [pendente, setPendente] = useState(false)
  const texto = valorDecimalTexto(value)
  const exibido = texto === '' ? '' : formatarMoeda(Number(texto))

  function aoDigitar(bruto: string) {
    const cent = centavosDeDigitos(bruto)
    if (!bruto.replace(/\D/g, '')) return onChange({ target: { value: '' } })
    onChange({ target: { value: (cent / 100).toFixed(2) } })
    setPendente(true)
  }

  function aoSair() {
    if (!pendente) return
    setPendente(false)
    const n = Number(texto)
    if (texto !== '' && precisaConfirmarTeto(n, teto) && !window.confirm(textoConfirmacaoTeto(n))) onChange({ target: { value: '' } })
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={exibido}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={style}
      aria-label={rest['aria-label']}
      onChange={(e) => aoDigitar(e.target.value)}
      onBlur={aoSair}
    />
  )
}
