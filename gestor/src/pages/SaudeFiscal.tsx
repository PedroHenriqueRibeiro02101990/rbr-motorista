import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatDateTime } from '@rbr/shared/format'
import { Aviso, Botao, Card, Carregando, Vazio, inputClass, inputStyle } from '../components/financeiro/ui'
import { codigoCurto } from '../lib/painelOperacao'
import { mensagemClara } from '../lib/mensagemClara'

// G09 · Saúde fiscal: o que o robô de conferência achou nas operações recentes (documento pendente, CT-e sem averbação,
// MDF-e aberto depois da entrega, CIOT perto do prazo, vale-pedágio em operação cancelada). Só leitura; "Verificar agora" chama a
// função saude-fiscal, que NÃO emite, NÃO cancela e NÃO averba nada.

type Gravidade = 'verde' | 'amarelo' | 'vermelho' | 'precisa_de_voce'
type Achado = { id: string; operacao_id: string | null; gravidade: Gravidade; mensagem: string; criado_em: string }

const COR: Record<Gravidade, { rotulo: string; fundo: string; cor: string }> = {
  verde: { rotulo: 'Tudo em dia', fundo: '#E7F5EC', cor: 'var(--rbr-positive)' },
  amarelo: { rotulo: 'Atenção', fundo: '#FDF1DC', cor: '#8A5A00' },
  vermelho: { rotulo: 'Problema', fundo: '#FBE9E9', cor: 'var(--rbr-danger)' },
  precisa_de_voce: { rotulo: 'Precisa de você', fundo: '#FBE9E9', cor: 'var(--rbr-danger)' },
}
const ORDEM: Gravidade[] = ['precisa_de_voce', 'vermelho', 'amarelo', 'verde']

export function gravidadeGeral(achados: { gravidade: Gravidade }[]): Gravidade {
  return ORDEM.find((g) => achados.some((a) => a.gravidade === g)) ?? 'verde'
}

type Disjuntor = { aberto: boolean; motivo: string | null; aberto_em: string | null }
type ChamaRpc = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>

// Robôs do visual aprovado "Fiscal-Saude". O estado só é medido onde existe medição (disjuntor); os demais mostram o que são de verdade:
// agendado (tem agendamento no banco), manual (só roda pelo botão) ou ainda não existe.
type Robo = { nome: string; desc: string; roda: string; situacao: 'agendado' | 'manual' | 'inexistente' | 'disjuntor' }
const ROBOS: Robo[] = [
  { nome: 'Sentinela', desc: 'Operações paradas e prazos de MDF-e/CIOT', roda: 'ao tocar em Verificar agora', situacao: 'manual' },
  { nome: 'Reconciliador', desc: 'Compara nosso banco com Focus e efrete', roda: '—', situacao: 'inexistente' },
  { nome: 'Auditor de dinheiro', desc: 'Frete, saldo e CIOT batem com o Financeiro', roda: '30 min', situacao: 'agendado' },
  { nome: 'Auditor de segregação', desc: 'Quem criou não emitiu; trilha completa', roda: '30 min', situacao: 'agendado' },
  { nome: 'Simulador noturno', desc: 'Emite na homologação e guarda a prova', roda: '—', situacao: 'inexistente' },
  { nome: 'Disjuntor', desc: 'Pausa emissão se um provedor cair', roda: 'contínuo', situacao: 'disjuntor' },
  { nome: 'Vigia regulatório', desc: 'Avisa mudança de piso, NT e prazos', roda: '—', situacao: 'inexistente' },
]

