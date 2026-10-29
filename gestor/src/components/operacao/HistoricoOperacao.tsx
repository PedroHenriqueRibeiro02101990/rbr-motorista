import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'

type Item = { id: string; quando: string; texto: string; detalhe?: string; ator?: string; ok?: boolean }

// Histórico da operação: o que o sistema e as pessoas fizeram (auditoria_log) e os eventos fiscais (emissões, cancelamentos).
// Só leitura, mais recente primeiro.
export default function HistoricoOperacao({ operacaoId }: { operacaoId: string }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [log, fiscal] = await Promise.all([
        supabase.from('auditoria_log').select('id, created_at, acao, entidade, pessoa_id_ator, papel').eq('entidade_id', operacaoId).order('created_at', { ascending: false }).limit(100),
        supabase.from('eventos_fiscais_operacao').select('id, created_at, evento, tipo_documento, sucesso, mensagem, origem').eq('operacao_id', operacaoId).order('created_at', { ascending: false }).limit(100),
      ])
      if (!vivo) return
      if (log.error && fiscal.error) {
        setErro(log.error.message)
        return
      }
      const atores = Array.from(new Set((log.data ?? []).map((l) => l.pessoa_id_ator).filter(Boolean))) as string[]
      const nomes: Record<string, string> = {}
      if (atores.length) {
        const { data } = await supabase.from('pessoas').select('id, nome').in('id', atores)
        for (const p of data ?? []) nomes[p.id] = p.nome
      }
      if (!vivo) return
      const lista: Item[] = [
        ...(log.data ?? []).map((l) => ({
          id: `a${l.id}`,
          quando: l.created_at,
          texto: l.acao.replace(/_/g, ' '),
          ator: l.pessoa_id_ator ? nomes[l.pessoa_id_ator] ?? l.papel ?? undefined : l.papel ?? 'sistema',
        })),
        ...(fiscal.data ?? []).map((f) => ({
          id: `f${f.id}`,
          quando: f.created_at,
          texto: `${f.tipo_documento.toUpperCase()}: ${f.evento.replace(/_/g, ' ')}`,
          detalhe: f.mensagem ?? undefined,
          ator: f.origem,
          ok: f.sucesso,
        })),
      ].sort((a, b) => b.quando.localeCompare(a.quando))
      setItens(lista)
    })().catch((e) => vivo && setErro(e instanceof Error ? e.message : 'Erro ao carregar o histórico.'))
    return () => {
      vivo = false
    }
  }, [operacaoId])

  if (erro) return <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>{erro}</div>
  if (!itens) return <div className="text-xs text-[color:var(--rbr-muted)]">Carregando histórico…</div>
  if (itens.length === 0) return <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum registro para esta operação ainda.</div>
  return (
    <ol className="flex flex-col list-none m-0 p-0 gap-2" aria-label="Histórico da operação">
      {itens.map((i) => (
        <li key={i.id} className="rounded-xl border px-3 py-2 text-xs flex flex-col gap-0.5" style={{ borderColor: i.ok === false ? '#F4C9C9' : 'var(--rbr-border)' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <b style={i.ok === false ? { color: 'var(--rbr-danger)' } : undefined}>{i.texto}</b>
            <span className="text-[color:var(--rbr-muted)] tabular-nums">{formatDateTime(i.quando)}</span>
          </div>
          {i.detalhe && <div className="text-[color:var(--rbr-muted)]">{i.detalhe}</div>}
          {i.ator && <div className="text-[color:var(--rbr-muted)]">por {i.ator}</div>}
        </li>
      ))}
    </ol>
  )
}
