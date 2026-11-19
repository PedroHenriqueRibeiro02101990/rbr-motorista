import { useCallback, useEffect, useState } from 'react'
import { useConfirmacao } from '../Confirmacao'
import { db } from '../../lib/prospeccaoDb'
import { gastoDoDiaEDoMes, situacaoGasto, type UsoLinha } from '../../lib/prospeccaoPainel'
import './prospeccaoUi.css'

/** Gasto de IA (dia e mes contra o teto) e chave da IA no Vault (so o Pedro; o valor nunca volta para a tela). */
export default function IaCusto() {
  const [uso, setUso] = useState<UsoLinha[]>([])
  const [params, setParams] = useState<Record<string, string>>({})
  const [temChave, setTemChave] = useState(false)
  const [ehPedro, setEhPedro] = useState(false)
  const [chave, setChave] = useState('')
  const [carregado, setCarregado] = useState(false)
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10) // dia de Sao Paulo (UTC-3)

  const carregar = useCallback(async () => {
    const mes = hoje.slice(0, 7) + '-01'
    const [u, p, s, e] = await Promise.all([
      db.from('prospeccao_ia_uso').select('data, custo_brl').gte('data', mes).limit(5000),
      db.from('parametros_sistema').select('chave, valor').like('chave', 'PROSPECCAO\\_IA\\_%'),
      db.rpc('prospeccao_segredos_status'),
      db.rpc('prospeccao_eh_pedro'),
    ])
    setUso((u.data ?? []) as UsoLinha[])
    setParams(Object.fromEntries(((p.data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, typeof x.valor === 'string' ? x.valor : JSON.stringify(x.valor)])))
    setTemChave(((s.data ?? []) as { nome: string; cadastrado: boolean }[]).some((x) => x.nome === 'PROSPECCAO_IA_CHAVE' && x.cadastrado))
    setEhPedro(e.data === true); setCarregado(true)
  }, [hoje])
  useEffect(() => { void carregar() }, [carregar])

  const teto = Number(params.PROSPECCAO_IA_TETO_DIARIO_BRL ?? 3)
  const g = gastoDoDiaEDoMes(uso, hoje)
  const sit = situacaoGasto(g.dia, teto)
  if (!carregado) return <div className="pr pr-card pr-card-p"><div className="pr-esq" style={{ width: '40%' }} /></div>
  return (
    <div className="pr pr-card pr-card-p flex flex-col gap-3">
      {confirmacao}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="pr-titulo flex-1">Inteligência artificial</div>
        <span className={`pr-badge ${temChave ? 'verde' : 'amarelo'}`}>{temChave ? 'Chave cadastrada' : 'IA desligada: falta a chave'}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div><div className="pr-titulo">Gasto hoje</div><div className="text-lg font-bold pr-num">R$ {g.dia.toFixed(2)}</div></div>
        <div><div className="pr-titulo">Teto diário</div><div className="text-lg font-bold pr-num">R$ {teto.toFixed(2)}</div></div>
        <div><div className="pr-titulo">Gasto no mês</div><div className="text-lg font-bold pr-num">R$ {g.mes.toFixed(2)}</div></div>
        <div><div className="pr-titulo">Autonomia</div><div className="text-lg font-bold">{params.PROSPECCAO_IA_AUTONOMIA ?? 'rascunho'}</div></div>
      </div>
      <div>
        <div className={`pr-barra ${sit.tom === 'atencao' ? 'ouro' : ''}`}><span style={{ width: `${Math.min(100, sit.pct)}%`, background: sit.tom === 'parada' ? 'var(--pr-bad)' : undefined }} /></div>
        <div className="text-[11px] pr-muted mt-1">{sit.pct}% do teto de hoje.{sit.tom === 'parada' ? ' A IA parou por hoje; os envios por modelo continuam.' : sit.tom === 'atencao' ? ' Atenção: perto do teto.' : ''} Valores em reais com o câmbio {params.PROSPECCAO_IA_CAMBIO_USD_BRL ?? '—'} (editável).</div>
      </div>
      <div className="text-xs pr-muted">Modelos: classificar/extrair/validar = {params.PROSPECCAO_IA_MODELO_CLASSIFICAR ?? '—'}; redigir = {params.PROSPECCAO_IA_MODELO_REDIGIR ?? '—'}; escala para {params.PROSPECCAO_IA_MODELO_ESCALAR ?? '—'} quando a confiança é baixa e depois para uma pessoa.</div>
      {ehPedro ? (
        <form className="flex gap-2 flex-wrap items-center" onSubmit={(e) => { e.preventDefault(); void rodar('Chave guardada no Vault. A IA liga sozinha quando as funções estiverem agendadas.', async () => {
          const { error } = await db.rpc('prospeccao_gravar_segredo', { p_nome: 'PROSPECCAO_IA_CHAVE', p_valor: chave })
          if (error) throw new Error(error.message)
          setChave(''); await carregar()
        }) }}>
          <input className="pr-input" style={{ maxWidth: 420 }} type="password" autoComplete="new-password" placeholder={temChave ? 'Trocar a chave da API da Anthropic' : 'Chave da API da Anthropic (começa com sk-ant-)'} value={chave} onChange={(e) => setChave(e.target.value)} />
          <button className="pr-btn pri" type="submit" disabled={ocupado || chave.trim().length < 20}>Guardar no Vault</button>
        </form>
      ) : <div className="text-[11px] pr-muted">Só o usuário do Pedro cadastra a chave.</div>}
    </div>
  )
}
