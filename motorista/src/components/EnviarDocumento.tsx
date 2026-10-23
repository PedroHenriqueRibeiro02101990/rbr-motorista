import { useRef, useState } from 'react'
import { IconCamera } from '@rbr/shared/icons'
import { enviarDocumentoPessoal, lerDocumentoRegistrado, type TipoDocPessoal } from '@rbr/shared/cadastro'

// Botão de envio de documento do motorista: tira/escolhe a foto, sobe convertida (JPEG até 1600 px), registra,
// pede a leitura automática e reavalia o cadastro. Erro aparece na tela com "Tentar de novo":
// - se a foto nem subiu, abre a câmera de novo;
// - se subiu mas a leitura falhou, relê a mesma foto (não sobe outra).
type Pendente = { tipo: TipoDocPessoal; path: string; documentoId: string }

export default function EnviarDocumento({
  tipo,
  rotulo,
  pessoaId,
  onEnviado,
}: {
  tipo: TipoDocPessoal
  rotulo: string
  pessoaId: string
  onEnviado?: (r: { lido: boolean }) => void | Promise<void>
}) {
  const input = useRef<HTMLInputElement | null>(null)
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'lendo' | 'ok'>('parado')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, setPendente] = useState<Pendente | null>(null)

  async function enviar(file: File) {
    setErro(null)
    setPendente(null)
    setEstado('enviando')
    const r = await enviarDocumentoPessoal({ tipo, arquivo: file, pessoaId, pastaPessoaId: pessoaId })
    if (r.erro) {
      setEstado('parado')
      setErro(r.erro)
      return
    }
    if (r.erroLeitura && r.documentoId) {
      setEstado('parado')
      setPendente({ tipo, path: r.path, documentoId: r.documentoId })
      setErro(`A foto chegou, mas a leitura automática falhou: ${r.erroLeitura}`)
      await onEnviado?.({ lido: false })
      return
    }
    setEstado('ok')
    await onEnviado?.({ lido: true })
  }

  async function tentarDeNovo() {
    if (!pendente) {
      setErro(null)
      input.current?.click()
      return
    }
    setErro(null)
    setEstado('lendo')
    const r = await lerDocumentoRegistrado(pendente)
    if (r.erroLeitura) {
      setEstado('parado')
      setErro(`A leitura automática falhou de novo: ${r.erroLeitura}`)
      return
    }
    setPendente(null)
    setEstado('ok')
    await onEnviado?.({ lido: true })
  }

  const ocupado = estado === 'enviando' || estado === 'lendo'
  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white cursor-pointer"
        style={{ background: 'var(--rbr-navy)', opacity: ocupado ? 0.6 : 1, minHeight: 48 }}
      >
        <IconCamera width={16} height={16} />
        {estado === 'enviando' ? 'Enviando a foto…' : estado === 'lendo' ? 'Lendo o documento…' : estado === 'ok' ? `${rotulo}: enviar outra foto` : rotulo}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={ocupado}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void enviar(file)
          }}
        />
      </label>
      {estado === 'ok' && <div className="text-xs font-semibold" style={{ color: 'var(--rbr-positive)' }}>Documento recebido e lido. A situação do cadastro foi atualizada.</div>}
      {erro && (
        <div role="alert" className="text-xs rounded-lg px-3 py-2 flex flex-col gap-2" style={{ background: '#FBE9E9', color: 'var(--rbr-danger)' }}>
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => void tentarDeNovo()}
            disabled={ocupado}
            className="self-start text-xs font-bold px-3 py-1.5 rounded-lg border bg-white disabled:opacity-60"
            style={{ borderColor: 'var(--rbr-danger)', color: 'var(--rbr-danger)' }}
          >
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  )
}
