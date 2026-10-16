import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'
import { Aviso, Botao, Campo, Modal, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { abrirDossie, gerarDossie } from '../../lib/dossie'

// Tarefa 10 na operação (visão do gestor): alertas de conformidade (revisar antes de liberar), declaração da carga,
// retenção sob apuração e protocolo de incidente com dossiê.

type Alerta = { codigo: string; titulo: string; detalhe: string; revisado: boolean; revisado_obs: string | null }
type Retencao = { id: string; alvo: string; status: string; motivo: string; data_limite: string }
type Incidente = { id: string; status: string; descricao: string; registrado_em: string; dossie_path: string | null; dossie_gerado_em: string | null }
type Declaracao = { embarcador_nome: string; embarcador_documento: string; mercadoria: string; quantidade: string; valor: number; nf_numero: string; created_at: string; hash_texto: string }

export type PedidoConformidade = 'reter' | 'incidente' | 'declaracao' | null

// Painel enxuto (2026-10-16): o cartão só aparece quando HÁ algo (alerta aberto, incidente, retenção, operação
// congelada). Reter, registrar incidente e ver a declaração da carga vêm do menu "Mais ações" da operação (pedido).
export default function ConformidadeOperacao({
  operacaoId,
  congeladaMotivo,
  onMudou,
  pedido = null,
  onPedidoAtendido,
}: {
  operacaoId: string
  congeladaMotivo: string | null | undefined
  onMudou: () => void
  pedido?: PedidoConformidade
  onPedidoAtendido?: () => void
}) {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null)
  const [ret, setRet] = useState<Retencao[]>([])
  const [inc, setInc] = useState<Incidente[]>([])
  const [decl, setDecl] = useState<Declaracao | null>(null)
  const [modal, setModal] = useState<{ tipo: 'revisar'; a: Alerta } | { tipo: 'reter' } | { tipo: 'incidente' } | { tipo: 'encerrar'; i: Incidente } | null>(null)
  const [verDecl, setVerDecl] = useState(false)
  const { confirmacao, rodar, ocupado, mostrar } = useConfirmacao()

  useEffect(() => {
    if (!pedido) return
    if (pedido === 'reter') setModal({ tipo: 'reter' })
    else if (pedido === 'incidente') setModal({ tipo: 'incidente' })
    else setVerDecl(true)
    onPedidoAtendido?.()
  }, [pedido, onPedidoAtendido])

  const carregar = useCallback(async () => {
    const [a, r, i, d] = await Promise.all([
      supabase.rpc('alertas_conformidade_operacao', { p_operacao: operacaoId }),
      supabase.from('retencoes_apuracao').select('id, alvo, status, motivo, data_limite').eq('operacao_id', operacaoId).order('criado_em', { ascending: false }),
      supabase.from('incidentes_carga').select('id, status, descricao, registrado_em, dossie_path, dossie_gerado_em').eq('operacao_id', operacaoId).order('registrado_em', { ascending: false }),
      supabase.from('declaracoes_carga').select('embarcador_nome, embarcador_documento, mercadoria, quantidade, valor, nf_numero, created_at, hash_texto').eq('operacao_id', operacaoId).maybeSingle(),
    ])
    // Funções/tabelas ainda não aplicadas no banco: o bloco não aparece.
    if (a.error) return setAlertas(null)
    setAlertas((a.data ?? []) as Alerta[])
    setRet((r.data ?? []) as Retencao[])
    setInc((i.data ?? []) as Incidente[])
    setDecl((d.data as Declaracao | null) ?? null)
  }, [operacaoId])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (alertas === null) return null
  const abertos = alertas.filter((a) => !a.revisado)
  const retido = ret.find((r) => r.status === 'retido_apuracao' && r.alvo === 'pagamento_prestador')
  const incAberto = inc.find((i) => i.status === 'aberto')
  const temAlgo = abertos.length > 0 || inc.length > 0 || !!retido || !!congeladaMotivo

  const modalDeclaracao = verDecl && (
    <Modal titulo="Declaração da carga (agenciador)" onFechar={() => setVerDecl(false)} largura="max-w-md">
      <div className="text-xs flex flex-col gap-1.5">
        {decl ? (
          <>
            <div>
              <b>{decl.embarcador_nome}</b> ({decl.embarcador_documento})
            </div>
            <div>
              {decl.mercadoria} · {decl.quantidade} · {formatMoney(decl.valor)} · NF {decl.nf_numero}
            </div>
            <div className="text-[color:var(--rbr-muted)]">
              Declarada em {new Date(decl.created_at).toLocaleString('pt-BR')} · SHA-256 {decl.hash_texto.slice(0, 12)}…
            </div>
          </>
        ) : (
          <span className="text-[color:var(--rbr-muted)]">Não há declaração (carga direta da RBR ou anterior à regra).</span>
        )}
      </div>
    </Modal>
  )

  if (!temAlgo) {
    return (
      <>
        {confirmacao}
        {modalDeclaracao}
        {modal && renderModal()}
      </>
    )
  }

  return (
    <div className="rounded-xl border p-3.5 flex flex-col gap-3" style={{ borderColor: abertos.length || incAberto ? 'var(--rbr-danger)' : 'var(--rbr-border)' }}>
      {modalDeclaracao}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Alertas de conformidade</div>
        {abertos.length > 0 && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
            Revisar antes de liberar
          </span>
        )}
      </div>
      {congeladaMotivo && <Aviso>Operação congelada: {congeladaMotivo}. Status e alocação não mudam até o incidente ser encerrado.</Aviso>}
      {confirmacao}
      {abertos.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {alertas.map((a) => (
            <li key={a.codigo} className="flex items-start justify-between gap-2 text-xs">
              <span style={{ color: a.revisado ? 'var(--rbr-muted)' : 'var(--rbr-danger)' }}>
                <b>{a.titulo}:</b> {a.detalhe}
                {a.revisado && <span className="block">✓ Revisado: {a.revisado_obs}</span>}
              </span>
              {!a.revisado && (
                <Botao variante="fantasma" onClick={() => setModal({ tipo: 'revisar', a })}>
                  Revisar
                </Botao>
              )}
            </li>
          ))}
        </ul>
      )}

      {retido && (
        <div className="text-xs" style={{ color: 'var(--rbr-danger)' }}>
          <b>Pagamento ao prestador retido para apuração</b> até {new Date(retido.data_limite + 'T12:00:00').toLocaleDateString('pt-BR')} ({retido.motivo})
        </div>
      )}

      {inc.map((i) => (
        <div key={i.id} className="rounded-lg px-3 py-2 text-xs flex flex-col gap-1.5" style={{ background: i.status === 'aberto' ? '#FBE9E9' : 'var(--rbr-muted-bg)' }}>
          <div>
            <b>Incidente {i.status === 'aberto' ? 'aberto' : 'encerrado'}</b> em {new Date(i.registrado_em).toLocaleString('pt-BR')}: {i.descricao}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Botao
              variante="secundario"
              disabled={ocupado}
              onClick={() =>
                void rodar(
                  (r: { faltas: string[] }) => `Dossiê gerado e guardado.${r.faltas.length ? ` Ficou de fora: ${r.faltas.join('; ')}.` : ''}`,
                  async () => {
                    const r = await gerarDossie(i.id)
                    await abrirDossie(r.path)
                    await carregar()
                    return r
                  },
                )
              }
            >
              {ocupado ? 'gerando…' : i.dossie_path ? 'Gerar dossiê de novo' : 'Gerar dossiê (ZIP)'}
            </Botao>
            {i.dossie_path && (
              <Botao variante="fantasma" onClick={() => void rodar('Dossiê aberto em outra aba.', () => abrirDossie(i.dossie_path!))}>
                Baixar último dossiê
              </Botao>
            )}
            {i.status === 'aberto' && (
              <Botao variante="fantasma" onClick={() => setModal({ tipo: 'encerrar', i })}>
                Encerrar incidente
              </Botao>
            )}
          </div>
        </div>
      ))}
      {modal && renderModal()}
    </div>
  )

  function renderModal() {
    if (!modal) return null
    return (
        <ModalMotivo
          titulo={
            modal.tipo === 'revisar'
              ? `Revisar: ${modal.a.titulo}`
              : modal.tipo === 'reter'
                ? 'Reter pagamento para apuração'
                : modal.tipo === 'encerrar'
                  ? 'Encerrar incidente'
                  : 'Registrar incidente'
          }
          aviso={
            modal.tipo === 'incidente'
              ? 'Ao confirmar: suspende o prestador e o agenciador, congela esta operação, retém o pagamento e as comissões em aberto e registra quem fez e quando. Depois gere o dossiê.'
              : modal.tipo === 'reter'
                ? 'O pagamento ao prestador fica bloqueado até o gestor liberar (prazo padrão do parâmetro de conformidade).'
                : modal.tipo === 'encerrar'
                  ? 'Descongela a operação. Suspensões e retenções continuam até serem liberadas uma a uma.'
                  : undefined
          }
          rotulo={modal.tipo === 'revisar' ? 'O que foi conferido (obrigatório)' : modal.tipo === 'incidente' ? 'Descrição do incidente (obrigatória)' : 'Motivo (obrigatório)'}
          perigo={modal.tipo === 'incidente'}
          onFechar={() => setModal(null)}
          onConfirmar={async (texto) => {
            const r =
              modal.tipo === 'revisar'
                ? await supabase.rpc('revisar_alerta_conformidade', { p_operacao: operacaoId, p_codigo: modal.a.codigo, p_observacao: texto })
                : modal.tipo === 'reter'
                  ? await supabase.rpc('reter_para_apuracao', { p_alvo: 'pagamento_prestador', p_operacao: operacaoId, p_comissao: null as unknown as string, p_motivo: texto })
                  : modal.tipo === 'encerrar'
                    ? await supabase.rpc('encerrar_incidente_carga', { p_incidente: modal.i.id, p_motivo: texto })
                    : await supabase.rpc('registrar_incidente_carga', { p_operacao: operacaoId, p_descricao: texto })
            if (r.error) throw new Error(r.error.message)
            setModal(null)
            mostrar(
              'ok',
              modal.tipo === 'revisar'
                ? 'Alerta marcado como revisado.'
                : modal.tipo === 'reter'
                  ? 'Pagamento retido para apuração.'
                  : modal.tipo === 'encerrar'
                    ? 'Incidente encerrado; operação descongelada.'
                    : 'Incidente registrado: prestador e agenciador suspensos, operação congelada, pagamentos retidos.',
            )
            await carregar()
            onMudou()
          }}
        />
    )
  }
}

export function ModalMotivo({
  titulo,
  aviso,
  rotulo,
  perigo,
  extra,
  onFechar,
  onConfirmar,
}: {
  titulo: string
  aviso?: string
  rotulo: string
  perigo?: boolean
  extra?: React.ReactNode
  onFechar: () => void
  onConfirmar: (texto: string) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  return (
    <Modal titulo={titulo} onFechar={ocupado ? () => {} : onFechar} largura="max-w-md">
      <div className="flex flex-col gap-3">
        {aviso && <Aviso tipo="atencao">{aviso}</Aviso>}
        {extra}
        <Campo label={rotulo}>
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} disabled={ocupado || !texto.trim()} onClick={() => void rodar('', () => onConfirmar(texto.trim()))}>
            {ocupado ? 'enviando…' : 'Confirmar'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
