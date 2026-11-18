import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatMoney } from '@rbr/shared/format'
import NfesCliente, { resumoNfes } from './NfesCliente'
import CartaoFiscalManual from './CartaoFiscalManual'
import SubirPdfManual from './SubirPdfManual'
import FinalizarViagem from './FinalizarViagem'
import DevolverOperacao from './DevolverOperacao'
import AvisoJanelaEmissao from './AvisoJanelaEmissao'
import { LinhaAverbacaoSompo } from './AverbacaoSompo'
import { DesfazerEPrazos, TrocaMotoristaVeiculo } from './EsteiraEmissao'
import { baixarArquivoFiscal } from './BaixarDocumentoFiscal'
import { Modal } from '../financeiro/ui'
import { carregarDadosFiscais, carregarPreVoo, type DadosFiscais } from '../../lib/fiscalV3Dados'
import { linhasConferenciaMdfe, modeloFiscal, type ChaveCartao, type EstadoFiscal } from '../../lib/fiscalV3Modelo'
import { etapaCiot, etapaVpo, IPEF_REPOM_CNPJ } from '../../../../supabase/functions/_shared/lancamentoManual.ts'
import { categoriaCombinacao } from '../../../../supabase/functions/_shared/combinacaoVeicular.ts'
import { faltaParaRepom, type ItemFalta } from '../../../../supabase/functions/_shared/repomPreVoo.ts'

