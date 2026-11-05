import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Botao, Cartao } from './ui'
import { redimensionarLogo, validarLogo } from '../lib/logo'

export function logoPublico(path?: string | null): string | null {
  return path ? supabase.storage.from('agenciador-logos').getPublicUrl(path).data.publicUrl : null
}

export default function LogoUpload({ pessoaId, logoPath, onMudou }: { pessoaId: string; logoPath?: string | null; onMudou: () => void }) {
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho'; t: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const url = logoPublico(logoPath)

  async function escolher(arq: File | undefined) {
    if (!arq) return
    const erro = validarLogo(arq.type, arq.size)
    if (erro) return setMsg({ tom: 'vermelho', t: erro })
    setEnviando(true)
    setMsg(null)
    try {
      const blob = await redimensionarLogo(arq)
      const path = `${pessoaId}/logo-${Date.now()}.png`
      const { error } = await supabase.storage.from('agenciador-logos').upload(path, blob, { contentType: 'image/png', upsert: true })
      if (error) throw error
      const { error: e2 } = await supabase.from('pessoas').update({ logo_path: path } as never).eq('id', pessoaId)
      if (e2) throw e2
      setMsg({ tom: 'verde', t: 'Logotipo atualizado. Ele já aparece no topo do painel.' })
      onMudou()
    } catch (e) {
      setMsg({ tom: 'vermelho', t: 'Não foi possível enviar o logotipo agora. ' + ((e as Error).message ?? '') })
    } finally {
      setEnviando(false)
    }
  }
  async function remover() {
    const { error } = await supabase.from('pessoas').update({ logo_path: null } as never).eq('id', pessoaId)
    if (error) return setMsg({ tom: 'vermelho', t: 'Não foi possível remover.' })
    setMsg({ tom: 'verde', t: 'Logotipo removido.' })
    onMudou()
  }
  return (
    <Cartao>
      <div className="rbr-display font-bold mb-2">Seu logotipo</div>
      <div className="flex items-center gap-4 flex-wrap">
        <span className="bg-white rounded-xl border p-1 flex items-center justify-center" style={{ borderColor: 'var(--rbr-border)', width: 72, height: 72 }}>
          {url ? <img src={url} alt="Logotipo" style={{ maxHeight: 64, maxWidth: 64, objectFit: 'contain' }} /> : <span className="text-xs text-[color:var(--rbr-muted)]">sem logo</span>}
        </span>
        <div className="text-[13px] text-[color:var(--rbr-muted)] flex-1 min-w-48">PNG, JPG ou WebP, até 1 MB. Ajustamos para no máximo 512 px. Aparece no topo do painel ao lado da marca RBR.</div>
        <label className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}>
          {enviando ? 'Enviando…' : url ? 'Trocar' : 'Enviar logotipo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviando} onChange={(e) => escolher(e.target.files?.[0])} />
        </label>
        {url && <Botao tipo="perigo" onClick={remover}>Remover</Botao>}
      </div>
      {msg && <div className="mt-3"><Aviso tom={msg.tom}>{msg.t}</Aviso></div>}
    </Cartao>
  )
}
