import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { useConfirmacao } from '../Confirmacao'
import { db } from '../../lib/prospeccaoDb'
import { COR_HEX, interpretarDiagnostico, type Achado, type Caixa, type Cor, type LinhaDiagnostico } from '../../lib/prospeccaoCaixa'
import './prospeccaoUi.css'

type Diag = LinhaDiagnostico & { caixa_id: string; executado_em: string; observacoes: string | null }
const PAPEL: Record<string, string> = { agente_1: 'Agente 1', agente_2: 'Agente 2', reserva: 'Reserva (inativa para prospecção)' }
const COR_TXT: Record<Cor, string> = { verde: 'Tudo certo', amarelo: 'Atenção', vermelho: 'Problema' }

/** Caixas de e-mail: estado, senha no Vault (so o Pedro) e botao "Testar caixa". Nunca mostra a senha. */
export default function Caixas() {
  const [caixas, setCaixas] = useState<Caixa[] | null>(null)
  const [diag, setDiag] = useState<Record<string, Diag>>({})
  const [senhas, setSenhas] = useState<Record<string, boolean>>({})
  const [ehPedro, setEhPedro] = useState(false)
  const [resultado, setResultado] = useState<Record<string, { resumo: Cor; achados: Achado[]; observacoes?: string[] } | string>>({})
  const [testando, setTestando] = useState<string | null>(null)
  const [nova, setNova] = useState<Record<string, string>>({})
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [c, d, s, p] = await Promise.all([
      db.from('prospeccao_caixas').select('*').order('papel'),
      db.from('prospeccao_caixa_diagnostico').select('*').order('executado_em', { ascending: false }).limit(30),
      db.rpc('prospeccao_segredos_status'),
      db.rpc('prospeccao_eh_pedro'),
    ])
    setCaixas((c.data ?? []) as Caixa[])
    const ultimo: Record<string, Diag> = {}
    for (const x of (d.data ?? []) as Diag[]) if (!ultimo[x.caixa_id]) ultimo[x.caixa_id] = x
    setDiag(ultimo)
    setSenhas(Object.fromEntries(((s.data ?? []) as { nome: string; cadastrado: boolean }[]).map((x) => [x.nome, x.cadastrado])))
    setEhPedro(p.data === true)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function testar(c: Caixa) {
    setTestando(c.id)
    try {
      const { data, error } = await supabase.functions.invoke('prospeccao-diagnostico-caixa', { body: { caixa_id: c.id } })
      if (error) throw new Error(error.message)
      const r = data as { ok: boolean; erro?: string; resumo?: Cor; achados?: Achado[]; observacoes?: string[] }
      if (!r.ok && !r.achados) throw new Error(r.erro ?? 'Falha no teste.')
      setResultado((x) => ({ ...x, [c.id]: { resumo: r.resumo ?? 'vermelho', achados: r.achados ?? [], observacoes: r.observacoes } }))
      await carregar()
    } catch (e) {
      setResultado((x) => ({ ...x, [c.id]: e instanceof Error ? e.message : String(e) }))
    } finally { setTestando(null) }
  }

  if (!caixas) return <div className="pr"><div className="pr-card pr-card-p"><div className="pr-esq" style={{ width: '60%' }} /></div></div>
  return (
    <div className="pr flex flex-col gap-3">
      {confirmacao}
      <div className="pr-aviso info">
        Cada caixa tem a senha guardada no <b>Vault</b> (cofre). A senha nunca aparece aqui depois de salva. <b>Testar caixa</b> é o primeiro passo de qualquer ligação: ele prova, na prática, o que a Hostinger não publicou
        (se aceita conexão de servidor em nuvem, IDLE, pastas, cópia em Enviados e se os cabeçalhos chegam intactos).
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {caixas.map((c) => {
          const d = diag[c.id]
          const interp = d ? interpretarDiagnostico({ ...d, pastas_descobertas: (d as unknown as { pastas_descobertas: LinhaDiagnostico['pastas_descobertas'] }).pastas_descobertas }) : null
          const res = resultado[c.id]
          const cor: Cor | null = c.parada_motivo ? 'vermelho' : (c.ultimo_diagnostico_resumo ?? null)
          const temSenha = senhas[c.segredo_senha] === true || (c.endereco === 'pedro@rbrcargo.com.br' && senhas['PROSPECCAO_EMAIL_SENHA'] === true)
          return (
            <div key={c.id} className="pr-card pr-card-p flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="pr-ponto" style={{ background: cor ? COR_HEX[cor].ponto : '#9aa3c7' }} title={cor ? COR_TXT[cor] : 'Ainda não testada'} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{c.endereco}</div>
                  <div className="text-[11px] pr-muted">{PAPEL[c.papel]} · assina “{c.assinatura}”</div>
                </div>
                <span className={`pr-badge ${c.ativa ? 'verde' : ''}`}>{c.ativa ? 'Ativa' : 'Inativa'}</span>
              </div>
              {c.parada_motivo && <div className="pr-aviso bad"><b>Caixa parada:</b> {c.parada_motivo}</div>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="pr-titulo">Limite por dia</div><div className="pr-num font-bold">{c.limite_diario}</div></div>
                <div><div className="pr-titulo">Última leitura</div><div>{c.ultima_leitura_em ? new Date(c.ultima_leitura_em).toLocaleString('pt-BR') : '—'}</div></div>
                <div><div className="pr-titulo">Senha</div><div className="font-bold" style={{ color: temSenha ? 'var(--pr-ok)' : 'var(--pr-bad)' }}>{temSenha ? '✓ cadastrada' : '✗ não cadastrada'}</div></div>
                <div><div className="pr-titulo">Último teste</div><div>{c.ultimo_diagnostico_em ? new Date(c.ultimo_diagnostico_em).toLocaleString('pt-BR') : 'nunca'}</div></div>
              </div>

              {ehPedro && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void rodar('Senha guardada no Vault.', async () => {
                  const { error } = await db.rpc('prospeccao_gravar_segredo', { p_nome: c.segredo_senha, p_valor: nova[c.id] ?? '' })
                  if (error) throw new Error(error.message)
                  setNova((x) => ({ ...x, [c.id]: '' })); await carregar()
                }) }}>
                  <input className="pr-input" type="password" autoComplete="new-password" placeholder={temSenha ? 'Trocar a senha desta caixa' : 'Senha desta caixa'} value={nova[c.id] ?? ''} onChange={(e) => setNova((x) => ({ ...x, [c.id]: e.target.value }))} />
                  <button className="pr-btn pri" type="submit" disabled={ocupado || (nova[c.id] ?? '').length < 8}>Salvar</button>
                </form>
              )}
              <div className="flex gap-2 flex-wrap">
                <button className="pr-btn ouro" disabled={!ehPedro || testando !== null} title={ehPedro ? '' : 'Só o usuário do Pedro roda o teste.'} onClick={() => void testar(c)}>
                  {testando === c.id ? 'Testando… (até 1 min)' : 'Testar caixa'}
                </button>
                {ehPedro && (
                  <button className="pr-btn" disabled={ocupado} onClick={() => void rodar(c.ativa ? 'Caixa desativada.' : 'Caixa ativada.', async () => {
                    const { error } = await db.from('prospeccao_caixas').update({ ativa: !c.ativa, atualizado_em: new Date().toISOString() }).eq('id', c.id)
                    if (error) throw new Error(error.message)
                    await carregar()
                  })}>{c.ativa ? 'Desativar' : 'Ativar'}</button>
                )}
              </div>
              {typeof res === 'string' && <div className="pr-aviso bad">{res}</div>}
              {res && typeof res !== 'string' && <Achados resumo={res.resumo} achados={res.achados} obs={res.observacoes} />}
              {!res && interp && <Achados resumo={interp.resumo} achados={interp.achados} obs={d?.observacoes?.split('\n')} antigo />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Achados({ resumo, achados, obs, antigo }: { resumo: Cor; achados: Achado[]; obs?: string[]; antigo?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: 'var(--pr-border)' }}>
      <div className="flex items-center gap-2"><span className={`pr-badge ${resumo}`}>{COR_TXT[resumo]}</span>{antigo && <span className="text-[11px] pr-muted">resultado do último teste</span>}</div>
      {achados.map((a) => (
        <div key={a.item} className="flex gap-2 text-xs">
          <span className="pr-ponto mt-1" style={{ background: COR_HEX[a.cor].ponto }} />
          <div><b>{a.item}.</b> <span className="pr-muted">{a.explicacao}</span></div>
        </div>
      ))}
      {obs && obs.length > 0 && <details className="text-[11px] pr-muted"><summary className="cursor-pointer">Detalhes técnicos</summary>{obs.map((o, i) => <div key={i}>{o}</div>)}</details>}
    </div>
  )
}
