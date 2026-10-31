import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Carregando } from '../components/financeiro/ui'
import { mensagemClara } from '../lib/mensagemClara'
import { MIN_BUSCA, ocultos, termoDeBusca, textoOcultos } from '../lib/busca'

// F04 · Busca global. Procura em clientes, cotações e operações usando as políticas da própria pessoa (só aparece o que a função dela
// deixa ver). A contagem do que existe vem de busca_contagens (só números) e vira "N resultados ocultos pela sua função".
// Esta versão casa o texto digitado com nome, CNPJ e cidades; a interpretação de frase livre por IA ainda não foi feita.

type Cliente = { id: string; razao_social: string | null; nome_fantasia: string | null; cnpj: string | null }
type Cotacao = { id: string; cidade_origem: string | null; cidade_destino: string | null; status: string | null; cliente_id: string | null }
type Operacao = { id: string; status: string; cotacao_id: string | null; cliente_id: string | null }
type Resultado = { termo: string; clientes: Cliente[]; cotacoes: Cotacao[]; operacoes: Operacao[]; ocultosClientes: number; ocultosCotacoes: number }

type ChamaRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export default function Busca() {
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)
  const [papel, setPapel] = useState<string | null>(null)
  useEffect(() => {
    void supabase.rpc('current_papel').then(({ data }) => setPapel((data as unknown as string) ?? null))
  }, [])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const termo = termoDeBusca(texto)
    if (!termo) {
      setRes(null)
      return setErro(`Digite pelo menos ${MIN_BUSCA} letras.`)
    }
    setCarregando(true)
    setErro(null)
    try {
      const p = `%${termo}%`
      const rpc = supabase.rpc as unknown as ChamaRpc
      const [cli, cot, cont] = await Promise.all([
        supabase.from('clientes').select('id, razao_social, nome_fantasia, cnpj').or(`razao_social.ilike.${p},nome_fantasia.ilike.${p},cnpj.ilike.${p}`).limit(20),
        supabase.from('cotacoes').select('id, cidade_origem, cidade_destino, status, cliente_id').or(`cidade_origem.ilike.${p},cidade_destino.ilike.${p}`).limit(20),
        rpc.call(supabase, 'busca_contagens', { p_termo: termo }),
      ])
      if (cli.error || cot.error) throw cli.error ?? cot.error
      const clientes = (cli.data ?? []) as Cliente[]
      const cotacoes = (cot.data ?? []) as Cotacao[]
      const totais = (cont.data ?? {}) as { clientes?: number; cotacoes?: number }
      const idsCli = clientes.map((c) => c.id)
      const idsCot = cotacoes.map((c) => c.id)
      let operacoes: Operacao[] = []
      if (idsCli.length || idsCot.length) {
        const filtros = [idsCot.length ? `cotacao_id.in.(${idsCot.join(',')})` : '', idsCli.length ? `cliente_id.in.(${idsCli.join(',')})` : ''].filter(Boolean).join(',')
        const { data, error } = await supabase.from('operacoes').select('id, status, cotacao_id, cliente_id').or(filtros).limit(20)
        if (error) throw error
        operacoes = (data ?? []) as Operacao[]
      }
      setRes({
        termo,
        clientes,
        cotacoes,
        operacoes,
        ocultosClientes: ocultos(Number(totais.clientes ?? 0), clientes.length),
        ocultosCotacoes: ocultos(Number(totais.cotacoes ?? 0), cotacoes.length),
      })
    } catch (e2) {
      setErro(mensagemClara(e2, 'Não consegui buscar agora. Tente de novo.'))
    } finally {
      setCarregando(false)
    }
  }

  const vazio = res && res.clientes.length + res.cotacoes.length + res.operacoes.length === 0
  const aviso = (n: number) => textoOcultos(n)
  const ocultosTotal = res ? res.ocultosClientes + res.ocultosCotacoes : 0
  const textoOculto = ocultosTotal > 0 ? textoOcultos(ocultosTotal) : null
  const COMO: Record<string, string> = { gestor_rbr: 'Gestor · vê tudo', comercial: 'Comercial · suas cotações e seus clientes', operacao: 'Operação · sem financeiro', fiscal: 'Fiscal · operações e documentos', financeiro: 'Financeiro · títulos e pagamentos' }
  const linha = (rotulo: string, cor: { bg: string; fg: string }, titulo: React.ReactNode, sub: string, para: string, k: string) => (
    <Link key={k} to={para} className="flex items-center gap-3.5 px-4 py-3 hover:bg-[#f7f8fc]" style={{ borderTop: '1px solid #eef0f5' }}>
      <span className="text-[11px] font-extrabold uppercase tracking-wide rounded-full px-3 py-1.5 w-[96px] text-center flex-shrink-0" style={{ background: cor.bg, color: cor.fg }}>
        {rotulo}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-extrabold text-[color:var(--rbr-navy-dark)] truncate">{titulo}</span>
        <span className="block text-[12px] truncate" style={{ color: 'var(--rbr-muted)' }}>
          {sub}
        </span>
      </span>
    </Link>
  )
  const COR_CLI = { bg: '#d6ecdf', fg: '#1a6b3c' }
  const COR_COT = { bg: '#f3e6cf', fg: '#7a5200' }
  const COR_OP = { bg: '#eef0fa', fg: '#1c2559' }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,760px)_300px] items-start">
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Busca</h1>
        <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>
          Cada pessoa encontra só o que é da sua função.
        </div>
      </div>
      <form onSubmit={(e) => void buscar(e)} className="flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-3 py-2.5" style={{ borderColor: '#1c2559' }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} className="flex-1 min-w-0 outline-none text-[14px] font-semibold bg-transparent" placeholder="Cliente, CNPJ ou cidade (ex.: Santos)" aria-label="Buscar" autoFocus />
        <button type="submit" disabled={carregando} className="text-[12px] font-bold px-3.5 py-1.5 rounded-[10px] text-white disabled:opacity-60" style={{ background: '#1c2559' }}>
          {carregando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && <Carregando />}
      {res && !carregando && (
        <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: '#f7f8fc' }}>
            <span className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
              VOCÊ BUSCA COMO
            </span>
            {papel && (
              <span className="text-[11px] font-extrabold rounded-full px-3 py-1" style={{ background: papel === 'gestor_rbr' ? '#d6ecdf' : '#ece6fb', color: papel === 'gestor_rbr' ? '#1a6b3c' : '#6b4fb3' }}>
                {COMO[papel] ?? 'Equipe'}
              </span>
            )}
          </div>
          {vazio && <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--rbr-muted)' }}>Nada encontrado para "{res.termo}".</div>}
          {res.clientes.map((c) => linha('Cliente', COR_CLI, c.nome_fantasia ?? c.razao_social ?? 'Cliente', c.cnpj ?? 'contrato, contatos e histórico', `/cadastros?aba=clientes&q=${encodeURIComponent(c.nome_fantasia ?? c.razao_social ?? '')}`, `c-${c.id}`))}
          {res.cotacoes.map((c) => linha('Cotação', COR_COT, `${c.cidade_origem} → ${c.cidade_destino}`, c.status ?? '', '/cotacao', `k-${c.id}`))}
          {res.operacoes.map((o) => linha('Operação', COR_OP, `Operação ${o.id.slice(0, 8)}`, o.status, `/operacoes?op=${o.id}`, `o-${o.id}`))}
          {textoOculto && (
            <div className="px-4 py-2.5 text-[12px] font-bold" style={{ background: '#fff4d9', color: '#7a5200' }}>
              {aviso(ocultosTotal)}
            </div>
          )}
        </div>
      )}
      <div className="rounded-2xl px-4 py-3 text-[12px]" style={{ background: '#eef0fa', color: '#1c2559', border: '1px solid #d5d9e6' }}>
        <b>O que a busca faz:</b> acha e leva até a tela. Ainda não interpreta frase livre nem responde com IA. Toda a visibilidade é a do banco: a busca não abre brecha.
      </div>
    </div>
    <aside className="bg-white border rounded-2xl p-5 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>NÍVEIS DE BUSCA</div>
      {[
        ['Gestor', 'tudo, inclusive financeiro e margem'],
        ['Comercial', 'suas cotações e seus clientes'],
        ['Operação', 'operações, motoristas, veículos; sem valores ao cliente nem financeiro'],
        ['Fiscal', 'operações e documentos fiscais'],
        ['Financeiro', 'títulos e pagamentos'],
      ].map(([r, d]) => (
        <div key={r} className="flex justify-between gap-3 text-[12px] py-1.5" style={{ borderTop: '1px solid #eef0f5' }}>
          <span style={{ color: 'var(--rbr-muted)' }}>{r}</span>
          <b className="text-right">{d}</b>
        </div>
      ))}
      <div className="text-[11px]" style={{ color: '#8a91ad' }}>A regra de visibilidade é a mesma do banco.</div>
    </aside>
    </div>
  )
}
