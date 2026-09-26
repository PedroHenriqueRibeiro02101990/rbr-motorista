import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Json } from '@rbr/shared/database.types'
import {
  type Apoio,
  type Categoria,
  type CondicaoPrazo,
  type Conta,
  type Recorrencia,
  type RegraCategorizacao,
  type RegraPrazo,
  FORMA_LABEL,
  GRUPO_LABEL,
  brl,
  descreverRegra,
  erroMsg,
  fmtData,
  hojeISO,
  lerParametro,
  nomeCliente,
  nomeFornecedor,
  parseValor,
  regraDeCondicao,
  salvarParametro,
  valorParaInput,
} from '../../lib/financeiro'
import { Aviso, Botao, Campo, Card, Chips, Modal, Vazio, inputClass, inputStyle } from './ui'
import { EditorParcelas, PreviaRegra } from './PrazoEditor'
import { NATUREZA_LABEL, OpcoesCategoria } from './CategoriaOpcoes'

type Secao = 'contas' | 'prazos' | 'recorrencias' | 'categorias' | 'parametros' | 'regras'

export default function Configuracoes({ apoio, versao, onMudou }: { apoio: Apoio; versao: number; onMudou: () => void }) {
  const [secao, setSecao] = useState<Secao>('contas')
  return (
    <div className="flex flex-col gap-3">
      <Chips
        opcoes={[
          { valor: 'contas', label: 'Contas bancárias' },
          { valor: 'prazos', label: 'Regras de prazo' },
          { valor: 'recorrencias', label: 'Despesas e receitas fixas' },
          { valor: 'categorias', label: 'Plano de contas' },
          { valor: 'parametros', label: 'Parâmetros' },
          { valor: 'regras', label: 'O que a IA aprendeu' },
        ]}
        valor={secao}
        onChange={setSecao}
      />
      {secao === 'contas' && <Contas apoio={apoio} onMudou={onMudou} />}
      {secao === 'prazos' && <Prazos apoio={apoio} onMudou={onMudou} />}
      {secao === 'recorrencias' && <Recorrencias apoio={apoio} versao={versao} onMudou={onMudou} />}
      {secao === 'categorias' && <Categorias apoio={apoio} onMudou={onMudou} />}
      {secao === 'parametros' && <Parametros />}
      {secao === 'regras' && <Regras apoio={apoio} />}
    </div>
  )
}

// ---------------------------------------------------------------- contas
function Contas({ apoio, onMudou }: { apoio: Apoio; onMudou: () => void }) {
  const [editar, setEditar] = useState<Partial<Conta> | null>(null)
  const [transf, setTransf] = useState(false)
  return (
    <Card
      titulo="Contas bancárias e caixa"
      acao={
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={() => setTransf(true)} disabled={apoio.contas.filter((c) => c.ativa).length < 2}>
            Transferir entre contas
          </Botao>
          <Botao onClick={() => setEditar({ tipo: 'corrente', saldo_inicial: 0, saldo_inicial_em: hojeISO(), ativa: true, padrao: apoio.contas.length === 0 })}>+ Conta</Botao>
        </div>
      }
    >
      <div className="text-[11px] text-[color:var(--rbr-muted)] mb-2">
        O saldo parte do “saldo inicial” na data informada e soma tudo que foi pago/recebido nesta conta depois disso. Para começar certo: pegue o saldo do extrato de
        um dia e informe aqui com essa data.
      </div>
      <div className="flex flex-col gap-2">
        {apoio.contas.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border rounded-xl px-3 py-2.5 flex-wrap" style={{ borderColor: 'var(--rbr-border)', opacity: c.ativa ? 1 : 0.5 }}>
            <div className="flex-1 min-w-[180px]">
              <div className="font-semibold text-sm">
                {c.nome} {c.padrao && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--rbr-muted-bg)' }}>padrão</span>}
              </div>
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                {[c.banco_nome, c.agencia ? `ag. ${c.agencia}` : null, c.conta ? `cc ${c.conta}` : null].filter(Boolean).join(' · ') || c.tipo} · saldo inicial {brl(Number(c.saldo_inicial))} em{' '}
                {fmtData(c.saldo_inicial_em)}
              </div>
            </div>
            <div className="text-right">
              <div className="rbr-display font-bold tabular-nums" style={{ color: Number(c.saldo_atual) < 0 ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}>
                {brl(Number(c.saldo_atual))}
              </div>
              {Number(c.itens_extrato_pendentes) > 0 && <div className="text-[10.5px] text-[color:var(--rbr-muted)]">{c.itens_extrato_pendentes} item(ns) do extrato a conciliar</div>}
            </div>
            <Botao variante="secundario" onClick={() => setEditar(c)}>
              Editar
            </Botao>
          </div>
        ))}
      </div>
      {editar && <ContaForm conta={editar} onFechar={() => setEditar(null)} onSalvo={onMudou} />}
      {transf && <TransferenciaForm apoio={apoio} onFechar={() => setTransf(false)} onSalvo={onMudou} />}
    </Card>
  )
}

