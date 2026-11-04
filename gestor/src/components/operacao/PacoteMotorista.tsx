import type { DetalheOperacao } from '../../lib/operacaoDetalhe'

// B9 (parcial): documentos do motorista num só lugar. Lista os PDFs que já existem (DACTE, DAMDFE, VPO etc.) para abrir ou
// baixar um a um. Ainda NÃO junta tudo num único arquivo (isso pede uma biblioteca de PDF que não foi adicionada) e NÃO inclui
// o comprovante de eventos. O DAMDFE em PDF não muda com evento de condutor; o comprovante, quando existir, é apoio.
const ROTULO: Record<string, string> = { cte: 'DACTE (CT-e)', mdfe: 'DAMDFE (MDF-e)', vpo: 'Comprovante do vale-pedágio', ciot: 'Comprovante do CIOT', atm: 'Averbação do seguro', apolice_seguro: 'Apólice de seguro' }

export default function PacoteMotorista({ d }: { d: DetalheOperacao }) {
  const itens = d.documentos.filter((x) => x.url_pdf && ROTULO[x.tipo])
  if (itens.length === 0) return null
  return (
    <details className="bg-white border rounded-2xl" style={{ borderColor: 'var(--rbr-border)' }}>
      <summary className="cursor-pointer px-4 py-3 text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">DOCUMENTOS DO MOTORISTA ({itens.length})</summary>
      <div className="px-4 pb-4 flex flex-col gap-2">
        {itens.map((x) => (
          <a key={x.tipo} href={x.url_pdf as string} target="_blank" rel="noreferrer" className="flex items-center justify-between text-[13px] font-bold border rounded-xl px-3 py-2" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
            <span>{ROTULO[x.tipo]}</span>
            <span className="text-[11px]">Abrir PDF ↗</span>
          </a>
        ))}
        <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Hoje cada documento abre separado. O arquivo único e o comprovante de eventos de condutor ainda não existem.</div>
      </div>
    </details>
  )
}
