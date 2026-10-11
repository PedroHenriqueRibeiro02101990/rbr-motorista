import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { dbNovo } from '@rbr/shared/dbNovo'
import { formatMoney } from '@rbr/shared/format'
import { whatsappLink } from '../lib/financeiro'
import { Aviso, Botao, Campo, Card, Carregando, Modal, Vazio, inputClass, inputStyle } from '../components/financeiro/ui'
import { useConfirmacao } from '../components/Confirmacao'

// Tarefa 4: frete pago aos parceiros sem NFS-e, por mês. A falta de nota NUNCA bloqueia o pagamento.

type Pendencia = {
  parceiro_id: string
  parceiro_nome: string
  parceiro_cpf: string | null
  parceiro_cnpj: string | null
  parceiro_celular: string | null
  competencia: string
  operacoes: number
  frete_total: number
  operacao_ids: string[]
}
type FretePago = { operacao_id: string; frete: number; pago_em: string }
type OpInfo = { id: string; rota: string }
type NotaFeita = { id: string; numero: string; valor: number; competencia: string; data_emissao: string; parceiro_id: string; criado_em: string }

const mesAno = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const curto = (id: string) => `#${id.slice(0, 8)}`
const numero = (s: string) => {
  const v = Number(s.replace(/\./g, '').replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(v) ? null : v
}

export function textoCobranca(p: Pendencia, fretes: FretePago[], ops: Map<string, OpInfo>): string {
  const linhas = fretes.map((f) => `• ${curto(f.operacao_id)} ${ops.get(f.operacao_id)?.rota ?? ''} — frete ${formatMoney(f.frete)}`)
  return [
    `Olá, ${p.parceiro_nome.split(' ')[0]}! Aqui é da RBR Cargo.`,
    '',
    `Para fecharmos ${mesAno(p.competencia)}, precisamos da sua NFS-e de serviço de transporte referente aos fretes pagos no mês:`,
    '',
    ...linhas,
    '',
    `Valor total do frete: ${formatMoney(p.frete_total)} (sem pedágio/VPO).`,
    '',
    'Pode emitir uma nota só cobrindo todas as viagens e nos enviar por aqui. O pagamento não fica travado por isso, é só para a nossa contabilidade. Obrigado!',
  ].join('\n')
}

export default function NotasParceiros() {
  const [pend, setPend] = useState<Pendencia[] | null>(null)
  const [fretes, setFretes] = useState<Map<string, FretePago[]>>(new Map())
  const [ops, setOps] = useState<Map<string, OpInfo>>(new Map())
  const [notas, setNotas] = useState<NotaFeita[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [anexando, setAnexando] = useState<Pendencia | null>(null)
  const { confirmacao, mostrar } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [p, f, n] = await Promise.all([
      dbNovo.from('v_notas_parceiro_pendentes').select('*').order('competencia', { ascending: false }),
      dbNovo.from('v_frete_pago_parceiro').select('parceiro_id, operacao_id, frete, pago_em, competencia').eq('tem_nota', false),
      dbNovo.from('notas_parceiro').select('id, numero, valor, competencia, data_emissao, parceiro_id, criado_em').order('criado_em', { ascending: false }).limit(20),
    ])
    const e = p.error ?? f.error ?? n.error
    setErro(e ? e.message : null)
    const lista = (p.data ?? []) as Pendencia[]
    setPend(lista)
    setNotas((n.data ?? []) as NotaFeita[])
    const m = new Map<string, FretePago[]>()
    for (const r of (f.data ?? []) as (FretePago & { parceiro_id: string; competencia: string })[]) {
      const k = `${r.parceiro_id}|${r.competencia}`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    setFretes(m)
    const ids = lista.flatMap((x) => x.operacao_ids)
    if (ids.length) {
      const { data } = await supabase.from('operacoes').select('id, cotacoes(cidade_origem, uf_origem, cidade_destino, uf_destino)').in('id', ids)
      setOps(
        new Map(
          (data ?? []).map((o) => {
            const c = o.cotacoes
            return [o.id, { id: o.id, rota: c ? `${c.cidade_origem ?? '?'}/${c.uf_origem ?? '?'} → ${c.cidade_destino ?? '?'}/${c.uf_destino ?? '?'}` : '' }]
          }),
        ),
      )
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const total = useMemo(() => (pend ?? []).reduce((s, p) => s + Number(p.frete_total), 0), [pend])
  const nomePorParceiro = useMemo(() => new Map((pend ?? []).map((p) => [p.parceiro_id, p.parceiro_nome])), [pend])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Notas dos parceiros</h1>
        <div className="text-xs text-[color:var(--rbr-muted)] mt-1">
          Frete pago sem NFS-e de serviço, por parceiro e mês. A soma é só do frete (sem VPO). O pagamento nunca fica travado pela falta de nota.
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {confirmacao}

      <Card titulo="Notas pendentes" acao={pend && pend.length > 0 ? <span className="text-xs text-[color:var(--rbr-muted)]">{formatMoney(total)} sem nota</span> : undefined}>
        {pend === null ? (
          <Carregando />
        ) : pend.length === 0 ? (
          <div className="text-sm font-semibold text-[color:var(--rbr-positive)]">✓ Nenhum frete pago sem nota.</div>
        ) : (
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--rbr-border)' }}>
            {pend.map((p) => {
              const fs = fretes.get(`${p.parceiro_id}|${p.competencia}`) ?? []
              return (
                <div key={`${p.parceiro_id}|${p.competencia}`} className="py-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-bold">{p.parceiro_nome}</div>
                      <div className="text-xs text-[color:var(--rbr-muted)] capitalize">
                        {mesAno(p.competencia)} · {p.operacoes} operação(ões) · <b className="tabular-nums">{formatMoney(p.frete_total)}</b>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <a
                        href={whatsappLink(p.parceiro_celular, textoCobranca(p, fs, ops))}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold px-3 py-2 rounded-lg border"
                        style={{ borderColor: 'var(--rbr-positive)', color: 'var(--rbr-positive)' }}
                      >
                        Cobrar por WhatsApp
                      </a>
                      <Botao onClick={() => setAnexando(p)}>Anexar nota</Botao>
                    </div>
                  </div>
                  <ul className="text-xs text-[color:var(--rbr-muted)] flex flex-col gap-0.5">
                    {fs.map((f) => (
                      <li key={f.operacao_id}>
                        {curto(f.operacao_id)} {ops.get(f.operacao_id)?.rota} · frete <span className="tabular-nums">{formatMoney(f.frete)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card titulo="Últimas notas anexadas">
        {notas.length === 0 ? (
          <Vazio>Nenhuma nota anexada ainda.</Vazio>
        ) : (
          <ul className="text-xs flex flex-col gap-1">
            {notas.map((n) => (
              <li key={n.id} className="flex justify-between gap-2 flex-wrap">
                <span>
                  NFS-e {n.numero} · {nomePorParceiro.get(n.parceiro_id) ?? 'parceiro'} · <span className="capitalize">{mesAno(n.competencia)}</span>
                </span>
                <span className="tabular-nums font-semibold">{formatMoney(n.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {anexando && (
        <AnexarNota
          p={anexando}
          fretes={fretes.get(`${anexando.parceiro_id}|${anexando.competencia}`) ?? []}
          ops={ops}
          onFechar={() => setAnexando(null)}
          onFeito={(msg) => {
            setAnexando(null)
            mostrar('ok', msg)
            void carregar()
          }}
        />
      )}
    </div>
  )
}

function AnexarNota({
  p,
  fretes,
  ops,
  onFechar,
  onFeito,
}: {
  p: Pendencia
  fretes: FretePago[]
  ops: Map<string, OpInfo>
  onFechar: () => void
  onFeito: (msg: string) => void
}) {
  const [num, setNum] = useState('')
  const [valor, setValor] = useState(String(p.frete_total).replace('.', ','))
  const [data, setData] = useState(new Date().toLocaleDateString('sv-SE'))
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(fretes.map((f) => f.operacao_id)))
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const soma = fretes.filter((f) => marcadas.has(f.operacao_id)).reduce((s, f) => s + Number(f.frete), 0)
  const v = numero(valor)
  const diferenca = v != null ? Math.round((v - soma) * 100) / 100 : null

  return (
    <Modal titulo={`Anexar NFS-e · ${p.parceiro_nome}`} onFechar={ocupado ? () => {} : onFechar} largura="max-w-lg">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Número da nota">
            <input value={num} onChange={(e) => setNum(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
          <Campo label="Valor (R$)">
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={inputClass} style={inputStyle} />
          </Campo>
          <Campo label="Data de emissão">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} style={inputStyle} />
          </Campo>
          <Campo label="Arquivo (PDF ou XML)">
            <input type="file" accept="application/pdf,.xml,text/xml,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="text-xs" />
          </Campo>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Operações cobertas</div>
          {fretes.map((f) => (
            <label key={f.operacao_id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={marcadas.has(f.operacao_id)}
                onChange={(e) =>
                  setMarcadas((s) => {
                    const n = new Set(s)
                    if (e.target.checked) n.add(f.operacao_id)
                    else n.delete(f.operacao_id)
                    return n
                  })
                }
              />
              {curto(f.operacao_id)} {ops.get(f.operacao_id)?.rota} · {formatMoney(f.frete)}
            </label>
          ))}
        </div>
        {diferenca != null && diferenca !== 0 && (
          <Aviso tipo="atencao">
            O valor da nota ({formatMoney(v)}) não bate com a soma do frete ({formatMoney(soma)}): diferença de {formatMoney(diferenca)}. Pode anexar assim mesmo.
          </Aviso>
        )}
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao
            disabled={ocupado || marcadas.size === 0}
            onClick={() =>
              void rodar('', async () => {
                if (!num.trim()) throw new Error('Informe o número da nota.')
                if (v == null || v <= 0) throw new Error('Informe o valor da nota.')
                let path: string | null = null
                if (arquivo) {
                  const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
                  path = `${p.parceiro_id}/${p.competencia.slice(0, 7)}/nfse-${num.trim().replace(/[^\w-]/g, '')}-${Date.now()}.${ext}`
                  const { error } = await supabase.storage.from('notas-parceiros').upload(path, arquivo, { contentType: arquivo.type || undefined })
                  if (error) throw error
                }
                const { data: r, error } = await dbNovo.rpc('anexar_nota_parceiro', {
                  p_parceiro: p.parceiro_id,
                  p_competencia: p.competencia,
                  p_numero: num.trim(),
                  p_valor: v,
                  p_data_emissao: data,
                  p_arquivo_url: path,
                  p_operacoes: [...marcadas],
                })
                if (error) throw error
                const dif = Number((r as { diferenca?: number } | null)?.diferenca ?? 0)
                onFeito(`NFS-e ${num.trim()} anexada: ${marcadas.size} operação(ões) baixada(s).${dif !== 0 ? ` Diferença de ${formatMoney(dif)} registrada como aviso.` : ''}`)
              })
            }
          >
            {ocupado ? 'enviando…' : 'Anexar nota'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
