import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import CampoMoeda from '../campos/CampoMoeda'
import { LinhaStatus, useStatusAcao } from '../StatusAcao'
import { Aviso } from '../financeiro/ui'
import { linhaConfirmacao } from '../../lib/statusAcao'
import { CATEGORIAS_VALIDAS, categoriaCombinacao, eixosDaCombinacao, normalizarCategoria, rotuloCategoriaPorEixos } from '../../../../supabase/functions/_shared/combinacaoVeicular.ts'
import { completarPadroes, etapaCiot, etapaVpo, IPEF_REPOM_CNPJ, separarCiot, validarLancamento, type FormularioManual, type LinhaCiotVpo } from '../../../../supabase/functions/_shared/lancamentoManual.ts'
import { caminhoArquivo, hashArquivo, montarEvento, planejarGravacao, REGRAS, validarArquivo, type CampoUpload, type DocExistente } from '../../../../supabase/functions/_shared/uploadsFiscais.ts'
import { normalizarExtracao, type Normalizado } from '../../../../supabase/functions/_shared/extracao-documentos.ts'
import { formatarMoeda } from '../../../../supabase/functions/_shared/unidades-br.ts'

// Cartao unico "Vale-pedagio e CIOT (lancamento manual)" da aba Fiscal (Parte B etapas 9 a 12b). So aparece com VITE_FISCAL_V3 e em operacao
// real manual. Tudo o que e mostrado vem do BANCO (operacao_ciot_vpo, documentacao_operacao): depois de cada acao a tela le de novo (G5).
type Linha = LinhaCiotVpo & { ciot_cnpj_responsavel?: string | null; vpo_cnpj_fornecedora?: string | null; ciot_emitido_em?: string | null; updated_at?: string | null }
interface DocLinha extends DocExistente { tipo: string; arquivo_enviado_em?: string | null; emitido_por?: string | null }
interface Dados { linha: Linha | null; docs: DocLinha[]; frete: number | null; adiantamento: number | null; placa: string | null; eixos: number | null; piso: number | null; outraOp: { ciot?: string; idvpo?: string } }
const COR = { alta: '#15803d', media: '#b45309', baixa: '#b91c1c' } as const

async function carregar(operacaoId: string): Promise<Dados> {
  const [l, d, c, o] = await Promise.all([
    supabase.from('operacao_ciot_vpo').select('*').eq('operacao_id', operacaoId).maybeSingle(),
    supabase.from('documentacao_operacao').select('*').eq('operacao_id', operacaoId).in('tipo', ['ciot', 'vpo']),
    supabase.from('condicoes_pagamento_operacao').select('valor_total_contrato, valor_adiantamento').eq('operacao_id', operacaoId).maybeSingle(),
    supabase.from('operacoes').select('veiculo_id, cotacao_id').eq('id', operacaoId).maybeSingle(),
  ])
  let placa: string | null = null
  let eixos: number | null = null
  let piso: number | null = null
  if (o.data?.veiculo_id) {
    const { data: v } = await supabase.from('veiculos').select('placa, quantidade_eixos').eq('id', o.data.veiculo_id).maybeSingle()
    placa = v?.placa ?? null
    const { data: rb } = await supabase.from('operacao_reboques').select('veiculo_id').eq('operacao_id', operacaoId)
    const ids = (rb ?? []).map((r) => r.veiculo_id)
    const { data: vs } = ids.length ? await supabase.from('veiculos').select('quantidade_eixos').in('id', ids) : { data: [] as { quantidade_eixos: number | null }[] }
    eixos = eixosDaCombinacao(v, vs ?? [])
  }
  if (o.data?.cotacao_id) {
    const { data: ct } = await supabase.from('cotacoes').select('piso_antt_calculado').eq('id', o.data.cotacao_id).maybeSingle()
    piso = ct?.piso_antt_calculado != null ? Number(ct.piso_antt_calculado) : null
  }
  return {
    linha: (l.data as Linha | null) ?? null, docs: (d.data ?? []) as unknown as DocLinha[],
    frete: c.data?.valor_total_contrato != null ? Number(c.data.valor_total_contrato) : null,
    adiantamento: c.data?.valor_adiantamento != null ? Number(c.data.valor_adiantamento) : null,
    placa, eixos, piso, outraOp: {},
  }
}

