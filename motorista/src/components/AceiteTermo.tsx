import { useCallback, useEffect, useState } from 'react'
import { dbNovo } from '@rbr/shared/dbNovo'

// Tarefas 7 e 9: antes de usar o app, o parceiro aceita a versão publicada do termo/contrato marcando "Li e aceito"
// em CADA cláusula, separadamente. Versão nova publicada = novo aceite no próximo acesso.
// A evidência (hash SHA-256, cláusulas, data/hora UTC, IP, aparelho) é gravada pelo banco (aceitar_termo).

export type TermoPendente = {
  termo_id: string
  tipo: string
  versao: number
  titulo: string
  minuta: boolean
  texto: string
  clausulas: { codigo: string; texto: string }[]
  ja_aceitou_versao_anterior: boolean
}
export type AceiteFeito = { aceite_id: string; aceito_em: string; hash: string; ip: string | null }

export default function AceiteTermo({
  children,
  onAceito,
}: {
  children: React.ReactNode
  onAceito?: (t: TermoPendente, a: AceiteFeito) => Promise<void> | void
}) {
  const [termo, setTermo] = useState<TermoPendente | null | undefined>(undefined)
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await dbNovo.rpc('meu_termo_pendente', { p_tipo: 'prestador' })
    // Se a função ainda não existe no banco (migration não aplicada), não trava o app.
    if (error) return setTermo(null)
    setTermo((data as TermoPendente | null) ?? null)
    setMarcadas({})
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (termo === undefined) return <div className="min-h-dvh flex items-center justify-center text-[color:var(--rbr-navy)]">Carregando…</div>
  if (termo === null) return <>{children}</>

  const todas = termo.clausulas.every((c) => marcadas[c.codigo])

  async function aceitar() {
    if (!termo) return
    setErro(null)
    setEnviando(true)
    try {
      const { data, error } = await dbNovo.rpc('aceitar_termo', { p_termo: termo.termo_id, p_clausulas: marcadas, p_user_agent: navigator.userAgent })
      if (error) throw new Error(error.message)
      const a = data as AceiteFeito
      setFeito(`✓ Aceite registrado em ${new Date(a.aceito_em).toLocaleString('pt-BR')}.`)
      await onAceito?.(termo, a)
      await carregar()
    } catch (e) {
      setErro('✗ ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-dvh px-5 py-8 max-w-xl mx-auto flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Versão {termo.versao}</div>
        <h1 className="rbr-display font-bold text-2xl text-[color:var(--rbr-navy-dark)]">{termo.titulo}</h1>
        {termo.ja_aceitou_versao_anterior && (
          <div className="text-xs mt-1 text-[color:var(--rbr-navy)]">O texto foi atualizado. Para continuar usando o app, leia e aceite a versão nova.</div>
        )}
        {termo.minuta && (
          <div className="text-[11px] font-bold mt-1" style={{ color: '#8A5A00' }}>
            Minuta para revisão jurídica
          </div>
        )}
      </div>
      <div className="text-sm whitespace-pre-line bg-white border rounded-2xl p-4 max-h-[45vh] overflow-auto" style={{ borderColor: 'var(--rbr-border)' }}>
        {termo.texto}
      </div>
      <div className="flex flex-col gap-2">
        {termo.clausulas.map((c) => (
          <label
            key={c.codigo}
            className="flex gap-3 items-start bg-white border rounded-2xl p-3.5 cursor-pointer"
            style={{ borderColor: marcadas[c.codigo] ? 'var(--rbr-positive)' : 'var(--rbr-border)' }}
          >
            <input
              type="checkbox"
              className="mt-1 w-5 h-5 flex-shrink-0"
              checked={!!marcadas[c.codigo]}
              onChange={(e) => setMarcadas((m) => ({ ...m, [c.codigo]: e.target.checked }))}
            />
            <span className="text-sm">
              <span className="font-bold">
                {c.codigo}. Li e aceito:{' '}
              </span>
              {c.texto}
            </span>
          </label>
        ))}
      </div>
      {erro && <div className="text-sm font-semibold" style={{ color: 'var(--rbr-danger)' }}>{erro}</div>}
      {feito && <div className="text-sm font-semibold" style={{ color: 'var(--rbr-positive)' }}>{feito}</div>}
      <button
        type="button"
        disabled={!todas || enviando}
        onClick={() => void aceitar()}
        className="rounded-xl py-3 font-bold text-sm disabled:opacity-50"
        style={{ background: 'var(--rbr-navy)', color: '#fff' }}
      >
        {enviando ? 'enviando…' : todas ? 'Aceitar e continuar' : `Marque as ${termo.clausulas.length} cláusulas para continuar`}
      </button>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">
        Ao aceitar, guardamos a data e hora, o IP, o aparelho e um código (hash) do texto aceito, como comprovante.
      </div>
    </div>
  )
}
