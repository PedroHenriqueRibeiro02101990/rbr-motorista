import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Botao, Card, Carregando, inputClass, inputStyle, Kpi, Vazio } from '../financeiro/ui'

// As tabelas do disparo (contatos_motoristas, envios_whatsapp, parametros 'disparo_whatsapp')
// ainda não estão em shared/database.types.ts: usamos o cliente sem tipos e tipos locais mínimos.
const db = supabase as unknown as SupabaseClient

type StatusContato = 'na_fila' | 'conferir' | 'enviado' | 'cadastrado' | 'nao_enviar'

type Contato = {
  id: string
  nome: string | null
  celular: string
  tipo_linha: 'celular' | 'fixo'
  ddd: string | null
  uf: string | null
  regiao: string | null
  tipo_veiculo: string | null
  telefone_alternativo: string | null
  observacao: string | null
  status: StatusContato
  nao_enviar: boolean
  total_envios: number
  ultimo_envio_em: string | null
  pessoa_id: string | null
  cadastrado_em: string | null
}

type ConfigDisparo = { link_cadastro: string; rodape_saida: string; limite_diario: number }

type Filtros = { busca: string; uf: string; regiao: string; ddd: string; veiculo: string; status: StatusContato | '' }

const COLUNAS = 'id, nome, celular, tipo_linha, ddd, uf, regiao, tipo_veiculo, telefone_alternativo, observacao, status, nao_enviar, total_envios, ultimo_envio_em, pessoa_id, cadastrado_em'
const POR_PAGINA = 50

const STATUS: Record<StatusContato, { label: string; bg: string; fg: string }> = {
  na_fila: { label: 'Na fila', bg: '#E8EEFB', fg: 'var(--rbr-navy)' },
  conferir: { label: 'A conferir', bg: '#FDF1DC', fg: '#8A5A00' },
  enviado: { label: 'Enviado', bg: '#E7F5EC', fg: 'var(--rbr-positive)' },
  cadastrado: { label: 'Cadastrado', bg: '#DDF3E4', fg: '#1F7A3D' },
  nao_enviar: { label: 'Não enviar', bg: '#FBE9E9', fg: 'var(--rbr-danger)' },
}
const ORDEM_STATUS: StatusContato[] = ['na_fila', 'enviado', 'cadastrado', 'nao_enviar', 'conferir']

