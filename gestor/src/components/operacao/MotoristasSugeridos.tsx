import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'

// As funções do aviso de carga ainda não estão em shared/database.types.ts:
// usamos o cliente sem tipos e tipos locais mínimos.
const db = supabase as unknown as SupabaseClient

export type CargaAguardando = {
  operacao_id: string
  origem: string | null
  destino: string | null
  eixos: number | null
  peso_kg: number | null
  criado_em: string
  candidatos_aptos: number
  candidatos_total: number
  avisados: number
}

type Sugestao = {
  pessoa_id: string
  veiculo_id: string | null
  nome: string
  whatsapp: string | null
  tipo_veiculo: string | null
  capacidade_carga: number | null
  cidade: string | null
  uf: string | null
  online: boolean
  perfil_confirmado: boolean
  apto: boolean
  alertas: string[] | null
  pontuacao: number | null
  ja_avisado_em: string | null
}

export async function carregarCargasAguardando(): Promise<{ cargas: CargaAguardando[]; erro: string | null }> {
  const { data, error } = await db.rpc('operacoes_aguardando_motorista')
  return { cargas: (data ?? []) as CargaAguardando[], erro: error?.message ?? null }
}

export function resumoCarga(c: Pick<CargaAguardando, 'origem' | 'destino' | 'eixos' | 'peso_kg'>) {
  const partes = [`${c.origem || 'Origem a confirmar'} → ${c.destino || 'destino a confirmar'}`]
  if (c.eixos) partes.push(`${c.eixos} eixos`)
  partes.push(c.peso_kg ? `${Number(c.peso_kg).toLocaleString('pt-BR')} kg` : 'peso não informado')
  return partes.join(' · ')
}

// Os erros do banco já vêm em português; os de rede vêm em inglês.
function mensagemErro(m: string | undefined) {
  if (!m) return 'Não foi possível avisar o motorista. Tente de novo.'
  if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão com o sistema. Confira a internet e tente de novo.'
  return m
}

