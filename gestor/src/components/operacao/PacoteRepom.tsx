import { useState } from 'react'
import type { DetalheOperacao } from '../../lib/operacaoDetalhe'
import { dadosRepom } from '../../lib/dadosRepom'
import { mostrarToast } from '../../lib/toast'

// B7: pacote de dados da Repom, para copiar campo a campo (regras em lib/dadosRepom.ts). Não envia nada.
export default function PacoteRepom({ d }: { d: DetalheOperacao }) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const linhas = dadosRepom(d)

  async function copiar(rotulo: string, valor: string) {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(rotulo)
      mostrarToast(`${rotulo} copiado.`, 'sucesso')
      window.setTimeout(() => setCopiado((c) => (c === rotulo ? null : c)), 2000)
    } catch {
      mostrarToast('Não consegui copiar. Selecione o valor e copie à mão.', 'erro')
    }
  }

  return (
    <details className="bg-white border rounded-2xl" style={{ borderColor: 'var(--rbr-border)' }}>
      <summary className="cursor-pointer px-4 py-3 text-[11px] font-extrabold tracking-[0.08em] text-[color:var(--rbr-muted)]">DADOS PARA A REPOM (copiar campo a campo)</summary>
      <div className="px-4 pb-4 flex flex-col gap-2">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-center gap-3 border-b pb-2 text-[13px]" style={{ borderColor: '#eef0f5' }}>
            <div className="w-[150px] flex-shrink-0 text-[12px] text-[color:var(--rbr-muted)]">{l.rotulo}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{l.valor || <span style={{ color: '#8a91ad' }}>em branco</span>}</div>
              {l.aviso && <div className="text-[11px]" style={{ color: '#7a5200' }}>{l.aviso}</div>}
            </div>
            <button type="button" disabled={!l.valor} onClick={() => void copiar(l.rotulo, l.valor)} className="text-[11px] font-extrabold px-3 py-1.5 rounded-[10px] border bg-white disabled:opacity-40 disabled:cursor-not-allowed" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>
              {copiado === l.rotulo ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        ))}
      </div>
    </details>
  )
}
