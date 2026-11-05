import { useMemo, useState } from 'react'
import { avaliar, precoPorSpread, simularRapido } from '@rbr/shared/spreadAgenciador'
import SpreadBloco from '../components/SpreadBloco'
import { Aviso, Botao, Cartao, Selo, SeloAgenciador, Titulo, Toast, Vazio, brl, pct } from '../components/ui'
import {
  AGENCIADOR_DEMO, ALIQUOTA, CLIENTES_DEMO, COTACOES_DEMO, ETAPAS, HISTORICO_DEMO, LOGO_DEMO, MESES_PT,
  OPERACOES_DEMO, PARAMS_DEMO, STATUS_COT, type ClienteDemo, type CotacaoDemo, type StatusCot,
} from './dados'

type Aba = 'inicio' | 'cotacoes' | 'clientes' | 'operacoes' | 'financeiro' | 'perfil'
const ABAS: { k: Aba; label: string }[] = [
  { k: 'inicio', label: 'Início' },
  { k: 'cotacoes', label: 'Cotações' },
  { k: 'clientes', label: 'Clientes' },
  { k: 'operacoes', label: 'Operações' },
  { k: 'financeiro', label: 'Financeiro' },
  { k: 'perfil', label: 'Perfil' },
]
const dataBr = (iso: string) => iso.split('-').reverse().join('/')
const precoDe = (c: CotacaoDemo) => precoPorSpread(c.custo, PARAMS_DEMO, c.spread).precoFinal
const WHATS = 'https://wa.me/5511953977966?text=' + encodeURIComponent('Olá, RBR! Sou agenciador parceiro e preciso de ajuda.')

