import { useCallback, useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { dbNovo } from '@rbr/shared/dbNovo'
import { abrirPdfContrato, gerarESalvarPdfAceite } from '@rbr/shared/pdfAceite'

// Tarefa 9: o motorista baixa o PDF do contrato que aceitou (bucket privado, link temporário).
type Linha = { aceite_id: string; titulo: string; versao: number; aceito_em: string; pdf_path: string | null; vigente: boolean }

export default function MeusContratos() {
  const [lista, setLista] = useState<Linha[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await dbNovo.rpc('meus_contratos')
    setLista(error ? [] : ((data ?? []) as Linha[]))
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!lista || lista.length === 0) return null

  async function baixar(l: Linha) {
    setOcupado(l.aceite_id)
    setMsg(null)
    try {
      const path = l.pdf_path ?? (await gerarESalvarPdfAceite(jsPDF, l.aceite_id))
      await abrirPdfContrato(path)
      if (!l.pdf_path) await carregar()
    } catch (e) {
      setMsg({ ok: false, t: '✗ ' + (e instanceof Error ? e.message : String(e)) })
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Meus contratos</div>
      {lista.map((l) => (
        <div key={l.aceite_id} className="flex items-center justify-between gap-2 text-xs">
          <span>
            {l.titulo} · v{l.versao} · aceito em {new Date(l.aceito_em).toLocaleDateString('pt-BR')}
            {l.vigente ? '' : ' (versão anterior)'}
          </span>
          <button type="button" disabled={ocupado === l.aceite_id} onClick={() => void baixar(l)} className="font-bold text-[color:var(--rbr-navy)] disabled:opacity-50">
            {ocupado === l.aceite_id ? 'enviando…' : 'Baixar PDF'}
          </button>
        </div>
      ))}
      {msg && <div className="text-xs font-semibold" style={{ color: msg.ok ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>{msg.t}</div>}
    </div>
  )
}
