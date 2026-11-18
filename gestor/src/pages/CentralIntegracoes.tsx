import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import { Card, Carregando } from '../components/financeiro/ui'
import { FORNECEDORES, resumir, type LinhaBruta, type ResumoFornecedor } from '../lib/centralIntegracoes'

// Central de integrações · aba "Que usamos". Só leitura: nenhum botão chama fornecedor, nenhuma escrita, nenhum segredo lido.
type Leitor = (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: LinhaBruta[] | null; error: unknown }> } } }

export default function CentralIntegracoes() {
  const [resumos, setResumos] = useState<Record<string, ResumoFornecedor> | null>(null)
  const [ambienteFocus, setAmbienteFocus] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      const de = supabase.from as unknown as Leitor
      const out: Record<string, ResumoFornecedor> = {}
      for (const f of FORNECEDORES) {
        if (!f.fonte) {
          out[f.id] = resumir(f, null)
          continue
        }
        const { tabela, colData, colResultado, colErro, colAmbiente } = f.fonte
        const cols = [colData, colResultado, colErro, colAmbiente].filter(Boolean).join(',')
        const { data, error } = await de(tabela).select(cols).order(colData, { ascending: false }).limit(200)
        out[f.id] = resumir(f, error ? null : data)
      }
      const { data: pf } = await supabase.from('parametros_fiscais').select('ambiente').eq('ativo', true).maybeSingle()
      if (!ativo) return
      setAmbienteFocus(pf?.ambiente ?? null)
      setResumos(out)
    }
    void carregar()
    return () => {
      ativo = false
    }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-[color:var(--rbr-navy)]">Central de integrações</h1>
        <p className="text-sm text-[color:var(--rbr-muted)]">Que usamos · só leitura. Nenhum segredo é lido ou mostrado aqui.</p>
      </div>
      <Card>
        {!resumos ? (
          <Carregando />
        ) : (
          <table className="w-full text-[12.5px] table-fixed" data-testid="tabela-integracoes">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide" style={{ color: '#B8863B' }}>
                <th className="py-2 pr-2 w-[15%]">Fornecedor</th>
                <th className="pr-2 w-[19%]">Para que serve</th>
                <th className="pr-2 w-[9%]">Ambiente</th>
                <th className="pr-2 w-[14%]">Última chamada</th>
                <th className="pr-2 w-[12%]">Resultado</th>
                <th className="pr-2 w-[7%]">Erros 24h</th>
                <th className="pr-2 w-[12%]">Credencial / validade</th>
                <th className="w-[12%]">Saldo ou custo</th>
              </tr>
            </thead>
            <tbody>
              {FORNECEDORES.map((f) => {
                const r = resumos[f.id]
                const ambiente = f.id === 'focus' ? (ambienteFocus ?? 'sem registro') : (f.ambienteFixo ?? r.ambiente)
                return (
                  <tr key={f.id} className="border-t align-top" style={{ borderColor: 'var(--rbr-border)' }}>
                    <td className="py-2 pr-2 font-bold text-[color:var(--rbr-navy)] break-words">{f.nome}</td>
                    <td className="pr-2 break-words">
                      {f.serve}
                      {f.nota ? <span className="block text-[11px] text-[color:var(--rbr-muted)]">{f.nota}</span> : null}
                    </td>
                    <td className="pr-2">{ambiente}</td>
                    <td className="pr-2">{r.ultimaChamada ? formatDateTime(r.ultimaChamada) : 'sem registro'}</td>
                    <td className="pr-2 break-words">{r.resultado}</td>
                    <td className="pr-2">{r.erros24h == null ? 'sem registro' : r.erros24h}</td>
                    <td className="pr-2 break-words">
                      {f.credencial}
                      <span className="block text-[11px] text-[color:var(--rbr-muted)]">validade: {f.validade}</span>
                    </td>
                    <td className="break-words">{f.custo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
