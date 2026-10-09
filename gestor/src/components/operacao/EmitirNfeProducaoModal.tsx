import { useState } from 'react'

// Confirmação da NF-e de teste em PRODUÇÃO (emitir-nfe-teste-producao): nota REAL de R$ 1,00 da RBR para ela mesma,
// usada só no teste ponta a ponta do CT-e. A chamada fica em Fiscal.tsx (padrão dos outros botões fiscais).

export default function EmitirNfeProducaoModal({
  enviando,
  erro,
  motivos,
  onFechar,
  onConfirmar,
}: {
  enviando: boolean
  erro: string | null
  motivos?: string[]
  onFechar: () => void
  onConfirmar: () => void
}) {
  const [entendo, setEntendo] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(18,23,61,0.55)' }}>
      <div className="bg-white rounded-xl w-full max-w-md max-h-[92vh] flex flex-col" style={{ boxShadow: '0 20px 60px rgba(18,23,61,0.35)' }}>
        <div className="px-5 pt-4 pb-3 border-b flex flex-col gap-1.5" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-extrabold text-[color:var(--rbr-navy-dark)]">Emitir NF-e de teste (R$ 1,00)</span>
            <span
              className="text-[11px] font-extrabold uppercase tracking-wide text-white px-2.5 py-1 rounded-full"
              style={{ background: 'var(--rbr-danger)' }}
            >
              Produção
            </span>
          </div>
          <div className="text-xs font-bold" style={{ color: 'var(--rbr-danger)' }}>
            Esta NF-e é REAL e vale fiscalmente. Só para o teste; cancele em até 24 h.
          </div>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex flex-col gap-2.5">
          <div className="text-[11px] text-[color:var(--rbr-muted)]">
            A RBR emite para ela mesma (remetente e destinatária). Depois de enviar, use "Consultar NF-e" para ver se foi
            autorizada; autorizada, a chave vai para a cotação e o CT-e passa a citá-la.
          </div>

          <label className="flex items-center gap-2 text-[11px] text-[color:var(--rbr-navy-dark)] font-bold">
            <input type="checkbox" checked={entendo} onChange={(e) => setEntendo(e.target.checked)} />
            Entendo que é uma nota real
          </label>

          {(erro || (motivos && motivos.length > 0)) && (
            <div className="text-xs rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
              {motivos && motivos.length > 0 ? (
                <ul className="list-disc pl-4 flex flex-col gap-0.5">
                  {motivos.map((motivo, i) => (
                    <li key={i}>{motivo}</li>
                  ))}
                </ul>
              ) : (
                <span>{erro}</span>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <button
            onClick={onFechar}
            disabled={enviando}
            className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60"
            style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
          >
            Voltar
          </button>
          <button
            onClick={onConfirmar}
            disabled={!entendo || enviando}
            className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--rbr-danger)', color: '#fff' }}
          >
            {enviando ? 'Enviando…' : 'Emitir NF-e real'}
          </button>
        </div>
      </div>
    </div>
  )
}