function ContaForm({ conta, onFechar, onSalvo }: { conta: Partial<Conta>; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    nome: conta.nome ?? '',
    tipo: conta.tipo ?? 'corrente',
    banco_codigo: conta.banco_codigo ?? '',
    banco_nome: conta.banco_nome ?? '',
    agencia: conta.agencia ?? '',
    conta: conta.conta ?? '',
    saldo_inicial: valorParaInput(conta.saldo_inicial ?? 0),
    saldo_inicial_em: conta.saldo_inicial_em ?? hojeISO(),
    padrao: !!conta.padrao,
    ativa: conta.ativa ?? true,
  })
  const [erro, setErro] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setErro(null)
    if (!f.nome.trim()) return setErro('Dê um nome à conta.')
    const saldo = parseValor(f.saldo_inicial || '0')
    if (!Number.isFinite(saldo)) return setErro('Saldo inicial inválido.')
    if (f.padrao) await supabase.from('contas_bancarias').update({ padrao: false }).neq('id', conta.id ?? '00000000-0000-0000-0000-000000000000').eq('padrao', true)
    const payload = {
      nome: f.nome.trim(),
      tipo: f.tipo,
      banco_codigo: f.banco_codigo || null,
      banco_nome: f.banco_nome || null,
      agencia: f.agencia || null,
      conta: f.conta || null,
      saldo_inicial: saldo,
      saldo_inicial_em: f.saldo_inicial_em,
      padrao: f.padrao,
      ativa: f.ativa,
    }
    const { error } = conta.id ? await supabase.from('contas_bancarias').update(payload).eq('id', conta.id) : await supabase.from('contas_bancarias').insert(payload)
    if (error) return setErro(error.message)
    onSalvo()
    onFechar()
  }

  return (
    <Modal titulo={conta.id ? 'Editar conta' : 'Nova conta'} onFechar={onFechar}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="Nome" className="md:col-span-2">
          <input value={f.nome} onChange={(e) => set('nome', e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: BTG PJ" />
        </Campo>
        <Campo label="Tipo">
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)} className={inputClass} style={inputStyle}>
            <option value="corrente">Conta corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="aplicacao">Aplicação</option>
            <option value="caixa">Caixa (dinheiro)</option>
            <option value="cartao">Cartão</option>
            <option value="outro">Outro</option>
          </select>
        </Campo>
        <Campo label="Banco">
          <input value={f.banco_nome} onChange={(e) => set('banco_nome', e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: BTG Pactual" />
        </Campo>
        <Campo label="Código do banco">
          <input value={f.banco_codigo} onChange={(e) => set('banco_codigo', e.target.value)} className={inputClass} style={inputStyle} placeholder="208" />
        </Campo>
        <Campo label="Agência / conta">
          <div className="flex gap-2">
            <input value={f.agencia} onChange={(e) => set('agencia', e.target.value)} className={inputClass} style={inputStyle} placeholder="ag." />
            <input value={f.conta} onChange={(e) => set('conta', e.target.value)} className={inputClass} style={inputStyle} placeholder="conta" />
          </div>
        </Campo>
        <Campo label="Saldo inicial (R$)">
          <input inputMode="decimal" value={f.saldo_inicial} onChange={(e) => set('saldo_inicial', e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Saldo em (data)">
          <input type="date" value={f.saldo_inicial_em} onChange={(e) => set('saldo_inicial_em', e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <div className="flex flex-col gap-2 justify-end">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.padrao} onChange={(e) => set('padrao', e.target.checked)} /> Conta padrão
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.ativa} onChange={(e) => set('ativa', e.target.checked)} /> Ativa
          </label>
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar}>Salvar</Botao>
      </div>
    </Modal>
  )
}

function TransferenciaForm({ apoio, onFechar, onSalvo }: { apoio: Apoio; onFechar: () => void; onSalvo: () => void }) {
  const ativas = apoio.contas.filter((c) => c.ativa)
  const [origem, setOrigem] = useState(ativas[0]?.id ?? '')
  const [destino, setDestino] = useState(ativas[1]?.id ?? '')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeISO())
  const [desc, setDesc] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  async function salvar() {
    setErro(null)
    const v = parseValor(valor)
    if (!Number.isFinite(v) || v <= 0) return setErro('Valor inválido.')
    if (origem === destino) return setErro('Escolha contas diferentes.')
    const { error } = await supabase.from('transferencias_contas').insert({ conta_origem_id: origem, conta_destino_id: destino, valor: v, data, descricao: desc || null })
    if (error) return setErro(error.message)
    onSalvo()
    onFechar()
  }
  return (
    <Modal titulo="Transferência entre contas" onFechar={onFechar}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Campo label="De">
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className={inputClass} style={inputStyle}>
            {ativas.map((c) => (
              <option key={c.id!} value={c.id!}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Para">
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className={inputClass} style={inputStyle}>
            {ativas.map((c) => (
              <option key={c.id!} value={c.id!}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Valor (R$)">
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Data">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Descrição" className="md:col-span-2">
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: aplicação" />
        </Campo>
      </div>
      <div className="text-[11px] text-[color:var(--rbr-muted)]">Transferência não é receita nem despesa — só muda o saldo de cada conta.</div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar}>Transferir</Botao>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- regras de prazo
function Prazos({ apoio, onMudou }: { apoio: Apoio; onMudou: () => void }) {
  const [editar, setEditar] = useState<Partial<CondicaoPrazo> | null>(null)
  return (
    <Card titulo="Regras de prazo (condições de pagamento)" acao={<Botao onClick={() => setEditar({ aplica_a: 'ambos', base: 'entrega', modo: 'dias', parcelas: [{ dias: 30, percentual: 100 }] as unknown as Json, ajustar_dia_util: true, ativa: true })}>+ Regra</Botao>}>
      <div className="text-[11px] text-[color:var(--rbr-muted)] mb-2">
        Cada negociação pode usar uma destas regras (escolhida na cotação para o cliente, e no cadastro do fornecedor para o que a RBR paga) ou um prazo personalizado
        feito na hora. Os vencimentos são calculados a partir do evento da operação (aprovação, liberação, coleta, entrega ou emissão) e caem no próximo dia útil.
      </div>
      <div className="flex flex-col gap-2">
        {apoio.condicoes.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border rounded-xl px-3 py-2.5 flex-wrap" style={{ borderColor: 'var(--rbr-border)', opacity: c.ativa ? 1 : 0.5 }}>
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold text-sm">
                {c.nome}
                {c.padrao_receber && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--rbr-muted-bg)' }}>padrão clientes</span>}
                {c.padrao_pagar && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--rbr-muted-bg)' }}>padrão fornecedores</span>}
              </div>
              <div className="text-[11px] text-[color:var(--rbr-muted)]">
                {descreverRegra(regraDeCondicao(c))} · {c.aplica_a === 'ambos' ? 'receber e pagar' : c.aplica_a === 'receber' ? 'só clientes' : 'só pagamentos'}
                {c.forma_padrao ? ` · ${FORMA_LABEL[c.forma_padrao]}` : ''}
              </div>
            </div>
            <Botao variante="secundario" onClick={() => setEditar(c)}>
              Editar
            </Botao>
          </div>
        ))}
      </div>
      {editar && <PrazoForm cond={editar} apoio={apoio} onFechar={() => setEditar(null)} onSalvo={onMudou} />}
    </Card>
  )
}

function PrazoForm({ cond, apoio, onFechar, onSalvo }: { cond: Partial<CondicaoPrazo>; apoio: Apoio; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(cond.nome ?? '')
  const [descricao, setDescricao] = useState(cond.descricao ?? '')
  const [aplica, setAplica] = useState(cond.aplica_a ?? 'ambos')
  const [forma, setForma] = useState(cond.forma_padrao ?? '')
  const [padraoR, setPadraoR] = useState(!!cond.padrao_receber)
  const [padraoP, setPadraoP] = useState(!!cond.padrao_pagar)
  const [ativa, setAtiva] = useState(cond.ativa ?? true)
  const [regra, setRegra] = useState<RegraPrazo>(
    cond.id
      ? regraDeCondicao(cond as CondicaoPrazo)
      : { base: cond.base ?? 'entrega', modo: (cond.modo as RegraPrazo['modo']) ?? 'dias', dia_fixo: cond.dia_fixo ?? null, parcelas: [{ dias: 30, percentual: 100 }], ajustar_dia_util: true },
  )
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    if (!nome.trim()) return setErro('Dê um nome à regra.')
    if (regra.modo === 'fechamento_mensal' && !regra.dia_fixo) return setErro('Informe o dia do vencimento.')
    if (padraoR) await supabase.from('condicoes_prazo').update({ padrao_receber: false }).eq('padrao_receber', true).neq('id', cond.id ?? '00000000-0000-0000-0000-000000000000')
    if (padraoP) await supabase.from('condicoes_prazo').update({ padrao_pagar: false }).eq('padrao_pagar', true).neq('id', cond.id ?? '00000000-0000-0000-0000-000000000000')
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      aplica_a: aplica,
      base: regra.base,
      modo: regra.modo,
      dia_fixo: regra.modo === 'fechamento_mensal' ? regra.dia_fixo ?? 10 : null,
      parcelas: regra.parcelas.map((p) => ({ dias: p.dias, percentual: p.percentual, ...(p.base ? { base: p.base } : {}) })) as unknown as Json,
      ajustar_dia_util: regra.ajustar_dia_util !== false,
      forma_padrao: forma || null,
      padrao_receber: padraoR,
      padrao_pagar: padraoP,
      ativa,
    }
    const { error } = cond.id ? await supabase.from('condicoes_prazo').update(payload).eq('id', cond.id) : await supabase.from('condicoes_prazo').insert(payload)
    if (error) return setErro(error.message)
    onSalvo()
    onFechar()
  }

  return (
    <Modal titulo={cond.id ? 'Editar regra de prazo' : 'Nova regra de prazo'} onFechar={onFechar}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Campo label="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: 28 dias após a entrega" />
        </Campo>
        <Campo label="Vale para">
          <select value={aplica} onChange={(e) => setAplica(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="ambos">Clientes e fornecedores</option>
            <option value="receber">Só clientes (a receber)</option>
            <option value="pagar">Só fornecedores (a pagar)</option>
          </select>
        </Campo>
        <Campo label="Descrição (opcional)" className="md:col-span-2">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
      </div>
      <EditorParcelas regra={regra} onChange={setRegra} />
      <PreviaRegra regra={regra} feriados={apoio.feriados} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Campo label="Forma de pagamento padrão">
          <select value={forma ?? ''} onChange={(e) => setForma(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">—</option>
            {Object.entries(FORMA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <div className="flex flex-col gap-1.5 justify-end">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={padraoR} onChange={(e) => setPadraoR(e.target.checked)} /> Padrão para novas cotações
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={padraoP} onChange={(e) => setPadraoP(e.target.checked)} /> Padrão para fornecedores sem regra
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Ativa
          </label>
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar}>Salvar</Botao>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- recorrências
function Recorrencias({ apoio, versao, onMudou }: { apoio: Apoio; versao: number; onMudou: () => void }) {
  const [lista, setLista] = useState<Recorrencia[] | null>(null)
  const [editar, setEditar] = useState<Partial<Recorrencia> | null>(null)
  useEffect(() => {
    supabase
      .from('recorrencias_financeiras')
      .select('*')
      .order('ativa', { ascending: false })
      .order('descricao')
      .then(({ data }) => setLista(data ?? []))
  }, [versao])
  const totalMes = (lista ?? [])
    .filter((r) => r.ativa && r.tipo === 'pagar')
    .reduce((s, r) => s + Number(r.valor) * ({ semanal: 4.33, mensal: 1, bimestral: 0.5, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12 }[r.frequencia] ?? 1), 0)
  return (
    <Card
      titulo="Despesas e receitas fixas"
      acao={<Botao onClick={() => setEditar({ tipo: 'pagar', frequencia: 'mensal', dia_vencimento: 10, inicio: hojeISO(), ativa: true })}>+ Recorrência</Botao>}
    >
      <div className="text-[11px] text-[color:var(--rbr-muted)] mb-2">
        Aluguel, contador, sistemas, Google Ads, pró-labore… O sistema cria os lançamentos dos próximos 60 dias sozinho, para o fluxo de caixa enxergar. Custo fixo
        mensal estimado: <b>{brl(totalMes)}</b>.
      </div>
      {!lista ? null : lista.length === 0 ? (
        <Vazio>Nenhuma recorrência cadastrada.</Vazio>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border rounded-xl px-3 py-2.5 flex-wrap" style={{ borderColor: 'var(--rbr-border)', opacity: r.ativa ? 1 : 0.5 }}>
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-sm">{r.descricao}</div>
                <div className="text-[11px] text-[color:var(--rbr-muted)]">
                  {r.tipo === 'pagar' ? 'Pagar' : 'Receber'} · {r.frequencia} · dia {r.dia_vencimento} · desde {fmtData(r.inicio)}
                  {r.fim ? ` até ${fmtData(r.fim)}` : ''}
                  {r.valor_variavel ? ' · valor variável' : ''} · {apoio.categorias.find((c) => c.id === r.categoria_id)?.nome ?? 'sem categoria'}
                </div>
              </div>
              <div className="tabular-nums font-semibold">{brl(Number(r.valor))}</div>
              <Botao variante="secundario" onClick={() => setEditar(r)}>
                Editar
              </Botao>
            </div>
          ))}
        </div>
      )}
      {editar && <RecorrenciaForm rec={editar} apoio={apoio} onFechar={() => setEditar(null)} onSalvo={onMudou} />}
    </Card>
  )
}

function RecorrenciaForm({ rec, apoio, onFechar, onSalvo }: { rec: Partial<Recorrencia>; apoio: Apoio; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    tipo: rec.tipo ?? 'pagar',
    descricao: rec.descricao ?? '',
    categoria_id: rec.categoria_id ?? '',
    fornecedor_id: rec.fornecedor_id ?? '',
    cliente_id: rec.cliente_id ?? '',
    contraparte_nome: rec.contraparte_nome ?? '',
    valor: valorParaInput(rec.valor ?? null),
    valor_variavel: !!rec.valor_variavel,
    frequencia: rec.frequencia ?? 'mensal',
    dia_vencimento: String(rec.dia_vencimento ?? 10),
    inicio: rec.inicio ?? hojeISO(),
    fim: rec.fim ?? '',
    forma_pagamento: rec.forma_pagamento ?? '',
    conta_bancaria_id: rec.conta_bancaria_id ?? '',
    ativa: rec.ativa ?? true,
  })
  const [erro, setErro] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  async function salvar() {
    setErro(null)
    const v = parseValor(f.valor)
    if (!f.descricao.trim()) return setErro('Informe a descrição.')
    if (!Number.isFinite(v) || v <= 0) return setErro('Informe o valor.')
    const payload = {
      tipo: f.tipo,
      descricao: f.descricao.trim(),
      categoria_id: f.categoria_id || null,
      fornecedor_id: f.tipo === 'pagar' ? f.fornecedor_id || null : null,
      cliente_id: f.tipo === 'receber' ? f.cliente_id || null : null,
      contraparte_nome: f.contraparte_nome.trim() || null,
      valor: v,
      valor_variavel: f.valor_variavel,
      frequencia: f.frequencia,
      dia_vencimento: Math.min(31, Math.max(1, Number(f.dia_vencimento) || 10)),
      inicio: f.inicio,
      fim: f.fim || null,
      forma_pagamento: f.forma_pagamento || null,
      conta_bancaria_id: f.conta_bancaria_id || null,
      ativa: f.ativa,
      updated_at: new Date().toISOString(),
    }
    const { error } = rec.id ? await supabase.from('recorrencias_financeiras').update(payload).eq('id', rec.id) : await supabase.from('recorrencias_financeiras').insert(payload)
    if (error) return setErro(error.message)
    if (rec.id) {
      // Refaz os lançamentos futuros que ainda não foram mexidos (sem pagamento e sem ajuste manual):
      // apaga e gera de novo com o valor/dia/frequência/fim atuais. Os ajustados à mão ficam como estão.
      const { error: e2 } = await supabase
        .from('lancamentos_financeiros')
        .delete()
        .eq('recorrencia_id', rec.id)
        .in('status', ['aberto', 'previsto'])
        .eq('valor_pago', 0)
        .eq('ajustado_manualmente', false)
        .gte('data_vencimento', hojeISO())
      if (e2) return setErro(`Recorrência salva, mas não consegui refazer os próximos lançamentos: ${e2.message}`)
    }
    const g = await supabase.rpc('gerar_lancamentos_recorrentes', {})
    if (g.error) return setErro(g.error.message)
    onSalvo()
    onFechar()
  }

  return (
    <Modal titulo={rec.id ? 'Editar recorrência' : 'Nova recorrência'} onFechar={onFechar}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="Tipo">
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)} className={inputClass} style={inputStyle} disabled={!!rec.id}>
            <option value="pagar">A pagar</option>
            <option value="receber">A receber</option>
          </select>
        </Campo>
        <Campo label="Descrição" className="md:col-span-2">
          <input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: Contador" />
        </Campo>
        <Campo label="Categoria">
          <select value={f.categoria_id} onChange={(e) => set('categoria_id', e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Sem categoria</option>
            <OpcoesCategoria categorias={apoio.categorias} tipo={f.tipo === 'pagar' ? 'despesa' : 'receita'} incluirInativas={f.categoria_id} />
          </select>
        </Campo>
        <Campo label={f.tipo === 'pagar' ? 'Fornecedor' : 'Cliente'}>
          {f.tipo === 'pagar' ? (
            <select value={f.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">— (use o nome ao lado)</option>
              {apoio.fornecedores.map((x) => (
                <option key={x.id} value={x.id}>
                  {nomeFornecedor(x)}
                </option>
              ))}
            </select>
          ) : (
            <select value={f.cliente_id} onChange={(e) => set('cliente_id', e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">— (use o nome ao lado)</option>
              {apoio.clientes.map((x) => (
                <option key={x.id} value={x.id}>
                  {nomeCliente(x)}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo label="Ou nome">
          <input value={f.contraparte_nome} onChange={(e) => set('contraparte_nome', e.target.value)} className={inputClass} style={inputStyle} placeholder="Ex.: Google" />
        </Campo>
        <Campo label="Valor (R$)">
          <input inputMode="decimal" value={f.valor} onChange={(e) => set('valor', e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Frequência">
          <select value={f.frequencia} onChange={(e) => set('frequencia', e.target.value)} className={inputClass} style={inputStyle}>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
            <option value="bimestral">Bimestral</option>
            <option value="trimestral">Trimestral</option>
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </select>
        </Campo>
        <Campo label="Dia do vencimento">
          <input inputMode="numeric" value={f.dia_vencimento} onChange={(e) => set('dia_vencimento', e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Começa em">
          <input type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Termina em (opcional)">
          <input type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Forma">
          <select value={f.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">—</option>
            {Object.entries(FORMA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        <div className="flex flex-col gap-1.5 justify-end md:col-span-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.valor_variavel} onChange={(e) => set('valor_variavel', e.target.checked)} /> Valor muda todo mês (entra como previsão)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.ativa} onChange={(e) => set('ativa', e.target.checked)} /> Ativa (desmarcar cancela os lançamentos futuros em aberto)
          </label>
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar}>Salvar</Botao>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- plano de contas
const ORDEM_GRUPOS_CFG = [
  'receita_operacional', 'outras_receitas', 'receita_financeira', 'custo_operacional', 'deducoes',
  'despesa_administrativa', 'despesa_comercial', 'despesa_pessoal', 'despesa_financeira',
  'investimento', 'retirada_socios', 'emprestimo',
]

function Categorias({ apoio, onMudou }: { apoio: Apoio; onMudou: () => void }) {
  const [editar, setEditar] = useState<Partial<Categoria> | null>(null)
  const [busca, setBusca] = useState('')
  const [natureza, setNatureza] = useState<'todas' | 'fixa' | 'variavel'>('todas')
  const t = busca.trim().toLowerCase()
  return (
    <Card titulo="Plano de contas" acao={<Botao onClick={() => setEditar({ tipo: 'despesa', grupo: 'despesa_administrativa', natureza: 'fixa', ativa: true })}>+ Categoria</Botao>}>
      <div className="text-[11px] text-[color:var(--rbr-muted)] mb-2">
        As categorias alimentam o DRE. <b>Fixa</b> = existe mesmo sem frete (aluguel, energia, internet, contador…). <b>Variável</b> = sobe e desce com o volume de
        fretes (motorista, pedágio, seguro, GR, imposto, comissão). Essa divisão calcula a margem de contribuição e o ponto de equilíbrio em Resultado. “Tributável”
        marca o que entra na base do DAS. As categorias do sistema podem ser renomeadas, mas não apagadas.
      </div>
      <div className="flex gap-2 flex-wrap items-center mb-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} className={`${inputClass} !w-60`} style={inputStyle} placeholder="Buscar categoria" />
        <Chips
          opcoes={[
            { valor: 'todas', label: 'Todas' },
            { valor: 'fixa', label: `Fixas (${apoio.categorias.filter((c) => c.ativa && c.natureza === 'fixa').length})` },
            { valor: 'variavel', label: `Variáveis (${apoio.categorias.filter((c) => c.ativa && c.natureza === 'variavel').length})` },
          ]}
          valor={natureza}
          onChange={setNatureza}
        />
      </div>
      <div className="flex flex-col gap-3">
        {ORDEM_GRUPOS_CFG.map((g) => {
          const cats = apoio.categorias
            .filter((c) => c.grupo === g && (natureza === 'todas' || c.natureza === natureza) && (!t || c.nome.toLowerCase().includes(t)))
            .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
          if (!cats.length) return null
          return (
            <div key={g}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1">{GRUPO_LABEL[g]}</div>
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEditar(c)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5"
                    style={{ borderColor: 'var(--rbr-border)', opacity: c.ativa ? 1 : 0.45 }}
                  >
                    {c.nome}
                    {c.natureza !== 'nao_se_aplica' && (
                      <span
                        className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={c.natureza === 'fixa' ? { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' } : { background: '#FBF1E1', color: '#8A5A00' }}
                      >
                        {NATUREZA_LABEL[c.natureza]}
                      </span>
                    )}
                    {c.tributavel && <span className="text-[9.5px] text-[color:var(--rbr-muted)]">trib.</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {editar && <CategoriaForm cat={editar} onFechar={() => setEditar(null)} onSalvo={onMudou} />}
    </Card>
  )
}

function CategoriaForm({ cat, onFechar, onSalvo }: { cat: Partial<Categoria>; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(cat.nome ?? '')
  const [tipo, setTipo] = useState(cat.tipo ?? 'despesa')
  const [grupo, setGrupo] = useState(cat.grupo ?? 'despesa_administrativa')
  const [natureza, setNatureza] = useState(cat.natureza ?? 'fixa')
  const [trib, setTrib] = useState(!!cat.tributavel)
  const [ativa, setAtiva] = useState(cat.ativa ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const foraDoResultado = tipo === 'receita' || ['investimento', 'retirada_socios', 'emprestimo'].includes(grupo)
  const naturezaFinal = foraDoResultado ? 'nao_se_aplica' : natureza === 'nao_se_aplica' ? 'fixa' : natureza
  async function salvar() {
    if (!nome.trim()) return setErro('Informe o nome.')
    const payload = cat.sistema
      ? { nome: nome.trim(), tributavel: trib, natureza: naturezaFinal }
      : { nome: nome.trim(), tipo, grupo, tributavel: trib, ativa, natureza: naturezaFinal }
    const { error } = cat.id
      ? await supabase.from('categorias_financeiras').update(payload).eq('id', cat.id)
      : await supabase.from('categorias_financeiras').insert({ nome: nome.trim(), tipo, grupo, tributavel: trib, ativa, natureza: naturezaFinal })
    if (error) return setErro(error.message)
    onSalvo()
    onFechar()
  }
  return (
    <Modal titulo={cat.id ? 'Editar categoria' : 'Nova categoria'} onFechar={onFechar}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="Nome" className="md:col-span-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Tipo">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass} style={inputStyle} disabled={!!cat.sistema}>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
        </Campo>
        <Campo label="Grupo no DRE" className="md:col-span-2">
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={inputClass} style={inputStyle} disabled={!!cat.sistema}>
            {Object.entries(GRUPO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
        {!foraDoResultado && (
          <Campo label="Fixa ou variável" className="md:col-span-3" dica="Variável = acompanha a quantidade de fretes. Fixa = você paga mesmo num mês sem nenhum frete.">
            <div className="flex gap-2">
              {(['fixa', 'variavel'] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNatureza(n)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full border"
                  style={{
                    borderColor: naturezaFinal === n ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                    background: naturezaFinal === n ? 'var(--rbr-navy)' : '#fff',
                    color: naturezaFinal === n ? '#fff' : 'var(--rbr-navy-dark)',
                  }}
                >
                  {NATUREZA_LABEL[n]}
                </button>
              ))}
            </div>
          </Campo>
        )}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={trib} onChange={(e) => setTrib(e.target.checked)} /> Tributável (entra no DAS)
        </label>
        {!cat.sistema && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /> Ativa
          </label>
        )}
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao onClick={salvar}>Salvar</Botao>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- parâmetros
function Parametros() {
  const [saldoMin, setSaldoMin] = useState('')
  const [aliq, setAliq] = useState('')
  const [prazoSaldo, setPrazoSaldo] = useState('')
  const [banco, setBanco] = useState<Record<string, string>>({ favorecido: '', pix: '', banco: '', agencia: '', conta: '' })
  const [ok, setOk] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([lerParametro<number>('saldo_minimo_alerta'), lerParametro<number>('aliquota_das_efetiva'), lerParametro<number>('saldo_motorista_prazo_dias'), lerParametro<Record<string, string>>('dados_bancarios_rbr')]).then(
      ([s, a, p, b]) => {
        setSaldoMin(valorParaInput(Number(s ?? 0)))
        setAliq(String(Math.round(Number(a ?? 0.06) * 10000) / 100).replace('.', ','))
        setPrazoSaldo(String(p ?? 0))
        if (b) setBanco((x) => ({ ...x, ...b }))
      },
    )
  }, [])
  async function salvar() {
    setErro(null)
    setOk(null)
    try {
      const s = parseValor(saldoMin || '0')
      const a = parseValor(aliq) / 100
      const p = Number(prazoSaldo)
      if (!Number.isFinite(s) || s < 0) throw new Error('Saldo mínimo inválido.')
      if (!Number.isFinite(a) || a < 0 || a > 0.3) throw new Error('Alíquota deve ficar entre 0% e 30%.')
      if (!Number.isInteger(p) || p < 0 || p > 120) throw new Error('Prazo do saldo: 0 a 120 dias.')
      await salvarParametro('saldo_minimo_alerta', s)
      await salvarParametro('aliquota_das_efetiva', a)
      await salvarParametro('saldo_motorista_prazo_dias', p)
      await salvarParametro('dados_bancarios_rbr', banco as unknown as Json)
      setOk('Parâmetros salvos. A nova alíquota vale para os próximos recálculos do DAS.')
    } catch (e) {
      setErro(erroMsg(e))
    }
  }
  return (
    <Card titulo="Parâmetros do financeiro">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Campo label="Saldo mínimo de segurança (R$)" dica="Abaixo disso, o painel avisa no fluxo de caixa.">
          <input inputMode="decimal" value={saldoMin} onChange={(e) => setSaldoMin(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Alíquota efetiva do Simples (%)" dica="Usada para estimar o DAS do mês. Confirme com o contador (varia com o faturamento de 12 meses).">
          <input inputMode="decimal" value={aliq} onChange={(e) => setAliq(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <Campo label="Saldo do motorista: dias após a entrega" dica="Padrão para operações novas; cada operação pode mudar.">
          <input inputMode="numeric" value={prazoSaldo} onChange={(e) => setPrazoSaldo(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-4 mb-2">Dados para o cliente pagar a RBR (saem na fatura e na cobrança)</div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {(
          [
            ['favorecido', 'Favorecido'],
            ['pix', 'Chave Pix'],
            ['banco', 'Banco'],
            ['agencia', 'Agência'],
            ['conta', 'Conta'],
          ] as const
        ).map(([k, l]) => (
          <Campo key={k} label={l}>
            <input value={banco[k] ?? ''} onChange={(e) => setBanco((b) => ({ ...b, [k]: e.target.value }))} className={inputClass} style={inputStyle} />
          </Campo>
        ))}
      </div>
      {ok && <div className="mt-3"><Aviso tipo="ok">{ok}</Aviso></div>}
      {erro && <div className="mt-3"><Aviso>{erro}</Aviso></div>}
      <div className="flex justify-end mt-3">
        <Botao onClick={salvar}>Salvar parâmetros</Botao>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- regras aprendidas
function Regras({ apoio }: { apoio: Apoio }) {
  const [lista, setLista] = useState<RegraCategorizacao[] | null>(null)
  const carregar = () =>
    supabase
      .from('regras_categorizacao')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setLista(data ?? []))
  useEffect(() => {
    carregar()
  }, [])
  async function apagar(id: string) {
    if (!window.confirm('Esquecer esta regra?')) return
    await supabase.from('regras_categorizacao').delete().eq('id', id)
    carregar()
  }
  return (
    <Card titulo="O que a IA aprendeu">
      <div className="text-[11px] text-[color:var(--rbr-muted)] mb-2">
        Cada vez que você confirma uma categoria marcando “lembrar”, o sistema guarda a regra. Na próxima nota desse CNPJ, ou no próximo extrato com esse texto, a
        categoria já vem certa — antes mesmo de chamar a IA.
      </div>
      {!lista ? null : lista.length === 0 ? (
        <Vazio>Nada aprendido ainda.</Vazio>
      ) : (
        <div className="flex flex-col gap-1.5">
          {lista.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-xs border rounded-lg px-3 py-2" style={{ borderColor: 'var(--rbr-border)' }}>
              <span className="flex-1">
                {r.campo === 'documento' ? 'CPF/CNPJ' : 'Extrato contém'} <b className="font-mono">{r.padrao}</b>
                {r.contraparte_nome ? ` (${r.contraparte_nome})` : ''} → {apoio.categorias.find((c) => c.id === r.categoria_id)?.nome ?? '—'}
                {r.fornecedor_id ? ` · ${nomeFornecedor(apoio.fornecedores.find((f) => f.id === r.fornecedor_id))}` : ''}
              </span>
              <button type="button" className="text-[11px] font-bold text-[color:var(--rbr-danger)]" onClick={() => apagar(r.id)}>
                Esquecer
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
