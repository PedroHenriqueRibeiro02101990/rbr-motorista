import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Botao, Card, Carregando, Vazio, inputClass, inputStyle } from '../components/financeiro/ui'
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
  const aviso = (n: number) => {
    const t = textoOcultos(n)
    return t ? <div className="text-xs text-[color:var(--rbr-muted)]">{t}</div> : null
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Busca</h1>
      <form onSubmit={(e) => void buscar(e)} className="flex gap-2 flex-wrap">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} className={inputClass} style={{ ...inputStyle, flex: '1 1 240px' }} placeholder="Cliente, CNPJ ou cidade (ex.: Santos)" aria-label="Buscar" />
        <Botao type="submit" disabled={carregando}>
          {carregando ? 'Buscando…' : 'Buscar'}
        </Botao>
      </form>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && <Carregando />}
      {res && !carregando && (
        <>
          {vazio && <Vazio>Nada encontrado para "{res.termo}".</Vazio>}
          {res.clientes.length > 0 && (
            <Card>
              <div className="font-bold text-sm text-[color:var(--rbr-navy-dark)] mb-2">Clientes</div>
              <div className="flex flex-col gap-1.5 text-sm">
                {res.clientes.map((c) => (
                  <Link key={c.id} to={`/cadastros?aba=clientes&q=${encodeURIComponent(c.nome_fantasia ?? c.razao_social ?? '')}`} className="underline text-[color:var(--rbr-navy)]">
                    {c.nome_fantasia ?? c.razao_social} <span className="text-xs text-[color:var(--rbr-muted)]">{c.cnpj}</span>
                  </Link>
                ))}
              </div>
              {aviso(res.ocultosClientes)}
            </Card>
          )}
          {res.cotacoes.length > 0 && (
            <Card>
              <div className="font-bold text-sm text-[color:var(--rbr-navy-dark)] mb-2">Cotações</div>
              <div className="flex flex-col gap-1.5 text-sm">
                {res.cotacoes.map((c) => (
                  <Link key={c.id} to="/cotacao" className="underline text-[color:var(--rbr-navy)]">
                    {c.cidade_origem} → {c.cidade_destino} <span className="text-xs text-[color:var(--rbr-muted)]">{c.status}</span>
                  </Link>
                ))}
              </div>
              {aviso(res.ocultosCotacoes)}
            </Card>
          )}
          {res.operacoes.length > 0 && (
            <Card>
              <div className="font-bold text-sm text-[color:var(--rbr-navy-dark)] mb-2">Operações</div>
              <div className="flex flex-col gap-1.5 text-sm">
                {res.operacoes.map((o) => (
                  <Link key={o.id} to={`/operacoes?op=${o.id}`} className="underline text-[color:var(--rbr-navy)]">
                    Operação {o.id.slice(0, 8)} <span className="text-xs text-[color:var(--rbr-muted)]">{o.status}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
