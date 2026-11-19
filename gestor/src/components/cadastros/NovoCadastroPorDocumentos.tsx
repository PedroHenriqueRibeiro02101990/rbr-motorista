import { useMemo, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Modal, Botao, Aviso } from '../financeiro/ui'
import { LinhaStatus, useStatusAcao } from '../StatusAcao'
import { rodarComLimite } from '../../../../supabase/functions/_shared/geminiResiliente.ts'
import CampoPeso from '../campos/CampoPeso'
import { estadoDaLeitura, ROTULO_ESTADO, textoResumoVazio, type EstadoLeitura, type ResultadoLeitura, achadosDoPayload, montarPayload, REPOM_CADASTRO_HABILITADO, resumoDoQueSeraCriado, temBloqueio, type DocumentoLido } from '../../lib/cadastroPorDocumentos'
import { conferenciaCruzada, TIPOS_DOCUMENTO, type Normalizado } from '../../../../supabase/functions/_shared/extracao-documentos.ts'
import { montarCorpoMotoristaRepom, montarCorpoVeiculoRepom, preChecagemRepom } from '../../../../supabase/functions/_shared/repomCadastro.ts'
import { formatarKg } from '../../../../supabase/functions/_shared/unidades-br.ts'

// Novo cadastro por documentos (Parte A, etapa 4). Atras da flag VITE_CADASTRO_POR_DOCUMENTOS (padrao desligada).
// Fluxo: soltar varios arquivos -> o sistema classifica e le -> conferencia (documento ao lado, cor por confianca) -> Confirmar (RPC unica).
const BUCKET = 'cadastro-documentos'
const ROTULO_TIPO: Record<string, string> = {
  crlv: 'CRLV', cnh: 'CNH', rg: 'RG', cpf: 'CPF', rntrc: 'RNTRC/ANTT', comprovante_residencia: 'Comprovante de residencia',
  dados_bancarios: 'Dados bancarios', contrato_ciot_repom: 'Contrato CIOT Repom', vpr_vale_pedagio: 'VPR vale-pedagio', outro: 'Outro (nao reconhecido)',
}
const COR_CONFIANCA = { alta: '#15803d', media: '#b45309', baixa: '#b91c1c' } as const
const CAMPOS_PESO = new Set(['tara', 'capacidade_carga', 'pbt', 'cmt'])

interface Item { nome: string; path: string; tipo: string; normalizado: Normalizado | null; edicoes: Record<string, string | number | null>; erro?: string; url?: string; estado: EstadoLeitura }
const limpa = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)

