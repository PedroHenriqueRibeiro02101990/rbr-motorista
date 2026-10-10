import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { msgErro } from '../../lib/novoDb'
import { Aviso, inputClass, inputStyle } from '../financeiro/ui'

// Upload do comprovante de residência (mesmo bucket e pasta dos documentos pessoais).
export default function ComprovanteResidencia({
  pessoaId,
  url,
  data,
  onChange,
}: {
  pessoaId: string | null
  url: string
  data: string
  onChange: (url: string, data: string) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  async function enviar(file: File) {
    setEnviando(true)
    setMsg(null)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `pessoa/${pessoaId ?? 'novo'}/comprovante_residencia-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('documentos-pessoais').upload(path, file, { contentType: file.type || undefined })
      if (error) throw error
      onChange(path, data || new Date().toISOString().slice(0, 10))
      setMsg({ tipo: 'ok', texto: '✓ Comprovante enviado. Lendo a data automaticamente…' })
      // Leitura automática da data de emissão (não bloqueia: se falhar, o gestor digita a data).
      const { data: lido } = await supabase.functions.invoke('extrair-documento', { body: { tipo: 'comprovante_residencia', path } })
      const emissao = lido?.sucesso ? (lido.campos?.data_emissao as string | null) : null
      if (emissao && /^\d{4}-\d{2}-\d{2}$/.test(emissao)) {
        onChange(path, emissao)
        setMsg({ tipo: 'ok', texto: `✓ Comprovante enviado; data lida: ${emissao.split('-').reverse().join('/')}. Salve o cadastro para guardar.` })
      } else {
        setMsg({ tipo: 'ok', texto: '✓ Comprovante enviado. Não consegui ler a data: confira o campo ao lado e salve o cadastro.' })
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: '✗ ' + msgErro(e) })
    } finally {
      setEnviando(false)
    }
  }

  async function ver() {
    const { data: s, error } = await supabase.storage.from('documentos-pessoais').createSignedUrl(url, 300)
    if (error || !s) return setMsg({ tipo: 'erro', texto: '✗ Não consegui abrir o arquivo.' })
    window.open(s.signedUrl, '_blank')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          Comprovante de residência (foto ou PDF)
          <input type="file" accept="image/*,application/pdf" disabled={enviando} onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} className="text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--rbr-muted)]">
          Data do comprovante
          <input type="date" value={data} onChange={(e) => onChange(url, e.target.value)} className={inputClass} style={inputStyle} />
        </label>
      </div>
      {enviando && <div className="text-[11px] text-[color:var(--rbr-muted)]">enviando…</div>}
      {url && !enviando && (
        <button type="button" onClick={ver} className="self-start text-[11px] font-bold text-[color:var(--rbr-navy)]">
          Ver comprovante enviado
        </button>
      )}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
    </div>
  )
}
