// Faixa vermelha fixa das operações de teste (cotacoes.eh_teste / operacoes.eh_teste).
// Documentos reais na SEFAZ, valor R$ 1,00 — tudo cancelado no fim pelo botão "Cancelar tudo do teste".

export const TEXTO_FAIXA_TESTE = 'OPERAÇÃO DE TESTE — documentos reais na SEFAZ, valor R$ 1,00'

export default function FaixaTeste({ detalhe }: { detalhe?: string }) {
  return (
    <div
      role="alert"
      className="text-white text-xs font-extrabold uppercase tracking-wide px-3 py-2 rounded-lg"
      style={{ background: 'var(--rbr-danger)' }}
    >
      {TEXTO_FAIXA_TESTE}
      {detalhe && <span className="block normal-case font-semibold tracking-normal mt-0.5">{detalhe}</span>}
    </div>
  )
}

// Passo a passo do circuito de teste, com o estado de cada documento.
export function PassoAPassoTeste({
  nfe,
  cte,
  atm,
  mdfe,
}: {
  nfe: boolean
  cte: string | null
  atm: string | null
  mdfe: string | null
}) {
  const passos: Array<{ rotulo: string; feito: boolean; estado: string }> = [
    { rotulo: '1. NF-e de teste (R$ 1,00, RBR → RBR)', feito: nfe, estado: nfe ? 'autorizada' : 'emitir e consultar' },
    { rotulo: '2. CT-e', feito: cte === 'emitido', estado: cte ?? 'pendente' },
    { rotulo: '3. Averbação (AT&M)', feito: atm === 'emitido', estado: atm ?? 'pendente' },
    { rotulo: '4. MDF-e', feito: mdfe === 'emitido', estado: mdfe ?? 'pendente' },
    { rotulo: '5. Cancelar tudo (MDF-e → CT-e → NF-e; NF-e em até 24 h)', feito: false, estado: 'no fim do teste' },
  ]
  return (
    <ol className="flex flex-col gap-1 text-xs">
      {passos.map((p) => (
        <li key={p.rotulo} className="flex items-center justify-between gap-2">
          <span className={p.feito ? 'font-bold' : ''}>
            {p.feito ? '✓ ' : ''}
            {p.rotulo}
          </span>
          <span className="text-[color:var(--rbr-muted)]">{p.estado}</span>
        </li>
      ))}
    </ol>
  )
}