function dataHoraCurta(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function Selo({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

export default function MotoristasSugeridos({
  operacaoId,
  carga,
  onAvisado,
}: {
  operacaoId: string
  carga?: CargaAguardando | null
  onAvisado?: () => void
}) {
  const [lista, setLista] = useState<Sugestao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [avisandoId, setAvisandoId] = useState<string | null>(null)
  // Visual Operacao-Alocar: primeiro "Escolher" (só marca), depois "Enviar frete ao motorista" (usa o mesmo aviso de antes).
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [soAprovados, setSoAprovados] = useState(true)
  // Avisados nesta tela agora (mostra "Avisado agora" em vez da data).
  const [avisadosAgora, setAvisadosAgora] = useState<Set<string>>(new Set())
  // Tarefa 5: frete do parceiro abaixo do piso mínimo da operação (aviso antes de mandar a proposta).
  const [piso, setPiso] = useState<{ piso: number | null; frete: number | null; abaixo: boolean } | null>(null)
  useEffect(() => {
    void supabase.rpc('checar_piso_operacao', { p_operacao: operacaoId }).then(({ data }) => setPiso((data as typeof piso) ?? null))
  }, [operacaoId])

  const carregar = useCallback(async () => {
    const { data, error } = await db.rpc('sugestoes_motoristas_operacao', { p_operacao: operacaoId })
    if (error) setErro(mensagemErro(error.message))
    setLista((data ?? []) as Sugestao[])
  }, [operacaoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function avisar(s: Sugestao) {
    if (avisandoId) return
    setErro(null)
    // Abre a janela já dentro do clique, senão o navegador bloqueia; o endereço vem depois.
    const janela = window.open('', '_blank')
    if (!janela) return setErro('O navegador bloqueou a janela do WhatsApp. Libere janelas pop-up para este site.')
    setAvisandoId(s.pessoa_id)
    try {
      const { data, error } = await db.rpc('montar_aviso_carga', { p_operacao: operacaoId, p_pessoa: s.pessoa_id, p_veiculo: s.veiculo_id })
      if (error) throw new Error(error.message)
      const aviso = ((data ?? []) as { mensagem_id: string; texto: string; whatsapp: string }[])[0]
      if (!aviso) throw new Error('Não consegui montar a mensagem. Tente de novo.')
      janela.location.href = `https://wa.me/${aviso.whatsapp}?text=${encodeURIComponent(aviso.texto)}`
      const reg = await db.rpc('registrar_aviso_carga', {
        p_operacao: operacaoId,
        p_pessoa: s.pessoa_id,
        p_veiculo: s.veiculo_id,
        p_mensagem: aviso.mensagem_id,
        p_texto_final: aviso.texto,
      })
      if (reg.error) throw new Error(reg.error.message)
      const agora = new Date().toISOString()
      setLista((l) => l?.map((x) => (x.pessoa_id === s.pessoa_id && x.veiculo_id === s.veiculo_id ? { ...x, ja_avisado_em: agora } : x)) ?? l)
      setAvisadosAgora((a) => new Set(a).add(`${s.pessoa_id}:${s.veiculo_id}`))
      onAvisado?.()
    } catch (e) {
      janela.close()
      setErro(mensagemErro(e instanceof Error ? e.message : undefined))
    } finally {
      setAvisandoId(null)
    }
  }

  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div>
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Motoristas sugeridos para esta carga</div>
        {carga && <div className="text-xs text-[color:var(--rbr-muted)]">{resumoCarga(carga)}</div>}
      </div>

      {piso?.abaixo && (
        <div className="text-xs rounded-lg px-3 py-2.5" style={{ background: '#FDF1DC', color: '#8A5A00' }}>
          Frete do parceiro ({formatMoney(piso.frete)}) abaixo do piso mínimo ({formatMoney(piso.piso)}). Ajuste antes de mandar a proposta: o CIOT
          da RBR fica bloqueado abaixo do piso.
        </div>
      )}

      {erro && (
        <div className="text-xs rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          <div className="flex-1">{erro}</div>
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso" className="font-bold opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {lista === null ? (
        <div className="text-xs text-[color:var(--rbr-muted)] py-3 text-center">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="text-sm text-center rounded-xl px-4 py-5 flex flex-col gap-1.5" style={{ background: 'var(--rbr-muted-bg)' }}>
          <div className="font-semibold text-[color:var(--rbr-navy-dark)]">Nenhum motorista cadastrado combina com esta carga ainda.</div>
          <Link to="/cadastros?aba=contatos" className="text-xs font-bold underline text-[color:var(--rbr-navy)]">
            Convidar motoristas em Cadastros → Gestão de contatos
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou cidade" className="border rounded-xl px-3 py-2 text-[13px] bg-white flex-1 min-w-[160px]" style={{ borderColor: 'var(--rbr-border)' }} />
          {([['Aprovados', true], ['Todos', false]] as const).map(([r, v]) => (
            <button key={r} type="button" onClick={() => setSoAprovados(v)} aria-pressed={soAprovados === v} className="text-[12px] font-bold px-3.5 py-1.5 rounded-full border" style={soAprovados === v ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#1c2559', borderColor: 'var(--rbr-border)' }}>{r}</button>
          ))}
          {['Disponíveis', 'Perto da coleta', 'Com rastreador'].map((r) => (
            <button key={r} type="button" disabled title="Ainda não disponível" className="text-[12px] font-bold px-3.5 py-1.5 rounded-full border bg-white opacity-50 cursor-not-allowed" style={{ borderColor: 'var(--rbr-border)' }}>{r}</button>
          ))}
        </div>
        <div className="border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="hidden md:flex items-center gap-3 px-4 py-2.5 text-[10px] font-extrabold tracking-[0.08em] uppercase" style={{ background: '#f7f8fc', color: 'var(--rbr-muted)' }}>
            <span className="flex-1">Motorista</span>
            <span className="w-[210px] flex-shrink-0">Conjunto</span>
            <span className="w-[220px] flex-shrink-0">Situação</span>
            <span className="w-[170px] flex-shrink-0" />
          </div>
          {lista.filter((x) => (!soAprovados || x.apto) && (!busca.trim() || `${x.nome} ${x.cidade ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))).map((s, i) => {
            const chave = `${s.pessoa_id}:${s.veiculo_id}`
            const alertas = s.alertas ?? []
            const avisado = !!s.ja_avisado_em
            const motivo = !s.apto ? `Não apto${alertas.length ? `: ${alertas.join('; ')}` : '.'}` : avisado ? 'Já avisado sobre esta carga.' : null
            const avisando = avisandoId === s.pessoa_id
            return (
              <div key={chave} className="px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-3" style={{ borderTop: i ? '1px solid #eef0f5' : undefined }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold text-[color:var(--rbr-navy-dark)] flex items-center gap-1.5 flex-wrap">
                    {s.nome}
                    {s.online && <Selo bg="#E7F5EC" fg="var(--rbr-positive)">Online</Selo>}
                    {s.perfil_confirmado && <Selo bg="#E8EEFB" fg="var(--rbr-navy)">Perfil confirmado</Selo>}
                  </div>
                  <div className="text-[12px] text-[color:var(--rbr-muted)]">{[s.cidade, s.uf].filter(Boolean).join('/') || 'cidade não informada'}</div>
                </div>
                <div className="md:w-[210px] flex-shrink-0 text-[13px] font-bold text-[color:var(--rbr-navy-dark)]">
                  {[s.tipo_veiculo, s.capacidade_carga ? `${Number(s.capacidade_carga).toLocaleString('pt-BR')} kg` : null].filter(Boolean).join(' · ') || 'Veículo não informado'}
                </div>
                <div className="md:w-[220px] flex-shrink-0 flex flex-col gap-1 items-start">
                  {!s.apto ? (
                    <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#fbe3e1', color: '#b42318' }}>✕ não apto</span>
                  ) : alertas.length === 0 ? (
                    <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#d6ecdf', color: '#1a6b3c' }}>✓ tudo em dia</span>
                  ) : null}
                  {alertas.map((al) => (
                    <span key={al} className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#fff0d6', color: '#7a5200' }}>
                      {al}
                    </span>
                  ))}
                  {avisado && (
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--rbr-positive)' }}>
                      {avisadosAgora.has(chave) ? 'Avisado agora' : `Avisado em ${dataHoraCurta(s.ja_avisado_em!)}`}
                    </span>
                  )}
                </div>
                <div className="md:w-[170px] flex-shrink-0 flex flex-col gap-1 items-stretch md:items-end">
                  <button
                    type="button"
                    onClick={() => setEscolhido(chave)}
                    disabled={!s.apto || !!avisandoId}
                    className="text-[12px] font-bold px-3.5 py-2 rounded-[10px] disabled:cursor-not-allowed whitespace-nowrap border"
                    style={!s.apto ? { background: '#e9ecf4', color: '#8a91ad', borderColor: '#e9ecf4' } : escolhido === chave ? { background: '#1c2559', color: '#fff', borderColor: '#1c2559' } : { background: '#fff', color: '#1c2559', borderColor: 'var(--rbr-border)' }}
                  >
                    {!s.apto ? 'Bloqueado' : escolhido === chave ? 'Escolhido' : 'Escolher'}
                  </button>
                  {avisando && <div className="text-[11px] text-[color:var(--rbr-muted)] md:text-right">Abrindo…</div>}
                  {motivo && <div className="text-[11px] text-[color:var(--rbr-muted)] md:text-right">{motivo}</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>O sistema só deixa escolher quem está aprovado. Quem tem bloqueio mostra o motivo.</div>
        </div>
        {(() => {
          const e = lista.find((x) => `${x.pessoa_id}:${x.veiculo_id}` === escolhido)
          return (
            <aside className="bg-white border rounded-2xl p-4 flex flex-col gap-2.5" style={{ borderColor: 'var(--rbr-border)' }}>
              <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>ESCOLHIDO</div>
              {!e ? (
                <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>Toque em “Escolher” em um motorista da lista.</div>
              ) : (
                <>
                  <div className="text-[15px] font-extrabold text-[color:var(--rbr-navy-dark)]">{e.nome}</div>
                  {[
                    [e.apto, e.apto ? 'Aprovado, documentos em dia' : 'Não apto'],
                    [e.perfil_confirmado, 'Perfil confirmado'],
                    [e.online, 'Online agora'],
                  ].map(([ok, txt]) => (
                    <div key={String(txt)} className="flex items-center gap-2 text-[12px] font-bold">
                      <span className="w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center" style={{ background: ok ? '#1f9d55' : '#d9a21b' }} aria-hidden>{ok ? '✓' : '!'}</span>
                      {String(txt)}
                    </div>
                  ))}
                  {(e.alertas ?? []).map((al) => (
                    <div key={al} className="text-[12px] rounded-lg px-2.5 py-1.5" style={{ background: '#fff0d6', color: '#7a5200' }}>{al}</div>
                  ))}
                  <button
                    type="button"
                    onClick={() => void avisar(e)}
                    disabled={!e.apto || !!e.ja_avisado_em || !!avisandoId}
                    className="text-[13px] font-extrabold px-4 py-2.5 rounded-xl disabled:cursor-not-allowed"
                    style={!e.apto || e.ja_avisado_em || avisandoId ? { background: '#e9ecf4', color: '#8a91ad' } : { background: '#1c2559', color: '#fff' }}
                  >
                    {avisandoId ? 'Abrindo…' : e.ja_avisado_em ? 'Frete já enviado' : 'Enviar frete ao motorista'}
                  </button>
                  <div className="text-[11px]" style={{ color: 'var(--rbr-muted)' }}>Abre o WhatsApp com a rota, a janela e o frete. Nada é enviado até você tocar em “Enviar frete”.</div>
                </>
              )}
            </aside>
          )
        })()}
        </div>
      )}
    </div>
  )
}

// Aviso com as cargas que ainda procuram motorista (Início e Operações).
export function AvisoCargasAguardando({
  cargas,
  rotulo,
  onAbrir,
  linkPara,
}: {
  cargas: CargaAguardando[]
  rotulo?: (c: CargaAguardando) => string | null | undefined
  onAbrir?: (id: string) => void
  linkPara?: (id: string) => string
}) {
  if (cargas.length === 0) return null
  return (
    <div className="bg-white border rounded-2xl px-3.5 py-2.5 flex flex-col gap-1.5" style={{ borderColor: '#F0D9A8', background: '#FFFBF2' }}>
      <div className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">
        {cargas.length === 1 ? '1 carga aguardando motorista' : `${cargas.length} cargas aguardando motorista`}
      </div>
      <div className="flex flex-col gap-1.5">
        {cargas.map((c) => {
          const nome = rotulo?.(c)
          const aptos = c.candidatos_aptos === 0 ? 'nenhum motorista apto' : c.candidatos_aptos === 1 ? '1 motorista apto' : `${c.candidatos_aptos} motoristas aptos`
          const conteudo = (
            <>
              <div className="min-w-0 text-xs truncate">
                <b className="text-[color:var(--rbr-navy-dark)]">{nome ? `${nome} · ` : ''}{c.origem || '?'} → {c.destino || '?'}</b>
                <span className="text-[color:var(--rbr-muted)]">
                  {' · '}
                  {aptos}
                  {c.avisados > 0 ? ` · ${c.avisados} já ${c.avisados === 1 ? 'avisado' : 'avisados'}` : ''}
                </span>
              </div>
              <span className="text-xs font-bold text-[color:var(--rbr-navy)] shrink-0">Alocar →</span>
            </>
          )
          const cls = 'flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 bg-white border text-left w-full hover:opacity-85'
          const estilo = { borderColor: c.candidatos_aptos === 0 ? '#F4C9C9' : 'var(--rbr-border)' }
          return linkPara ? (
            <Link key={c.operacao_id} to={linkPara(c.operacao_id)} className={cls} style={estilo}>
              {conteudo}
            </Link>
          ) : (
            <button key={c.operacao_id} type="button" onClick={() => onAbrir?.(c.operacao_id)} className={cls} style={estilo}>
              {conteudo}
            </button>
          )
        })}
      </div>
    </div>
  )
}
