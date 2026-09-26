// Ícones SVG inline locais (não editar shared/icons.tsx — outro agente pode estar usando).
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

export const IconPlus = (p: IconProps) => base(<path d="M12 5v14M5 12h14" />, p)
export const IconEdit = (p: IconProps) =>
  base(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>,
    p,
  )
export const IconX = (p: IconProps) => base(<path d="M18 6L6 18M6 6l12 12" />, p)
export const IconArchive = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 13h4" />
    </>,
    p,
  )
export const IconFileText = (p: IconProps) =>
  base(
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 15h6M9 12h3M9 18h4" />
    </>,
    p,
  )
export const IconAlertTriangle = (p: IconProps) =>
  base(
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>,
    p,
  )
