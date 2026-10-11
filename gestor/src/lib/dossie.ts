import { strToU8, zipSync, type Zippable } from 'fflate'
import { supabase } from '@rbr/shared/supabaseClient'
import { sha256Hex } from '@rbr/shared/contratoPdf'

// Tarefa 10.5: dossiê do incidente (ZIP no bucket privado "dossies") para entregar ao advogado e às autoridades
// quando houver ordem legal. Junta o que o sistema registrou: contratos aceitos com comprovação, declaração da carga,
// NF, documentos da operação (ordem de serviço, CT-e/MDF-e/CIOT...), trilha de rastreamento, eventos, fotos e aceites.

type Arquivos = Record<string, Uint8Array>
const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2))
const csv = (linhas: Record<string, unknown>[]) => {
  if (!linhas.length) return strToU8('')
  const cols = Object.keys(linhas[0])
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return strToU8([cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\n'))
}
const nomeArquivo = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(-80)

async function baixarStorage(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await supabase.storage.from(bucket).download(path)
  return data ? new Uint8Array(await data.arrayBuffer()) : null
}
async function baixarUrl(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url)
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
  } catch {
    return null
  }
}

export async function gerarDossie(incidenteId: string): Promise<{ path: string; hash: string; faltas: string[] }> {
  const faltas: string[] = []
  const arq: Arquivos = {}
  const { data: inc, error } = await supabase.from('incidentes_carga').select('*').eq('id', incidenteId).single()
  if (error || !inc) throw new Error('Incidente não encontrado.')
  const i = inc as { id: string; operacao_id: string; prestador_id: string | null; agenciador_id: string | null }
  const op = i.operacao_id

  const [operacao, nfes, docs, gps, fotos, eventos, declaracao, retencoes, aceites, contratosAg] = await Promise.all([
    supabase.from('operacoes').select('*, cotacoes(*), clientes(*)').eq('id', op).single(),
    supabase.from('operacao_nfes').select('*').eq('operacao_id', op),
    supabase.from('documentacao_operacao').select('*').eq('operacao_id', op),
    supabase.from('posicoes_gps').select('capturado_em, latitude, longitude, fonte, pessoa_id, veiculo_id').eq('operacao_id', op).order('capturado_em'),
    supabase.from('operacao_checklist_fotos').select('*').eq('operacao_id', op),
    supabase.from('auditoria_log').select('*').eq('entidade_id', op).order('created_at'),
    supabase.from('declaracoes_carga').select('*').eq('operacao_id', op),
    supabase.from('retencoes_apuracao').select('*, retencoes_eventos(*)').eq('incidente_id', incidenteId),
    supabase.from('aceites_termo').select('*, aceites_termo_pdf(pdf_path, hash_pdf)').in('pessoa_id', [i.prestador_id, i.agenciador_id].filter(Boolean) as string[]),
    i.agenciador_id ? supabase.from('contratos_agenciador').select('*').eq('agenciador_id', i.agenciador_id) : Promise.resolve({ data: [] }),
  ])

  arq['00-incidente.json'] = json(inc)
  arq['01-operacao-e-cotacao.json'] = json(operacao.data)
  arq['02-declaracao-da-carga.json'] = json(declaracao.data ?? [])
  for (const d of (declaracao.data ?? []) as { id: string; texto_declarado: string; hash_texto: string }[]) {
    arq[`02-declaracao-${d.id.slice(0, 8)}.txt`] = strToU8(`${d.texto_declarado}\n\nSHA-256: ${d.hash_texto}\n`)
  }
  arq['03-nf/notas.json'] = json(nfes.data ?? [])
  for (const n of (nfes.data ?? []) as { chave_acesso: string; xml_url: string | null }[]) {
    if (!n.xml_url) continue
    const b = /^https?:/.test(n.xml_url) ? await baixarUrl(n.xml_url) : await baixarStorage('operacao-documentos', n.xml_url)
    if (b) arq[`03-nf/${n.chave_acesso}.xml`] = b
    else faltas.push(`XML da NF ${n.chave_acesso}`)
  }
  arq['04-documentos-operacao/documentos.json'] = json(docs.data ?? [])
  for (const d of (docs.data ?? []) as { tipo: string; arquivo_path: string | null; url_pdf: string | null; url_xml: string | null }[]) {
    if (d.arquivo_path) {
      const b = await baixarStorage('operacao-documentos', d.arquivo_path)
      if (b) arq[`04-documentos-operacao/${d.tipo}-${nomeArquivo(d.arquivo_path)}`] = b
      else faltas.push(`arquivo do ${d.tipo}`)
    }
    for (const [u, ext] of [
      [d.url_pdf, 'pdf'],
      [d.url_xml, 'xml'],
    ] as const) {
      if (!u) continue
      const b = await baixarUrl(u)
      if (b) arq[`04-documentos-operacao/${d.tipo}.${ext}`] = b
      else faltas.push(`${d.tipo}.${ext} (link externo)`)
    }
  }
  arq['05-rastreamento/trilha.csv'] = csv((gps.data ?? []) as Record<string, unknown>[])
  arq['06-eventos/auditoria.json'] = json(eventos.data ?? [])
  arq['06-eventos/retencoes.json'] = json(retencoes.data ?? [])
  arq['07-fotos/fotos.json'] = json(fotos.data ?? [])
  for (const f of (fotos.data ?? []) as { etapa: string; foto_url: string; id: string }[]) {
    const b = /^https?:/.test(f.foto_url) ? await baixarUrl(f.foto_url) : await baixarStorage('operacao-fotos', f.foto_url)
    if (b) arq[`07-fotos/${f.etapa}-${f.id.slice(0, 8)}-${nomeArquivo(f.foto_url)}`] = b
    else faltas.push(`foto ${f.etapa}`)
  }
  arq['08-contratos/aceites.json'] = json(aceites.data ?? [])
  for (const a of (aceites.data ?? []) as { id: string; texto_aceito: string; hash_texto: string; aceites_termo_pdf: { pdf_path: string } | { pdf_path: string }[] | null }[]) {
    arq[`08-contratos/aceite-${a.id.slice(0, 8)}-texto.txt`] = strToU8(`${a.texto_aceito}\n\nSHA-256: ${a.hash_texto}\n`)
    const pdf = Array.isArray(a.aceites_termo_pdf) ? a.aceites_termo_pdf[0] : a.aceites_termo_pdf
    if (pdf?.pdf_path) {
      const b = await baixarStorage('contratos', pdf.pdf_path)
      if (b) arq[`08-contratos/aceite-${a.id.slice(0, 8)}.pdf`] = b
      else faltas.push('PDF do contrato aceito pelo prestador')
    }
  }
  arq['08-contratos/contrato-agenciador.json'] = json(contratosAg.data ?? [])
  for (const c of (contratosAg.data ?? []) as { id: string; arquivo_path: string; status: string }[]) {
    const b = await baixarStorage('contratos', c.arquivo_path)
    if (b) arq[`08-contratos/agenciador-${c.status}-${c.id.slice(0, 8)}.pdf`] = b
    else faltas.push('PDF do contrato do agenciador')
  }
  arq['LEIA-ME.txt'] = strToU8(
    [
      'Dossiê de incidente de carga - RBR Cargo',
      `Incidente: ${i.id}`,
      `Operação: ${op}`,
      `Gerado em: ${new Date().toISOString()}`,
      '',
      'Material para o advogado e para as autoridades, mediante ordem legal.',
      faltas.length ? `\nNão foi possível incluir: ${faltas.join('; ')}.` : '',
    ].join('\n'),
  )

  const zip = zipSync(arq as Zippable, { level: 6 })
  const blob = new Blob([zip], { type: 'application/zip' })
  const hash = await sha256Hex(blob)
  const path = `incidentes/${incidenteId}/dossie-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  const { error: eu } = await supabase.storage.from('dossies').upload(path, blob, { contentType: 'application/zip' })
  if (eu) throw eu
  const { error: er } = await supabase.rpc('registrar_dossie_incidente', { p_incidente: incidenteId, p_path: path, p_hash: hash })
  if (er) throw new Error(er.message)
  return { path, hash, faltas }
}

export async function abrirDossie(path: string) {
  const { data, error } = await supabase.storage.from('dossies').createSignedUrl(path, 600)
  if (error || !data) throw new Error('Não consegui abrir o dossiê.')
  window.open(data.signedUrl, '_blank', 'noopener')
}
