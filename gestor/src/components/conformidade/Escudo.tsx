import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@rbr/shared/supabaseClient'
import { dbNovo } from '@rbr/shared/dbNovo'
import { Aviso, Botao, Campo, Card, Carregando, Kpi, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { ModalMotivo } from '../operacao/ConformidadeOperacao'
import { abrirDossie } from '../../lib/dossie'

// Tarefa 10: painel de pendências de conformidade (10.7), alertas abertos (10.2), retenções (10.4), incidentes (10.5)
// e os parâmetros editáveis das regras.

export type Painel = {
  contratos_a_validar: number
  agenciadores_sem_contrato: number
  alertas_abertos: number
  retencoes_vencendo: number
  retencoes_ativas: number
  incidentes_abertos: number
  toxicologicos_vencendo: number
}

export function usePainelConformidade(versao = 0) {
  const [p, setP] = useState<Painel | null>(null)
  useEffect(() => {
    void dbNovo.rpc('painel_conformidade').then(({ data, error }) => setP(error ? null : ((data as Painel | null) ?? null)))
  }, [versao])
  return p
}

// 10.7: contador "Pendências de conformidade" (Início do gestor e topo da Conformidade).
export function PainelConformidade({ compacto = false }: { compacto?: boolean }) {
  const p = usePainelConformidade()
  if (!p) return null
  const itens: [string, number, string, boolean][] = [
    ['Contratos a validar', p.contratos_a_validar, '/conformidade?aba=agenciadores', p.contratos_a_validar > 0],
    ['Alertas abertos', p.alertas_abertos, '/conformidade?aba=alertas', p.alertas_abertos > 0],
    ['Retenções vencendo', p.retencoes_vencendo, '/conformidade?aba=retencoes', p.retencoes_vencendo > 0],
    ['Incidentes abertos', p.incidentes_abertos, '/conformidade?aba=incidentes', p.incidentes_abertos > 0],
  ]
  const total = itens.reduce((s, i) => s + i[1], 0)
  if (compacto && total === 0) return null
  return (
    <Card titulo="Pendências de conformidade" acao={<span className="text-xs text-[color:var(--rbr-muted)]">{total} pendente(s)</span>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {itens.map(([l, n, to, ruim]) => (
          <Link key={l} to={to}>
            <Kpi label={l} valor={String(n)} tom={ruim ? 'ruim' : 'bom'} />
          </Link>
        ))}
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">
        {p.agenciadores_sem_contrato} agenciador(es) sem contrato validado · {p.retencoes_ativas} retenção(ões) ativas · {p.toxicologicos_vencendo} exame(s)
        toxicológico(s) vencendo
      </div>
    </Card>
  )
}

type AlertaAberto = { operacao_id: string; codigo: string; titulo: string; detalhe: string }
export function AlertasAbertos() {
  const [l, setL] = useState<AlertaAberto[] | null>(null)
  useEffect(() => {
    void dbNovo.rpc('alertas_conformidade_abertos').then(({ data }) => setL((data ?? []) as AlertaAberto[]))
  }, [])
  if (l === null) return <Carregando />
  return (
    <Card titulo="Alertas abertos (operações em andamento)">
      {l.length === 0 ? (
        <div className="text-sm font-semibold text-[color:var(--rbr-positive)]">✓ Nenhum alerta aberto.</div>
      ) : (
        <ul className="flex flex-col gap-1.5 text-xs">
          {l.map((a) => (
            <li key={a.operacao_id + a.codigo} className="flex justify-between gap-2 flex-wrap">
              <span>
                <b>{a.titulo}</b>: {a.detalhe}
              </span>
              <Link to={`/operacoes?op=${a.operacao_id}`} className="font-bold underline text-[color:var(--rbr-navy)]">
                #{a.operacao_id.slice(0, 8)}: revisar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

type Retencao = {
  id: string
  alvo: 'pagamento_prestador' | 'comissao_agenciador'
  operacao_id: string | null
  comissao_id: string | null
  pessoa_id: string
  status: string
  motivo: string
  data_limite: string
  criado_em: string
  retencoes_eventos: { acao: string; motivo: string; em: string }[]
}
export function Retencoes() {
  const [l, setL] = useState<Retencao[] | null>(null)
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())
  const [acao, setAcao] = useState<{ r: Retencao; tipo: 'liberar' | 'prorrogar' } | null>(null)
  const [dias, setDias] = useState('15')
  const { confirmacao, mostrar } = useConfirmacao()
  const carregar = useCallback(async () => {
    const { data } = await dbNovo.from('retencoes_apuracao').select('*, retencoes_eventos(acao, motivo, em)').order('data_limite')
    const lista = (data ?? []) as Retencao[]
    setL(lista)
    const ids = [...new Set(lista.map((r) => r.pessoa_id))]
    if (ids.length) {
      const { data: ps } = await supabase.from('pessoas').select('id, nome').in('id', ids)
      setNomes(new Map((ps ?? []).map((p) => [p.id, p.nome])))
    }
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])
  if (l === null) return <Carregando />
  const hoje = new Date().toLocaleDateString('sv-SE')
  const ativas = l.filter((r) => r.status === 'retido_apuracao')
  return (
    <Card titulo="Retenções sob apuração">
      {confirmacao}
      {ativas.length === 0 ? (
        <Vazio>Nenhum pagamento retido.</Vazio>
      ) : (
        <div className="flex flex-col gap-2">
          {ativas.map((r) => {
            const vencida = r.data_limite < hoje
            return (
              <div key={r.id} className="border rounded-xl p-3 flex flex-col gap-1.5" style={{ borderColor: vencida ? 'var(--rbr-danger)' : 'var(--rbr-border)' }}>
                <div className="text-sm">
                  <b>{r.alvo === 'pagamento_prestador' ? 'Pagamento ao prestador' : 'Comissão do agenciador'}</b> · {nomes.get(r.pessoa_id) ?? '—'}
                  {r.operacao_id && (
                    <Link to={`/operacoes?op=${r.operacao_id}`} className="ml-2 text-xs underline text-[color:var(--rbr-navy)]">
                      #{r.operacao_id.slice(0, 8)}
                    </Link>
                  )}
                </div>
                <div className="text-xs" style={{ color: vencida ? 'var(--rbr-danger)' : undefined }}>
                  Retido até {new Date(r.data_limite + 'T12:00:00').toLocaleDateString('pt-BR')}
                  {vencida ? ' (VENCIDA: decidir agora)' : ''} · {r.motivo}
                </div>
                <div className="text-[11px] text-[color:var(--rbr-muted)]">
                  {r.retencoes_eventos.map((e) => `${new Date(e.em).toLocaleDateString('pt-BR')} ${e.acao}: ${e.motivo}`).join(' · ')}
                </div>
                <div className="flex gap-2">
                  <Botao variante="secundario" onClick={() => setAcao({ r, tipo: 'prorrogar' })}>
                    Prorrogar
                  </Botao>
                  <Botao onClick={() => setAcao({ r, tipo: 'liberar' })}>Liberar</Botao>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {acao && (
        <ModalMotivo
          titulo={acao.tipo === 'liberar' ? 'Liberar pagamento' : 'Prorrogar retenção'}
          rotulo="Motivo (obrigatório)"
          extra={
            acao.tipo === 'prorrogar' ? (
              <Campo label="Prorrogar por (dias)">
                <input value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} style={inputStyle} />
              </Campo>
            ) : undefined
          }
          onFechar={() => setAcao(null)}
          onConfirmar={async (motivo) => {
            const r =
              acao.tipo === 'liberar'
                ? await dbNovo.rpc('liberar_retencao', { p_retencao: acao.r.id, p_motivo: motivo })
                : await dbNovo.rpc('prorrogar_retencao', { p_retencao: acao.r.id, p_dias: Number(dias), p_motivo: motivo })
            if (r.error) throw new Error(r.error.message)
            setAcao(null)
            mostrar('ok', acao.tipo === 'liberar' ? 'Retenção liberada: o pagamento pode ser feito.' : `Retenção prorrogada por ${dias} dia(s).`)
            await carregar()
          }}
        />
      )}
    </Card>
  )
}

type IncidenteLinha = { id: string; operacao_id: string; status: string; descricao: string; registrado_em: string; dossie_path: string | null; encerramento_motivo: string | null }
export function Incidentes() {
  const [l, setL] = useState<IncidenteLinha[] | null>(null)
  const { confirmacao, rodar } = useConfirmacao()
  useEffect(() => {
    void dbNovo
      .from('incidentes_carga')
      .select('id, operacao_id, status, descricao, registrado_em, dossie_path, encerramento_motivo')
      .order('registrado_em', { ascending: false })
      .then(({ data }) => setL((data ?? []) as IncidenteLinha[]))
  }, [])
  if (l === null) return <Carregando />
  return (
    <Card titulo="Incidentes de carga">
      {confirmacao}
      {l.length === 0 ? (
        <Vazio>Nenhum incidente registrado.</Vazio>
      ) : (
        <ul className="flex flex-col gap-2 text-xs">
          {l.map((i) => (
            <li key={i.id} className="border rounded-xl p-3 flex flex-col gap-1" style={{ borderColor: i.status === 'aberto' ? 'var(--rbr-danger)' : 'var(--rbr-border)' }}>
              <div>
                <b>{i.status === 'aberto' ? 'Aberto' : 'Encerrado'}</b> · {new Date(i.registrado_em).toLocaleString('pt-BR')} ·{' '}
                <Link to={`/operacoes?op=${i.operacao_id}`} className="underline text-[color:var(--rbr-navy)]">
                  operação #{i.operacao_id.slice(0, 8)}
                </Link>
              </div>
              <div>{i.descricao}</div>
              {i.encerramento_motivo && <div className="text-[color:var(--rbr-muted)]">Encerrado: {i.encerramento_motivo}</div>}
              <div>
                {i.dossie_path ? (
                  <Botao variante="secundario" onClick={() => void rodar('Dossiê aberto em outra aba.', () => abrirDossie(i.dossie_path!))}>
                    Baixar dossiê
                  </Botao>
                ) : (
                  <span className="text-[color:var(--rbr-muted)]">Dossiê ainda não gerado (gere na operação).</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

type ParConformidade = {
  agenciador_novo_dias: number
  agenciador_novo_cargas: number
  limite_valor_agenciador_novo: number
  tolerancia_valor_nf_pct: number
  limite_valor_por_nivel: { novo: number | null; verificado: number | null; restrito: number | null }
  bloquear_liberacao_com_alerta: boolean
  prazo_retencao_dias: number
  dias_aviso_retencao: number
  dias_aviso_toxicologico: number
}
type TextosDeclaracao = { minuta: boolean; a: string; b: string; c: string; d: string }

export function ParametrosConformidade() {
  const [p, setP] = useState<ParConformidade | null>(null)
  const [t, setT] = useState<TextosDeclaracao | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  useEffect(() => {
    void supabase
      .from('parametros_sistema')
      .select('chave, valor')
      .in('chave', ['conformidade', 'declaracao_carga_textos'])
      .then(({ data }) => {
        for (const r of data ?? []) {
          if (r.chave === 'conformidade') setP(r.valor as unknown as ParConformidade)
          else setT(r.valor as unknown as TextosDeclaracao)
        }
      })
  }, [])
  if (!p || !t) return null
  const num = (k: keyof ParConformidade, label: string) => (
    <Campo label={label}>
      <input
        value={String(p[k] ?? '')}
        onChange={(e) => setP({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })}
        inputMode="decimal"
        className={inputClass}
        style={inputStyle}
      />
    </Campo>
  )
  const nivel = (k: 'novo' | 'verificado' | 'restrito') => (
    <Campo label={`Limite por carga: ${k} (R$, vazio = sem limite)`}>
      <input
        value={p.limite_valor_por_nivel[k] ?? ''}
        onChange={(e) => setP({ ...p, limite_valor_por_nivel: { ...p.limite_valor_por_nivel, [k]: e.target.value === '' ? null : Number(e.target.value) } })}
        inputMode="decimal"
        className={inputClass}
        style={inputStyle}
      />
    </Campo>
  )
  return (
    <Card titulo="Regras e parâmetros">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {num('agenciador_novo_dias', 'Agenciador novo: menos de (dias)')}
        {num('agenciador_novo_cargas', 'Agenciador novo: menos de (cargas)')}
        {num('limite_valor_agenciador_novo', 'Valor alto para agenciador novo (R$)')}
        {num('tolerancia_valor_nf_pct', 'Tolerância NF x declarado (0,01 = 1%)')}
        {num('prazo_retencao_dias', 'Prazo da retenção (dias)')}
        {num('dias_aviso_retencao', 'Avisar retenção vencendo (dias antes)')}
        {num('dias_aviso_toxicologico', 'Avisar toxicológico vencendo (dias antes)')}
        {nivel('novo')}
        {nivel('verificado')}
        {nivel('restrito')}
      </div>
      <label className="flex items-center gap-2 text-xs mt-3">
        <input type="checkbox" checked={p.bloquear_liberacao_com_alerta} onChange={(e) => setP({ ...p, bloquear_liberacao_com_alerta: e.target.checked })} />
        Bloquear a liberação para coleta enquanto houver alerta não revisado (padrão: desligado, só avisa)
      </label>
      <div className="mt-4 flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
          Declarações da carga (cláusula 6.2 do contrato do agenciador){t.minuta ? ' · MINUTA, substituir pelo texto do advogado' : ''}
        </div>
        {(['a', 'b', 'c', 'd'] as const).map((k) => (
          <Campo key={k} label={`6.2 (${k})`}>
            <textarea rows={2} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} className={inputClass} style={inputStyle} />
          </Campo>
        ))}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={t.minuta} onChange={(e) => setT({ ...t, minuta: e.target.checked })} /> Ainda é minuta (texto provisório)
        </label>
      </div>
      {confirmacao}
      <div className="mt-3">
        <Botao
          disabled={ocupado}
          onClick={() =>
            void rodar('Parâmetros de conformidade salvos.', async () => {
              const r1 = await supabase.from('parametros_sistema').update({ valor: p }).eq('chave', 'conformidade')
              if (r1.error) throw r1.error
              const r2 = await supabase.from('parametros_sistema').update({ valor: t }).eq('chave', 'declaracao_carga_textos')
              if (r2.error) throw r2.error
            })
          }
        >
          {ocupado ? 'enviando…' : 'Salvar parâmetros'}
        </Botao>
      </div>
      <Aviso tipo="info">
        Alerta é aviso e marca "revisar antes de liberar". Só bloqueia se a opção acima estiver ligada. Operação com incidente fica congelada sempre.
      </Aviso>
    </Card>
  )
}

// 10.5: prestadores suspensos por incidente; reativar exige motivo (fica na auditoria).
export function PrestadoresSuspensos() {
  const [l, setL] = useState<{ id: string; nome: string; suspenso_em: string; suspensao_motivo: string | null }[] | null>(null)
  const [reativando, setReativando] = useState<string | null>(null)
  const { confirmacao, mostrar } = useConfirmacao()
  const carregar = useCallback(async () => {
    const { data } = await dbNovo.from('pessoas').select('id, nome, suspenso_em, suspensao_motivo').not('suspenso_em', 'is', null).order('suspenso_em', { ascending: false })
    setL((data ?? []) as { id: string; nome: string; suspenso_em: string; suspensao_motivo: string | null }[])
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])
  if (!l || l.length === 0) return null
  return (
    <Card titulo="Motoristas/parceiros suspensos">
      {confirmacao}
      <ul className="flex flex-col gap-1.5 text-xs">
        {l.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 flex-wrap">
            <span>
              <b>{p.nome}</b> · desde {new Date(p.suspenso_em).toLocaleDateString('pt-BR')} · {p.suspensao_motivo}
            </span>
            <Botao variante="secundario" onClick={() => setReativando(p.id)}>
              Reativar
            </Botao>
          </li>
        ))}
      </ul>
      {reativando && (
        <ModalMotivo
          titulo="Reativar motorista/parceiro"
          rotulo="Motivo (obrigatório)"
          onFechar={() => setReativando(null)}
          onConfirmar={async (motivo) => {
            const { error } = await dbNovo.rpc('reativar_prestador', { p_pessoa: reativando, p_motivo: motivo })
            if (error) throw new Error(error.message)
            setReativando(null)
            mostrar('ok', 'Reativado: volta a poder ser alocado.')
            await carregar()
          }}
        />
      )}
    </Card>
  )
}
