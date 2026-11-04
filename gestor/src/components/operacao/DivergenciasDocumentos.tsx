import type { DetalheOperacao } from '../../lib/operacaoDetalhe'
import { divergenciasDocumentos } from '../../lib/divergenciasDocumentos'

// B6: conferência entre a NF e os documentos (peso, valor, NCM). Só aparece quando há alerta; só lê.
export default function DivergenciasDocumentos({ d }: { d: DetalheOperacao }) {
  const op = d.operacao
  const cte = d.documentos.find((x) => x.tipo === 'cte')
  const mdfe = d.documentos.find((x) => x.tipo === 'mdfe')
  const alertas = divergenciasDocumentos({
    pesoNf: op.peso_bruto != null ? Number(op.peso_bruto) : null,
    valorNf: op.valor_declarado_nfe != null ? Number(op.valor_declarado_nfe) : null,
    ncmNf: (d.cotacao?.ncms_produtos ?? [])[0] ?? null,
    cte: (cte?.payload_enviado as Record<string, unknown> | null) ?? null,
    mdfe: (mdfe?.payload_enviado as Record<string, unknown> | null) ?? null,
  })
  if (alertas.length === 0) return null
  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-2" style={{ borderColor: '#f0d9a8' }} role="status">
      <div className="text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">CONFERÊNCIA ENTRE A NF E OS DOCUMENTOS</div>
      {alertas.map((a) => (
        <div key={a.texto} className="text-[12px] rounded-lg px-3 py-2" style={a.gravidade === 'bloqueia' ? { background: '#fbe3e1', color: '#7d1a12' } : { background: '#fff0d6', color: '#7a5200' }}>
          {a.gravidade === 'bloqueia' ? '✕ ' : '! '}
          {a.texto}
        </div>
      ))}
      <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Só informa. O CIOT e o VPO ainda não entram nesta conferência.</div>
    </div>
  )
}