// Aba Fiscal v3 IGUAL A PREVIA APROVADA (docs/design/preview-fiscal-completo-v3-2026-11-18.html): esteira de 4 cartoes clicaveis no topo e UMA visao por cartao
// (fita de etapas + painel da esquerda + painel Acoes). So desenho: emitir, cancelar, carta de correcao e trocar condutor chamam as MESMAS rotinas da tela
// (props). Estado e avisos vem do BANCO (G5). Atras de VITE_FISCAL_V3 (so operacao real manual; DEMO/teste ficam como estao).
const CSS = `
.fv3{--navy:#1E2761;--gold:#B8863B;--gold-t:#8F6A2A;--bg:#EEF0F6;--card:#fff;--line:#E1E4EE;--soft:#F4F5F9;--fg:#1B2140;--mut:#5A6180;--ok:#1F7A4D;--okbg:#E4F3EA;--warn:#8F6A2A;--warnbg:#F7EBD3;--bad:#A3281F;--badbg:#FBE4E1;color:var(--fg);font:14px/1.45 Inter,system-ui,sans-serif}
.fv3 *{box-sizing:border-box}
.fv3 .steps{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:6px 0 4px}
@media(max-width:760px){.fv3 .steps{grid-template-columns:1fr 1fr}}
.fv3 .step{border:1.5px solid var(--line);border-radius:12px;padding:10px 14px;background:#fff;color:var(--fg);text-align:left;font:inherit;cursor:pointer}
.fv3 .step b{display:block;font-size:14px}.fv3 .step span{font-size:12.5px;color:var(--mut)}.fv3 .step small{display:block;font-size:11.5px;color:var(--ok);font-weight:600;margin-top:1px}
.fv3 .step:hover{border-color:var(--navy)}.fv3 .step.sel{border:2px solid var(--navy);box-shadow:0 0 0 3px rgba(30,39,97,.08)}
.fv3 .step.done{background:var(--okbg);border-color:#9AD0B1}.fv3 .step.done span{color:var(--ok);font-weight:600}
.fv3 .step.next{animation:fv3p 1.6s ease-in-out infinite}
@keyframes fv3p{50%{box-shadow:0 0 0 5px rgba(184,134,59,.25)}}
@media(prefers-reduced-motion:reduce){.fv3 .step.next{animation:none;box-shadow:0 0 0 3px rgba(184,134,59,.35)}}
.fv3 .count{display:flex;justify-content:space-between;color:var(--mut);font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:6px 0 10px;gap:8px;flex-wrap:wrap}
.fv3 .head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:2px 0 10px;flex-wrap:wrap}
.fv3 .head h2{margin:0;font-size:18px}
.fv3 .tag{font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 9px;border-radius:99px;background:var(--okbg);color:var(--ok)}.fv3 .tag.w{background:var(--warnbg);color:var(--warn)}.fv3 .tag.g{background:var(--soft);color:var(--mut)}
.fv3 .flow{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.fv3 .flow i{font-style:normal;background:var(--soft);border-radius:99px;padding:3px 12px;font-size:12.5px;color:var(--mut)}.fv3 .flow i.on{background:var(--navy);color:#fff}
.fv3 .grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;align-items:stretch}
@media(max-width:900px){.fv3 .grid{grid-template-columns:1fr}}
.fv3 .panel{border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;background:#fff}
.fv3 .panel h3{margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-t)}
.fv3 table{width:100%;border-collapse:collapse}
.fv3 th{white-space:nowrap;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);text-align:left;padding:4px 8px 6px;font-weight:600}
.fv3 td{padding:7px 8px;border-top:1px solid var(--line);vertical-align:top}.fv3 td.o{white-space:nowrap;text-align:right}
.fv3 .et{font-size:11.5px;font-weight:600;padding:2px 10px;border-radius:99px;background:var(--soft);border:1px solid var(--line);color:var(--navy)}
.fv3 details{border-top:1px solid var(--line);padding-top:10px}.fv3 summary{cursor:pointer;font-weight:600;color:var(--navy)}
.fv3 .btn{font:inherit;font-weight:600;border-radius:9px;padding:9px 14px;border:1.5px solid var(--navy);background:#fff;color:var(--navy);cursor:pointer}
.fv3 .btn.p{background:var(--navy);color:#fff}.fv3 .btn:disabled{opacity:.4;cursor:not-allowed}.fv3 .btn.sm{padding:6px 10px;font-size:13px}.fv3 .btn.red{border-color:var(--bad);color:var(--bad)}
.fv3 .acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fv3 .acts .full{grid-column:1/-1}
.fv3 .res{background:var(--soft);border-radius:10px;padding:10px 12px;color:var(--mut)}.fv3 .res.okk{background:var(--okbg);color:var(--fg)}.fv3 .res.bad{background:var(--badbg);color:var(--bad)}.fv3 .res b{color:var(--ok)}
.fv3 .kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:13px;margin:0}.fv3 .kv dt{color:var(--mut)}.fv3 .kv dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.fv3 .chk{list-style:none;margin:0;padding:0;display:grid;gap:6px}.fv3 .chk li{display:flex;gap:8px;align-items:baseline}.fv3 .chk .y{color:var(--ok);font-weight:700}.fv3 .chk .a{color:var(--warn);font-weight:700}.fv3 .chk .x{color:var(--bad);font-weight:700}
.fv3 .lnk{color:var(--navy);font-weight:600;text-decoration:underline;font-size:12.5px;cursor:pointer;background:none;border:0;padding:0;font-family:inherit}
.fv3 .avb{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--okbg);border:1px solid #9AD0B1;border-radius:10px;padding:8px 12px;font-size:13px}
.fv3 .avb b{color:var(--ok)}.fv3 .avb small{color:var(--mut)}
.fv3 .foot{margin-top:auto;border-top:1px solid var(--line);padding-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fv3 .foot small{color:var(--mut)}
.fv3 .mini{border-top:1px dashed var(--line);padding-top:10px;display:grid;gap:6px}.fv3 .mini h4{margin:0;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.fv3 .drop{display:block;border:1.5px dashed #AEB5CF;border-radius:12px;padding:12px;text-align:center;color:var(--mut);background:var(--soft);cursor:pointer}.fv3 .drop:hover{border-color:var(--navy)}.fv3 .drop b{color:var(--navy)}.fv3 .drop input{display:none}
.fv3 .fl{margin-top:6px;font-size:12.5px;color:var(--ok);font-weight:600}.fv3 .fl:empty{display:none}
.fv3 .prazo{font-size:12px;color:var(--mut)}.fv3 .prazo b{color:var(--fg)}
.fv3 .view[hidden]{display:none}
`

const dh = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')
const reais = (n: number | null | undefined) => (n != null ? formatMoney(n) : '—')

type Linha = [string, ReactNode, string]
function Tabela({ cab, linhas }: { cab: [string, string, string]; linhas: Linha[] }) {
  return (
    <table>
      <thead><tr><th>{cab[0]}</th><th>{cab[1]}</th><th style={{ textAlign: 'right' }}>{cab[2]}</th></tr></thead>
      <tbody>{linhas.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td className="o"><span className="et">{c}</span></td></tr>)}</tbody>
    </table>
  )
}

export interface PropsFiscalV3 {
  operacaoId: string
  status: string
  entregueEm: string | null
  clienteNome: string | null
  valorTotal: number | null
  cidadeOrigem?: string | null; ufOrigem?: string | null; cidadeDestino?: string | null; ufDestino?: string | null
  rcv: { averbacao_rcv_status?: string | null; averbacao_rcv_numero?: string | null; averbacao_rcv_erro?: string | null; averbacao_rcv_em?: string | null } | null
  respostaAverba?: string
  ocupado: (chave: string) => boolean
  onEmitir: (tipo: 'cte' | 'mdfe') => void
  onCancelar: (tipo: 'cte' | 'mdfe', ambiente: string | null, chave: string | null) => void
  onCartaCorrecao: () => void
  onTrocarCondutor: () => void
  onAverbar: () => void
  onVerRespostaAverba: () => void
  onMudou: () => void
  onDevolvida: () => void
  quem?: string | null
}