function SeloStatus({ status }: { status: StatusContato }) {
  const s = STATUS[status] ?? { label: status, bg: '#F1F2F6', fg: '#6B7280' }
  return (
    <span className="inline-block text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

function soDigitos(s: string) {
  return s.replace(/\D/g, '')
}

// 55 + DDD + número → "(11) 98765-4321".
function formatarCelular(celular: string) {
  const d = soDigitos(celular).replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return celular
}

// Aceita com ou sem o 55 na frente; devolve null se não for 55 + 10 ou 11 dígitos.
function normalizarCelular(texto: string): string | null {
  let d = soDigitos(texto)
  if (d.length === 10 || d.length === 11) d = '55' + d
  return /^55\d{10,11}$/.test(d) ? d : null
}

// DDD → UF e região (área do DDD, conforme a Anatel). Usado ao corrigir o telefone.
const DDD_INFO: Record<string, { uf: string; regiao: string }> = {
  '11': { uf: 'SP', regiao: 'São Paulo e região metropolitana' },
  '12': { uf: 'SP', regiao: 'Vale do Paraíba e Litoral Norte' },
  '13': { uf: 'SP', regiao: 'Baixada Santista e Vale do Ribeira' },
  '14': { uf: 'SP', regiao: 'Bauru e Marília' },
  '15': { uf: 'SP', regiao: 'Sorocaba' },
  '16': { uf: 'SP', regiao: 'Ribeirão Preto e Araraquara' },
  '17': { uf: 'SP', regiao: 'São José do Rio Preto' },
  '18': { uf: 'SP', regiao: 'Presidente Prudente e Araçatuba' },
  '19': { uf: 'SP', regiao: 'Campinas e Piracicaba' },
  '21': { uf: 'RJ', regiao: 'Rio de Janeiro e região metropolitana' },
  '22': { uf: 'RJ', regiao: 'Norte Fluminense e Região dos Lagos' },
  '24': { uf: 'RJ', regiao: 'Sul Fluminense e Região Serrana' },
  '27': { uf: 'ES', regiao: 'Vitória e região' },
  '28': { uf: 'ES', regiao: 'Sul do Espírito Santo' },
  '31': { uf: 'MG', regiao: 'Belo Horizonte e região' },
  '32': { uf: 'MG', regiao: 'Juiz de Fora e Zona da Mata' },
  '33': { uf: 'MG', regiao: 'Governador Valadares e Vale do Rio Doce' },
  '34': { uf: 'MG', regiao: 'Uberlândia e Triângulo Mineiro' },
  '35': { uf: 'MG', regiao: 'Sul de Minas' },
  '37': { uf: 'MG', regiao: 'Divinópolis e Centro-Oeste de Minas' },
  '38': { uf: 'MG', regiao: 'Montes Claros e Norte de Minas' },
  '41': { uf: 'PR', regiao: 'Curitiba e região' },
  '42': { uf: 'PR', regiao: 'Ponta Grossa e Campos Gerais' },
  '43': { uf: 'PR', regiao: 'Londrina e Norte do Paraná' },
  '44': { uf: 'PR', regiao: 'Maringá e Noroeste do Paraná' },
  '45': { uf: 'PR', regiao: 'Cascavel e Oeste do Paraná' },
  '46': { uf: 'PR', regiao: 'Sudoeste do Paraná' },
  '47': { uf: 'SC', regiao: 'Joinville e Vale do Itajaí' },
  '48': { uf: 'SC', regiao: 'Florianópolis e Sul de Santa Catarina' },
  '49': { uf: 'SC', regiao: 'Oeste de Santa Catarina' },
  '51': { uf: 'RS', regiao: 'Porto Alegre e região' },
  '53': { uf: 'RS', regiao: 'Pelotas e Sul do Rio Grande do Sul' },
  '54': { uf: 'RS', regiao: 'Caxias do Sul e Serra Gaúcha' },
  '55': { uf: 'RS', regiao: 'Santa Maria e Oeste do Rio Grande do Sul' },
  '61': { uf: 'DF', regiao: 'Distrito Federal e entorno' },
  '62': { uf: 'GO', regiao: 'Goiânia e região' },
  '63': { uf: 'TO', regiao: 'Tocantins' },
  '64': { uf: 'GO', regiao: 'Sul de Goiás' },
  '65': { uf: 'MT', regiao: 'Cuiabá e região' },
  '66': { uf: 'MT', regiao: 'Interior de Mato Grosso' },
  '67': { uf: 'MS', regiao: 'Mato Grosso do Sul' },
  '68': { uf: 'AC', regiao: 'Acre' },
  '69': { uf: 'RO', regiao: 'Rondônia' },
  '71': { uf: 'BA', regiao: 'Salvador e região' },
  '73': { uf: 'BA', regiao: 'Sul da Bahia' },
  '74': { uf: 'BA', regiao: 'Norte da Bahia' },
  '75': { uf: 'BA', regiao: 'Feira de Santana e Recôncavo' },
  '77': { uf: 'BA', regiao: 'Oeste e Sudoeste da Bahia' },
  '79': { uf: 'SE', regiao: 'Sergipe' },
  '81': { uf: 'PE', regiao: 'Recife e região' },
  '82': { uf: 'AL', regiao: 'Alagoas' },
  '83': { uf: 'PB', regiao: 'Paraíba' },
  '84': { uf: 'RN', regiao: 'Rio Grande do Norte' },
  '85': { uf: 'CE', regiao: 'Fortaleza e região' },
  '86': { uf: 'PI', regiao: 'Teresina e Norte do Piauí' },
  '87': { uf: 'PE', regiao: 'Sertão de Pernambuco' },
  '88': { uf: 'CE', regiao: 'Interior do Ceará' },
  '89': { uf: 'PI', regiao: 'Sul do Piauí' },
  '91': { uf: 'PA', regiao: 'Belém e região' },
  '92': { uf: 'AM', regiao: 'Manaus e região' },
  '93': { uf: 'PA', regiao: 'Santarém e Oeste do Pará' },
  '94': { uf: 'PA', regiao: 'Marabá e Sudeste do Pará' },
  '95': { uf: 'RR', regiao: 'Roraima' },
  '96': { uf: 'AP', regiao: 'Amapá' },
  '97': { uf: 'AM', regiao: 'Interior do Amazonas' },
  '98': { uf: 'MA', regiao: 'São Luís e Norte do Maranhão' },
  '99': { uf: 'MA', regiao: 'Sul do Maranhão' },
}

// Só recebe mensagem quem está na fila ou já recebeu, com celular (fixo não tem WhatsApp garantido).
// "A conferir" só depois de corrigir o telefone; "não enviar" e "cadastrado" nunca.
function podeReceber(c: Contato) {
  return (c.status === 'na_fila' || c.status === 'enviado') && !c.nao_enviar && c.tipo_linha === 'celular'
}

function tipoLinhaDe(celular: string): 'celular' | 'fixo' {
  return celular.length === 13 && celular[4] === '9' ? 'celular' : 'fixo'
}

// Data de hoje e hora atual no horário de Brasília (o Brasil não tem mais horário de verão: -03:00).
function hojeBrasilia() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
function saudacaoAgora() {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()))
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

// No começo do texto ou de frase: "Bom dia". No meio da frase ("Olá, {saudacao}!"): "bom dia".
function montarTexto(modelo: string, cfg: ConfigDisparo) {
  const saudacao = saudacaoAgora()
  const corpo = modelo
    .replace(/(^|[.!?]\s+)\{saudacao\}/g, (_m, antes: string) => antes + saudacao)
    .replaceAll('{saudacao}', saudacao.toLowerCase())
    .replaceAll('{link}', cfg.link_cadastro)
  return cfg.rodape_saida ? `${corpo}\n\n${cfg.rodape_saida}` : corpo
}

function mensagemErro(e: { message?: string; code?: string } | null | undefined) {
  if (!e) return 'Algo deu errado. Tente de novo.'
  if (e.code === '23505') return 'Esse telefone já está em outro contato.'
  if (e.code === '23514') return 'Telefone inválido. Use DDD + número.'
  return e.message || 'Algo deu errado. Tente de novo.'
}

// Aplica os filtros (menos status) numa consulta de contatos_motoristas.
function aplicarFiltros<Q extends { eq: (c: string, v: string) => Q; or: (f: string) => Q }>(q: Q, f: Filtros): Q {
  const busca = f.busca.trim()
  if (busca) {
    const termo = busca.replace(/[,()*%]/g, ' ').trim()
    const dig = soDigitos(busca)
    const partes = [`nome.ilike.*${termo}*`]
    if (dig.length >= 3) partes.push(`celular.like.*${dig}*`, `telefone_alternativo.like.*${dig}*`)
    q = q.or(partes.join(','))
  }
  if (f.uf) q = q.eq('uf', f.uf)
  if (f.regiao) q = q.eq('regiao', f.regiao)
  if (f.ddd) q = q.eq('ddd', f.ddd)
  if (f.veiculo) q = q.eq('tipo_veiculo', f.veiculo)
  return q
}

const FILTROS_INICIAIS: Filtros = { busca: '', uf: '', regiao: '', ddd: '', veiculo: '', status: 'na_fila' }

export default function GestaoContatos() {
  const [cfg, setCfg] = useState<ConfigDisparo | null>(null)
  const [contagem, setContagem] = useState<Record<StatusContato, number> | null>(null)
  const [enviadosHoje, setEnviadosHoje] = useState<number | null>(null)
  const [opcoes, setOpcoes] = useState<{ uf: string[]; regiao: string[]; ddd: string[]; veiculo: string[] }>({ uf: [], regiao: [], ddd: [], veiculo: [] })

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS)
  const [buscaDigitada, setBuscaDigitada] = useState('')
  const [lista, setLista] = useState<Contato[] | null>(null)
  const [total, setTotal] = useState(0)
  const [carregandoMais, setCarregandoMais] = useState(false)

  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [enviandoProximo, setEnviandoProximo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [telefoneEditado, setTelefoneEditado] = useState<Record<string, string>>({})

  const limite = cfg?.limite_diario ?? 0
  const limiteAtingido = cfg != null && enviadosHoje != null && limite > 0 && enviadosHoje >= limite

  const carregarResumo = useCallback(async () => {
    const inicioHoje = `${hojeBrasilia()}T00:00:00-03:00`
    const [porStatus, hoje] = await Promise.all([
      Promise.all(ORDEM_STATUS.map((s) => db.from('contatos_motoristas').select('id', { count: 'exact', head: true }).eq('status', s))),
      db.from('envios_whatsapp').select('id', { count: 'exact', head: true }).gte('enviado_em', inicioHoje),
    ])
    const c = {} as Record<StatusContato, number>
    ORDEM_STATUS.forEach((s, i) => (c[s] = porStatus[i].count ?? 0))
    setContagem(c)
    setEnviadosHoje(hoje.count ?? 0)
  }, [])

  // Configuração e opções dos filtros: só uma vez.
  useEffect(() => {
    db.from('parametros_sistema')
      .select('valor')
      .eq('chave', 'disparo_whatsapp')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setErro(mensagemErro(error))
        const v = (data?.valor ?? {}) as Partial<ConfigDisparo>
        setCfg({ link_cadastro: v.link_cadastro ?? '', rodape_saida: v.rodape_saida ?? '', limite_diario: Number(v.limite_diario ?? 0) })
      })
    ;(async () => {
      const uf = new Set<string>(), regiao = new Set<string>(), ddd = new Set<string>(), veiculo = new Set<string>()
      // Lê só as colunas dos filtros, de mil em mil.
      for (let de = 0; de < 20000; de += 1000) {
        const { data } = await db.from('contatos_motoristas').select('uf, regiao, ddd, tipo_veiculo').range(de, de + 999)
        const linhas = (data ?? []) as Pick<Contato, 'uf' | 'regiao' | 'ddd' | 'tipo_veiculo'>[]
        for (const l of linhas) {
          if (l.uf) uf.add(l.uf)
          if (l.regiao) regiao.add(l.regiao)
          if (l.ddd) ddd.add(l.ddd)
          if (l.tipo_veiculo) veiculo.add(l.tipo_veiculo)
        }
        if (linhas.length < 1000) break
      }
      const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      setOpcoes({ uf: ord(uf), regiao: ord(regiao), ddd: ord(ddd), veiculo: ord(veiculo) })
    })()
    carregarResumo()
  }, [carregarResumo])

  // A busca só dispara depois que a pessoa para de digitar.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.busca === buscaDigitada ? f : { ...f, busca: buscaDigitada })), 350)
    return () => clearTimeout(t)
  }, [buscaDigitada])

  const consultaLista = useCallback(
    (de: number) => {
      let q = db.from('contatos_motoristas').select(COLUNAS, { count: 'exact' })
      q = aplicarFiltros(q, filtros)
      if (filtros.status) q = q.eq('status', filtros.status)
      return q.order('created_at', { ascending: true }).order('id').range(de, de + POR_PAGINA - 1)
    },
    [filtros],
  )

  useEffect(() => {
    let vivo = true
    setLista(null)
    consultaLista(0).then(({ data, count, error }) => {
      if (!vivo) return
      if (error) setErro(mensagemErro(error))
      setLista((data ?? []) as Contato[])
      setTotal(count ?? 0)
    })
    return () => {
      vivo = false
    }
  }, [consultaLista])

  async function carregarMais() {
    if (!lista) return
    setCarregandoMais(true)
    const { data, error } = await consultaLista(lista.length)
    if (error) setErro(mensagemErro(error))
    setLista([...lista, ...((data ?? []) as Contato[])])
    setCarregandoMais(false)
  }

  async function atualizarLinha(id: string) {
    const { data } = await db.from('contatos_motoristas').select(COLUNAS).eq('id', id).maybeSingle()
    if (!data) return
    const novo = data as Contato
    setLista((l) => (l?.some((c) => c.id === id) ? l.map((c) => (c.id === id ? novo : c)) : l))
  }

  // Fluxo do envio. Recebe a janela já aberta (precisa ser aberta dentro do clique,
  // senão o navegador bloqueia) e o contato a enviar.
  async function enviar(janela: Window, contato: Contato) {
    if (!cfg) throw new Error('Configuração do disparo ainda não carregou. Tente de novo.')
    const { data, error } = await db.rpc('proxima_mensagem_disparo', { p_contato: contato.id })
    if (error) throw new Error(mensagemErro(error))
    const msg = ((data ?? []) as { id: string; texto: string }[])[0]
    if (!msg) throw new Error(`${contato.nome || 'Esse contato'} já recebeu todas as mensagens.`)
    const texto = montarTexto(msg.texto, cfg)
    janela.location.href = `https://wa.me/${contato.celular}?text=${encodeURIComponent(texto)}`
    const reg = await db.rpc('registrar_envio_whatsapp', { p_contato: contato.id, p_mensagem: msg.id, p_texto_final: texto })
    if (reg.error) throw new Error(mensagemErro(reg.error))
    setEnviadosHoje((n) => (n ?? 0) + 1)
    setOk(`Mensagem aberta no WhatsApp para ${contato.nome || formatarCelular(contato.celular)}.`)
    await Promise.all([atualizarLinha(contato.id), carregarResumo()])
  }

  function avisoLimite() {
    setErro(`Limite de hoje atingido (${enviadosHoje} de ${limite}). Os envios voltam amanhã.`)
  }

  async function enviarContato(contato: Contato) {
    setErro(null)
    setOk(null)
    if (limiteAtingido) return avisoLimite()
    const janela = window.open('', '_blank')
    if (!janela) return setErro('O navegador bloqueou a janela do WhatsApp. Libere janelas pop-up para este site.')
    setOcupadoId(contato.id)
    try {
      await enviar(janela, contato)
    } catch (e) {
      janela.close()
      setErro((e as Error).message)
    } finally {
      setOcupadoId(null)
    }
  }

  async function enviarProximo() {
    setErro(null)
    setOk(null)
    if (limiteAtingido) return avisoLimite()
    const janela = window.open('', '_blank')
    if (!janela) return setErro('O navegador bloqueou a janela do WhatsApp. Libere janelas pop-up para este site.')
    setEnviandoProximo(true)
    try {
      let q = db.from('contatos_motoristas').select(COLUNAS)
      q = aplicarFiltros(q, filtros).eq('status', 'na_fila').eq('nao_enviar', false).eq('tipo_linha', 'celular')
      const { data, error } = await q.order('created_at', { ascending: true }).order('id').limit(1)
      if (error) throw new Error(mensagemErro(error))
      const proximo = ((data ?? []) as Contato[])[0]
      if (!proximo) throw new Error('Não há ninguém na fila com esses filtros.')
      setOcupadoId(proximo.id)
      await enviar(janela, proximo)
    } catch (e) {
      janela.close()
      setErro((e as Error).message)
    } finally {
      setEnviandoProximo(false)
      setOcupadoId(null)
    }
  }

  async function naoEnviarMais(contato: Contato) {
    if (!window.confirm(`Parar de enviar mensagens para ${contato.nome || formatarCelular(contato.celular)}?`)) return
    setErro(null)
    setOk(null)
    setOcupadoId(contato.id)
    const { error } = await db.rpc('marcar_contato_nao_enviar', { p_contato: contato.id, p_motivo: 'marcado pelo gestor' })
    if (error) setErro(mensagemErro(error))
    await Promise.all([atualizarLinha(contato.id), carregarResumo()])
    setOcupadoId(null)
  }

  async function reativar(contato: Contato) {
    setErro(null)
    setOk(null)
    setOcupadoId(contato.id)
    const { error } = await db.rpc('reativar_contato', { p_contato: contato.id })
    if (error) setErro(mensagemErro(error))
    await Promise.all([atualizarLinha(contato.id), carregarResumo()])
    setOcupadoId(null)
  }

  async function salvarTelefone(contato: Contato) {
    setErro(null)
    setOk(null)
    const celular = normalizarCelular(telefoneEditado[contato.id] ?? contato.celular)
    if (!celular) return setErro('Telefone inválido. Digite DDD + número (10 ou 11 dígitos).')
    const local = DDD_INFO[celular.slice(2, 4)]
    setOcupadoId(contato.id)
    const { error } = await db
      .from('contatos_motoristas')
      .update({ celular, tipo_linha: tipoLinhaDe(celular), status: 'na_fila', uf: local?.uf ?? contato.uf, regiao: local?.regiao ?? contato.regiao })
      .eq('id', contato.id)
    if (error) setErro(mensagemErro(error))
    else {
      setTelefoneEditado((t) => {
        const resto = { ...t }
        delete resto[contato.id]
        return resto
      })
      setOk('Telefone corrigido. O contato voltou para a fila.')
    }
    await Promise.all([atualizarLinha(contato.id), carregarResumo()])
    setOcupadoId(null)
  }

  const semNenhumContato = contagem != null && Object.values(contagem).every((n) => n === 0)
  const filtrosAtivos = useMemo(
    () => !!(filtros.busca || filtros.uf || filtros.regiao || filtros.ddd || filtros.veiculo || filtros.status !== FILTROS_INICIAIS.status),
    [filtros],
  )

  const selectFiltro = (valor: string, onChange: (v: string) => void, rotulo: string, itens: { valor: string; label: string }[]) => (
    <select aria-label={rotulo} value={valor} onChange={(e) => onChange(e.target.value)} className={inputClass} style={inputStyle}>
      <option value="">{rotulo}: todos</option>
      {itens.map((i) => (
        <option key={i.valor} value={i.valor}>
          {i.label}
        </option>
      ))}
    </select>
  )
  const comoOpcoes = (l: string[]) => l.map((v) => ({ valor: v, label: v }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Na fila" valor={contagem ? String(contagem.na_fila) : '…'} />
        <Kpi label="Enviados" valor={contagem ? String(contagem.enviado) : '…'} />
        <Kpi label="Cadastrados" valor={contagem ? String(contagem.cadastrado) : '…'} tom="bom" />
        <Kpi label="Não enviar" valor={contagem ? String(contagem.nao_enviar) : '…'} />
        <Kpi label="A conferir" valor={contagem ? String(contagem.conferir) : '…'} tom={contagem?.conferir ? 'atencao' : undefined} />
        <Kpi
          label="Hoje"
          valor={enviadosHoje != null && cfg ? `${enviadosHoje} de ${limite}` : '…'}
          sub="enviados hoje"
          tom={limiteAtingido ? 'ruim' : undefined}
        />
      </div>

      {erro && (
        <Aviso tipo="erro" onFechar={() => setErro(null)}>
          {erro}
        </Aviso>
      )}
      {ok && (
        <Aviso tipo="ok" onFechar={() => setOk(null)}>
          {ok}
        </Aviso>
      )}

      {semNenhumContato ? (
        <Card>
          <Vazio>
            <div className="font-bold text-[color:var(--rbr-navy-dark)]">Nenhum contato carregado ainda</div>
            <div className="mt-1">Quando a lista de motoristas for importada, os contatos aparecem aqui para envio.</div>
          </Vazio>
        </Card>
      ) : (
        <>
          <button
            type="button"
            onClick={enviarProximo}
            disabled={enviandoProximo || !cfg || limiteAtingido}
            className="w-full sm:w-auto sm:self-start text-base font-bold px-6 py-3.5 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: '#1F9D55', color: '#fff' }}
          >
            {enviandoProximo ? 'Abrindo WhatsApp…' : 'Enviar para o próximo da fila'}
          </button>
          {limiteAtingido && <div className="text-xs text-[color:var(--rbr-danger)] -mt-2">Limite de hoje atingido. Os envios voltam amanhã.</div>}

          <Card titulo="Filtros">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              <input
                placeholder="Buscar nome ou telefone"
                value={buscaDigitada}
                onChange={(e) => setBuscaDigitada(e.target.value)}
                className={`${inputClass} col-span-2 md:col-span-3 lg:col-span-5`}
                style={inputStyle}
              />
              {selectFiltro(filtros.uf, (uf) => setFiltros({ ...filtros, uf }), 'UF', comoOpcoes(opcoes.uf))}
              {selectFiltro(filtros.regiao, (regiao) => setFiltros({ ...filtros, regiao }), 'Região', comoOpcoes(opcoes.regiao))}
              {selectFiltro(filtros.ddd, (ddd) => setFiltros({ ...filtros, ddd }), 'DDD', comoOpcoes(opcoes.ddd))}
              {selectFiltro(filtros.veiculo, (veiculo) => setFiltros({ ...filtros, veiculo }), 'Veículo', comoOpcoes(opcoes.veiculo))}
              {selectFiltro(
                filtros.status,
                (status) => setFiltros({ ...filtros, status: status as StatusContato | '' }),
                'Status',
                ORDEM_STATUS.map((s) => ({ valor: s, label: STATUS[s].label })),
              )}
            </div>
            {filtrosAtivos && (
              <button
                type="button"
                className="mt-2 text-xs font-bold text-[color:var(--rbr-navy)] underline"
                onClick={() => {
                  setBuscaDigitada('')
                  setFiltros(FILTROS_INICIAIS)
                }}
              >
                Limpar filtros
              </button>
            )}
          </Card>

          {lista === null ? (
            <Carregando />
          ) : lista.length === 0 ? (
            <Card>
              <Vazio>Nenhum contato com esses filtros.</Vazio>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-[color:var(--rbr-muted)]">
                Mostrando {lista.length} de {total}
              </div>
              {lista.map((c) => {
                const ocupado = ocupadoId === c.id
                const podeEnviar = podeReceber(c)
                return (
                  <div key={c.id} className="bg-white border rounded-2xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between" style={{ borderColor: 'var(--rbr-border)' }}>
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[color:var(--rbr-navy-dark)] truncate">{c.nome || 'Sem nome'}</span>
                        <SeloStatus status={c.status} />
                        {c.tipo_linha === 'fixo' && (
                          <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: '#F1F2F6', color: '#6B7280' }}>
                            fixo
                          </span>
                        )}
                      </div>
                      <div className="text-sm tabular-nums">{formatarCelular(c.celular)}</div>
                      <div className="text-xs text-[color:var(--rbr-muted)]">
                        {[c.ddd && `DDD ${c.ddd}`, c.uf, c.regiao, c.tipo_veiculo].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div className="text-xs text-[color:var(--rbr-muted)]">
                        {c.total_envios === 0 ? 'Nenhum envio ainda' : `${c.total_envios} ${c.total_envios === 1 ? 'envio' : 'envios'} · último em ${formatDateTime(c.ultimo_envio_em)}`}
                      </div>
                      {c.status === 'conferir' && (
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <input
                            aria-label="Corrigir telefone"
                            inputMode="tel"
                            placeholder="DDD + número"
                            value={telefoneEditado[c.id] ?? soDigitos(c.celular).replace(/^55/, '')}
                            onChange={(e) => setTelefoneEditado({ ...telefoneEditado, [c.id]: e.target.value })}
                            className={`${inputClass} !w-44`}
                            style={inputStyle}
                          />
                          <Botao variante="secundario" disabled={ocupado} onClick={() => salvarTelefone(c)}>
                            Salvar telefone
                          </Botao>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap md:justify-end shrink-0">
                      {podeEnviar && (
                        <button
                          type="button"
                          onClick={() => enviarContato(c)}
                          disabled={ocupado || enviandoProximo || !cfg || limiteAtingido}
                          className="text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          style={{ background: '#1F9D55', color: '#fff' }}
                        >
                          {ocupado ? 'Abrindo…' : 'Enviar no WhatsApp'}
                        </button>
                      )}
                      {c.status === 'nao_enviar' ? (
                        <Botao variante="secundario" disabled={ocupado} onClick={() => reativar(c)}>
                          Reativar
                        </Botao>
                      ) : (
                        c.status !== 'cadastrado' && (
                          <Botao variante="perigo" disabled={ocupado} onClick={() => naoEnviarMais(c)}>
                            Não enviar mais
                          </Botao>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
              {lista.length < total && (
                <Botao variante="secundario" className="self-center" disabled={carregandoMais} onClick={carregarMais}>
                  {carregandoMais ? 'Carregando…' : `Carregar mais (${total - lista.length} restantes)`}
                </Botao>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
