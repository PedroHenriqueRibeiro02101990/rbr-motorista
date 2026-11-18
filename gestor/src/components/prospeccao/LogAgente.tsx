import { useCallback, useEffect, useState } from 'react'
import { Card, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { db } from '../../lib/prospeccaoDb'

type Linha = { id: number; momento: string; robo: string; acao: string; empresa_id: string | null; resultado: string | null; erro: string | null }

// Log do agente: o que cada robo fez (sem senha, sem token, sem corpo de e-mail de terceiros).
export default function LogAgente() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [robo, setRobo] = useState('')
  const [soErro, setSoErro] = useState(false)
  const carregar = useCallback(async () => {
    let q = db.from('prospeccao_log').select('*').order('momento', { ascending: false }).limit(300)
    if (robo) q = q.eq('robo', robo)
    if (soErro) q = q.not('erro', 'is', null)
    const { data } = await q
    setLinhas((data ?? []) as Linha[])
  }, [robo, soErro])
  useEffect(() => { void carregar() }, [carregar])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 items-end flex-wrap">
        <select className={inputClass + ' !w-40'} style={inputStyle} value={robo} onChange={(e) => setRobo(e.target.value)}>
          <option value="">Todos os robôs</option><option value="enviar">Envio</option><option value="ler">Leitura</option><option value="sistema">Sistema</option>
        </select>
        <label className="text-xs font-semibold flex items-center gap-1.5"><input type="checkbox" checked={soErro} onChange={(e) => setSoErro(e.target.checked)} /> Só com erro</label>
      </div>
      <Card>
        {linhas === null ? <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div> : linhas.length === 0 ? <Vazio>Nenhum registro ainda.</Vazio> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[color:var(--rbr-muted)]"><th className="py-1">Quando</th><th>Robô</th><th>Ação</th><th>Resultado</th><th>Erro</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t align-top" style={{ borderColor: '#eef0f5' }}>
                  <td className="py-1.5 whitespace-nowrap">{new Date(l.momento).toLocaleString('pt-BR')}</td><td>{l.robo}</td><td className="font-bold">{l.acao}</td>
                  <td>{l.resultado ?? ''}</td><td style={{ color: '#b3261e' }}>{l.erro ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