export default function NovoCadastroPorDocumentos({ onFechar, quem, aoConcluir, onPreencherManual }: { onFechar: () => void; quem?: string | null; aoConcluir?: () => void; onPreencherManual?: () => void }) {
  const [itens, setItens] = useState<Item[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const st = useStatusAcao(quem)
  const lote = useRef(`lote-${Date.now()}`)
  const hoje = new Date().toISOString().slice(0, 10)

  const docs: DocumentoLido[] = itens.map((i) => ({ path: i.path, tipo: i.tipo, normalizado: i.normalizado, edicoes: i.edicoes }))
  const payload = useMemo(() => montarPayload(docs), [itens]) // eslint-disable-line react-hooks/exhaustive-deps
  const achados = useMemo(() => achadosDoPayload(payload, hoje), [payload, hoje])
  // Preparo da Repom (so leitura; nenhuma chamada): o que falta no cadastro para a Repom aceitar
  const faltaRepom = useMemo(() => {
    const m = payload.motorista as Record<string, string | null> | undefined
    const out: string[] = []
    if (m) out.push(...montarCorpoMotoristaRepom({ nome: m.nome, cpf: m.cpf, cnh_numero_registro: m.cnh_numero_registro, data_nascimento: m.data_nascimento, cep: m.cep, logradouro: m.logradouro, numero_endereco: m.numero_endereco, bairro: m.bairro }).faltando.map((f) => `motorista: ${f}`))
    for (const [rot, v, reb] of [['cavalo', payload.cavalo, false], ['carreta', payload.carreta, true]] as const) {
      if (!v) continue
      out.push(...montarCorpoVeiculoRepom({ placa: v.placa as string, quantidade_eixos: v.quantidade_eixos as number, e_reboque: reb }, { documento: v.proprietario_documento as string }).faltando.map((f) => `${rot}: ${f}`))
    }
    out.push(...preChecagemRepom({ motoristaCadastradoNaRepom: false, veiculoNoPrestador: false, eCavalo: !!payload.cavalo, temImplemento: !!payload.carreta }).map((p) => p.mensagem))
    return out
  }, [payload])
  const cruzada = useMemo(() => conferenciaCruzada(itens.map((i) => i.normalizado).filter(Boolean) as Normalizado[]), [itens])
  const bloqueado = temBloqueio(achados) || (!payload.motorista && !payload.cavalo && !payload.carreta)

  const setItem = (path: string, mudar: Partial<Item>) => setItens((l) => l.map((o) => (o.path === path ? { ...o, ...mudar } : o)))

  // UM arquivo por chamada: cada documento tem o proprio estado e os outros nao esperam por ele.
  async function lerUm(path: string, tipo?: string) {
    setItem(path, { estado: 'lendo', erro: undefined })
    try {
      const { data, error } = await supabase.functions.invoke('extrair-documento', { body: { modo: 'cadastro', bucket: BUCKET, arquivos: [{ path, tipo }] } })
      const x = (data as { resultados?: ResultadoLeitura[] } | null)?.resultados?.[0]
      const e = estadoDaLeitura(x, Boolean(error) || !data)
      setItem(path, { estado: e.estado, tipo: x?.tipo ?? tipo ?? 'outro', normalizado: (x?.normalizado as Normalizado | null) ?? null, erro: e.mensagem })
    } catch {
      setItem(path, { estado: 'falhou_ia', erro: estadoDaLeitura(null, true).mensagem })
    }
  }

  async function aoSoltar(files: FileList | File[]) {
    const lista = Array.from(files)
    if (!lista.length) return
    setAviso(null)
    const paraLer: string[] = []
    for (const f of lista) {
      if (!/\.(pdf|png|jpe?g)$/i.test(f.name) || f.size === 0 || f.size > 10 * 1024 * 1024) { setItens((a) => [...a, { nome: f.name, path: '', tipo: 'outro', normalizado: null, edicoes: {}, erro: 'Use PDF, PNG ou JPG com ate 10 MB.', estado: 'erro_arquivo' }]); continue }
      const path = `${lote.current}/${Date.now()}-${limpa(f.name)}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined })
      if (error) { setItens((a) => [...a, { nome: f.name, path, tipo: 'outro', normalizado: null, edicoes: {}, erro: 'Nao consegui enviar o arquivo. Tente de novo.', estado: 'erro_arquivo' }]); continue }
      const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
      setItens((a) => [...a, { nome: f.name, path, tipo: 'outro', normalizado: null, edicoes: {}, url: url?.signedUrl, estado: 'lendo' }])
      paraLer.push(path)
    }
    // no maximo 2 chamadas ao mesmo tempo (limite por minuto do Gemini)
    await rodarComLimite(paraLer.map((path) => () => lerUm(path)), 2)
  }

  async function trocarTipo(idx: number, tipo: string) {
    const it = itens[idx]
    if (!it.path) return
    await lerUm(it.path, tipo)
  }

  function editar(idx: number, campo: string, valor: string | number | null) {
    setItens((l) => l.map((o, i) => (i === idx ? { ...o, edicoes: { ...o.edicoes, [campo]: valor } } : o)))
  }

  async function confirmar() {
    let avisoComplemento: string | null = null
    const gravado = await st.rodar({
      verbo: 'Cadastro lancado', enviando: 'Gravando o cadastro...',
      acao: async () => {
        const { data, error } = await (supabase as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc('confirmar_cadastro_por_documentos', { p_payload: payload })
        if (error) throw new Error(error.message)
        // Complemento (RG e genero confirmados) para a Repom: tolerante a funcao ainda nao aplicada (nao derruba o cadastro).
        if (payload.complemento && payload.motorista?.cpf) {
          try {
            const { error: ec } = await (supabase as unknown as { rpc: (n: string, a: unknown) => Promise<{ error: { message: string } | null }> }).rpc('complementar_motorista_por_documentos', { p_cpf: payload.motorista.cpf, p_dados: payload.complemento })
            if (ec) avisoComplemento = ec.message
          } catch (e) {
            avisoComplemento = e instanceof Error ? e.message : String(e)
          }
        }
        return data as { motorista_id?: string; cavalo_id?: string; carreta_id?: string }
      },
      // so mostra ok depois de reler o que foi gravado
      verificar: async (r) => {
        const ids = [r.cavalo_id, r.carreta_id].filter(Boolean) as string[]
        if (ids.length) {
          const { data } = await supabase.from('veiculos').select('id').in('id', ids)
          if ((data?.length ?? 0) !== ids.length) return false
        }
        if (r.motorista_id) {
          const { data } = await supabase.from('pessoas').select('id').eq('id', r.motorista_id).maybeSingle()
          if (!data) return false
        }
        return true
      },
    })
    // So fecha/recarrega se gravou de verdade; se falhou, a tela continua com o erro e o 'Tentar de novo'.
    if (!gravado) return
    if (avisoComplemento) setAviso(`Cadastro gravado, mas RG e genero (usados no cadastro da Repom) nao foram gravados: ${avisoComplemento}`)
    aoConcluir?.()
  }

  const atual = itens[sel]
  return (
    <Modal titulo="Novo cadastro por documentos" onFechar={onFechar} largura="max-w-6xl" fecharNoFundo={false}>
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void aoSoltar(e.dataTransfer.files) }}
          className="border-2 border-dashed rounded-lg p-4 text-center text-sm"
          style={{ borderColor: 'var(--rbr-border)' }}
        >
          Solte aqui o CRLV do cavalo, o CRLV da carreta, a CNH, o RNTRC, o comprovante de residencia e os dados bancarios.
          <div className="mt-2">
            <label className="underline cursor-pointer font-semibold">
              ou escolha os arquivos
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*" className="hidden" onChange={(e) => { if (e.target.files) void aoSoltar(e.target.files); e.target.value = '' }} />
            </label>
          </div>
        </div>
        <LinhaStatus estado={st.estado} onTentarDeNovo={st.tentarDeNovo} />
        {aviso && <Aviso tipo="atencao">{aviso}</Aviso>}
        {cruzada.map((m) => <Aviso key={m} tipo="atencao">{m}</Aviso>)}

        {itens.length > 0 && (
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <ul className="flex flex-col gap-1">
              {itens.map((i, idx) => (
                <li key={i.path || i.nome}>
                  <button type="button" onClick={() => setSel(idx)} className="w-full text-left rounded px-2 py-1.5 text-xs" style={{ background: idx === sel ? 'var(--rbr-surface-2, #eef2f7)' : 'transparent', border: '1px solid var(--rbr-border)' }}>
                    <div className="font-semibold truncate">{i.nome}</div>
                    <div>{i.estado === 'lido' ? (ROTULO_TIPO[i.tipo] ?? i.tipo) : ROTULO_ESTADO[i.estado]}</div>
                  </button>
                </li>
              ))}
            </ul>
            {atual && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border overflow-hidden" style={{ borderColor: 'var(--rbr-border)', minHeight: 240 }}>
                  {atual.url ? (/\.pdf$/i.test(atual.nome) ? <iframe title={atual.nome} src={atual.url} className="w-full" style={{ height: 420 }} /> : <img src={atual.url} alt={atual.nome} className="w-full" />) : <div className="p-3 text-xs">Sem previa.</div>}
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <label className="flex items-center gap-2">Tipo do documento
                    <select value={atual.tipo} onChange={(e) => void trocarTipo(sel, e.target.value)} className="border rounded px-1.5 py-1" style={{ borderColor: 'var(--rbr-border)' }}>
                      {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </select>
                  </label>
                  {atual.estado === 'falhou_ia' && (
                    <div role="alert" className="rounded border p-2 flex flex-col gap-1" style={{ borderColor: COR_CONFIANCA.media }}>
                      <div className="font-semibold">A leitura automatica esta ocupada.</div>
                      <div className="flex gap-3 items-center">
                        <Botao onClick={() => void lerUm(atual.path, atual.tipo === 'outro' ? undefined : atual.tipo)}>Tentar de novo</Botao>
                        <button type="button" className="underline font-semibold" onClick={onPreencherManual ?? onFechar}>Preencher manualmente</button>
                      </div>
                    </div>
                  )}
                  {atual.estado === 'lendo' && <div style={{ color: 'var(--rbr-muted)' }}>Lendo o documento...</div>}
                  {atual.erro && atual.estado !== 'falhou_ia' && <Aviso tipo="atencao">{atual.erro}</Aviso>}
                  {atual.normalizado?.avisos.map((a) => <Aviso key={a} tipo="atencao">{a}</Aviso>)}
                  {atual.normalizado && Object.entries(atual.normalizado.campos).map(([k, c]) => {
                    const editado = k in atual.edicoes
                    const vazioOuBaixo = c.valor === null || c.confianca === 'baixa'
                    return (
                      <div key={k} className="flex flex-col gap-0.5" style={{ borderLeft: `3px solid ${COR_CONFIANCA[c.confianca]}`, paddingLeft: 6 }}>
                        <span className="font-semibold">{k.replace(/_/g, ' ')}{vazioOuBaixo && !editado ? ' (confira: obrigatorio)' : ''}</span>
                        {CAMPOS_PESO.has(k) ? (
                          <CampoPeso rotulo={k === 'tara' ? 'Tara' : 'Peso'} value={editado ? (atual.edicoes[k] as number | null) : (c.valor as number | null)} onChange={(e) => editar(sel, k, e.target.value === '' ? null : Number(e.target.value))} className="border rounded px-1.5 py-1" style={{ borderColor: 'var(--rbr-border)' }} />
                        ) : (
                          <input value={String(editado ? (atual.edicoes[k] ?? '') : (c.valor ?? ''))} onChange={(e) => editar(sel, k, e.target.value)} className="border rounded px-1.5 py-1" style={{ borderColor: 'var(--rbr-border)' }} />
                        )}
                        {c.observacao && <span style={{ color: COR_CONFIANCA.media }}>{c.observacao}</span>}
                        {c.valor === null && c.motivo_nulo && <span style={{ color: 'var(--rbr-muted)' }}>{c.motivo_nulo}</span>}
                        {k === 'tara' && atual.tipo === 'crlv' && atual.normalizado?.deducoes.tara_derivada_crlv && (
                          <label className="flex items-center gap-1" style={{ color: COR_CONFIANCA.media }}>
                            <input type="checkbox" checked={atual.edicoes.tara_derivada === 1} onChange={(e) => editar(sel, 'tara_derivada', e.target.checked ? 1 : 0)} />
                            Usar tara derivada do CRLV: {formatarKg(Number(atual.normalizado.deducoes.tara_derivada_crlv.valor))} (PBT menos capacidade)
                          </label>
                        )}
                      </div>
                    )
                  })}
                  {atual.normalizado && Object.entries(atual.normalizado.deducoes).filter(([k]) => k === 'genero' || k === 'idade').map(([k, d]) => (
                    <div key={k} style={{ color: 'var(--rbr-muted)' }}>Sugestao ({d.origem}, confianca {d.confianca}): {k} = {String(d.valor)} (nada e gravado sem sua confirmacao)</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded border p-2 text-xs flex flex-col gap-1" style={{ borderColor: 'var(--rbr-border)' }}>
          <div className="font-semibold">Vai criar: {payload.motorista || payload.cavalo || payload.carreta ? resumoDoQueSeraCriado(payload) : textoResumoVazio(itens.map((i) => i.estado))}</div>
          {achados.map((a, i) => <div key={i} style={{ color: a.nivel === 'bloqueio' ? 'var(--rbr-danger)' : COR_CONFIANCA.media }}>{a.nivel === 'bloqueio' ? 'Corrija: ' : 'Aviso: '}{a.mensagem}</div>)}
        </div>
        {REPOM_CADASTRO_HABILITADO && faltaRepom.length > 0 && (
          <div className="rounded border p-2 text-xs" style={{ borderColor: 'var(--rbr-border)' }}>
            <div className="font-semibold">Para cadastrar na Repom ainda falta:</div>
            {faltaRepom.map((f) => <div key={f}>- {f}</div>)}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {REPOM_CADASTRO_HABILITADO && <Botao variante="secundario" disabled title="Desligado: o envio para a Repom so entra depois da liberacao">Cadastrar na Repom</Botao>}
          <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>
          <Botao onClick={() => void confirmar()} disabled={bloqueado || st.enviando}>Confirmar cadastro</Botao>
        </div>
      </div>
    </Modal>
  )
}
