import { supabase } from './supabaseClient'
import { dbNovo } from './dbNovo'
import { gerarPdfContrato, sha256Hex, type JsPDFCtor } from './contratoPdf'

// Tarefa 9: PDF do contrato aceito, com a assinatura eletrônica do prestador (nome, CPF/CNPJ, data/hora, IP), a
// assinatura eletrônica automática da RBR (em nome do representante configurado) e a página de comprovação.
// Guardado em contratos/prestador/<pessoa_id>/<aceite_id>.pdf (bucket privado) e registrado em aceites_termo_pdf.

type DadosPdf = {
  aceite_id: string
  pessoa_id: string
  titulo: string
  versao: number
  minuta: boolean
  texto: string
  hash: string
  aceito_em: string
  ip: string | null
  user_agent: string | null
  prestador_nome: string
  prestador_documento: string | null
  representante_rbr: string | null
  clausulas: { codigo: string; texto: string }[]
  pdf_path: string | null
}

export async function gerarESalvarPdfAceite(JsPDF: JsPDFCtor, aceiteId: string): Promise<string> {
  const { data, error } = await dbNovo.rpc('dados_pdf_aceite', { p_aceite: aceiteId })
  if (error) throw new Error(error.message)
  const d = data as DadosPdf
  if (d.pdf_path) return d.pdf_path
  const quando = new Date(d.aceito_em)
  const dataHora = `${quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília) / ${quando.toISOString().replace('T', ' ').slice(0, 19)} UTC`
  const blob = gerarPdfContrato(JsPDF, {
    titulo: d.titulo,
    versao: d.versao,
    minuta: d.minuta,
    texto: d.texto,
    geradoEm: quando,
    assinaturas: [
      {
        papel: 'Prestador',
        nome: d.prestador_nome,
        documento: d.prestador_documento,
        detalhe: `Aceite eletrônico em ${dataHora}, IP ${d.ip ?? 'não informado'}, marcando "Li e aceito" em cada cláusula.`,
      },
      {
        papel: 'RBR Cargo',
        nome: d.representante_rbr || 'representante legal (a configurar)',
        detalhe: `Assinatura eletrônica automática da RBR Cargo, registrada no mesmo momento do aceite (${dataHora}).`,
      },
    ],
    comprovacao: { hash: d.hash, versao: d.versao, aceito_em: d.aceito_em, ip: d.ip, aparelho: d.user_agent ?? 'não informado', clausulas: d.clausulas },
  })
  const path = `prestador/${d.pessoa_id}/${d.aceite_id}.pdf`
  const { error: eu } = await supabase.storage.from('contratos').upload(path, blob, { contentType: 'application/pdf', upsert: false })
  // Se o arquivo já subiu numa tentativa anterior, só falta registrar.
  if (eu && !/exist|duplicate/i.test(eu.message)) throw eu
  const { error: er } = await dbNovo.rpc('registrar_pdf_aceite', { p_aceite: d.aceite_id, p_path: path, p_hash: await sha256Hex(blob) })
  if (er) throw new Error(er.message)
  return path
}

export async function abrirPdfContrato(path: string) {
  const { data, error } = await supabase.storage.from('contratos').createSignedUrl(path, 600)
  if (error || !data) throw new Error('Não consegui abrir o PDF do contrato.')
  window.open(data.signedUrl, '_blank', 'noopener')
}