export default function FiscalV3Painel(p: PropsFiscalV3) {
  const [dados, setDados] = useState<DadosFiscais | null>(null)
  const [preVoo, setPreVoo] = useState<EstadoFiscal['preVoo']>(null)
  const [repom, setRepom] = useState<ItemFalta[] | null>(null)
  const [erro, setErro] = useState(false)
  const [vista, setVista] = useState<ChaveCartao | null>(null)
  const [regras, setRegras] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      const d = await carregarDadosFiscais(p.operacaoId)
      setDados(d); setErro(false)
      void carregarPreVoo(p.operacaoId).then(setPreVoo)
      // pre-voo da Repom: usa a MESMA funcao de NCM do pre-voo do MDF-e (causa do erro B: um lia operacoes.ncm, o outro as NF-e)
      const { data: mot } = await supabase.from('pessoas').select('nome, cpf, cnh_numero_registro, data_nascimento, celular, cep, logradouro, rntrc_numero, genero, rg_numero, rg_orgao_emissor, rg_uf, numero_dependentes, optante_simples_nacional' as never).eq('id', (await supabase.from('operacoes').select('pessoa_alocada_id').eq('id', p.operacaoId).maybeSingle()).data?.pessoa_alocada_id ?? '').maybeSingle()
      const { data: o2 } = await supabase.from('operacoes').select('entrega_prevista, tipo_carga_antt' as never).eq('id', p.operacaoId).maybeSingle()
      const { data: cfg } = await supabase.from('repom_config' as never).select('valor').eq('chave', 'filial_codigo').maybeSingle()
      const mm = (mot ?? null) as unknown as Record<string, unknown> | null
      const oo = (o2 ?? {}) as unknown as { entrega_prevista?: string | null; tipo_carga_antt?: number | null }
      setRepom(mm ? faltaParaRepom({
        motorista: mm as never, prestador: { documento: mm.cpf as string, rntrc: mm.rntrc_numero as string, optante_simples_nacional: (mm.optante_simples_nacional as boolean | null) ?? null },
        veiculos: [...(d.placa ? [{ placa: d.placa, quantidade_eixos: d.eixos, e_reboque: false, tipo_veiculo: d.placaReboques.length ? 'cavalo' : 'truck' }] : []), ...d.placaReboques.map((pl) => ({ placa: pl, quantidade_eixos: 3, e_reboque: true, tipo_veiculo: 'semirreboque' }))],
        operacao: { tipo_carga_antt: oo.tipo_carga_antt ?? null, entrega_prevista: oo.entrega_prevista ?? null, ncm: d.ncm, filial_repom: (cfg as { valor?: string } | null)?.valor ?? null },
      }) : null)
    } catch { setErro(true) }
  }, [p.operacaoId])

  useEffect(() => {
    void recarregar()
    const canal = supabase.channel(`fiscal-v3-${p.operacaoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operacao_ciot_vpo', filter: `operacao_id=eq.${p.operacaoId}` }, () => void recarregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentacao_operacao', filter: `operacao_id=eq.${p.operacaoId}` }, () => void recarregar())
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [p.operacaoId, recarregar])

  const doc = (t: string) => dados?.docs.find((d) => d.tipo === t) ?? null
  const estado: EstadoFiscal = useMemo(() => ({
    cte: doc('cte'), atm: doc('atm'), mdfe: doc('mdfe'), rcv: p.rcv, ciotVpo: dados?.ciotVpo ?? null, preVoo,
  }), [dados, p.rcv, preVoo]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => modeloFiscal(estado), [estado])
  const sel: ChaveCartao = vista ?? m.inicial
  const mudou = () => { void recarregar(); p.onMudou() }

  if (erro) return <div className="text-xs">Nao consegui ler o estado fiscal. <button type="button" className="underline font-bold" onClick={() => void recarregar()}>Tentar de novo</button></div>
  if (!dados) return <div className="text-xs">Carregando a esteira fiscal...</div>

  const cte = doc('cte'), mdfe = doc('mdfe'), atm = doc('atm')
  const lv = dados.ciotVpo
  const vpo = etapaVpo(lv, true), ciot = etapaCiot(lv)
  const rota = `${p.cidadeOrigem ?? '?'}/${p.ufOrigem ?? '?'} → ${p.cidadeDestino ?? '?'}/${p.ufDestino ?? '?'}`
  const totalNfes = dados.nfes.reduce((s, n) => s + (Number(n.valor) || 0), 0)
  const cat = lv?.vpo_categoria_combinacao || categoriaCombinacao(dados.eixos)
  const baixar = async (tipo: 'cte' | 'mdfe', f: 'pdf' | 'xml', chave: string | null) => { const e = await baixarArquivoFiscal(p.operacaoId, tipo, chave, f); if (e) window.alert(e) }
  const baixarJson = () => {
    const blob = new Blob([JSON.stringify({ operacao: p.operacaoId, ciot_vpo: lv, documentos: dados.docs.map((d) => ({ tipo: d.tipo, status: d.status, numero: d.numero_documento })) }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fiscal-${p.operacaoId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000)
  }
  const existente = (t: string) => { const d = doc(t); return d ? { id: d.id, arquivo_path: d.arquivo_nome ? 'sim' : null, arquivo_nome: d.arquivo_nome, arquivo_enviado_em: d.arquivo_enviado_em, versao: d.versao } : null }

  const cartao = (c: (typeof m.cartoes)[number]) => (
    <button key={c.chave} type="button" role="tab" aria-selected={sel === c.chave} onClick={() => setVista(c.chave)} className={`step ${c.classe} ${sel === c.chave ? 'sel' : ''}`}>
      <b>{c.titulo}</b><span>{c.texto}</span>{c.averbado && <small>✓ averbado</small>}
    </button>
  )

  return (
    <div className="fv3">
      <style>{CSS}</style>
      <div className="steps" role="tablist" aria-label="Esteira fiscal">{m.cartoes.map(cartao)}</div>
      <div className="count"><span>Esteira fiscal · {dados.codigo} · {p.clienteNome ?? 'Cliente a confirmar'}{p.valorTotal != null ? ` · ${formatMoney(p.valorTotal)}` : ''}</span><span>{m.contador}</span></div>

      {/* ---------------- CT-e ---------------- */}
      <section className="view" hidden={sel !== 'cte'}>
        <div className="head"><h2>1. CT-e</h2><span className={`tag ${cte?.status === 'emitido' ? '' : 'w'}`}>{cte?.status === 'emitido' ? `${m.tagCte} · ${dh(cte.emitido_em)}` : m.tagCte}</span></div>
        <div className="flow"><i className="on">NF-e do cliente</i><i className={dados.nfes.length ? 'on' : ''}>Dados do sistema</i><i className={cte?.status === 'emitido' ? 'on' : ''}>Emissão</i><i className={m.cteAverbado ? 'on' : ''}>Averbação automática</i></div>
        <div className="grid">
          <div className="panel">
            <h3>NF-e do cliente</h3>
            <NfesCliente operacaoId={p.operacaoId} onMudou={mudou} />
            <div className="prazo"><b>{dados.nfes.length ? `${dados.nfes.length} nota(s) · ${formatMoney(totalNfes)}.` : 'Nenhuma nota ainda.'}</b> {dados.nfes.length ? 'A carga será faturada com CT-e e MDF-e.' : 'Suba o XML da NF-e do cliente: os dados vêm do XML, nunca digitados.'} <span style={{ display: 'none' }}>{resumoNfes(dados.nfes.length, totalNfes)}</span></div>
            <details><summary>Ver o que enviamos e de onde vem</summary>
              <Tabela cab={['Dado', 'Valor', 'Origem']} linhas={[
                ['Tomador', p.clienteNome ?? '—', 'Cotação'], ['Frete', reais(p.valorTotal), 'Cotação'], ['Origem e destino', rota, 'Cotação'],
                ['Carga, NCM e peso', `NCM ${dados.ncm ?? '—'} · peso da NF-e`, 'NF-e'], ['Motorista e veículo', dados.motoristaNome ? `${dados.motoristaNome} · ${dados.placa ?? ''}` : 'do cadastro aprovado', 'Cadastro'],
              ]} />
            </details>
          </div>
          <div className="panel">
            <h3>Ações</h3>
            <button className="btn p" type="button" style={{ width: '100%' }} disabled={!m.botoes.emitirCte || p.ocupado(`${p.operacaoId}:cte`)} onClick={() => p.onEmitir('cte')}>{p.ocupado(`${p.operacaoId}:cte`) ? 'Enviando…' : 'Emitir CT-e'}</button>
            {cte?.status === 'emitido' && <div className="res okk"><b>CT-e emitido.</b> Nº {cte.numero_documento} · {dh(cte.emitido_em)}</div>}
            {cte && (cte.status === 'erro' || cte.status === 'bloqueado') && cte.mensagem_erro && <div className="res bad">{cte.mensagem_erro}</div>}
            <div className="acts">
              <button className="btn sm" disabled={!m.botoes.baixarCte} onClick={() => void baixar('cte', 'pdf', cte?.chave_acesso ?? null)}>Baixar PDF</button>
              <button className="btn sm" disabled={!m.botoes.baixarXmlCte} onClick={() => void baixar('cte', 'xml', cte?.chave_acesso ?? null)}>Baixar XML</button>
              <button className="btn sm" disabled={!m.botoes.cartaCorrecao} onClick={p.onCartaCorrecao}>Carta de correção</button>
              <button className="btn sm red" disabled={!m.botoes.cancelarCte} onClick={() => p.onCancelar('cte', cte?.ambiente ?? null, cte?.chave_acesso ?? null)}>Cancelar CT-e</button>
            </div>
            <div className="prazo"><b>Prazo:</b> cancela até 7 dias, se não há MDF-e ativo. Depois: substituição ou complemento. Passou de 7 dias: só o gestor decide com a contabilidade.</div>
            <SubirPdfManual operacaoId={p.operacaoId} campo="cte_pdf" titulo="CT-e feito fora do sistema" ajuda="Suba o PDF do CT-e." existente={existente('cte')} aoGravar={mudou} quem={p.quem} />
            <h3>Averbação do CT-e</h3>
            {atm?.status === 'emitido'
              ? <div className="avb"><span><b>✓ Averbado automaticamente</b><br /><small>RCTR-C · NS Tech/Averba · {dh(atm.atualizado_em)}{atm.numero_documento ? ` · nº ${atm.numero_documento}` : ''}</small></span><button className="lnk" type="button" onClick={p.onVerRespostaAverba}>Ver resposta</button></div>
              : <div className={`res ${atm?.status === 'erro' ? 'bad' : ''}`}>{cte?.status === 'emitido' ? (atm ? `Averbação: ${atm.status}${atm.mensagem_erro ? ` · ${atm.mensagem_erro}` : ''}` : 'Averbação pendente.') : 'A averbação RCTR-C é automática e sai logo depois do CT-e.'}{cte?.status === 'emitido' && atm?.status !== 'emitido' && <> <button className="lnk" type="button" onClick={p.onAverbar} disabled={p.ocupado(`${p.operacaoId}:averbar`)}>{atm?.status === 'erro' ? 'Tentar averbar de novo' : 'Averbar CT-e'}</button></>}</div>}
            {p.respostaAverba !== undefined && p.respostaAverba !== '' && <pre className="res" style={{ fontSize: 10, overflowX: 'auto' }}>{p.respostaAverba}</pre>}
            <div className="prazo">Cancela junto com o CT-e. Se falhar ao cancelar, chamar o gestor. Cancelar ou trocar depois de averbado precisa de aviso à seguradora (cláusulas 23 e 24).</div>
          </div>
        </div>
      </section>

      {/* ---------------- Vale-pedagio ---------------- */}
      <section className="view" hidden={sel !== 'vpo'} style={{ marginTop: 10 }}>
        <div className="head"><h2>2. Vale-pedágio</h2><span className={`tag ${vpo.concluida ? '' : 'w'}`}>{vpo.concluida ? 'COMPRADO · LANÇADO MANUALMENTE' : 'A COMPRAR'}</span></div>
        <div className="flow"><i className="on">Dados do sistema</i><i className={vpo.concluida ? 'on' : ''}>Conferência</i><i className={vpo.concluida ? 'on' : ''}>Lançamento do vale</i><i className={vpo.concluida ? 'on' : ''}>Resposta gravada na operação</i></div>
        <div className="grid">
          <div className="panel">
            <h3>O que enviamos e de onde vem</h3>
            <Tabela cab={['Dado enviado', 'Valor nesta operação', 'De onde vem']} linhas={[
              ['Placa do cavalo', dados.placa ?? '—', 'Cadastro'], ['Eixos', dados.eixos ? `${dados.eixos} (cavalo + carretas)` : '—', 'Cadastro'], ['Origem e destino', rota, 'Cotação'],
              ['Categoria de combinação', cat ?? '—', 'Cadastro'], ['Número do vale (IDVPO)', lv?.vpo_idvpo ?? 'aparece depois do lançamento', 'Fiscal'], ['Valor do vale', lv?.vpo_valor != null ? reais(Number(lv.vpo_valor)) : 'aparece depois do lançamento', 'Fiscal'],
            ]} />
            <CartaoFiscalManual operacaoId={p.operacaoId} quem={p.quem} onMudou={mudou} secao="vpo" />
          </div>
          <div className="panel">
            <h3>Ações</h3>
            <div className="acts">
              <button className="btn" disabled title="Em breve: a compra pelo NSPEDÁGIO ainda não está ligada em operação real">Simular</button>
              <button className="btn" disabled title="Em breve">Consultar tag</button>
              <button className="btn p full" disabled title="Em breve: hoje o vale é lançado manualmente">Comprar vale-pedágio</button>
            </div>
            <div className="prazo">Em operação real, o vale é comprado fora do sistema e lançado ao lado (IDVPO, valor e PDF). Simular, consultar tag e comprar ficam como <b>Em breve</b>.</div>
            <h3>Resultado</h3>
            <div className={`res ${vpo.concluida ? 'okk' : ''}`}>{vpo.concluida ? <><b>Vale lançado.</b><dl className="kv" style={{ marginTop: 6 }}><dt>Nº do vale</dt><dd>{lv?.vpo_idvpo}</dd><dt>Valor</dt><dd>{reais(Number(lv?.vpo_valor))}</dd></dl></> : `Ainda sem lançamento. ${vpo.texto}.`}</div>
            <div className="acts"><button className="btn sm" disabled>Baixar recibo (PDF)</button><button className="btn sm" disabled>Reemitir recibo</button><button className="btn sm full" disabled>Cancelar vale</button></div>
            <SubirPdfManual operacaoId={p.operacaoId} campo="vpo_pdf" titulo="Vale-pedágio feito fora do sistema" ajuda="Suba o PDF do vale-pedágio." existente={existente('vpo')} aoGravar={mudou} quem={p.quem} />
            <div className="foot"><button className="btn sm" onClick={baixarJson}>Baixar JSON</button><button className="btn sm" onClick={() => window.print()}>Salvar em PDF</button><small>Registro de passos: nenhum ainda</small></div>
          </div>
        </div>
      </section>

      {/* ---------------- CIOT ---------------- */}
      <section className="view" hidden={sel !== 'ciot'} style={{ marginTop: 10 }}>
        <div className="head"><h2>3. CIOT</h2><span className={`tag ${ciot.concluida && !m.ciotHomologacao ? '' : 'w'}`}>{m.ciotHomologacao ? 'HOMOLOGAÇÃO - SEM VALIDADE FISCAL' : ciot.concluida ? 'EMITIDO' : 'A EMITIR'}</span></div>
        <div className="flow"><i className="on">Dados do sistema</i><i className={ciot.concluida ? 'on' : ''}>Conferência</i><i className={ciot.concluida ? 'on' : ''}>Lançamento do CIOT</i><i className={ciot.concluida ? 'on' : ''}>Resposta gravada na operação</i></div>
        <div className="grid">
          <div className="panel">
            <h3>O que enviamos e de onde vem</h3>
            <Tabela cab={['Dado enviado', 'Valor nesta operação', 'De onde vem']} linhas={[
              ['Contratante', 'RBR Cargo', 'Cadastro'], ['Motorista', dados.motoristaNome ?? '—', 'Cadastro'], ['Placas e eixos', [dados.placa, ...dados.placaReboques].filter(Boolean).join(' + ') + (dados.eixos ? ` (${dados.eixos} eixos)` : ''), 'Cadastro'],
              ['Origem, destino e distância', `${rota}${dados.distanciaKm ? ` · ${dados.distanciaKm} km` : ''}`, 'Rota'], ['Carga, NCM e peso', `NCM ${dados.ncm ?? '—'}${dados.pesoKg ? ` · ${dados.pesoKg.toLocaleString('pt-BR')} kg` : ''}`, 'Cotação'],
              ['Frete, adiantamento e saldo', dados.frete != null ? `${reais(dados.frete)} · ${reais(dados.adiantamento)} + ${reais(dados.frete - (dados.adiantamento ?? 0))}` : '—', 'Operação'],
              ['Destino do pagamento', lv?.ciot_origem === 'rbr_repom' ? `IPEF Repom · ${IPEF_REPOM_CNPJ}` : 'cadastro do motorista', 'Fiscal'], ['Piso mínimo da ANTT', dados.piso != null ? reais(dados.piso) : '—', 'Fiscal'],
              ['Pedágio', lv?.vpo_valor != null ? `${reais(Number(lv.vpo_valor))} (valor do vale lançado)` : 'sem vale lançado', lv?.vpo_valor != null ? 'Fiscal' : 'Cotação'],
            ]} />
            {repom && repom.length > 0 && (
              <details open><summary>Pré-voo da Repom · o que falta</summary>
                <ul className="chk" style={{ marginTop: 8 }}>{repom.map((i) => <li key={i.campo}><span className="a">!</span><span>{i.mensagem}</span></li>)}</ul>
              </details>
            )}
          </div>
          <div className="panel">
            <h3>Conferência antes de emitir</h3>
            <ul className="chk">
              <li>{cte?.status === 'emitido' ? <><span className="y">✓</span><span>CT-e: emitido (nº {cte.numero_documento})</span></> : <><span className="x">✗</span><span>CT-e ainda não emitido</span></>}</li>
              <li>{m.cteAverbado ? <><span className="y">✓</span><span>Averbação: pronta</span></> : <><span className="a">!</span><span>Averbação: aguardando</span></>}</li>
              <li>{dados.motoristaNome && dados.placa ? <><span className="y">✓</span><span>Dados conferidos (motorista e veículo)</span></> : <><span className="x">✗</span><span>Faltam dados do motorista ou do veículo</span></>}</li>
            </ul>
            <h3>Emitir</h3>
            <dl className="kv"><dt>Ambiente</dt><dd>{m.ciotHomologacao ? 'Homologação' : 'Produção'}</dd><dt>Caminhão</dt><dd>{dados.placa ?? '—'}</dd><dt>Frete</dt><dd>{reais(dados.frete)}</dd><dt>CIOT</dt><dd>{ciot.concluida ? ciot.texto.replace('CIOT ', '') : '—'}</dd></dl>
            <button className="btn p" disabled title="Em breve: o CIOT da Repom é lançado manualmente ao lado">Emitir CIOT</button>
            <div className={`res ${ciot.concluida && !m.ciotHomologacao ? 'okk' : ''}`}>{ciot.concluida ? <><b>{m.ciotHomologacao ? 'CIOT de homologação lançado (sem validade fiscal).' : 'CIOT lançado.'}</b> {ciot.texto}</> : `Ainda não emitido. ${ciot.texto}. O CIOT da Repom é emitido no portal e lançado aqui.`}</div>
            <div className="acts"><button className="btn sm" disabled>Baixar PDF</button><button className="btn sm" disabled>Consultar</button><button className="btn sm full" disabled>Cancelar CIOT</button></div>
            <CartaoFiscalManual operacaoId={p.operacaoId} quem={p.quem} onMudou={mudou} secao="ciot" />
            <SubirPdfManual operacaoId={p.operacaoId} campo="ciot_pdf" titulo="CIOT feito fora do sistema" ajuda="Suba o PDF do CIOT." existente={existente('ciot')} aoGravar={mudou} quem={p.quem} />
            <div className="foot"><button className="btn sm" onClick={baixarJson}>Baixar JSON</button><button className="btn sm" onClick={() => window.print()}>Salvar em PDF</button><small>Se a efrete estiver fora do ar, digite o CIOT à mão no bloco "CIOT" da operação.</small></div>
          </div>
        </div>
      </section>

      {/* ---------------- MDF-e ---------------- */}
      <section className="view" hidden={sel !== 'mdfe'} style={{ marginTop: 10 }}>
        <div className="head"><h2>4. MDF-e</h2><span className={`tag ${mdfe?.status === 'emitido' ? '' : m.tagMdfe === 'AGUARDANDO' ? 'g' : 'w'}`}>{mdfe?.status === 'emitido' ? `${m.tagMdfe} · ${dh(mdfe.emitido_em)}` : m.tagMdfe}</span></div>
        <div className="flow"><i className="on">Dados do sistema</i><i className="on">Conferência (pré-voo)</i><i className={mdfe?.status === 'emitido' ? 'on' : ''}>Emissão</i><i className={m.mdfeAverbado ? 'on' : ''}>Averbação automática</i></div>
        <div className="grid">
          <div className="panel">
            <h3>Conferência antes de emitir</h3>
            <ul className="chk">{linhasConferenciaMdfe(estado).map((l) => <li key={l.texto}><span className={l.sinal}>{l.sinal === 'y' ? '✓' : l.sinal === 'a' ? '!' : '✗'}</span><span>{l.texto}</span></li>)}</ul>
            <details><summary>Ver o que enviamos e de onde vem</summary>
              <Tabela cab={['Dado', 'Valor', 'Origem']} linhas={[
                ['Tração e reboque', [dados.placa, ...dados.placaReboques].filter(Boolean).join(' + ') || 'cavalo + carreta do cadastro', 'Cadastro'], ['Tara e capacidade (kg)', 'pelos três níveis, sem mexer no cadastro', 'Cadastro/CRLV'],
                ['Condutor', dados.motoristaNome ?? 'motorista da operação', 'Cadastro'], ['CIOT e vale-pedágio', 'lançados nesta operação', 'Fiscal'], ['CT-e', cte?.numero_documento ? `nº ${cte.numero_documento}` : '—', 'Fiscal'],
              ]} />
            </details>
          </div>
          <div className="panel">
            <h3>Ações</h3>
            <button className="btn p" type="button" style={{ width: '100%' }} disabled={!m.botoes.emitirMdfe || p.ocupado(`${p.operacaoId}:mdfe`)} onClick={() => p.onEmitir('mdfe')}>{p.ocupado(`${p.operacaoId}:mdfe`) ? 'Enviando…' : 'Emitir MDF-e'}</button>
            <div className={`res ${mdfe?.status === 'emitido' ? 'okk' : m.motivoMdfe ? 'bad' : ''}`}>{mdfe?.status === 'emitido' ? <><b>MDF-e emitido.</b> Nº {mdfe.numero_documento} · {dh(mdfe.emitido_em)}</> : m.motivoMdfe || 'Ainda não emitido. O protocolo é gravado antes de ler a resposta; clicar de novo não gera outro MDF-e.'}</div>
            {mdfe && (mdfe.status === 'erro' || mdfe.status === 'bloqueado') && mdfe.mensagem_erro && <div className="res bad">{mdfe.mensagem_erro}</div>}
            {mdfe?.status === 'emitido' && (
              <div>
                <div className="acts" style={{ marginTop: 8 }}>
                  <button className="btn sm" disabled={!m.botoes.baixarMdfe} onClick={() => void baixar('mdfe', 'pdf', mdfe.chave_acesso)}>Baixar PDF</button>
                  <button className="btn sm" disabled={!m.botoes.baixarXmlMdfe} onClick={() => void baixar('mdfe', 'xml', mdfe.chave_acesso)}>Baixar XML</button>
                  <button className="btn sm" disabled={!m.botoes.trocarCondutor || Boolean(mdfe.encerrado_em)} onClick={p.onTrocarCondutor}>Trocar condutor</button>
                  <button className="btn sm red" disabled={!m.botoes.cancelarMdfe || Boolean(mdfe.encerrado_em)} onClick={() => p.onCancelar('mdfe', mdfe.ambiente, mdfe.chave_acesso)}>Cancelar MDF-e</button>
                </div>
                <div className="prazo" style={{ marginTop: 8 }}><b>Prazo:</b> cancela até 24h, se a viagem não começou. Com viagem em curso: encerrar e emitir outro.</div>
              </div>
            )}
            <SubirPdfManual operacaoId={p.operacaoId} campo="mdfe_pdf" titulo="MDF-e feito fora do sistema" ajuda="Suba o PDF do MDF-e." existente={existente('mdfe')} aoGravar={mudou} quem={p.quem} />
            <h3>Averbação do MDF-e</h3>
            {m.mdfeAverbado
              ? <div className="avb"><span><b>✓ Averbado automaticamente</b><br /><small>RC-V (Sompo){p.rcv?.averbacao_rcv_em ? ` · ${dh(p.rcv.averbacao_rcv_em)}` : ''}{p.rcv?.averbacao_rcv_numero ? ` · nº ${p.rcv.averbacao_rcv_numero}` : ''}</small></span></div>
              : <div className="res">Aguardando o MDF-e. A averbação RC-V é feita automaticamente logo após a emissão.</div>}
            {mdfe?.status === 'emitido' && !m.mdfeAverbado && <LinhaAverbacaoSompo operacaoId={p.operacaoId} mdfe={mdfe as never} rcv={p.rcv as never} onMudou={mudou} />}
            <div className="prazo">A placa vai no MDF-e averbado (exigência do RC-V).</div>
            {mdfe?.status === 'emitido' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3>Finalizar viagem</h3>
                <FinalizarViagem operacaoId={p.operacaoId} statusOperacao={p.status as never} entregueEm={p.entregueEm} mdfe={mdfe as never} onAtualizado={mudou} />
                <div className="prazo">MDF-e nº {mdfe.numero_documento} · aguardando a entrega da carga. Eventos do MDF-e: veja o histórico em "Finalizar viagem".</div>
              </div>
            )}
            <div className="prazo"><button className="lnk" type="button" onClick={() => setRegras(true)}>Regras de troca de motorista e veículo</button></div>
          </div>
        </div>
      </section>

      {/* "Algo errado? Devolver esta operacao": fora do desenho; mantido exatamente como estava */}
      <div className="grid" style={{ marginTop: 14 }}>
        <div><AvisoJanelaEmissao operacaoId={p.operacaoId} /></div>
        <div className="panel">
          <h3>Algo errado?</h3>
          <div className="prazo">Devolva à Operação com o motivo, ou desfaça o que já foi emitido (cancelar fica no cartão de cada documento).</div>
          {p.status === 'aguardando_liberacao_fiscal' ? <DevolverOperacao operacaoId={p.operacaoId} onDevolvida={p.onDevolvida} /> : <div className="prazo">Devolver só aparece enquanto a operação aguarda a liberação fiscal.</div>}
        </div>
      </div>
      {regras && <Modal titulo="Regras de troca de motorista e veiculo" onFechar={() => setRegras(false)} largura="max-w-4xl"><div className="flex flex-col gap-3"><DesfazerEPrazos /><TrocaMotoristaVeiculo /></div></Modal>}
    </div>
  )
}
