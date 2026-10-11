import { useState } from 'react'
import { dbNovo } from '@rbr/shared/dbNovo'
import { DOCUMENTO_CLIENTE_LABEL, type TipoDocumentoCliente } from '@rbr/shared/DocumentoCliente'

// Tarefa 6: documentos liberados para o agenciador, já filtrados pelo tipo detectado na operação
// (NFS-e quando o frete é dentro da capital; CT-e e MDF-e nos demais). RPC documentos_operacao_agenciador.

type Doc = { tipo: string; numero_documento: string | null; chave_acesso: string | null; url_pdf: string | null; url_xml: string | null; emitido_em: string | null }
const NOME: Record<string, string> = { nfse: 'NFS-e', cte: 'CT-e', mdfe: 'MDF-e' }

export default function BaixarDocumentacao({ operacaoId, tipo }: { operacaoId: string; tipo: TipoDocumentoCliente | null | undefined }) {
  const [aberto, setAberto] = useState(false)
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setAberto(true)
    setErro(null)
    const { data, error } = await dbNovo.rpc('documentos_operacao_agenciador', { p_operacao: operacaoId })
    if (error) setErro(error.message)
    setDocs((data ?? []) as Doc[])
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={() => (aberto ? setAberto(false) : void abrir())} className="text-xs font-bold text-[color:var(--rbr-navy)]">
        {aberto ? 'Fechar documentação' : 'Baixar documentação'}
      </button>
      {aberto && (
        <div className="mt-2 flex flex-col gap-1.5">
          {tipo !== undefined && (
            <div className="text-[11px] text-[color:var(--rbr-muted)]">Documento desta carga: {tipo ? DOCUMENTO_CLIENTE_LABEL[tipo] : 'a definir pela RBR'}</div>
          )}
          {erro && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-danger)' }}>✗ {erro}</div>}
          {docs === null && !erro && <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>}
          {docs?.length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhum documento liberado ainda.</div>}
          {docs?.map((d) => (
            <div key={d.tipo} className="flex items-center justify-between gap-2 text-xs border rounded-lg px-2.5 py-1.5" style={{ borderColor: 'var(--rbr-border)' }}>
              <span className="font-semibold">
                {NOME[d.tipo] ?? d.tipo.toUpperCase()} {d.numero_documento ?? ''}
              </span>
              <span className="flex gap-2">
                {d.url_pdf && (
                  <a href={d.url_pdf} target="_blank" rel="noreferrer" className="font-bold underline text-[color:var(--rbr-navy)]">
                    PDF
                  </a>
                )}
                {d.url_xml && (
                  <a href={d.url_xml} target="_blank" rel="noreferrer" className="font-bold underline text-[color:var(--rbr-navy)]">
                    XML
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
