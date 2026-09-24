import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { Database } from './database.types'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Veiculo = Database['public']['Tables']['veiculos']['Row']

export type ItemVerificacao = { codigo: string; nivel: 'ok' | 'info' | 'pendente' | 'atencao' | 'bloqueio'; titulo: string; detalhe?: string | null }
export type TipoDocPessoal = 'cnh' | 'rg' | 'crlv' | 'cartao_cnpj'

export const APROVACAO: Record<string, { texto: string; bg: string; cor: string }> = {
  aprovado: { texto: 'Aprovado', bg: '#E7F6EE', cor: '#137A45' },
  em_analise: { texto: 'Em análise', bg: 'var(--rbr-warning-bg)', cor: 'var(--rbr-navy-dark)' },
  aguardando_documentos: { texto: 'Faltam documentos', bg: '#EEF1F8', cor: 'var(--rbr-navy)' },
  recusado: { texto: 'Recusado', bg: '#FBE9E9', cor: 'var(--rbr-danger)' },
}

export const NIVEL: Record<ItemVerificacao['nivel'], { cor: string; simbolo: string; rotulo: string }> = {
  ok: { cor: '#137A45', simbolo: '✓', rotulo: 'OK' },
  info: { cor: 'var(--rbr-muted)', simbolo: 'i', rotulo: 'Informação' },
  pendente: { cor: 'var(--rbr-navy)', simbolo: '…', rotulo: 'Falta' },
  atencao: { cor: '#B7791F', simbolo: '!', rotulo: 'Conferir' },
  bloqueio: { cor: 'var(--rbr-danger)', simbolo: '×', rotulo: 'Corrigir' },
}

export function itensDe(v: unknown): ItemVerificacao[] {
  return Array.isArray(v) ? (v as ItemVerificacao[]) : []
}

export function BadgeAprovacao({ status }: { status: string | null | undefined }) {
  const s = APROVACAO[status ?? ''] ?? APROVACAO.aguardando_documentos
  return (
    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap" style={{ background: s.bg, color: s.cor }}>
      {s.texto}
    </span>
  )
}

