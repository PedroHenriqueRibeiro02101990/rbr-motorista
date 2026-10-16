// Selo de documento fiscal enviado e ainda sem resposta da SEFAZ. Some sozinho quando o robô grava o resultado.
export default function SeloProcessando() {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
      style={{ background: 'var(--rbr-navy-tint)', color: 'var(--rbr-navy)' }}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="11" height="11" className="animate-spin motion-reduce:animate-none">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      Processando na SEFAZ…
    </span>
  )
}
