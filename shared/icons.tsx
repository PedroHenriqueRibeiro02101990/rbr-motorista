// Ícones SVG inline (sem lib externa) — mesmos traços usados no canvas de design aprovado.
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

export const IconHome = (p: IconProps) =>
  base(
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </>,
    p,
  )

export const IconTruck = (p: IconProps) =>
  base(
    <>
      <rect x="1" y="6" width="13" height="10" rx="1" />
      <path d="M14 10h4l4 4v2h-8z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>,
    p,
  )

export const IconWallet = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.2c0 1.1.9 1.6 3 2.1s3 1 3 2.2c0 1.2-1.3 2.2-3 2.2s-3-1.1-3-2.5" />
    </>,
    p,
  )

export const IconStar = (p: IconProps) =>
  base(<path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.9 6.4 20.1l1.4-6.3L3 9.5l6.4-.6z" />, p)

export const IconUser = (p: IconProps) =>
  base(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>,
    p,
  )

export const IconQuote = (p: IconProps) =>
  base(
    <>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 15h6M9 12h3" />
    </>,
    p,
  )

export const IconUsers = (p: IconProps) =>
  base(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
      <circle cx="17.5" cy="9" r="2.6" />
      <path d="M15.5 14.3c2.2.2 3.9 1.6 4.8 4" />
    </>,
    p,
  )

export const IconBox = (p: IconProps) =>
  base(
    <>
      <rect x="3" y="5" width="4" height="4" />
      <rect x="3" y="11" width="4" height="4" />
      <rect x="3" y="17" width="4" height="4" />
      <line x1="10" y1="7" x2="21" y2="7" />
      <line x1="10" y1="13" x2="21" y2="13" />
      <line x1="10" y1="19" x2="21" y2="19" />
    </>,
    p,
  )

export const IconChevronRight = (p: IconProps) => base(<path d="M9 6l6 6-6 6" />, p)
export const IconMapPin = (p: IconProps) =>
  base(
    <>
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>,
    p,
  )
export const IconLogOut = (p: IconProps) =>
  base(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>,
    p,
  )
export const IconCheck = (p: IconProps) => base(<path d="M20 6L9 17l-5-5" />, p)
export const IconCamera = (p: IconProps) =>
  base(
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </>,
    p,
  )
