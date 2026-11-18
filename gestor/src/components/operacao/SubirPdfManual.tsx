import { useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { caminhoArquivo, hashArquivo, montarEvento, planejarGravacao, REGRAS, validarArquivo, type CampoUpload, type DocExistente } from '../../../../supabase/functions/_shared/uploadsFiscais.ts'
import { linhaConfirmacao } from '../../lib/statusAcao'
import { mensagemClara } from '../../lib/mensagemClara'

// Campo "Subir PDF manual" da aba Fiscal v3 (CT-e, MDF-e, vale-pedagio e CIOT). Usa so o que a migracao 0200 ja criou
// (documentacao_operacao.arquivo_*, hash, versao, historico; eventos_fiscais_operacao). NAO muda o status do documento: so guarda o arquivo.
// Se o documento ainda nao existe, cria a linha como "pendente" (so passa a contar como emitido quando houver numero e chave).
export default function SubirPdfManual({ operacaoId, campo, titulo, ajuda, existente, aoGravar, quem }: {
  operacaoId: string; campo: CampoUpload; titulo: string; ajuda: string; existente: (DocExistente & { id?: string; arquivo_nome?: string | null; arquivo_enviado_em?: string | null }) | null; aoGravar: () => void; quem?: string | null
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const regra = REGRAS[campo]

  async function enviar(file: File) {
    const v = validarArquivo(campo, { nome: file.name, tamanho: file.size, mime: file.type })
    if (!v.ok) return setMsg({ ok: false, texto: v.mensagem ?? 'Arquivo recusado.' })
    if (ocupado) return
    setOcupado(true); setMsg(null)
    try {
      const hash = await hashArquivo(await file.arrayBuffer())
      const plano = planejarGravacao(existente, hash)
      if (plano.acao === 'duplicado') return setMsg({ ok: false, texto: plano.mensagem })
      const path = caminhoArquivo(campo, operacaoId, file.name)
      const up = await supabase.storage.from(regra.bucket).upload(path, file, { contentType: file.type || undefined })
      if (up.error) throw new Error('Nao consegui enviar o arquivo. Tente de novo.')
      const { data: u } = await supabase.auth.getUser()
      const dados = { arquivo_path: path, arquivo_nome: file.name, arquivo_hash: hash, arquivo_enviado_em: new Date().toISOString(), origem_acao: 'manual', versao: plano.versao, arquivo_historico: plano.historico }
      const gr = existente?.id
        ? await supabase.from('documentacao_operacao').update(dados as never).eq('id', existente.id)
        : await supabase.from('documentacao_operacao').insert({ ...dados, operacao_id: operacaoId, tipo: regra.tipoDoc!, status: 'pendente' } as never)
      if (gr.error) {
        await supabase.storage.from(regra.bucket).remove([path])
        await supabase.from('eventos_fiscais_operacao').insert(montarEvento({ operacaoId, campo, evento: 'erro', atorId: u.user?.id ?? null, sucesso: false, mensagem: 'Falha ao gravar o documento; arquivo desfeito.' }) as never)
        throw new Error('Nao consegui gravar o documento. O arquivo enviado foi desfeito.')
      }
      await supabase.from('eventos_fiscais_operacao').insert(montarEvento({ operacaoId, campo, evento: plano.acao === 'trocar' ? 'troca' : 'upload', atorId: u.user?.id ?? null, sucesso: true, mensagem: `${regra.rotulo}: ${file.name}`, requisicao: { path, hash } }) as never)
      setMsg({ ok: true, texto: `${file.name} · ${linhaConfirmacao('Enviado', new Date(), quem)}` })
      aoGravar()
    } catch (e) {
      setMsg({ ok: false, texto: mensagemClara(e) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="mini">
      <h4>{titulo}</h4>
      <label className="drop">
        <input type="file" accept={regra.extensoes.map((x) => `.${x}`).join(',')} disabled={ocupado} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void enviar(f) }} />
        <b>Subir PDF manual</b><br /><small>{ajuda}</small>
        {existente?.arquivo_nome && !msg && <div className="fl">✓ {existente.arquivo_nome}{existente.arquivo_enviado_em ? ` · ${linhaConfirmacao('Enviado', existente.arquivo_enviado_em, null)}` : ''}</div>}
        {msg && <div className="fl" style={msg.ok ? undefined : { color: 'var(--bad)' }}>{msg.ok ? '✓ ' : '✗ '}{msg.texto}</div>}
      </label>
    </div>
  )
}
