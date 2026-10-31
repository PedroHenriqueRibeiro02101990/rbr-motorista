import DevolverOperacao from './DevolverOperacao'
import AvisoJanelaEmissao from './AvisoJanelaEmissao'

// Painel do Fiscal (visuais Fiscal-Servico e Fiscal-Erro): esteira de emissão com o estado de cada etapa, o que deu errado e "Algo errado?".
// Só leitura do que a tela já carrega; emitir, reemitir e cancelar continuam nos cartões de documento abaixo (lógica intacta).
type Doc = { tipo: string; status: string; numero_documento?: string | null; mensagem_erro?: string | null; emitido_em?: string | null }

const ETAPAS: { tipo: string; rotulo: string; vazio: string }[] = [
  { tipo: 'cte', rotulo: 'CT-e', vazio: 'Ainda não emitido' },
  { tipo: 'atm', rotulo: 'Averbação do CT-e', vazio: 'Automática após o CT-e' },
  { tipo: 'vpo', rotulo: 'Vale-pedágio (VPO)', vazio: 'Rota sem pedágio não precisa' },
  { tipo: 'ciot', rotulo: 'CIOT', vazio: 'Ainda não emitido' },
  { tipo: 'mdfe', rotulo: 'MDF-e', vazio: 'Libera quando CIOT e VPO (se houver) estiverem emitidos' },
]

export default function EsteiraEmissao({ operacaoId, status, docs, onDevolvida }: { operacaoId: string; status: string; docs: Doc[]; onDevolvida: () => void }) {
  const estado = (tipo: string) => docs.find((d) => d.tipo === tipo)
  const feitas = ETAPAS.filter((e) => estado(e.tipo)?.status === 'emitido').length
  const comErro = ETAPAS.map((e) => ({ e, d: estado(e.tipo) })).filter((x) => x.d && (x.d.status === 'erro' || x.d.status === 'bloqueado'))
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
      <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
          ESTEIRA DE EMISSÃO · {feitas} DE {ETAPAS.length} CONCLUÍDAS
        </div>
        {ETAPAS.map((e) => {
          const d = estado(e.tipo)
          const ok = d?.status === 'emitido'
          const erro = d?.status === 'erro' || d?.status === 'bloqueado'
          return (
            <div key={e.tipo} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5" style={{ borderColor: erro ? '#f2c4c0' : 'var(--rbr-border)', background: erro ? '#fff7f6' : ok ? '#fff' : '#fafbfd' }}>
              <span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[13px] font-extrabold flex-shrink-0" style={{ background: erro ? '#fbe3e1' : ok ? '#d6ecdf' : '#eef0f5', color: erro ? '#b42318' : ok ? '#1a6b3c' : '#8a91ad' }}>
                {erro ? '✕' : ok ? '✓' : '•'}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold">{e.rotulo}</div>
                <div className="text-[12px]" style={{ color: erro ? '#b42318' : 'var(--rbr-muted)' }}>
                  {erro ? (d?.mensagem_erro ?? 'Rejeitado') : ok ? `${d?.numero_documento ? `nº ${d.numero_documento} · ` : ''}emitido` : d ? 'Em andamento' : e.vazio}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-3.5">
        {comErro.length > 0 && (
          <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: '#f2c4c0' }}>
            <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
              O QUE DEU ERRADO
            </div>
            {comErro.map((x) => (
              <div key={x.e.tipo} className="rounded-xl px-3.5 py-3 text-[13px]" style={{ background: '#fbe3e1', color: '#7d1a12' }}>
                <b>{x.e.rotulo} com problema.</b> {x.d?.mensagem_erro ?? 'Sem mensagem do órgão.'}
              </div>
            ))}
            <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
              As etapas anteriores seguem válidas. Reemitir pelo cartão do documento abaixo usa o mesmo pedido.
            </div>
          </div>
        )}
        <AvisoJanelaEmissao operacaoId={operacaoId} />
        <div className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
            ALGO ERRADO?
          </div>
          <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
            Devolva à Operação com o motivo, ou desfaça o que já foi emitido (cancelar fica no cartão de cada documento, abaixo).
          </div>
          {status === 'aguardando_liberacao_fiscal' ? <DevolverOperacao operacaoId={operacaoId} onDevolvida={onDevolvida} /> : <div className="text-[12px]" style={{ color: '#8a91ad' }}>Devolver só aparece enquanto a operação aguarda o fiscal.</div>}
        </div>
      </div>
    </div>
  )
}