export default function DemoApp() {
  const [aba, setAba] = useState<Aba>('inicio')
  const [cots, setCots] = useState<CotacaoDemo[]>(COTACOES_DEMO)
  const [clientes, setClientes] = useState<ClienteDemo[]>(CLIENTES_DEMO)
  const [aberta, setAberta] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const avisar = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }
  const ir = (a: Aba) => {
    setAba(a)
    setAberta(null)
    window.scrollTo({ top: 0 })
  }
  const atualizar = (id: string, p: Partial<CotacaoDemo>) => setCots((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))

  return (
    <div className="min-h-dvh bg-white">
      <Toast msg={toast} />
      <div className="text-center text-[12px] font-bold py-1.5" style={{ background: 'var(--rbr-gold)', color: '#fff' }}>
        DEMONSTRAÇÃO com dados fictícios — nada aqui é gravado
      </div>
      <header className="sticky top-0 z-30 bg-white border-b" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo-192.png" alt="RBR Cargo" className="w-8 h-8 rounded-lg" />
            <span className="rbr-display font-bold text-[15px] text-[color:var(--rbr-navy-dark)]">RBR Cargo</span>
          </div>
          <SeloAgenciador nome={AGENCIADOR_DEMO.nome} logoUrl={LOGO_DEMO} />
        </div>
        <nav className="max-w-6xl mx-auto px-2 flex gap-1 overflow-x-auto">
          {ABAS.map((a) => (
            <button key={a.k} onClick={() => ir(a.k)} className="px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2" style={{ borderColor: aba === a.k ? 'var(--rbr-gold)' : 'transparent', color: aba === a.k ? 'var(--rbr-navy-dark)' : 'var(--rbr-muted)' }}>
              {a.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 flex flex-col gap-4">
        {aba === 'inicio' && <Inicio cots={cots} ir={ir} />}
        {aba === 'cotacoes' && <Cotacoes cots={cots} clientes={clientes} aberta={aberta} setAberta={setAberta} atualizar={atualizar} avisar={avisar} nova={(c) => setCots((l) => [c, ...l])} />}
        {aba === 'clientes' && <Clientes clientes={clientes} cots={cots} novo={(c) => { setClientes((l) => [c, ...l]); avisar('Cliente cadastrado (exemplo).') }} />}
        {aba === 'operacoes' && <Operacoes cots={cots} clientes={clientes} />}
        {aba === 'financeiro' && <Financeiro cots={cots} clientes={clientes} avisar={avisar} />}
        {aba === 'perfil' && <Perfil avisar={avisar} />}
      </main>

      <a href={WHATS} target="_blank" rel="noreferrer" className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-full text-sm font-bold shadow-lg" style={{ background: '#16a34a', color: '#fff' }}>
        Falar com a RBR
      </a>
    </div>
  )
}

function Inicio({ cots, ir }: { cots: CotacaoDemo[]; ir: (a: Aba) => void }) {
  const funil: StatusCot[] = ['rascunho', 'enviada_cliente', 'aceita', 'enviada_operacao', 'perdida']
  const aceitas = cots.filter((c) => c.status === 'aceita').length
  const paradas = cots.filter((c) => c.status === 'enviada_cliente').length
  return (
    <>
      <Titulo sub="Agenciador parceiro RBR">Olá, Marcos</Titulo>
      {(aceitas > 0 || paradas > 0) && (
        <Cartao>
          <div className="rbr-display font-bold mb-2">Pendências comerciais</div>
          <div className="flex flex-col gap-2 text-[13px]">
            {aceitas > 0 && <Aviso tom="verde">{aceitas} cotação(ões) aceita(s) pelo cliente aguardando você enviar à operação.</Aviso>}
            {paradas > 0 && <Aviso tom="amarelo">{paradas} cotação(ões) enviada(s) ao cliente aguardando resposta.</Aviso>}
          </div>
        </Cartao>
      )}
      <div>
        <div className="rbr-display font-bold mb-2">Seu funil</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {funil.map((s) => {
            const l = cots.filter((c) => c.status === s)
            const total = l.reduce((a, c) => a + precoDe(c), 0)
            return (
              <button key={s} onClick={() => ir('cotacoes')} className="rbr-card p-3.5 text-left">
                <Selo texto={STATUS_COT[s].label} bg={STATUS_COT[s].bg} cor={STATUS_COT[s].cor} />
                <div className="rbr-display font-bold text-2xl mt-2">{l.length}</div>
                <div className="text-[12px] text-[color:var(--rbr-muted)]">{brl(total)}</div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Cartao>
          <div className="rbr-display font-bold mb-3">Atalhos</div>
          <div className="flex flex-wrap gap-2">
            <Botao tipo="dourado" onClick={() => ir('cotacoes')}>Nova cotação</Botao>
            <Botao tipo="neutro" onClick={() => ir('clientes')}>Novo cliente</Botao>
            <Botao tipo="neutro" onClick={() => ir('financeiro')}>Ver ganhos</Botao>
          </div>
        </Cartao>
        <Cartao>
          <div className="rbr-display font-bold mb-2">Primeiros passos</div>
          {[['Completar o perfil', true], ['Subir o logotipo', true], ['Cadastrar o 1º cliente', true], ['Fazer a 1ª cotação', true]].map(([t, ok]) => (
            <div key={String(t)} className="flex items-center gap-2 text-[13px] py-0.5">
              <span style={{ color: ok ? 'var(--rbr-positive)' : 'var(--rbr-muted)' }}>{ok ? '✔' : '○'}</span>
              {t as string}
            </div>
          ))}
          <p className="text-[12px] text-[color:var(--rbr-muted)] mt-2">Tudo concluído: este quadro some sozinho na conta real.</p>
        </Cartao>
      </div>
    </>
  )
}

function Cotacoes({ cots, clientes, aberta, setAberta, atualizar, avisar, nova }: {
  cots: CotacaoDemo[]; clientes: ClienteDemo[]; aberta: string | null; setAberta: (id: string | null) => void
  atualizar: (id: string, p: Partial<CotacaoDemo>) => void; avisar: (m: string) => void; nova: (c: CotacaoDemo) => void
}) {
  const [filtro, setFiltro] = useState<StatusCot | 'todas'>('todas')
  const [sim, setSim] = useState(false)
  const nomeCli = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '—'
  const lista = cots.filter((c) => filtro === 'todas' || c.status === filtro)
  const atual = cots.find((c) => c.id === aberta)

  if (atual) return <DetalheCotacao c={atual} cliente={nomeCli(atual.clienteId)} voltar={() => setAberta(null)} atualizar={atualizar} avisar={avisar} />

  const criar = () => {
    const base = cots[0]!
    const c: CotacaoDemo = { ...base, id: 'q' + (cots.length + 1), codigo: 'COT-' + (1043 + cots.length - 12), status: 'rascunho', clienteId: clientes[0]!.id, data: '2026-11-05', motivoPerda: undefined, spread: 1000 }
    nova(c)
    setAberta(c.id)
    avisar('Rascunho criado (exemplo).')
  }
  return (
    <>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <Titulo sub="Monte, acompanhe e envie para a operação.">Cotações</Titulo>
        <div className="flex gap-2">
          <Botao tipo="neutro" onClick={() => setSim(!sim)}>Simulador rápido</Botao>
          <Botao tipo="dourado" onClick={criar}>Nova cotação</Botao>
        </div>
      </div>
      {sim && <SimuladorRapido />}
      <div className="flex gap-1.5 flex-wrap">
        {(['todas', 'rascunho', 'enviada_cliente', 'aceita', 'enviada_operacao', 'perdida'] as const).map((s) => (
          <button key={s} onClick={() => setFiltro(s)} className="px-3 py-1.5 rounded-full text-[12px] font-bold" style={{ background: filtro === s ? 'var(--rbr-btn, #1e2761)' : 'var(--rbr-muted-bg)', color: filtro === s ? '#fff' : 'var(--rbr-muted)' }}>
            {s === 'todas' ? 'Todas' : STATUS_COT[s].label}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <Vazio titulo="Nenhuma cotação aqui" texto="Quando você criar cotações nesse estado, elas aparecem nesta lista." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {lista.map((c) => {
            const r = avaliar(c.custo, PARAMS_DEMO, c.piso, c.spread)
            return (
              <button key={c.id} onClick={() => setAberta(c.id)} className="rbr-card p-4 text-left flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[color:var(--rbr-muted)]">{c.codigo} · {dataBr(c.data)}</div>
                  <div className="font-bold text-[color:var(--rbr-navy-dark)] truncate">{nomeCli(c.clienteId)}</div>
                  <div className="text-[13px] text-[color:var(--rbr-muted)]">{c.origem} → {c.destino} · {c.produto}</div>
                </div>
                <div className="text-right">
                  <Selo texto={STATUS_COT[c.status].label} bg={STATUS_COT[c.status].bg} cor={STATUS_COT[c.status].cor} />
                  <div className="rbr-display font-bold mt-1.5">{brl(r.precoFinal)}</div>
                  <div className="text-[12px] text-[color:var(--rbr-positive)] font-semibold">seu spread {brl(r.spread)} ({pct(r.margemPct)})</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function SimuladorRapido() {
  const [preco, setPreco] = useState('9500')
  const [spread, setSpread] = useState('1000')
  const p = Number(preco.replace(',', '.')) || 0
  const s = Number(spread.replace(',', '.')) || 0
  const r = simularRapido(p, ALIQUOTA, s, PARAMS_DEMO.taxaTecnologia)
  const campo = 'w-full rounded-xl border px-3 py-2.5 text-sm font-semibold bg-white'
  return (
    <Cartao>
      <div className="rbr-display font-bold mb-2">Simulador rápido: se eu cobrar X, ganho Y</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-[11px] font-bold uppercase text-[color:var(--rbr-muted)]">Preço ao cliente (R$)<input className={campo} style={{ borderColor: 'var(--rbr-border)' }} value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" /></label>
        <label className="text-[11px] font-bold uppercase text-[color:var(--rbr-muted)]">Quanto quero ganhar (R$)<input className={campo} style={{ borderColor: 'var(--rbr-border)' }} value={spread} onChange={(e) => setSpread(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <div className="rounded-xl p-3" style={{ background: 'var(--rbr-navy-tint)' }}><div className="text-[11px] text-[color:var(--rbr-muted)] font-semibold">Margem</div><div className="rbr-display font-bold text-lg">{pct(r.margemPct)}</div></div>
        <div className="rounded-xl p-3" style={{ background: 'var(--rbr-navy-tint)' }}><div className="text-[11px] text-[color:var(--rbr-muted)] font-semibold">Taxa de tecnologia</div><div className="rbr-display font-bold text-lg">{brl(PARAMS_DEMO.taxaTecnologia)}</div></div>
        <div className="rounded-xl p-3" style={{ background: 'var(--rbr-muted-bg)' }}><div className="text-[11px] text-[color:var(--rbr-muted)] font-semibold">Você recebe</div><div className="rbr-display font-bold text-lg" style={{ color: 'var(--rbr-positive)' }}>{brl(r.spreadLiquido)}</div></div>
      </div>
      <p className="text-[12px] text-[color:var(--rbr-muted)] mt-2">Simulação sem cliente e sem gravar nada. Para valer, monte a cotação completa (o piso do frete é conferido lá).</p>
    </Cartao>
  )
}

function DetalheCotacao({ c, cliente, voltar, atualizar, avisar }: { c: CotacaoDemo; cliente: string; voltar: () => void; atualizar: (id: string, p: Partial<CotacaoDemo>) => void; avisar: (m: string) => void }) {
  const [motivo, setMotivo] = useState('')
  const [perdendo, setPerdendo] = useState(false)
  const r = avaliar(c.custo, PARAMS_DEMO, c.piso, c.spread)
  const travada = c.status === 'enviada_operacao' || c.status === 'perdida'
  const mudar = (status: StatusCot, msg: string, extra: Partial<CotacaoDemo> = {}) => {
    atualizar(c.id, { status, ...extra })
    avisar(msg)
  }
  return (
    <>
      <button onClick={voltar} className="text-sm font-semibold text-[color:var(--rbr-navy)] self-start">← Voltar às cotações</button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Titulo sub={`${c.codigo} · criada em ${dataBr(c.data)}`}>{cliente}</Titulo>
        <Selo texto={STATUS_COT[c.status].label} bg={STATUS_COT[c.status].bg} cor={STATUS_COT[c.status].cor} />
      </div>
      <Cartao>
        <div className="rbr-display font-bold mb-2">Cliente e carga</div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          <div><span className="text-[color:var(--rbr-muted)]">Origem: </span><b>{c.origem}</b></div>
          <div><span className="text-[color:var(--rbr-muted)]">Destino: </span><b>{c.destino}</b></div>
          <div><span className="text-[color:var(--rbr-muted)]">Produto: </span><b>{c.produto}</b></div>
          <div><span className="text-[color:var(--rbr-muted)]">Peso: </span><b>{c.pesoKg.toLocaleString('pt-BR')} kg</b></div>
          <div><span className="text-[color:var(--rbr-muted)]">Prazo de pagamento: </span><b>{c.custo.prazoDias} dias</b></div>
        </div>
      </Cartao>
      <Cartao>
        <div className="rbr-display font-bold mb-3">Seu spread e sua margem</div>
        <SpreadBloco custo={c.custo} params={PARAMS_DEMO} piso={c.piso} spread={c.spread} onSpread={(v) => atualizar(c.id, { spread: v })} bloqueado={travada} />
        {travada && <p className="text-[12px] text-[color:var(--rbr-muted)] mt-3">Esta cotação está travada e não pode mais ser alterada.</p>}
      </Cartao>
      {!travada && (
        <Cartao>
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => avisar('Salvo (exemplo).')}>Salvar</Botao>
            <Botao tipo="neutro" onClick={() => avisar('PDF gerado (exemplo): o link de aceite seria copiado aqui.')}>Gerar PDF e link de aceite</Botao>
            {c.status === 'rascunho' && <Botao tipo="neutro" desabilitado={!!r.erro} titulo={r.erro ?? ''} onClick={() => mudar('enviada_cliente', 'Marcada como enviada ao cliente.')}>Marcar enviada ao cliente</Botao>}
            {c.status === 'enviada_cliente' && <Botao tipo="neutro" onClick={() => mudar('aceita', 'Cotação aceita!')}>Marcar aceita</Botao>}
            {(c.status === 'rascunho' || c.status === 'enviada_cliente') && <Botao tipo="perigo" onClick={() => setPerdendo(true)}>Marcar perdida</Botao>}
            <Botao tipo="dourado" desabilitado={c.status !== 'aceita' || !!r.erro} titulo={c.status !== 'aceita' ? 'Só dá para enviar depois que o cliente aceitar.' : ''} onClick={() => mudar('enviada_operacao', 'Enviada para a operação da RBR. A cotação foi travada.')}>Enviar para a operação</Botao>
          </div>
          {c.status !== 'aceita' && <p className="text-[12px] text-[color:var(--rbr-muted)] mt-2">O envio para a operação só libera depois que o cliente aceitar.</p>}
          {perdendo && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <input className="flex-1 min-w-48 rounded-xl border px-3 py-2.5 text-sm bg-white" style={{ borderColor: 'var(--rbr-border)' }} placeholder="Motivo da perda" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <Botao tipo="perigo" desabilitado={!motivo.trim()} onClick={() => { mudar('perdida', 'Cotação marcada como perdida.', { motivoPerda: motivo }); setPerdendo(false) }}>Confirmar</Botao>
            </div>
          )}
        </Cartao>
      )}
      {c.status === 'perdida' && <Aviso tom="vermelho">Perdida: {c.motivoPerda}</Aviso>}
      {c.status === 'enviada_operacao' && <Aviso tom="azul">Quem cuida da operação é a RBR. Acompanhe na aba Operações.</Aviso>}
    </>
  )
}

function Clientes({ clientes, cots, novo }: { clientes: ClienteDemo[]; cots: CotacaoDemo[]; novo: (c: ClienteDemo) => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState(false)
  const [nome, setNome] = useState('')
  const lista = clientes.filter((c) => (c.nome + c.doc + c.cidade).toLowerCase().includes(q.toLowerCase()))
  const atual = clientes.find((c) => c.id === sel)
  if (atual) {
    const hist = cots.filter((c) => c.clienteId === atual.id)
    return (
      <>
        <button onClick={() => setSel(null)} className="text-sm font-semibold text-[color:var(--rbr-navy)] self-start">← Voltar aos clientes</button>
        <Titulo sub={`${atual.doc} · ${atual.cidade}`}>{atual.nome}</Titulo>
        <Cartao>
          <div className="text-[13px] grid sm:grid-cols-3 gap-2"><div><span className="text-[color:var(--rbr-muted)]">Contato: </span><b>{atual.contato}</b></div><div><span className="text-[color:var(--rbr-muted)]">WhatsApp: </span><b>{atual.whatsapp}</b></div><div><span className="text-[color:var(--rbr-muted)]">E-mail: </span><b>{atual.email}</b></div></div>
          <p className="text-[12px] text-[color:var(--rbr-muted)] mt-2">Este cliente é seu: nenhum outro agenciador enxerga esse cadastro.</p>
        </Cartao>
        <div className="rbr-display font-bold">Histórico de cotações</div>
        {hist.length === 0 ? <Vazio titulo="Sem cotações ainda" texto="Faça a primeira cotação para este cliente na aba Cotações." /> : hist.map((c) => (
          <Cartao key={c.id}><div className="flex justify-between gap-2 flex-wrap"><div><b>{c.codigo}</b> · {c.origem} → {c.destino}</div><div className="flex items-center gap-2"><Selo texto={STATUS_COT[c.status].label} bg={STATUS_COT[c.status].bg} cor={STATUS_COT[c.status].cor} /><b>{brl(precoDe(c))}</b></div></div></Cartao>
        ))}
      </>
    )
  }
  return (
    <>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <Titulo sub="Sua carteira privada de clientes.">Clientes</Titulo>
        <Botao tipo="dourado" onClick={() => setForm(!form)}>Novo cliente</Botao>
      </div>
      {form && (
        <Cartao>
          <div className="flex gap-2 flex-wrap">
            <input className="flex-1 min-w-48 rounded-xl border px-3 py-2.5 text-sm bg-white" style={{ borderColor: 'var(--rbr-border)' }} placeholder="Nome ou razão social (exemplo)" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Botao desabilitado={!nome.trim()} onClick={() => { novo({ id: 'c' + (clientes.length + 1), nome, doc: '00.000.000/0001-00', cidade: '—', contato: '—', whatsapp: '—', email: '—' }); setNome(''); setForm(false) }}>Salvar cliente</Botao>
          </div>
          <p className="text-[12px] text-[color:var(--rbr-muted)] mt-2">Na conta real, o CNPJ preenche razão social, fantasia e cidade automaticamente.</p>
        </Cartao>
      )}
      <input className="rounded-xl border px-3.5 py-2.5 text-sm bg-white" style={{ borderColor: 'var(--rbr-border)' }} placeholder="Buscar por nome, CNPJ ou cidade" value={q} onChange={(e) => setQ(e.target.value)} />
      {lista.length === 0 ? <Vazio titulo="Nenhum cliente encontrado" texto="Tente outro nome ou cadastre um novo cliente." /> : (
        <div className="grid md:grid-cols-2 gap-2.5">
          {lista.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className="rbr-card p-4 text-left">
              <div className="font-bold text-[color:var(--rbr-navy-dark)]">{c.nome}</div>
              <div className="text-[13px] text-[color:var(--rbr-muted)]">{c.cidade} · {c.contato}</div>
              <div className="text-[12px] text-[color:var(--rbr-muted)] mt-1">{cots.filter((x) => x.clienteId === c.id).length} cotação(ões)</div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function Operacoes({ cots, clientes }: { cots: CotacaoDemo[]; clientes: ClienteDemo[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const ops = OPERACOES_DEMO
  const atual = ops.find((o) => o.id === sel)
  const info = (cid: string) => {
    const c = cots.find((x) => x.id === cid)!
    return { c, cli: clientes.find((x) => x.id === c.clienteId)?.nome ?? '—' }
  }
  if (atual) {
    const { c, cli } = info(atual.cotacaoId)
    const idx = ETAPAS.findIndex((e) => e.k === atual.etapa)
    return (
      <>
        <button onClick={() => setSel(null)} className="text-sm font-semibold text-[color:var(--rbr-navy)] self-start">← Voltar às operações</button>
        <Titulo sub={`${c.origem} → ${c.destino}`}>{atual.codigo} · {cli}</Titulo>
        <Cartao>
          <ol className="flex flex-col gap-3">
            {ETAPAS.map((e, i) => (
              <li key={e.k} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: i <= idx ? 'var(--rbr-positive)' : 'var(--rbr-muted-bg)', color: i <= idx ? '#fff' : 'var(--rbr-muted)' }}>{i <= idx ? '✔' : i + 1}</span>
                <span className="text-sm" style={{ fontWeight: i === idx ? 800 : 500, color: i <= idx ? 'var(--rbr-navy-dark)' : 'var(--rbr-muted)' }}>{e.label}</span>
              </li>
            ))}
          </ol>
          <div className="text-[13px] mt-4 flex gap-6 flex-wrap"><span>Coleta prevista: <b>{dataBr(atual.coleta)}</b></span><span>Entrega prevista: <b>{dataBr(atual.entrega)}</b></span></div>
        </Cartao>
        <Aviso tom="azul">Quem cuida da operação é a RBR. Aqui você só acompanha.</Aviso>
      </>
    )
  }
  return (
    <>
      <Titulo sub="Quem cuida da operação é a RBR. Aqui você só acompanha.">Operações</Titulo>
      <div className="flex flex-col gap-2.5">
        {ops.map((o) => {
          const { c, cli } = info(o.cotacaoId)
          const et = ETAPAS.find((e) => e.k === o.etapa)!
          return (
            <button key={o.id} onClick={() => setSel(o.id)} className="rbr-card p-4 text-left flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-[11px] font-bold text-[color:var(--rbr-muted)]">{o.codigo}</div><div className="font-bold">{cli}</div><div className="text-[13px] text-[color:var(--rbr-muted)]">{c.origem} → {c.destino}</div></div>
              <div className="text-right"><Selo texto={et.label} bg={o.etapa === 'entregue' ? 'var(--rbr-positive)' : 'var(--rbr-muted-bg)'} cor={o.etapa === 'entregue' ? '#fff' : 'var(--rbr-navy)'} /><div className="text-[12px] text-[color:var(--rbr-muted)] mt-1.5">Entrega prevista {dataBr(o.entrega)}</div></div>
            </button>
          )
        })}
      </div>
    </>
  )
}

type StatusSpread = 'Previsto' | 'A receber' | 'Pago'
function Financeiro({ cots, clientes, avisar }: { cots: CotacaoDemo[]; clientes: ClienteDemo[]; avisar: (m: string) => void }) {
  const [cli, setCli] = useState('todos')
  const linhas = useMemo(() => {
    return OPERACOES_DEMO.map((o, i) => {
      const c = cots.find((x) => x.id === o.cotacaoId)!
      const r = avaliar(c.custo, PARAMS_DEMO, c.piso, c.spread)
      const st: StatusSpread = o.etapa === 'entregue' ? (i === 4 ? 'A receber' : 'Pago') : 'Previsto'
      return { o, c, r, st, cliente: clientes.find((x) => x.id === c.clienteId)!, data: c.data }
    })
  }, [cots, clientes])
  const vis = linhas.filter((l) => cli === 'todos' || l.cliente.id === cli)
  const mesAtual = { cotado: cots.filter((c) => c.status !== 'rascunho').reduce((a, c) => a + precoDe(c), 0), fechado: cots.filter((c) => c.status === 'enviada_operacao').reduce((a, c) => a + precoDe(c), 0) }
  const liquidoMes = linhas.reduce((a, l) => a + l.r.spreadLiquido, 0)
  const aReceber = linhas.filter((l) => l.st === 'A receber').reduce((a, l) => a + l.r.spreadLiquido, 0)
  const pago = linhas.filter((l) => l.st === 'Pago').reduce((a, l) => a + l.r.spreadLiquido, 0)
  const conv = cots.filter((c) => c.status === 'enviada_operacao').length / Math.max(1, cots.filter((c) => c.status !== 'rascunho').length)
  const margemMedia = linhas.reduce((a, l) => a + l.r.margemPct, 0) / Math.max(1, linhas.length)
  const serie = [...HISTORICO_DEMO.map((h) => ({ mes: h.mes, v: h.spreadLiquido })), { mes: '2026-11', v: liquidoMes }]
  const todos = [{ mes: '2026-07', v: 0 }, ...serie]

  const exportar = () => {
    const cab = 'data;cliente;rota;preco_final;spread_bruto;taxa_tecnologia;spread_liquido;status'
    const rows = vis.map((l) => [dataBr(l.data), l.cliente.nome, `${l.c.origem} -> ${l.c.destino}`, l.r.precoFinal.toFixed(2), l.r.spread.toFixed(2), l.r.taxaTecnologia.toFixed(2), l.r.spreadLiquido.toFixed(2), l.st].join(';'))
    const blob = new Blob(['﻿' + [cab, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'extrato-agenciador-exemplo.csv'
    a.click()
    avisar('CSV de exemplo baixado.')
  }
  const cor: Record<StatusSpread, { bg: string; c: string }> = { Previsto: { bg: 'var(--rbr-muted-bg)', c: 'var(--rbr-muted)' }, 'A receber': { bg: 'var(--rbr-warning-bg)', c: 'var(--rbr-navy-dark)' }, Pago: { bg: '#E3F5EA', c: '#14532d' } }
  return (
    <>
      <Titulo sub="Tudo calculado do seu spread. Somente leitura.">Financeiro</Titulo>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Cotado no mês', brl(mesAtual.cotado)], ['Fechado', brl(mesAtual.fechado)], ['Taxa de conversão', pct(conv)], ['Spread líquido ganho', brl(liquidoMes)],
          ['Margem média', pct(margemMedia)], ['A receber', brl(aReceber)], ['Recebido', brl(pago)],
        ].map(([t, v]) => (
          <Cartao key={t}><div className="text-[11px] font-semibold text-[color:var(--rbr-muted)]">{t}</div><div className="rbr-display font-bold text-xl mt-1">{v}</div></Cartao>
        ))}
      </div>
      <Cartao>
        <div className="rbr-display font-bold mb-2">Spread líquido por mês</div>
        <Grafico dados={todos} />
      </Cartao>
      <Aviso tom="azul">A RBR paga o seu spread depois que o cliente paga a RBR. O prazo é o combinado no seu contrato.</Aviso>
      <Cartao className="overflow-x-auto">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="rbr-display font-bold">Extrato por operação</div>
          <div className="flex gap-2">
            <select className="rounded-xl border px-3 py-2 text-sm bg-white" style={{ borderColor: 'var(--rbr-border)' }} value={cli} onChange={(e) => setCli(e.target.value)}>
              <option value="todos">Todos os clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <Botao tipo="neutro" onClick={exportar}>Exportar CSV</Botao>
          </div>
        </div>
        {vis.length === 0 ? <Vazio titulo="Sem operações para este filtro" texto="Escolha outro cliente ou volte para todos." /> : (
          <table className="w-full text-[13px] min-w-[720px]">
            <thead><tr className="text-left text-[11px] uppercase text-[color:var(--rbr-muted)]">{['Data', 'Cliente', 'Rota', 'Preço final', 'Spread bruto', 'Taxa tec.', 'Líquido', 'Status'].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
            <tbody>
              {vis.map((l) => (
                <tr key={l.o.id} className="border-t" style={{ borderColor: 'var(--rbr-border)' }}>
                  <td className="py-2.5 pr-3">{dataBr(l.data)}</td><td className="pr-3">{l.cliente.nome}</td><td className="pr-3">{l.c.origem.split('/')[0]} → {l.c.destino.split('/')[0]}</td>
                  <td className="pr-3">{brl(l.r.precoFinal)}</td><td className="pr-3">{brl(l.r.spread)}</td><td className="pr-3">{brl(l.r.taxaTecnologia)}</td><td className="pr-3 font-bold">{brl(l.r.spreadLiquido)}</td>
                  <td><Selo texto={l.st} bg={cor[l.st].bg} cor={cor[l.st].c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  )
}

function Grafico({ dados }: { dados: { mes: string; v: number }[] }) {
  const W = 560, H = 220, mL = 56, mB = 32, mT = 12
  const max = Math.max(1000, ...dados.map((d) => d.v))
  const teto = Math.ceil(max / 1000) * 1000
  const bw = (W - mL - 12) / dados.length
  const y = (v: number) => mT + (H - mT - mB) * (1 - v / teto)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Spread líquido por mês">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={mL} x2={W - 8} y1={y(teto * f)} y2={y(teto * f)} stroke="var(--rbr-border)" />
          <text x={mL - 6} y={y(teto * f) + 4} textAnchor="end" fontSize="11" fill="var(--rbr-muted)">{(teto * f).toLocaleString('pt-BR')}</text>
        </g>
      ))}
      {dados.map((d, i) => (
        <g key={d.mes}>
          <rect x={mL + i * bw + bw * 0.2} y={y(d.v)} width={bw * 0.6} height={Math.max(0, H - mB - y(d.v))} rx="5" fill="var(--rbr-gold)" />
          <text x={mL + i * bw + bw / 2} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--rbr-muted)">{MESES_PT[d.mes] ?? d.mes}</text>
          {d.v > 0 && <text x={mL + i * bw + bw / 2} y={y(d.v) - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--rbr-navy-dark)">{Math.round(d.v).toLocaleString('pt-BR')}</text>}
        </g>
      ))}
      <text x={10} y={H / 2} fontSize="11" fill="var(--rbr-muted)" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">R$</text>
    </svg>
  )
}

function Perfil({ avisar }: { avisar: (m: string) => void }) {
  const a = AGENCIADOR_DEMO
  return (
    <>
      <Titulo sub="Seus dados e a sua marca no painel.">Perfil</Titulo>
      <Cartao>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="bg-white rounded-xl border p-1" style={{ borderColor: 'var(--rbr-border)' }}><img src={LOGO_DEMO} alt="Logotipo de exemplo" style={{ height: 56 }} /></span>
          <div className="text-[13px]"><b>Logotipo</b><br /><span className="text-[color:var(--rbr-muted)]">PNG, JPG ou WebP, até 1 MB. Ajustamos para no máximo 512 px.</span></div>
          <Botao tipo="neutro" onClick={() => avisar('Na demonstração o envio de arquivo fica desligado.')}>Trocar logotipo</Botao>
        </div>
      </Cartao>
      <Cartao>
        <div className="grid sm:grid-cols-2 gap-2 text-[13px]">
          {[['Empresa', a.nome], ['CNPJ', a.cnpj], ['Responsável', a.responsavel], ['E-mail', a.email], ['WhatsApp', a.whatsapp]].map(([k, v]) => <div key={k}><span className="text-[color:var(--rbr-muted)]">{k}: </span><b>{v}</b></div>)}
        </div>
        <div className="mt-3"><Selo texto="Cadastro aprovado (exemplo)" bg="#E3F5EA" cor="#14532d" /></div>
      </Cartao>
    </>
  )
}
