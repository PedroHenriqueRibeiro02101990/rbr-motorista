import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { carregarApoio, erroMsg, type Apoio } from '../lib/financeiro'
import { Aviso, Carregando } from '../components/financeiro/ui'

const VisaoGeral = lazy(() => import('../components/financeiro/VisaoGeral'))
const Lancamentos = lazy(() => import('../components/financeiro/Lancamentos'))
const Faturas = lazy(() => import('../components/financeiro/Faturas'))
const Documentos = lazy(() => import('../components/financeiro/Documentos'))
const Conciliacao = lazy(() => import('../components/financeiro/Conciliacao'))
const Resultado = lazy(() => import('../components/financeiro/Resultado'))
const Configuracoes = lazy(() => import('../components/financeiro/Configuracoes'))

const ABAS = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'receber', label: 'A receber' },
  { id: 'pagar', label: 'A pagar' },
  { id: 'faturas', label: 'Faturas' },
  { id: 'documentos', label: 'Notas e boletos' },
  { id: 'conciliacao', label: 'Conciliação' },
  { id: 'resultado', label: 'Resultado' },
  { id: 'config', label: 'Configurações' },
] as const
type Aba = (typeof ABAS)[number]['id']

export default function Financeiro() {
  const [params, setParams] = useSearchParams()
  const aba = (ABAS.some((a) => a.id === params.get('aba')) ? params.get('aba') : 'geral') as Aba
  const filtro = params.get('filtro') ?? undefined
  const [apoio, setApoio] = useState<Apoio | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  const recarregarApoio = useCallback(async () => {
    try {
      setApoio(await carregarApoio())
    } catch (e) {
      setErro(erroMsg(e))
    }
  }, [])

  useEffect(() => {
    // Mensalidades fixas e assinaturas dos próximos 60 dias (idempotente).
    supabase.rpc('gerar_lancamentos_recorrentes', {}).then(({ error }) => {
      if (error) setErro(`Não consegui gerar as despesas fixas do período: ${error.message}`)
    })
    recarregarApoio()
  }, [recarregarApoio])

  const ir = useCallback(
    (novaAba: string, novoFiltro?: string) => {
      const p: Record<string, string> = { aba: novaAba }
      if (novoFiltro) p.filtro = novoFiltro
      setParams(p)
      window.scrollTo({ top: 0 })
    },
    [setParams],
  )

  const mudou = useCallback(() => {
    setVersao((v) => v + 1)
    recarregarApoio()
  }, [recarregarApoio])

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Financeiro</h1>
      </div>

      <nav className="-mx-1 overflow-x-auto" aria-label="Seções do financeiro">
        <div className="flex gap-1 px-1 border-b min-w-max" style={{ borderColor: 'var(--rbr-border)' }}>
          {ABAS.map((a) => {
            const ativa = a.id === aba
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => ir(a.id)}
                className="text-[13px] font-semibold px-3 py-2.5 -mb-px border-b-2 whitespace-nowrap"
                style={{
                  borderColor: ativa ? 'var(--rbr-gold)' : 'transparent',
                  color: ativa ? 'var(--rbr-navy-dark)' : 'var(--rbr-muted)',
                }}
                aria-current={ativa ? 'page' : undefined}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      </nav>

      {erro && (
        <Aviso tipo="erro" onFechar={() => setErro(null)}>
          {erro}
        </Aviso>
      )}

      {!apoio ? (
        <Carregando />
      ) : (
        <Suspense fallback={<Carregando />}>
          {aba === 'geral' && <VisaoGeral versao={versao} apoio={apoio} ir={ir} onMudou={mudou} />}
          {aba === 'receber' && <Lancamentos key="receber" versao={versao} tipo="receber" apoio={apoio} filtroInicial={filtro} onMudou={mudou} ir={ir} />}
          {aba === 'pagar' && <Lancamentos key="pagar" versao={versao} tipo="pagar" apoio={apoio} filtroInicial={filtro} onMudou={mudou} ir={ir} />}
          {aba === 'faturas' && <Faturas versao={versao} apoio={apoio} onMudou={mudou} />}
          {aba === 'documentos' && <Documentos versao={versao} apoio={apoio} onMudou={mudou} filtroInicial={filtro} />}
          {aba === 'conciliacao' && <Conciliacao versao={versao} apoio={apoio} onMudou={mudou} />}
          {aba === 'resultado' && <Resultado versao={versao} />}
          {aba === 'config' && <Configuracoes versao={versao} apoio={apoio} onMudou={mudou} />}
        </Suspense>
      )}
    </div>
  )
}
