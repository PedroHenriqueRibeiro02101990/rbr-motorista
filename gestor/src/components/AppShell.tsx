import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { Database } from '@rbr/shared/database.types'
import { IconLogOut } from '@rbr/shared/icons'
import { initials } from '@rbr/shared/format'
import { IconMenu, IconX, IconSearch, IconAlertTriangle } from '../icons-local'
import AjudaFlutuante from '@rbr/shared/AjudaFlutuante'
import { BiometriaToggle } from '@rbr/shared/biometria'
import { podeVerNoMenu } from '../lib/menuPorPapel'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

// Menu aprovado (visual Inicio-Final): quatro entradas fixas e "Mais" para o resto.
const NAV_PRINCIPAL = [
  { to: '/', label: 'Início', end: true },
  { to: '/servicos', label: 'Serviços', end: false },
  { to: '/financeiro', label: 'Financeiro', end: false },
  { to: '/cadastros', label: 'Cadastros', end: false },
]
// Menu enxuto de cada função (visuais Operacao-Fila, Fiscal-Fila, Vendedor-Inicio): só o que ela usa, com o nome do desenho.
const MENU_FUNCAO: Record<string, { to: string; label: string; end: boolean }[]> = {
  operacao: [
    { to: '/', label: 'Início', end: true },
    { to: '/servicos', label: 'Serviços', end: false },
    { to: '/cadastros?aba=motoristas', label: 'Motoristas e veículos', end: false },
  ],
  fiscal: [
    { to: '/', label: 'Início', end: true },
    { to: '/servicos', label: 'Serviços', end: false },
    { to: '/fiscal?parametros=1', label: 'Parâmetros fiscais', end: false },
  ],
  comercial: [
    { to: '/', label: 'Início', end: true },
    { to: '/servicos', label: 'Serviços', end: false },
    { to: '/meus-clientes', label: 'Meus clientes', end: false },
  ],
}
const SUBTITULO: Record<string, string> = { gestor_rbr: 'Painel do gestor', operacao: 'Painel da operação', fiscal: 'Painel fiscal', comercial: 'Painel comercial', financeiro: 'Painel financeiro' }

const NAV_MAIS = [
  { to: '/fila-do-dia', label: 'Fila do dia', end: false },
  { to: '/cotacao', label: 'Cotação', end: false },
  { to: '/pre-cotacao', label: 'Pré-cotação', end: false },
  { to: '/operacoes', label: 'Operações', end: false },
  { to: '/fiscal', label: 'Fiscal', end: false },
  { to: '/mapa', label: 'Mapa', end: false },
  { to: '/jornada', label: 'Jornada da operação', end: false },
  { to: '/alteracoes', label: 'Alterações', end: false },
  { to: '/relatorio-comercial', label: 'Relatório comercial', end: false },
  { to: '/metas', label: 'Metas', end: false },
  { to: '/busca', label: 'Busca', end: false },
  { to: '/avisos', label: 'Avisos', end: false },
  { to: '/saude-fiscal', label: 'Saúde fiscal', end: false },
  { to: '/notas-parceiros', label: 'Notas parceiros', end: false },
  { to: '/risco', label: 'Risco', end: false },
  { to: '/conformidade', label: 'Conformidade', end: false },
]

// F01: sino do menu. Conta os avisos não lidos desta pessoa; atualiza a cada minuto e quando a central marca algo como lido.
function useAvisosNaoLidos() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    const ler = () =>
      supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .neq('status_entrega', 'confirmado_lido')
        .then(({ count }) => {
          if (vivo) setN(count ?? 0)
        })
    void ler()
    const t = window.setInterval(() => void ler(), 60000)
    window.addEventListener('avisos-atualizados', ler)
    return () => {
      vivo = false
      window.clearInterval(t)
      window.removeEventListener('avisos-atualizados', ler)
    }
  }, [])
  return n
}

