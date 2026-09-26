// Ícones locais do app Motorista — não editar shared/icons.tsx (outro agente
// trabalha em paralelo nesse mesmo arquivo pelo app Agenciador). Mesmo
// traço/estilo dos ícones em @rbr/shared/icons.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (children: React.ReactNode, props: IconProps) => (
  <svg
    width={props.width ?? 20}
    height={props.height ?? 20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
)

export const IconAlertTriangle = (p: IconProps) =>
  base(
    <>
      <path d="M12 3.5l9.5 16.5H2.5z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </>,
    p,
  )

export const IconX = (p: IconProps) => base(<path d="M6 6l12 12M18 6L6 18" />, p)

export const IconClock = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>,
    p,
  )

export const IconFileText = (p: IconProps) =>
  base(
    <>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h6M9 9h2" />
    </>,
    p,
  )
