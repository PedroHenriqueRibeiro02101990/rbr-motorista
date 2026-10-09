import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { extrairErro } from './EventoFiscalModal'

// Download do PDF (DANFE/DACTE/DAMDFE) ou XML pela Edge Function `baixar-documento-fiscal`.
// Sucesso vem como arquivo: o supabase-js entrega Blob para application/pdf e texto para application/xml.
// Erro vem como JSON { sucesso:false, erro } — lido por extrairErro.

export type TipoDocumentoBaixavel = 'nfe' | 'cte' | 'mdfe'
type Formato = 'pdf' | 'xml'

const ROTULO_ARQUIVO: Record<TipoDocumentoBaixavel, string> = { nfe: 'NFe', cte: 'CTe', mdfe: 'MDFe' }

function nomeDoHeader(response: Response | undefined): string | null {
  const cd = response?.headers.get('content-disposition')
  const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return m ? decodeURIComponent(m[1]) : null
}

// Dispara o download; se o navegador não deixar (alguns celulares), abre o arquivo em nova aba.
function salvarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    const aba = window.open(url, '_blank')
    if (!aba) window.location.assign(url)
  }
  // Dá tempo para o navegador/aba nova ler o arquivo antes de liberar a URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function BaixarDocumentoFiscal({
  operacaoId,
  tipo,
  chave,
}: {
  operacaoId: string
  tipo: TipoDocumentoBaixavel
  chave: string | null
}) {
  const [baixando, setBaixando] = useState<Formato | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function baixar(formato: Formato) {
    setBaixando(formato)
    setErro(null)
    try {
      const { data, error, response } = await supabase.functions.invoke<Blob | string>('baixar-documento-fiscal', {
        body: { operacao_id: operacaoId, tipo, formato },
      })
      if (error || data == null) {
        setErro(error ? await extrairErro(error) : 'A função não devolveu o arquivo.')
        return
      }
      const mime = formato === 'pdf' ? 'application/pdf' : 'application/xml'
      const blob = data instanceof Blob ? data : new Blob([String(data)], { type: mime })
      const nome =
        nomeDoHeader(response) ?? `${ROTULO_ARQUIVO[tipo]}-${(chave ?? '').replace(/\D/g, '') || operacaoId}.${formato}`
      salvarArquivo(blob, nome)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado ao baixar o arquivo.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <button
          onClick={() => baixar('pdf')}
          disabled={baixando !== null}
          className="text-[11px] font-bold px-2.5 py-1 rounded-lg border disabled:opacity-60"
          style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
        >
          {baixando === 'pdf' ? 'Baixando…' : 'Baixar PDF'}
        </button>
        <button
          onClick={() => baixar('xml')}
          disabled={baixando !== null}
          className="text-[11px] font-bold underline disabled:opacity-60"
          style={{ color: 'var(--rbr-navy)' }}
        >
          {baixando === 'xml' ? 'Baixando…' : 'XML'}
        </button>
      </span>
      {erro && (
        <span className="text-[11px] rounded-lg px-2.5 py-1.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          {erro}
        </span>
      )}
    </span>
  )
}
