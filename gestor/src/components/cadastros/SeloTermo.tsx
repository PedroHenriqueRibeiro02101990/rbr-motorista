import { useEffect, useState } from 'react'
import { dbNovo } from '@rbr/shared/dbNovo'

// Tarefas 7/9: o parceiro aceitou a versão publicada do termo/contrato? (aceites_termo; só o gestor lê)

export type AceitesPrestador = { versao: number | null; termoId: string | null; aceites: Map<string, { aceito_em: string; aceite_id: string }> }

export function useAceitesPrestador(): AceitesPrestador {
  const [r, setR] = useState<AceitesPrestador>({ versao: null, termoId: null, aceites: new Map() })
  useEffect(() => {
    void (async () => {
      const { data: t } = await dbNovo.from('termos_contrato').select('id, versao').eq('tipo', 'prestador').eq('status', 'publicado').maybeSingle()
      const termo = t as { id: string; versao: number } | null
      if (!termo) return
      const { data } = await dbNovo.from('aceites_termo').select('id, pessoa_id, aceito_em').eq('termo_id', termo.id)
      setR({
        versao: termo.versao,
        termoId: termo.id,
        aceites: new Map(((data ?? []) as { id: string; pessoa_id: string; aceito_em: string }[]).map((a) => [a.pessoa_id, { aceito_em: a.aceito_em, aceite_id: a.id }])),
      })
    })()
  }, [])
  return r
}

export function SeloTermo({ pessoaId, a }: { pessoaId: string; a: AceitesPrestador }) {
  if (a.versao == null) return null
  const aceite = a.aceites.get(pessoaId)
  return aceite ? (
    <span
      title={`Aceito em ${new Date(aceite.aceito_em).toLocaleString('pt-BR')}`}
      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}
    >
      Contrato v{a.versao} aceito
    </span>
  ) : (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
      Falta aceite v{a.versao}
    </span>
  )
}
