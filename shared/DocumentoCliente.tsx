import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Tarefa 6: aviso automático do documento que a RBR vai emitir ao cliente, pela origem e destino (código IBGE).
// O usuário não escolhe: a regra fica no banco (detectar_documento_por_cidades / detectar_documento_cliente).

export type TipoDocumentoCliente = 'nfse' | 'cte_mdfe'
export type DeteccaoDocumento = { tipo: TipoDocumentoCliente | null; situacao: string; aviso: string }
type Local = { cidade: string | null | undefined; uf: string | null | undefined }

export const DOCUMENTO_CLIENTE_LABEL: Record<TipoDocumentoCliente, string> = { nfse: 'NFS-e (sem MDF-e)', cte_mdfe: 'CT-e + MDF-e' }

// pessoas/operacoes guardam o tipo como texto (com check): guarda de tipo para usar o rótulo sem cast.
export const ehTipoDocumento = (t: string | null | undefined): t is TipoDocumentoCliente => t === 'nfse' || t === 'cte_mdfe'
export const rotuloDocumento = (t: string | null | undefined) => (ehTipoDocumento(t) ? DOCUMENTO_CLIENTE_LABEL[t] : 'não definido')

export function estiloDeteccao(tipo: string | null | undefined) {
  return tipo ? { background: '#EEF1F8', color: 'var(--rbr-navy-dark)' } : { background: '#FDF1DC', color: '#8A5A00' }
}

export function useDocumentoCliente(origem: Local, destinos: Local[]) {
  const [r, setR] = useState<DeteccaoDocumento | null>(null)
  const chave = JSON.stringify([origem.cidade?.trim(), origem.uf?.trim(), destinos.map((d) => [d.cidade?.trim(), d.uf?.trim()])])
  useEffect(() => {
    const lista = destinos.filter((d) => d.cidade?.trim() || d.uf?.trim())
    const cidadeOrigem = origem.cidade?.trim()
    const ufOrigem = origem.uf?.trim()
    if (!cidadeOrigem || !ufOrigem || lista.length === 0) {
      setR(null)
      return
    }
    let vivo = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('detectar_documento_por_cidades', {
        p_cidade_origem: cidadeOrigem,
        p_uf_origem: ufOrigem,
        p_destinos: lista.map((d) => ({ cidade: d.cidade ?? '', uf: d.uf ?? '' })),
      })
      if (vivo) setR(error ? null : ((data as DeteccaoDocumento | null) ?? null))
    }, 500)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  return r
}

export function AvisoDocumentoCliente({ origem, destinos, compacto = false }: { origem: Local; destinos: Local[]; compacto?: boolean }) {
  const r = useDocumentoCliente(origem, destinos)
  if (!r) return null
  return (
    <div className={`rounded-lg ${compacto ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'} font-semibold`} style={estiloDeteccao(r.tipo)}>
      {r.aviso}
    </div>
  )
}
