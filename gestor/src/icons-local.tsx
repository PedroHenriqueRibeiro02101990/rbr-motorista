// Ícones locais do app Gestor — não editar shared/icons.tsx (outros apps
// dependem dele). Mesmo traço/estilo dos ícones em @rbr/shared/icons.
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

export const IconSearch = (p: IconProps) =>
  base(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>,
    p,
  )

export const IconX = (p: IconProps) => base(<path d="M18 6L6 18M6 6l12 12" />, p)

export const IconMenu = (p: IconProps) =>
  base(
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>,
    p,
  )

export const IconCopy = (p: IconProps) =>
  base(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>,
    p,
  )

export const IconClock = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
    p,
  )

export const IconFileText = (p: IconProps) =>
  base(
    <>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 12.5h6" />
      <path d="M9 16h6" />
    </>,
    p,
  )

export const IconClipboard = (p: IconProps) =>
  base(
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <path d="M9 4.5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" />
      <path d="M9 11h6" />
      <path d="M9 14.5h6" />
      <path d="M9 18h4" />
    </>,
    p,
  )