export default function SaudeFiscal() {
  const [emissoesHoje, setEmissoesHoje] = useState<number | null>(null)
  useEffect(() => {
    const ini = new Date()
    ini.setHours(0, 0, 0, 0)
    void supabase
      .from('documentacao_operacao')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'emitido')
      .gte('emitido_em', ini.toISOString())
      .then(({ count }) => setEmissoesHoje(count ?? 0))
  }, [])
  // G07: disjuntor fiscal. Aberto = há achado grave de segregação de funções; só o gestor reabre, com motivo.
  const [disjuntor, setDisjuntor] = useState<Disjuntor | null>(null)
  const [motivoReabrir, setMotivoReabrir] = useState('')
  const lerDisjuntor = useCallback(async () => {
    const tabela = supabase.from as unknown as (t: string) => { select: (c: string) => { eq: (c: string, v: boolean) => { maybeSingle: () => Promise<{ data: Disjuntor | null }> } } }
    const { data } = await tabela.call(supabase, 'disjuntor_fiscal').select('aberto, motivo, aberto_em').eq('id', true).maybeSingle()
    setDisjuntor(data)
  }, [])
  async function reabrir() {
    const rpc = supabase.rpc as unknown as ChamaRpc
    const { error } = await rpc.call(supabase, 'reabrir_disjuntor', { p_motivo: motivoReabrir })
    if (error) setErro(`Não consegui reabrir. ${mensagemClara(error, '')}`.trim())
    setMotivoReabrir('')
    await lerDisjuntor()
  }
  const [achados, setAchados] = useState<Achado[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('saude_fiscal_achados')
      .select('id, operacao_id, gravidade, mensagem, criado_em')
      .is('resolvido_em', null)
      .order('criado_em', { ascending: false })
      .limit(200)
    if (error) setErro(`Não consegui ler os achados. ${mensagemClara(error, '')}`.trim())
    else setErro(null)
    setAchados(error ? [] : ((data ?? []) as Achado[]))
  }, [])

  useEffect(() => {
    void carregar()
    void lerDisjuntor()
  }, [carregar, lerDisjuntor])

  async function verificarAgora() {
    setVerificando(true)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('saude-fiscal', { body: {} })
      if (error || data?.ok === false) setErro(`A verificação não rodou. ${data?.erro ?? mensagemClara(error, '')}`.trim())
      await carregar()
    } catch (e) {
      setErro(mensagemClara(e, 'A verificação não rodou.'))
    } finally {
      setVerificando(false)
    }
  }

  const geral = gravidadeGeral(achados ?? [])
  const cor = COR[geral]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">Saúde fiscal</h1>
          <div className="text-[13px] mt-1" style={{ color: '#4a5275' }}>Os robôs vigiam a esteira. Verde quer dizer que nada precisa de você.</div>
        </div>
        <Botao onClick={() => void verificarAgora()} disabled={verificando}>
          {verificando ? 'Verificando…' : 'Verificar agora'}
        </Botao>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {disjuntor?.aberto && (
        <Aviso tipo="erro">
          <div className="font-bold">Disjuntor fiscal aberto</div>
          <div>{disjuntor.motivo}</div>
          <div className="mt-2 flex gap-2 flex-wrap items-center">
            <input value={motivoReabrir} onChange={(e) => setMotivoReabrir(e.target.value)} className={inputClass} style={{ ...inputStyle, flex: '1 1 220px' }} placeholder="Motivo para reabrir (mín. 10 letras)" aria-label="Motivo para reabrir" />
            <Botao onClick={() => void reabrir()} disabled={motivoReabrir.trim().length < 10}>Reabrir</Botao>
          </div>
        </Aviso>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['Robôs', String(ROBOS.length), `${ROBOS.filter((r) => r.situacao === 'agendado' || r.situacao === 'disjuntor').length} ativos, ${ROBOS.filter((r) => r.situacao === 'manual').length} manual, ${ROBOS.filter((r) => r.situacao === 'inexistente').length} ainda não existem`],
          ['Emissões hoje', emissoesHoje == null ? '—' : String(emissoesHoje), 'documentos emitidos desde 00h'],
          ['Itens em aberto', achados == null ? '—' : String(achados.length), 'achados do robô de conferência'],
        ].map(([r, v, n]) => (
          <div key={r} className="bg-white border rounded-2xl px-4 py-3" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="text-[11px] font-semibold" style={{ color: 'var(--rbr-muted)' }}>{r}</div>
            <div className="text-[30px] leading-tight font-extrabold tabular-nums">{v}</div>
            <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>{n}</div>
          </div>
        ))}
      </div>
      <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="hidden md:grid grid-cols-[1.6fr_1fr_1fr] gap-3 px-4 py-2.5 text-[10px] font-extrabold tracking-[0.08em] uppercase" style={{ background: '#f7f8fc', color: 'var(--rbr-muted)' }}>
          <span>Robô</span>
          <span>Roda</span>
          <span>Estado</span>
        </div>
        {ROBOS.map((r) => {
          const estado =
            r.situacao === 'disjuntor'
              ? disjuntor?.aberto
                ? { t: 'Aberto', bg: '#fbe3e1', fg: '#b42318' }
                : { t: 'Verde', bg: '#d6ecdf', fg: '#1a6b3c' }
              : r.situacao === 'agendado'
                ? { t: 'Agendado', bg: '#d6ecdf', fg: '#1a6b3c' }
                : r.situacao === 'manual'
                  ? { t: 'Manual', bg: '#fff0d6', fg: '#7a5200' }
                  : { t: 'Ainda não existe', bg: '#eef0f5', fg: '#8a91ad' }
          return (
            <div key={r.nome} className="grid md:grid-cols-[1.6fr_1fr_1fr] gap-1 md:gap-3 px-4 py-3 items-center" style={{ borderTop: '1px solid #eef0f5', opacity: r.situacao === 'inexistente' ? 0.7 : 1 }}>
              <div>
                <div className="text-[15px] font-extrabold">{r.nome}</div>
                <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{r.desc}</div>
              </div>
              <div className="text-[13px]">{r.roda}</div>
              <div><span className="text-[11px] font-extrabold rounded-full px-3 py-1" style={{ background: estado.bg, color: estado.fg }}>{estado.t}</span></div>
            </div>
          )
        })}
      </div>
      {achados === null ? (
        <Carregando />
      ) : (
        <>
          <div className="rounded-2xl px-4 py-3 font-bold" style={{ background: cor.fundo, color: cor.cor }} role="status">
            {cor.rotulo}
            {achados.length > 0 && <span className="font-normal"> · {achados.length} item(ns) em aberto</span>}
          </div>
          {achados.length === 0 ? (
            <Vazio>Nenhum achado em aberto. Toque em "Verificar agora" para conferir de novo.</Vazio>
          ) : (
            <div className="flex flex-col gap-2">
              {achados.map((a) => (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full self-start" style={{ background: COR[a.gravidade].fundo, color: COR[a.gravidade].cor }}>
                        {COR[a.gravidade].rotulo}
                      </span>
                      <div className="text-sm text-[color:var(--rbr-navy-dark)]">{a.mensagem}</div>
                      <div className="text-xs text-[color:var(--rbr-muted)]">{formatDateTime(a.criado_em)}</div>
                    </div>
                    {a.operacao_id && (
                      <Link to={`/operacoes?op=${a.operacao_id}`} className="text-xs font-bold text-[color:var(--rbr-navy)] underline">
                        Abrir operação {codigoCurto(a.operacao_id)}
                      </Link>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
