import { useState, type CSSProperties } from 'react'
import { formatarKg, lerPesoKg } from '../../../../supabase/functions/_shared/unidades-br.ts'

// Regra G1: peso (tara, capacidade, PBT, CMT) so em KG inteiro, exibido como "25.500 kg".
// "25,5" e "25.5" sao RECUSADOS com "Tara e em kg. Voce quis dizer 25.500?" — a tela nunca converte sozinha.
// Troca direta de <input type="number">: `value` e `onChange(e)` continuam texto ("25500"). Valor recusado emite '' (nada e gravado).
interface Props {
  value?: string | number | null
  /** uso sem controle (como input nao controlado) */
  defaultValue?: string | number | null
  onChange: (e: { target: { value: string } }) => void
  rotulo?: string
  placeholder?: string
  className?: string
  style?: CSSProperties
  disabled?: boolean
  id?: string
}

export default function CampoPeso({ value: valorControlado, defaultValue, onChange: aoMudar, rotulo = 'Tara', placeholder = 'kg', className, style, disabled, id }: Props) {
  const [digitado, setDigitado] = useState<string | null>(null) // texto cru enquanto edita
  const [erro, setErro] = useState<string | null>(null)
  const [interno, setInterno] = useState<string | number | null | undefined>(defaultValue)
  const value = valorControlado !== undefined ? valorControlado : interno
  const onChange = (e: { target: { value: string } }) => { setInterno(e.target.value); aoMudar(e) }
  const kg = value === null || value === undefined || value === '' ? null : Number(value)
  const base = kg !== null && Number.isFinite(kg) ? formatarKg(kg) : ''

  function aoDigitar(txt: string) {
    setDigitado(txt)
    if (!txt.trim()) { setErro(null); return onChange({ target: { value: '' } }) }
    const r = lerPesoKg(txt, rotulo)
    if (r.ok) { setErro(null); onChange({ target: { value: String(r.kg) } }) }
    else { setErro(r.mensagem); onChange({ target: { value: '' } }) }
  }

  return (
    <span style={{ display: 'block' }}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={digitado ?? base}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={{ ...style, ...(erro ? { borderColor: 'var(--rbr-danger)' } : null) }}
        aria-invalid={erro ? true : undefined}
        onFocus={() => setDigitado(base.replace(/\s*kg$/, ''))}
        onChange={(e) => aoDigitar(e.target.value)}
        onBlur={() => { if (!erro) setDigitado(null) }}
      />
      {erro && <span role="alert" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--rbr-danger)', marginTop: 2 }}>{erro}</span>}
    </span>
  )
}
