import { useCallback, useEffect, useMemo, useState } from 'react'
import { Aviso, Botao, Campo, Card, Modal, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { db, auditar, type Bloqueio, type Contato, type Empresa, type Mensagem } from '../../lib/prospeccaoDb'
import {
  SEGMENTOS, SEGMENTO_FRASE, SEGMENTO_LEGIVEL, SEGMENTO_LABEL, STATUS_EMPRESA_LABEL, preencher, VALIDACAO_LABEL, VEICULOS, analisarImportacao, calcularPontuacao, parseCsv,
  podeGerarRascunho, rascunhoToque1, soDigitos, type LinhaImport, type Peso, type Segmento,
} from '../../lib/prospeccao'

const COR_CLASSE: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#E7F5EC', fg: '#1a6b3c' }, B: { bg: '#FDF1DC', fg: '#8A5A00' }, C: { bg: '#EEF0F5', fg: '#4a5275' },
}
const COR_VALID: Record<string, { bg: string; fg: string }> = {
  verificado: { bg: '#E7F5EC', fg: '#1a6b3c' }, mx_ok: { bg: '#E7F5EC', fg: '#1a6b3c' }, sintaxe_ok: { bg: '#EEF0F5', fg: '#4a5275' },
  pendente: { bg: '#EEF0F5', fg: '#4a5275' }, catch_all: { bg: '#FDF1DC', fg: '#8A5A00' }, invalido: { bg: '#FBE9E9', fg: '#b3261e' }, devolvido: { bg: '#FBE9E9', fg: '#b3261e' },
}
function Chip({ texto, cor }: { texto: string; cor: { bg: string; fg: string } }) {
  return <span className="inline-block text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: cor.bg, color: cor.fg }}>{texto}</span>
}
export const ChipClasse = ({ classe, pontos }: { classe: string; pontos?: number }) => (
  <Chip texto={pontos == null ? classe : `${classe} · ${pontos}`} cor={COR_CLASSE[classe] ?? COR_CLASSE.C} />
)

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null)
  const [contatos, setContatos] = useState<Contato[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [pesos, setPesos] = useState<Peso[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [f, setF] = useState({ classe: '', segmento: '', uf: '', status: '', veiculo: '', busca: '' })
  const [aberta, setAberta] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [e, c, b, p] = await Promise.all([
      db.from('prospeccao_empresas').select('*').order('pontuacao', { ascending: false }).limit(2000),
      db.from('prospeccao_contatos').select('*').order('criado_em').limit(5000),
      db.from('prospeccao_bloqueio').select('*'),
      db.from('prospeccao_pesos').select('*').order('ordem'),
    ])
    const falha = e.error ?? c.error ?? b.error ?? p.error
    if (falha) setErro(`Não consegui carregar a prospecção: ${falha.message}`)
    setEmpresas((e.data ?? []) as Empresa[])
    setContatos((c.data ?? []) as Contato[])
    setBloqueios((b.data ?? []) as Bloqueio[])
    setPesos((p.data ?? []) as Peso[])
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const principal = useMemo(() => {
    const m = new Map<string, Contato>()
    for (const c of contatos) if (!m.has(c.empresa_id)) m.set(c.empresa_id, c)
    return m
  }, [contatos])

  const lista = useMemo(() => {
    const q = f.busca.trim().toLowerCase()
    const qd = soDigitos(f.busca)
    return (empresas ?? []).filter((e) =>
      (!f.classe || e.classe === f.classe) && (!f.segmento || e.segmento === f.segmento) && (!f.uf || e.uf === f.uf) &&
      (!f.status || e.status === f.status) && (!f.veiculo || e.veiculo_provavel === f.veiculo) &&
      (!q || e.razao_social.toLowerCase().includes(q) || (e.nome_fantasia ?? '').toLowerCase().includes(q) || (qd !== '' && e.cnpj.includes(qd))))
  }, [empresas, f])
  const ufs = useMemo(() => [...new Set((empresas ?? []).map((e) => e.uf).filter(Boolean))].sort() as string[], [empresas])

  async function gerarRascunho(e: Empresa) {
    const c = principal.get(e.id)
    await rodar('Rascunho do 1º toque criado. Veja na Fila de aprovação.', async () => {
      if (!c || !podeGerarRascunho(e.classe, c.validacao_status)) throw new Error('Precisa de empresa classe A ou B e contato com e-mail de sintaxe válida.')
      const { data: ja } = await db.from('prospeccao_mensagens').select('id').eq('empresa_id', e.id).eq('contato_id', c.id).eq('toque', 1).in('status', ['rascunho', 'aprovado', 'enviado']).limit(1)
      if (ja && ja.length > 0) throw new Error('Já existe um 1º toque para este contato (rascunho, aprovado ou enviado).')
      // Parte B: o texto vem do modelo editavel (toque1, ativo); se a tabela nao existir ainda, usa o modelo fixo da Parte A.
      const { data: mod } = await db.from('prospeccao_modelos').select('assunto, corpo, ativo').eq('tipo', 'toque1').maybeSingle()
      let m = rascunhoToque1({ segmento: e.segmento as Segmento, cidade: e.cidade })
      if (mod && (mod as { ativo: boolean }).ativo) {
        const v = { segmento_legivel: SEGMENTO_LEGIVEL[e.segmento as Segmento], segmento_frase: SEGMENTO_FRASE[e.segmento as Segmento], cidade: e.cidade?.trim() || 'sua região', nome: c.nome ?? '', empresa: e.nome_fantasia ?? e.razao_social, veiculo: e.veiculo_provavel ?? '' }
        m = { assunto: preencher((mod as { assunto: string }).assunto, v), corpo: preencher((mod as { corpo: string }).corpo, v) }
      }
      const { error } = await db.from('prospeccao_mensagens').insert({ empresa_id: e.id, contato_id: c.id, toque: 1, assunto: m.assunto, corpo: m.corpo, status: 'rascunho' })
      if (error) throw new Error(error.message)
      await db.from('prospeccao_empresas').update({ status: 'em_aprovacao' }).eq('id', e.id).eq('status', 'novo')
      await auditar('prospeccao_rascunho_gerado', { empresa_id: e.id, toque: 1 })
      await carregar()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {confirmacao}
      {erro && <Aviso onFechar={() => setErro(null)}>{erro}</Aviso>}
      <div className="flex gap-2 flex-wrap items-end">
        <div className="w-full md:w-56"><Campo label="Buscar"><input className={inputClass} style={inputStyle} placeholder="Nome ou CNPJ" value={f.busca} onChange={(ev) => setF({ ...f, busca: ev.target.value })} /></Campo></div>
        {([
          ['classe', 'Classe', ['A', 'B', 'C'].map((v) => [v, v])],
          ['segmento', 'Segmento', SEGMENTOS.map((v) => [v, SEGMENTO_LABEL[v]])],
          ['uf', 'UF', ufs.map((v) => [v, v])],
          ['status', 'Status', Object.entries(STATUS_EMPRESA_LABEL)],
          ['veiculo', 'Veículo', VEICULOS.map((v) => [v, v])],
        ] as [keyof typeof f, string, string[][]][]).map(([k, rot, ops]) => (
          <div key={k} className="w-[120px]">
            <Campo label={rot}>
              <select className={inputClass} style={inputStyle} value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })}>
                <option value="">Todos</option>
                {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Campo>
          </div>
        ))}
        <div className="ml-auto"><Botao onClick={() => setImportando(true)}>Importar planilha (CSV)</Botao></div>
      </div>

      <Card>
        {empresas === null ? <div className="text-sm text-[color:var(--rbr-muted)]">Carregando…</div> : lista.length === 0 ? (
          <Vazio>{empresas.length === 0 ? 'Nenhuma empresa ainda. Importe uma planilha (CSV) para começar.' : 'Nenhuma empresa com esses filtros.'}</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--rbr-muted)]">
                  {['Empresa', 'Cidade/UF', 'Segmento', 'Func.', 'Veículo', 'Pontuação', 'E-mail', 'Status', ''].map((h) => <th key={h} className="py-2 pr-3 font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const c = principal.get(e.id)
                  return (
                    <tr key={e.id} className="border-t cursor-pointer hover:bg-[#f7f8fc]" style={{ borderColor: '#eef0f5' }} onClick={() => setAberta(e.id)}>
                      <td className="py-2 pr-3 font-bold">{e.nome_fantasia || e.razao_social}</td>
                      <td className="py-2 pr-3">{e.cidade ?? '—'}{e.uf ? `/${e.uf}` : ''}</td>
                      <td className="py-2 pr-3">{SEGMENTO_LABEL[e.segmento as Segmento] ?? e.segmento}</td>
                      <td className="py-2 pr-3">{e.funcionarios ?? '—'}</td>
                      <td className="py-2 pr-3">{e.veiculo_provavel ?? '—'}</td>
                      <td className="py-2 pr-3"><ChipClasse classe={e.classe} pontos={e.pontuacao} /></td>
                      <td className="py-2 pr-3">{c ? <Chip texto={VALIDACAO_LABEL[c.validacao_status] ?? c.validacao_status} cor={COR_VALID[c.validacao_status] ?? COR_VALID.pendente} /> : '—'}</td>
                      <td className="py-2 pr-3">{STATUS_EMPRESA_LABEL[e.status] ?? e.status}</td>
                      <td className="py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                        <Botao variante="secundario" disabled={ocupado || !c || !podeGerarRascunho(e.classe, c.validacao_status)} onClick={() => void gerarRascunho(e)}
                          title="Cria o rascunho do 1º toque (classe A ou B, e-mail com sintaxe válida)">Gerar rascunho do 1º toque</Botao>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {aberta && empresas && (
        <Detalhe empresa={empresas.find((e) => e.id === aberta)!} contatos={contatos.filter((c) => c.empresa_id === aberta)} pesos={pesos}
          onFechar={() => setAberta(null)} onSalvo={carregar} />
      )}
      {importando && <Importar bloqueios={bloqueios} empresas={empresas ?? []} contatos={contatos} onFechar={() => setImportando(false)} onFeito={carregar} />}
    </div>
  )
}

// ---- gaveta de detalhe -------------------------------------------------------------------------------
function Detalhe({ empresa, contatos, pesos, onFechar, onSalvo }: { empresa: Empresa; contatos: Contato[]; pesos: Peso[]; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const [crit, setCrit] = useState<Record<string, number>>(empresa.criterios ?? {})
  const [risco, setRisco] = useState(empresa.penalidade_risco)
  const [motivo, setMotivo] = useState(empresa.penalidade_motivo ?? '')
  const [func, setFunc] = useState(empresa.funcionarios == null ? '' : String(empresa.funcionarios))
  const [msgs, setMsgs] = useState<Mensagem[]>([])
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  useEffect(() => {
    void db.from('prospeccao_mensagens').select('*').eq('empresa_id', empresa.id).order('criado_em', { ascending: false }).then(({ data }) => setMsgs((data ?? []) as Mensagem[]))
  }, [empresa.id])
  const funcN = func.trim() === '' ? null : Number(func)
  const previa = calcularPontuacao(crit, pesos, funcN, risco)
  return (
    <Modal titulo={empresa.razao_social} onFechar={onFechar} largura="max-w-3xl">
      {confirmacao}
      <div className="text-xs text-[color:var(--rbr-muted)]">CNPJ {empresa.cnpj} · {empresa.cidade ?? '—'}{empresa.uf ? `/${empresa.uf}` : ''} · {SEGMENTO_LABEL[empresa.segmento as Segmento]} · CNAE {empresa.cnae ?? '—'}</div>
      <div className="text-xs">Site: {empresa.site ?? '—'} · Telefone: {empresa.telefone ?? '—'} · Veículo provável: {empresa.veiculo_provavel ?? '—'}</div>
      <div className="text-xs"><b>Origem do contato:</b> {empresa.origem_contato}</div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm font-bold">Pontuação agora: <ChipClasse classe={previa.classe} pontos={previa.pontuacao} /></div>
        <div className="w-28"><Campo label="Funcionários"><input className={inputClass} style={inputStyle} inputMode="numeric" value={func} onChange={(e) => setFunc(e.target.value.replace(/\D/g, ''))} /></Campo></div>
        <label className="text-xs flex items-center gap-1.5 font-semibold"><input type="checkbox" checked={risco} onChange={(e) => setRisco(e.target.checked)} /> Penalidade de risco (rebaixa uma classe)</label>
      </div>
      {risco && <Campo label="Motivo da penalidade"><input className={inputClass} style={inputStyle} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Recuperação judicial, protestos altos…" /></Campo>}
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5">
        {pesos.map((p) => (
          <label key={p.criterio} className="flex items-center gap-2 text-xs">
            <span className="flex-1">{p.rotulo} <span className="text-[color:var(--rbr-muted)]">(peso {p.peso})</span></span>
            <input type="range" min={0} max={1} step={0.1} value={crit[p.criterio] ?? 0} onChange={(e) => setCrit({ ...crit, [p.criterio]: Number(e.target.value) })} />
            <span className="w-8 text-right font-bold">{(crit[p.criterio] ?? 0).toFixed(1)}</span>
          </label>
        ))}
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1">Contatos</div>
        {contatos.length === 0 ? <div className="text-xs text-[color:var(--rbr-muted)]">Sem contatos.</div> : contatos.map((c) => (
          <div key={c.id} className="text-xs py-1 border-t" style={{ borderColor: '#eef0f5' }}>
            <b>{c.email}</b> ({c.tipo_email}) · {VALIDACAO_LABEL[c.validacao_status]} · {c.nome ?? 'sem nome'}{c.cargo ? `, ${c.cargo}` : ''} · origem: {c.origem_contato}
          </div>
        ))}
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1">Histórico de mensagens</div>
        {msgs.length === 0 ? <div className="text-xs text-[color:var(--rbr-muted)]">Nenhuma mensagem.</div> : msgs.map((m) => (
          <div key={m.id} className="text-xs py-1 border-t" style={{ borderColor: '#eef0f5' }}>Toque {m.toque} · <b>{m.status}</b> · {m.assunto} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}</div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>
        <Botao disabled={ocupado} onClick={() => void rodar('Critérios salvos.', async () => {
          const { error } = await db.from('prospeccao_empresas').update({ criterios: crit, penalidade_risco: risco, penalidade_motivo: risco ? motivo || null : null, funcionarios: funcN }).eq('id', empresa.id)
          if (error) throw new Error(error.message)
          await onSalvo()
        })}>Salvar critérios</Botao>
      </div>
    </Modal>
  )
}

// ---- importacao CSV ----------------------------------------------------------------------------------
function Importar({ bloqueios, empresas, contatos, onFechar, onFeito }: { bloqueios: Bloqueio[]; empresas: Empresa[]; contatos: Contato[]; onFechar: () => void; onFeito: () => Promise<void> }) {
  const [linhas, setLinhas] = useState<LinhaImport[] | null>(null)
  const [arquivo, setArquivo] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const ok = (linhas ?? []).filter((l) => l.situacao === 'ok')
  async function ler(f: File) {
    setArquivo(f.name)
    const rows = parseCsv(await f.text())
    setLinhas(analisarImportacao(rows, { cnpjs: new Set(empresas.map((e) => e.cnpj)), emails: new Set(contatos.map((c) => c.email.toLowerCase())) }, bloqueios))
  }
  async function gravar() {
    await rodar((n: number) => `${n} empresa(s) importada(s).`, async () => {
      let n = 0
      for (const l of ok) {
        const { data, error } = await db.from('prospeccao_empresas').insert(l.empresa!).select('id').single()
        if (error) throw new Error(`Linha ${l.linha}: ${error.message}`)
        if (l.contato) {
          const r = await db.from('prospeccao_contatos').insert({ ...l.contato, empresa_id: data.id, validado_em: new Date().toISOString() })
          if (r.error) throw new Error(`Linha ${l.linha} (contato): ${r.error.message}`)
        }
        n++
      }
      await auditar('prospeccao_importacao', { arquivo, importadas: n, ignoradas: (linhas ?? []).length - n })
      await onFeito()
      onFechar()
      return n
    })
  }
  const cont = (s: string) => (linhas ?? []).filter((l) => l.situacao === s).length
  return (
    <Modal titulo="Importar planilha (CSV)" onFechar={onFechar} largura="max-w-4xl" fecharNoFundo={false}>
      {confirmacao}
      <div className="text-xs text-[color:var(--rbr-muted)]">
        Colunas: razao_social, nome_fantasia, cnpj, cnae, segmento (alimentos, bebidas, plasticos, metalurgia, maquinas), cidade, uf, funcionarios, site, telefone, contato_nome, contato_cargo, contato_email, <b>origem_contato (obrigatória)</b>.
        Só confere a sintaxe do e-mail; não consulta DNS nesta fase.
      </div>
      <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f) }} />
      {linhas && (
        <>
          <div className="text-sm"><b>{ok.length}</b> pronta(s) · {cont('erro')} com erro · {cont('duplicada')} duplicada(s) · {cont('bloqueada')} bloqueada(s)</div>
          <div className="max-h-72 overflow-auto border rounded-lg" style={{ borderColor: 'var(--rbr-border)' }}>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[color:var(--rbr-muted)]"><th className="p-2">Linha</th><th className="p-2">Empresa</th><th className="p-2">E-mail</th><th className="p-2">Situação</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.linha} className="border-t" style={{ borderColor: '#eef0f5' }}>
                    <td className="p-2">{l.linha}</td>
                    <td className="p-2">{l.empresa?.razao_social ?? '—'}</td>
                    <td className="p-2">{l.contato ? `${l.contato.email} (${l.contato.validacao_status === 'invalido' ? 'inválido' : l.contato.tipo_email})` : '—'}</td>
                    <td className="p-2" style={{ color: l.situacao === 'ok' ? '#1a6b3c' : l.situacao === 'erro' ? '#b3261e' : '#8A5A00' }}>{l.situacao === 'ok' ? 'Vai importar' : l.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cont('erro') > 0 && <Aviso tipo="atencao">As linhas com erro serão ignoradas. Corrija a planilha e importe de novo se quiser incluí-las.</Aviso>}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao disabled={ocupado || ok.length === 0} onClick={() => void gravar()}>Importar {ok.length} empresa(s)</Botao>
      </div>
    </Modal>
  )
}
