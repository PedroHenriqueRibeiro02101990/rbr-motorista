import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { jsPDF } from 'jspdf'
import { abrirPdfContrato, gerarESalvarPdfAceite } from '@rbr/shared/pdfAceite'

// Tarefas 7/9: o parceiro aceitou a versão publicada do termo/contrato? (aceites_termo; só o gestor lê)

export type AceitesPrestador = { versao: number | null; termoId: string | null; aceites: Map<string, { aceito_em: string; aceite_id: string }> }

export function useAceitesPrestador(): AceitesPrestador {
  const [r, setR] = useState<AceitesPrestador>({ versao: null, termoId: null, aceites: new Map() })
  useEffect(() => {
    void (async () => {
      const { data: t } = await supabase.from('termos_contrato').select('id, versao').eq('tipo', 'prestador').eq('status', 'publicado').maybeSingle()
      const termo = t as { id: string; versao: number } | null
      if (!termo) return
      const { data } = await supabase.from('aceites_termo').select('id, pessoa_id, aceito_em').eq('termo_id', termo.id)
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
  const [erro, setErro] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  if (a.versao == null) return null
  const aceite = a.aceites.get(pessoaId)
  // Tarefa 9: clique abre o PDF do contrato aceito (ou gera, se o app do motorista não conseguiu gerar).
  return aceite ? (
    <>
    <span
      role="button"
      tabIndex={0}
      title={`Aceito em ${new Date(aceite.aceito_em).toLocaleString('pt-BR')}. Clique para abrir o PDF.`}
      onClick={(e) => {
        e.stopPropagation()
        if (abrindo) return
        setErro(null)
        setAbrindo(true)
        void gerarESalvarPdfAceite(jsPDF, aceite.aceite_id)
          .then(abrirPdfContrato)
          .catch((err: unknown) => setErro('✗ ' + (err instanceof Error ? err.message : String(err))))
          .finally(() => setAbrindo(false))
      }}
      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap cursor-pointer underline"
      style={{ background: '#E7F5EC', color: 'var(--rbr-positive)' }}
    >
      {abrindo ? 'abrindo…' : `Contrato v${a.versao} aceito · PDF`}
    </span>
    {erro && <span className="text-[10px] font-semibold" style={{ color: 'var(--rbr-danger)' }}>{erro}</span>}
    </>
  ) : (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
      Falta aceite v{a.versao}
    </span>
  )
}