export default function CartaoFiscalManual({ operacaoId, quem, onMudou, secao = 'ambos' }: { operacaoId: string; quem?: string | null; onMudou?: () => void; secao?: 'vpo' | 'ciot' | 'ambos' }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [form, setForm] = useState<{ idvpo: string; vpo_valor: string; cnpj_forn: string; categoria: string; ciot: string; ver: string; frete: string; adiant: string; ipef: string; cnpjResp: string }>({ idvpo: '', vpo_valor: '', cnpj_forn: '', categoria: '', ciot: '', ver: '', frete: '', adiant: '', ipef: '', cnpjResp: '' })
  const [lido, setLido] = useState<{ campo: CampoUpload; norm: Normalizado; path: string } | null>(null)
  const [avisosLeitura, setAvisosLeitura] = useState<string[]>([])
  const stForm = useStatusAcao(quem)
  const stUp = useStatusAcao(quem)

  const recarregar = useCallback(async () => {
    try {
      const d = await carregar(operacaoId)
      setDados(d); setErroCarga(null)
      const l = d.linha
      setForm({
        idvpo: l?.vpo_idvpo ?? '', vpo_valor: l?.vpo_valor != null ? String(l.vpo_valor) : '', cnpj_forn: l?.vpo_cnpj_fornecedora ?? '', categoria: l?.vpo_categoria_combinacao ?? '',
        ciot: l?.ciot ?? '', ver: l?.ciot_verificador ?? '', frete: d.frete != null ? String(d.frete) : '', adiant: d.adiantamento != null ? String(d.adiantamento) : '',
        ipef: l?.pagto_cnpj_ipef ?? '', cnpjResp: l?.ciot_cnpj_responsavel ?? '',
      })
    } catch { setErroCarga('Nao consegui ler o estado gravado. Tente de novo.') }
  }, [operacaoId])
  useEffect(() => { void recarregar() }, [recarregar])

  const l = dados?.linha ?? null
  const vpo = etapaVpo(l, true)
  const ciot = etapaCiot(l)
  const numeros = useMemo<FormularioManual>(() => ({
    idvpo: form.idvpo || null, vpo_valor: form.vpo_valor ? Number(form.vpo_valor) : null, vpo_cnpj_fornecedora: form.cnpj_forn || null,
    categoria_combinacao: form.categoria || null, ciot: form.ciot || null, ciot_verificador: form.ver || null, valor_frete: form.frete ? Number(form.frete) : null,
    adiantamento: form.adiant ? Number(form.adiant) : null, saldo: form.frete && form.adiant ? Number(form.frete) - Number(form.adiant) : null,
    pagto_cnpj_ipef: form.ipef || null, ciot_cnpj_responsavel: form.cnpjResp || null, piso_antt: dados?.piso ?? null, origem_repom: true,
  }), [form, dados?.piso])
  const achados = validarLancamento(numeros)
  const bloqueado = achados.some((a) => a.nivel === 'bloqueio')

  async function gravar(f: FormularioManual, extra: Record<string, unknown> = {}) {
    const completo = completarPadroes(f, { eixos_combinacao: dados?.eixos ?? null })
    const sep = completo.ciot ? separarCiot(completo.ciot) : null
    const payload = {
      vpo_idvpo: completo.idvpo, vpo_valor: completo.vpo_valor, vpo_cnpj_fornecedora: completo.vpo_cnpj_fornecedora, vpo_categoria_combinacao: completo.categoria_combinacao,
      ciot: sep?.ciot ?? null, ciot_verificador: sep?.verificador || completo.ciot_verificador || null, ciot_origem: 'rbr_repom', ciot_cnpj_responsavel: completo.ciot_cnpj_responsavel,
      pagto_cnpj_ipef: completo.pagto_cnpj_ipef, valor_total_contrato: completo.valor_frete, valor_adiantamento: completo.adiantamento, ...extra,
    }
    const { error } = await (supabase as unknown as { rpc: (n: string, a: unknown) => Promise<{ error: { message: string } | null }> }).rpc('confirmar_ciot_vpo_manual', { p_operacao: operacaoId, p_dados: payload })
    if (error) throw new Error(error.message)
  }

  async function salvarForm() {
    await stForm.rodar({
      verbo: 'Lancado', enviando: 'Gravando...',
      acao: () => gravar(numeros),
      verificar: async () => { await recarregar(); return true },
    })
    onMudou?.()
  }

  async function aoEscolherArquivo(campo: CampoUpload, file: File) {
    const v = validarArquivo(campo, { nome: file.name, tamanho: file.size, mime: file.type })
    if (!v.ok) { await stUp.rodar({ verbo: '', acao: async () => { throw new Error(v.mensagem) } }); return }
    const regra = REGRAS[campo]
    await stUp.rodar({
      verbo: `${regra.rotulo} enviado e lido`, enviando: 'Enviando e lendo o arquivo...',
      acao: async () => {
        const bytes = await file.arrayBuffer()
        const hash = await hashArquivo(bytes)
        const existente = (dados?.docs ?? []).find((d) => d.tipo === regra.tipoDoc) ?? null
        const plano = planejarGravacao(existente, hash)
        if (plano.acao === 'duplicado') { setAvisosLeitura([plano.mensagem]); return null }
        const path = caminhoArquivo(campo, operacaoId, file.name)
        const up = await supabase.storage.from(regra.bucket).upload(path, file, { contentType: file.type || undefined })
        if (up.error) throw new Error('Nao consegui enviar o arquivo. Tente de novo.')
        const { data: u } = await supabase.auth.getUser()
        const linha = { operacao_id: operacaoId, tipo: regra.tipoDoc!, arquivo_path: path, arquivo_nome: file.name, arquivo_hash: hash, arquivo_enviado_em: new Date().toISOString(), origem_acao: 'manual', versao: plano.versao, arquivo_historico: plano.historico, status: 'emitido' as const }
        const gr = existente?.id
          ? await supabase.from('documentacao_operacao').update(linha as never).eq('id', existente.id)
          : await supabase.from('documentacao_operacao').insert(linha as never)
        if (gr.error) {
          await supabase.storage.from(regra.bucket).remove([path]) // falha no banco: desfaz o arquivo
          await supabase.from('eventos_fiscais_operacao').insert(montarEvento({ operacaoId, campo, evento: 'erro', atorId: null, sucesso: false, mensagem: 'Falha ao gravar o documento; arquivo desfeito.' }) as never)
          throw new Error('Nao consegui gravar o documento. O arquivo enviado foi desfeito.')
        }
        await supabase.from('eventos_fiscais_operacao').insert(montarEvento({ operacaoId, campo, evento: plano.acao === 'trocar' ? 'troca' : 'upload', atorId: null, sucesso: true, mensagem: `${regra.rotulo}: ${file.name}`, requisicao: { path, hash }, resposta: { ator: u.user?.id ?? null } }) as never)
        // Leitura pelo sistema (so CIOT e VPO). Se falhar, segue manual sem erro.
        if (campo === 'ciot_pdf' || campo === 'vpo_pdf') {
          const tipo = campo === 'ciot_pdf' ? 'contrato_ciot_repom' : 'vpr_vale_pedagio'
          const { data, error } = await supabase.functions.invoke('extrair-documento', { body: { modo: 'cadastro', bucket: regra.bucket, arquivos: [{ path, tipo }] } })
          const r = data?.resultados?.[0]
          if (error || !r?.normalizado) setAvisosLeitura(['Nao consegui ler o arquivo sozinho. Preencha os campos abaixo manualmente.'])
          else {
            const norm = normalizarExtracao(tipo, Object.fromEntries(Object.entries(r.normalizado.campos as Record<string, { valor: unknown; confianca: string; trecho?: string }>).map(([k, c]) => [k, { valor: c.valor, confianca: c.confianca, trecho: c.trecho }])), new Date().toISOString().slice(0, 10))
            setLido({ campo, norm: { ...norm, deducoes: r.normalizado.deducoes ?? norm.deducoes, avisos: r.normalizado.avisos ?? norm.avisos }, path })
            await supabase.from('eventos_fiscais_operacao').insert(montarEvento({ operacaoId, campo, evento: 'leitura', atorId: null, sucesso: true, mensagem: 'Documento lido pelo sistema' }) as never)
          }
        }
        return path
      },
      verificar: async () => { await recarregar(); return true },
    })
  }

  // Avisos ao confirmar a leitura (derivados do que foi lido x o que esta gravado)
  const conferenciaLeitura = useMemo(() => {
    if (!lido || !dados) return { bloqueios: [] as string[], avisos: [] as string[] }
    const c = lido.norm.campos
    const bloqueios: string[] = []; const avisos: string[] = [...lido.norm.avisos]
    const placaDoc = String(c.placa?.valor ?? '')
    if (placaDoc && dados.placa && placaDoc !== dados.placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()) bloqueios.push(`A placa do documento (${placaDoc}) e diferente da placa da operacao (${dados.placa}).`)
    const frete = typeof c.valor_frete?.valor === 'number' ? c.valor_frete.valor : null
    if (frete !== null && dados.frete !== null && Math.abs(frete - dados.frete) > 0.01) avisos.push(`Valor do frete do contrato (${formatarMoeda(frete)}) diferente do valor da operacao (${formatarMoeda(dados.frete)}). O valor do CIOT da Repom prevalece depois da confirmacao.`)
    if (frete !== null && dados.piso !== null && frete < dados.piso) avisos.push('Valor do frete abaixo do piso minimo ANTT.')
    return { bloqueios, avisos }
  }, [lido, dados])

  async function confirmarLeitura() {
    if (!lido) return
    const c = lido.norm.campos
    const ehCiot = lido.campo === 'ciot_pdf'
    const sep = ehCiot ? separarCiot(`${c.ciot?.valor ?? ''}${lido.norm.deducoes.ciot_verificador?.valor ?? ''}`) : null
    const f: FormularioManual = ehCiot
      ? { ciot: sep?.ciot ?? null, ciot_verificador: sep?.verificador ?? null, valor_frete: (c.valor_frete?.valor as number) ?? null, adiantamento: (c.adiantamento?.valor as number) ?? null, origem_repom: true }
      : { idvpo: (c.idvpo?.valor as string) ?? null, vpo_valor: (c.valor_total?.valor as number) ?? null }
    await stUp.rodar({
      verbo: 'Leitura confirmada e gravada', enviando: 'Gravando...',
      acao: async () => { await gravar({ ...numeros, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null)) } as FormularioManual) },
      verificar: async () => { await recarregar(); setLido(null); return true },
    })
    onMudou?.()
  }

  const docDe = (t: string) => dados?.docs.find((d) => d.tipo === t)
  const upBloco = (campo: CampoUpload, rotulo: string) => {
    const d = docDe(REGRAS[campo].tipoDoc!)
    return (
      <div className="flex flex-col gap-1 rounded border p-2" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="font-semibold text-xs">{rotulo}</div>
        {d?.arquivo_nome
          ? <div className="text-xs">{d.arquivo_nome} · {linhaConfirmacao('Enviado', d.arquivo_enviado_em, null)}{d.versao && d.versao > 1 ? ` · versao ${d.versao}` : ''}</div>
          : <div className="text-xs" style={{ color: 'var(--rbr-muted)' }}>Nenhum arquivo enviado.</div>}
        <label className="text-xs font-bold underline cursor-pointer self-start">
          {d?.arquivo_nome ? 'Trocar' : 'Subir'}
          <input type="file" className="hidden" accept={REGRAS[campo].extensoes.map((e) => `.${e}`).join(',')} disabled={stUp.enviando} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void aoEscolherArquivo(campo, f) }} />
        </label>
      </div>
    )
  }

  if (erroCarga) return <Aviso tipo="erro">{erroCarga} <button type="button" className="underline font-bold" onClick={() => void recarregar()}>Tentar de novo</button></Aviso>
  if (!dados) return <div className="text-xs">Carregando o estado gravado...</div>
  const campo = 'border rounded px-2 py-1 text-sm w-full'
  const estilo = { borderColor: 'var(--rbr-border)' }
  return (
    <section className="rounded-xl border bg-white p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }} aria-label="Vale-pedagio e CIOT (lancamento manual)">
      <header className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: '#eef0fa', color: '#1c2559' }}>Manual</span>
        <h3 className="font-extrabold text-sm">Vale-pedagio e CIOT (lancamento manual)</h3>
        <span className="text-xs">VPO: <b>{vpo.concluida ? 'lancado' : 'pendente'}</b> · CIOT: <b>{ciot.concluida ? 'lancado' : 'pendente'}</b></span>
      </header>
      <div className="text-xs" style={{ color: 'var(--rbr-muted)' }}>{vpo.texto} · {ciot.texto}{l?.ciot_emitido_em ? ` · ${linhaConfirmacao('Lancado', l.ciot_emitido_em, null)}` : ''}</div>

      <div className="grid gap-2 md:grid-cols-2">
        {secao !== 'ciot' && (
        <div className="flex flex-col gap-2">
          <div className="font-bold text-xs">Vale-pedagio</div>
          <label className="text-xs">IDVPO (20 digitos)<input className={campo} style={estilo} inputMode="numeric" value={form.idvpo} onChange={(e) => setForm({ ...form, idvpo: e.target.value.replace(/\D/g, '').slice(0, 20) })} /></label>
          <label className="text-xs">Valor do vale<CampoMoeda className={campo} style={estilo} value={form.vpo_valor} onChange={(e) => setForm({ ...form, vpo_valor: e.target.value })} /></label>
          <label className="text-xs">CNPJ da empresa fornecedora (padrao da Repom quando vazio)<input className={campo} style={estilo} inputMode="numeric" value={form.cnpj_forn} onChange={(e) => setForm({ ...form, cnpj_forn: e.target.value.replace(/\D/g, '').slice(0, 14) })} /></label>
          <label className="text-xs">Categoria de combinação veicular ({rotuloCategoriaPorEixos(dados.eixos)})
            <select className={campo} style={estilo} value={normalizarCategoria(form.categoria) ?? ''} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option value="">Automática pelos eixos{categoriaCombinacao(dados.eixos) ? ` (${categoriaCombinacao(dados.eixos)})` : ''}</option>
              {CATEGORIAS_VALIDAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {form.categoria && !normalizarCategoria(form.categoria) && <span className="text-xs" style={{ color: 'var(--rbr-danger)' }}>Valor inválido gravado antes ({form.categoria}): escolha da lista.</span>}
          </label>
        </div>
        )}
        {secao !== 'vpo' && (
        <div className="flex flex-col gap-2">
          <div className="font-bold text-xs">CIOT</div>
          <label className="text-xs">Número (12 dígitos; o verificador de 4 é opcional, a Repom o mascara com XXXX)
            <div className="flex gap-1"><input className={campo} style={estilo} inputMode="numeric" value={form.ciot} onChange={(e) => setForm({ ...form, ciot: e.target.value.replace(/\D/g, '').slice(0, 16) })} /><input className="border rounded px-2 py-1 text-sm w-24" style={estilo} inputMode="numeric" placeholder="opcional" value={form.ver} onChange={(e) => setForm({ ...form, ver: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></div></label>
          <label className="text-xs">Valor do frete<CampoMoeda className={campo} style={estilo} value={form.frete} onChange={(e) => setForm({ ...form, frete: e.target.value })} /></label>
          <label className="text-xs">Adiantamento<CampoMoeda className={campo} style={estilo} value={form.adiant} onChange={(e) => setForm({ ...form, adiant: e.target.value })} /></label>
          <div className="text-xs">Saldo: <b>{numeros.saldo != null ? formatarMoeda(numeros.saldo) : '-'}</b> · Destino do pagamento: IPEF da Repom ({IPEF_REPOM_CNPJ})</div>
        </div>
        )}
      </div>
      {achados.filter((a) => a.nivel !== 'ok').map((a) => <div key={a.campo + a.mensagem} className="text-xs" style={{ color: a.nivel === 'bloqueio' ? 'var(--rbr-danger)' : COR.media }}>{a.nivel === 'bloqueio' ? 'Corrija: ' : 'Aviso: '}{a.mensagem}</div>)}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" disabled={bloqueado || stForm.enviando} onClick={() => void salvarForm()} className="text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-50" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>Salvar lancamento</button>
        <LinhaStatus estado={stForm.estado} onTentarDeNovo={stForm.tentarDeNovo} rotuloCorrigir="Corrigir" />
      </div>

      <div className="grid gap-2 md:grid-cols-2">{secao !== 'vpo' && upBloco('ciot_pdf', 'Subir CIOT (contrato da Repom, PDF)')}{secao !== 'ciot' && upBloco('vpo_pdf', 'Subir VPO (VPR/recibo, PDF ou imagem)')}</div>
      <LinhaStatus estado={stUp.estado} onTentarDeNovo={stUp.tentarDeNovo} />
      {avisosLeitura.map((a) => <Aviso key={a} tipo="atencao">{a}</Aviso>)}

      {lido && (
        <div className="rounded border p-2 text-xs flex flex-col gap-1" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="font-bold">Conferencia da leitura ({lido.campo === 'ciot_pdf' ? 'contrato CIOT' : 'VPR'}) · nada e gravado sem o seu clique</div>
          {Object.entries(lido.norm.campos).filter(([, c]) => c.valor !== null).map(([k, c]) => (
            <div key={k} style={{ borderLeft: `3px solid ${COR[c.confianca]}`, paddingLeft: 6 }}>{k.replace(/_/g, ' ')}: <b>{typeof c.valor === 'number' && /valor|adiant|saldo/.test(k) ? formatarMoeda(c.valor) : String(c.valor)}</b>{c.observacao ? ` (${c.observacao})` : ''} <span style={{ color: COR[c.confianca] }}>[{c.confianca}]</span></div>
          ))}
          {conferenciaLeitura.bloqueios.map((b) => <div key={b} style={{ color: 'var(--rbr-danger)' }}>Corrija: {b}</div>)}
          {conferenciaLeitura.avisos.map((b) => <div key={b} style={{ color: COR.media }}>Aviso: {b}</div>)}
          <button type="button" disabled={conferenciaLeitura.bloqueios.length > 0 || stUp.enviando} onClick={() => void confirmarLeitura()} className="self-start text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: 'var(--rbr-navy)', color: '#fff' }}>Confirmar e gravar</button>
        </div>
      )}

      <details className="text-xs"><summary className="cursor-pointer font-semibold">Ver dados da operacao</summary>
        <div className="mt-1">Placa: {dados.placa ?? '-'} · Eixos da combinacao: {dados.eixos ?? '-'} · Frete gravado: {dados.frete != null ? formatarMoeda(dados.frete) : '-'}{dados.piso != null ? ` · Piso ANTT: ${formatarMoeda(dados.piso)}` : ''}</div>
      </details>
    </section>
  )
}