type AvisoMini = { id: string; tipo: string; referencia_id: string | null; conteudo: string | null; criado_em: string }
function PainelSino({ onFechar }: { onFechar: () => void }) {
  const [itens, setItens] = useState<AvisoMini[] | null>(null)
  const nav = useNavigate()
  useEffect(() => {
    void supabase
      .from('notificacoes')
      .select('id, tipo, referencia_id, conteudo, criado_em')
      .neq('status_entrega', 'confirmado_lido')
      .order('criado_em', { ascending: false })
      .limit(4)
      .then(({ data }) => setItens((data ?? []) as AvisoMini[]))
  }, [])
  return (
    <div className="absolute right-0 top-12 w-[400px] max-w-[92vw] bg-white border rounded-2xl z-40 overflow-hidden" style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 12px 40px rgba(28,37,89,0.18)' }} role="dialog" aria-label="Central de avisos">
      <div className="flex items-center justify-between px-4 py-3 text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>
        <span>CENTRAL DE AVISOS</span>
        <button type="button" onClick={() => { onFechar(); nav('/avisos') }} className="font-extrabold" style={{ color: '#1c2559' }}>Ver tudo →</button>
      </div>
      {itens === null ? (
        <div className="px-4 py-6 text-[13px]" style={{ color: 'var(--rbr-muted)' }}>Carregando…</div>
      ) : itens.length === 0 ? (
        <div className="px-4 py-6 text-[13px]" style={{ color: 'var(--rbr-muted)', borderTop: '1px solid #eef0f5' }}>Nenhum aviso pendente.</div>
      ) : (
        itens.map((i) => (
          <div key={i.id} className="px-4 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid #eef0f5' }}>
            <div className="text-[13px] font-extrabold">{i.conteudo}</div>
            <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>{new Date(i.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
            {i.referencia_id && (
              <button type="button" onClick={() => { onFechar(); nav('/operacoes?op=' + i.referencia_id) }} className="self-start text-[12px] font-extrabold px-3.5 py-1.5 rounded-[10px] text-white" style={{ background: '#1c2559' }}>
                Abrir operação →
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

const ROTULO_PAPEL: Record<string, string> = { gestor_rbr: 'Gestor', comercial: 'Comercial', operacao: 'Operação', fiscal: 'Fiscal', financeiro: 'Financeiro' }

function Avatar({ nome, tam }: { nome: string; tam: number }) {
  return (
    <span
      className="rounded-full inline-flex items-center justify-center font-extrabold text-white flex-shrink-0"
      style={{ width: tam, height: tam, background: '#1a6b3c', fontSize: tam > 36 ? 13 : 12 }}
    >
      {initials(nome)}
    </span>
  )
}

export default function AppShell({
  pessoa,
  onSignOut,
  children,
}: {
  pessoa: Pessoa
  onSignOut: () => void
  children: React.ReactNode
}) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [sinoAberto, setSinoAberto] = useState(false)
  const avisos = useAvisosNaoLidos()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const enxuto = MENU_FUNCAO[pessoa.papel]
  const principal = enxuto ?? NAV_PRINCIPAL.filter((i) => podeVerNoMenu(pessoa.papel, i.to))
  const mais = enxuto ? [] : NAV_MAIS.filter((i) => podeVerNoMenu(pessoa.papel, i.to))
  // "Mais" abre sozinho quando a tela atual é uma das que moram nele.
  const [maisAberto, setMaisAberto] = useState(false)
  const dentroDeMais = mais.some((i) => pathname.startsWith(i.to))
  const mostrarMais = maisAberto || dentroDeMais

  // Ctrl K abre a busca, como no visual aprovado.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        nav('/busca')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [nav])

  const item = (to: string, label: string, end: boolean, fechar?: () => void) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      onClick={fechar}
      className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-sm"
      style={({ isActive }) => ({
        background: isActive ? '#eef0fa' : 'transparent',
        color: isActive ? '#1c2559' : '#4a5275',
        fontWeight: isActive ? 700 : 600,
      })}
    >
      {label}
      {to === '/avisos' && avisos > 0 && (
        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--rbr-danger)', color: '#fff' }}>
          {avisos}
        </span>
      )}
    </NavLink>
  )

  const lista = (fechar?: () => void) => (
    <>
      {principal.map((i) => item(i.to, i.label, i.end, fechar))}
      {mais.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setMaisAberto((v) => !v)}
            aria-expanded={mostrarMais}
            className="text-left px-3 py-2.5 rounded-[10px] text-sm font-semibold"
            style={{ color: '#4a5275' }}
          >
            Mais {mostrarMais ? '▴' : '▾'}
          </button>
          {mostrarMais && <div className="flex flex-col gap-0.5 pl-2">{mais.map((i) => item(i.to, i.label, i.end, fechar))}</div>}
        </>
      )}
    </>
  )

  return (
    <div className="min-h-dvh flex flex-col md:flex-row" style={{ background: 'var(--rbr-canvas)' }}>
      {/* Barra do celular */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-20" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="font-extrabold text-sm" style={{ color: '#1c2559' }}>
          RBR Cargo
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => nav('/avisos')} className="relative w-9 h-9 rounded-xl border bg-white flex items-center justify-center" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }} aria-label="Avisos">
            <IconAlertTriangle width={17} height={17} />
            {avisos > 0 && (
              <span className="absolute -top-1.5 -right-1.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--rbr-danger)' }}>
                {avisos}
              </span>
            )}
          </button>
          <button onClick={() => setMenuAberto((v) => !v)} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }} aria-label="Abrir menu">
            {menuAberto ? <IconX width={18} height={18} /> : <IconMenu width={18} height={18} />}
          </button>
        </div>
      </div>
      {menuAberto && (
        <nav className="md:hidden flex flex-col gap-1 px-3 py-3 border-b bg-white" style={{ borderColor: 'var(--rbr-border)' }}>
          {lista(() => setMenuAberto(false))}
          <button onClick={onSignOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[color:var(--rbr-muted)]">
            <IconLogOut width={17} height={17} />
            Sair
          </button>
        </nav>
      )}

      {/* Menu lateral (visual aprovado) */}
      <aside className="hidden md:flex md:flex-col md:w-[220px] md:flex-shrink-0 md:h-dvh md:sticky md:top-0 bg-white border-r px-3.5 py-5 gap-1.5" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="px-2.5 pb-4">
          <div className="text-[16px] font-extrabold" style={{ color: '#1c2559' }}>
            RBR Cargo
          </div>
          <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>
            {SUBTITULO[pessoa.papel] ?? 'Painel da equipe'}
          </div>
        </div>
        <nav className="flex flex-col gap-1.5 overflow-y-auto min-h-0">{lista()}</nav>

        <div className="mt-auto pt-3 border-t flex flex-col gap-1" style={{ borderColor: '#eef0f5' }}>
          <div className="flex items-center gap-2.5 px-2.5 py-1.5">
            <Avatar nome={pessoa.nome} tam={34} />
            <div className="min-w-0">
              <div className="text-[13px] font-bold truncate">{pessoa.nome.split(' ')[0]}</div>
              <div className="text-[11px] truncate" style={{ color: 'var(--rbr-muted)' }}>
                {ROTULO_PAPEL[pessoa.papel] ?? 'Equipe'}
              </div>
            </div>
          </div>
          <div className="px-2.5 py-1">
            <BiometriaToggle userId={pessoa.auth_user_id ?? pessoa.id} nome={pessoa.nome} email={pessoa.email} />
          </div>
          <button onClick={onSignOut} className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-[color:var(--rbr-muted)] hover:text-[color:var(--rbr-danger)]">
            <IconLogOut width={17} height={17} />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-dvh min-w-0">
        {/* Barra superior: busca, sino e avatar */}
        <div className="hidden md:flex items-center gap-3.5 h-[60px] flex-shrink-0 pl-7 pr-6">
          <button
            type="button"
            onClick={() => nav('/busca')}
            className="flex-1 max-w-[560px] flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-3 py-2.5 text-left"
            style={{ borderColor: 'var(--rbr-border)' }}
            aria-label="Abrir a busca"
          >
            <IconSearch width={15} height={15} style={{ color: '#6b7390' }} />
            <span className="text-[13px]" style={{ color: '#8a91ad' }}>
              Pesquise: operação, cliente, motorista, CT-e…
            </span>
            <span className="ml-auto flex gap-1.5 items-center">
              <span className="text-[10px] font-extrabold rounded-md px-1.5 py-0.5" style={{ color: '#6b4fb3', background: '#efeafb' }}>
                IA
              </span>
              <span className="text-[10px] rounded-md px-1.5 py-0.5 border" style={{ color: '#8a91ad', borderColor: 'var(--rbr-border)' }}>
                Ctrl K
              </span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-3 relative">
            {sinoAberto && <PainelSino onFechar={() => setSinoAberto(false)} />}
            <button
              type="button"
              onClick={() => setSinoAberto((v) => !v)}
              className="relative w-10 h-10 rounded-xl bg-white border flex items-center justify-center"
              style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}
              aria-label={avisos > 0 ? `Avisos: ${avisos} não lidos` : 'Avisos'}
            >
              <IconAlertTriangle width={18} height={18} />
              {avisos > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'var(--rbr-danger)' }}>
                  {avisos}
                </span>
              )}
            </button>
            <Avatar nome={pessoa.nome} tam={38} />
          </div>
        </div>
        <main className={`flex-1 w-full px-4 py-5 md:px-7 md:pt-1.5 md:pb-6 ${(pessoa.papel as string) === 'comercial' ? 'pb-24 md:pb-6' : ''}`}>{children}</main>
      </div>

      {/* Celular do vendedor (visual "Celular-Vendedor"): barra de baixo com Início, Serviços, Clientes e + Cotar */}
      {(pessoa.papel as string) === 'comercial' && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t grid grid-cols-4 text-[12px] font-bold" style={{ borderColor: 'var(--rbr-border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {[
            ['/', 'Início', true],
            ['/servicos', 'Serviços', false],
            ['/meus-clientes', 'Clientes', false],
            ['/cotacao', '+ Cotar', false],
          ].map(([to, rotulo, end]) => (
            <NavLink key={to as string} to={to as string} end={end as boolean} className="py-3 text-center" style={({ isActive }) => ({ color: isActive ? '#1c2559' : '#8a91ad' })}>
              {rotulo as string}
            </NavLink>
          ))}
        </nav>
      )}

      <AjudaFlutuante app="gestor" />
    </div>
  )
}