export function ListaItens({ itens, mostrarOk = false }: { itens: ItemVerificacao[]; mostrarOk?: boolean }) {
  const ordem = { bloqueio: 0, atencao: 1, pendente: 2, info: 3, ok: 4 }
  const lista = itens.filter((i) => mostrarOk || i.nivel !== 'ok').sort((a, b) => ordem[a.nivel] - ordem[b.nivel])
  if (!lista.length) return null
  return (
    <ul className="flex flex-col gap-1.5">
      {lista.map((i, k) => (
        <li key={i.codigo + k} className="flex gap-2 text-xs leading-snug">
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-px"
            style={{ background: NIVEL[i.nivel].cor, color: '#fff' }}
            aria-label={NIVEL[i.nivel].rotulo}
          >
            {NIVEL[i.nivel].simbolo}
          </span>
          <span>
            <span className="font-semibold text-[color:var(--rbr-navy-dark)]">{i.titulo}</span>
            {i.detalhe && <span className="text-[color:var(--rbr-muted)]"> — {i.detalhe}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

// Envia a foto, registra o documento e pede a leitura automática (que dispara a verificação no banco).
export async function enviarDocumentoPessoal(p: {
  tipo: TipoDocPessoal
  arquivo?: File
  pessoaId?: string
  veiculoId?: string
  pastaPessoaId: string // dono da pasta no Storage (pessoa/<id>/…)
  caminhoExistente?: string // foto já enviada (ex.: CRLV lido antes de salvar o veículo)
}): Promise<{ erro: string | null; campos: Record<string, unknown> | null; path: string }> {
  let path = p.caminhoExistente ?? ''
  if (!path) {
    if (!p.arquivo) return { erro: 'Selecione a foto.', campos: null, path }
    const ext = (p.arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    path = `pessoa/${p.pastaPessoaId}/${p.tipo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('documentos-pessoais').upload(path, p.arquivo, {
      contentType: p.arquivo.type || undefined,
    })
    if (upErr) return { erro: upErr.message, campos: null, path }
  }
  const { data: doc, error: insErr } = await supabase
    .from('documentos_pessoais_imagens')
    .insert({ tipo: p.tipo, arquivo_url: path, pessoa_id: p.pessoaId ?? null, veiculo_id: p.veiculoId ?? null })
    .select('id')
    .single()
  if (insErr || !doc) return { erro: insErr?.message ?? 'Não foi possível registrar o documento.', campos: null, path }
  const { data, error } = await supabase.functions.invoke('extrair-documento', {
    body: { tipo: p.tipo, path, documento_id: doc.id },
  })
  if (error || !data?.sucesso) {
    return { erro: null, campos: null, path } // foto guardada; a RBR confere manualmente
  }
  return { erro: null, campos: data.campos as Record<string, unknown>, path }
}

// Só lê (pré-preenche o formulário), sem gravar.
export async function lerDocumento(tipo: TipoDocPessoal, arquivo: File, pastaPessoaId: string) {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `pessoa/${pastaPessoaId}/${tipo}-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from('documentos-pessoais').upload(path, arquivo, { contentType: arquivo.type || undefined })
  if (upErr) return { erro: upErr.message, campos: null as Record<string, unknown> | null, path }
  const { data, error } = await supabase.functions.invoke('extrair-documento', { body: { tipo, path } })
  if (error || !data?.sucesso) return { erro: null, campos: null, path }
  return { erro: null, campos: data.campos as Record<string, unknown>, path }
}

// Aviso da situação do cadastro (app do motorista / agenciador).
export function StatusCadastro({
  pessoa,
  veiculos = [],
  onAtualizar,
  compacto = false,
}: {
  pessoa: Pessoa
  veiculos?: Veiculo[]
  onAtualizar?: () => void
  compacto?: boolean
}) {
  const [atualizando, setAtualizando] = useState(false)
  const itens = itensDe(pessoa.verificacao)
  const veicPend = veiculos.filter((v) => v.ativo && v.aprovacao_status !== 'aprovado')
  const st = pessoa.aprovacao_status

  if (st === 'aprovado' && veicPend.length === 0) {
    if (compacto) return null
    return (
      <div className="text-xs rounded-xl px-3.5 py-2.5 flex items-center gap-2" style={{ background: '#E7F6EE', color: '#137A45' }}>
        <span className="font-bold">✓</span> Cadastro aprovado
      </div>
    )
  }

  const titulo =
    st === 'recusado'
      ? 'Cadastro não aprovado — veja o que corrigir'
      : st === 'em_analise'
        ? 'Cadastro em análise pela RBR'
        : st === 'aguardando_documentos'
          ? 'Complete seu cadastro para receber cargas'
          : 'Veículo aguardando liberação'
  const fundo = st === 'recusado' ? '#FBE9E9' : 'var(--rbr-warning-bg)'

  async function atualizar() {
    setAtualizando(true)
    await supabase.rpc('reavaliar_meu_cadastro')
    setAtualizando(false)
    onAtualizar?.()
  }

  return (
    <div className="rounded-[16px] px-4 py-3.5 flex flex-col gap-2.5" style={{ background: fundo }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-bold text-[color:var(--rbr-navy-dark)]">{titulo}</div>
        {onAtualizar && (
          <button onClick={atualizar} disabled={atualizando} className="text-[11px] font-bold underline text-[color:var(--rbr-navy)] flex-shrink-0">
            {atualizando ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
      </div>
      {pessoa.aprovacao_motivo && st !== 'aprovado' && (
        <div className="text-xs text-[color:var(--rbr-navy-dark)]">
          <b>Recado da RBR:</b> {pessoa.aprovacao_motivo}
        </div>
      )}
      {st === 'em_analise' && (
        <div className="text-xs text-[color:var(--rbr-muted)]">Seus documentos chegaram. Alguns pontos precisam de conferência manual — normalmente em até 1 dia útil.</div>
      )}
      {st !== 'aprovado' && <ListaItens itens={itens.filter((i) => i.nivel !== 'info')} />}
      {veicPend.map((v) => (
        <div key={v.id} className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[color:var(--rbr-navy-dark)]">Veículo {v.placa}</span>
            <BadgeAprovacao status={v.aprovacao_status} />
          </div>
          {v.aprovacao_motivo && (
            <div className="text-xs">
              <b>Recado da RBR:</b> {v.aprovacao_motivo}
            </div>
          )}
          <ListaItens itens={itensDe(v.verificacao)} />
        </div>
      ))}
    </div>
  )
}

// LGPD: baixar meus dados / pedir exclusão.
export function MeusDados({ pessoa }: { pessoa: Pessoa }) {
  const [pedido, setPedido] = useState<{ status: string; solicitado_em: string; prazo_limite: string | null } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    supabase
      .from('solicitacoes_exclusao_dados')
      .select('status, solicitado_em, prazo_limite')
      .eq('pessoa_id', pessoa.id)
      .order('solicitado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPedido(data ?? null))
  }, [pessoa.id])

  async function baixar() {
    setOcupado(true)
    const [{ data: eu }, { data: veics }, { data: docs }, { data: termos }] = await Promise.all([
      supabase.from('pessoas').select('*').eq('id', pessoa.id).maybeSingle(),
      supabase.from('veiculos').select('*').eq('titular_id', pessoa.id),
      supabase.from('documentos_pessoais_imagens').select('tipo, status, created_at, campos_extraidos').eq('pessoa_id', pessoa.id),
      supabase.from('contratos_aceite').select('versao_contrato, aceito_em').eq('parte_id', pessoa.id),
    ])
    const limpo = eu ? { ...eu } : null
    if (limpo) {
      delete (limpo as Record<string, unknown>).aprovacao_hash
      delete (limpo as Record<string, unknown>).auth_user_id
    }
    const conteudo = {
      gerado_em: new Date().toISOString(),
      controlador: 'RBR Cargo',
      cadastro: limpo,
      veiculos: veics ?? [],
      documentos_enviados: docs ?? [],
      termos_aceitos: termos ?? [],
    }
    const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `meus-dados-rbr-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    setOcupado(false)
  }

  async function pedirExclusao() {
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.from('solicitacoes_exclusao_dados').insert({ pessoa_id: pessoa.id, motivo: motivo.trim() || null })
    setOcupado(false)
    if (error) return setMsg(error.message)
    setConfirmando(false)
    setPedido({ status: 'processando', solicitado_em: new Date().toISOString(), prazo_limite: null })
    setMsg('Pedido registrado. A RBR responde em até 15 dias.')
  }

  const emAndamento = pedido?.status === 'processando'
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs text-[color:var(--rbr-muted)] leading-relaxed">
        Pela LGPD você pode ver, baixar e pedir a exclusão dos seus dados. Dados de transportes já realizados ficam guardados pelo prazo da lei,
        com acesso restrito.
      </div>
      <button onClick={baixar} disabled={ocupado} className="text-left text-sm font-semibold text-[color:var(--rbr-navy)] underline disabled:opacity-60">
        Baixar uma cópia dos meus dados
      </button>
      {emAndamento ? (
        <div className="text-xs rounded-xl px-3 py-2" style={{ background: 'var(--rbr-warning-bg)' }}>
          Pedido de exclusão em andamento desde {new Date(pedido!.solicitado_em).toLocaleDateString('pt-BR')}.
        </div>
      ) : !confirmando ? (
        <button onClick={() => setConfirmando(true)} className="text-left text-sm font-semibold text-[color:var(--rbr-danger)] underline">
          Pedir exclusão dos meus dados
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: '#FBE9E9' }}>
          <div className="text-xs text-[color:var(--rbr-navy-dark)]">
            Ao excluir, você perde o acesso ao app. Pagamentos pendentes continuam sendo feitos. Quer continuar?
          </div>
          <textarea
            className="border rounded-lg px-3 py-2 text-xs outline-none"
            style={{ borderColor: 'var(--rbr-border)' }}
            placeholder="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={() => setConfirmando(false)} className="flex-1 py-2 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--rbr-border)' }}>
              Cancelar
            </button>
            <button
              onClick={pedirExclusao}
              disabled={ocupado}
              className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--rbr-danger)' }}
            >
              Confirmar pedido
            </button>
          </div>
        </div>
      )}
      {msg && <div className="text-xs text-[color:var(--rbr-navy-dark)]">{msg}</div>}
    </div>
  )
}
