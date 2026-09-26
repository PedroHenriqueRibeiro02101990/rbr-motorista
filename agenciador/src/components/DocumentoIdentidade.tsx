import { useState } from 'react'
import type { Database } from '@rbr/shared/database.types'
import { enviarDocumentoPessoal, type TipoDocPessoal } from '@rbr/shared/cadastro'
import { formatarDoc } from '@rbr/shared/documento'

type Pessoa = Database['public']['Tables']['pessoas']['Row']

// Agenciador: documento de identidade (PF: CNH ou RG; PJ: Cartão CNPJ). A foto é lida e conferida automaticamente.
export default function DocumentoIdentidade({ pessoa, onEnviado }: { pessoa: Pessoa; onEnviado: () => Promise<void> | void }) {
  const ehPJ = pessoa.tipo_pessoa_doc === 'PJ'
  const [tipo, setTipo] = useState<TipoDocPessoal>(ehPJ ? 'cartao_cnpj' : 'cnh')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null)

  async function enviar(file: File) {
    setEnviando(true)
    setMsg(null)
    const r = await enviarDocumentoPessoal({ tipo, arquivo: file, pessoaId: pessoa.id, pastaPessoaId: pessoa.id })
    setEnviando(false)
    if (r.erro) return setMsg({ erro: true, texto: r.erro })
    await onEnviado()
    setMsg({
      erro: false,
      texto: r.campos ? 'Documento recebido e conferido. Veja a situação do cadastro no topo.' : 'Documento recebido. A RBR confere manualmente.',
    })
  }

  return (
    <section
      className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3"
      style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
    >
      <div className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">Documento</div>
      <div className="text-xs text-[color:var(--rbr-muted)]">
        {ehPJ ? 'CNPJ' : 'CPF'}: <b className="text-[color:var(--rbr-navy-dark)]">{formatarDoc(ehPJ ? pessoa.cnpj : pessoa.cpf)}</b> — não pode ser alterado.
      </div>
      {!ehPJ && (
        <div className="flex gap-2">
          {(['cnh', 'rg'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className="border rounded-lg px-3 py-1.5 text-xs font-bold"
              style={{
                borderColor: tipo === t ? 'var(--rbr-navy)' : 'var(--rbr-border)',
                background: tipo === t ? 'var(--rbr-muted-bg)' : '#fff',
                color: 'var(--rbr-navy-dark)',
              }}
            >
              {t === 'cnh' ? 'CNH' : 'RG'}
            </button>
          ))}
        </div>
      )}
      <div className="text-xs text-[color:var(--rbr-muted)]">
        {ehPJ
          ? 'Envie o Cartão CNPJ (comprovante de inscrição do site da Receita Federal) — foto ou PDF.'
          : 'Envie uma foto nítida do documento inteiro, sem reflexo. Pode ser a versão digital aberta no celular.'}
      </div>
      <label
        className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-semibold cursor-pointer"
        style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', opacity: enviando ? 0.6 : 1 }}
      >
        {enviando ? 'Enviando e conferindo…' : 'Enviar documento'}
        <input
          type="file"
          accept={ehPJ ? 'image/*,application/pdf' : 'image/*'}
          className="hidden"
          disabled={enviando}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) enviar(f)
          }}
        />
      </label>
      {msg && (
        <div
          className="text-xs rounded-xl px-3 py-2"
          style={{ background: msg.erro ? '#FBE9E9' : 'var(--rbr-warning-bg)', color: msg.erro ? 'var(--rbr-danger)' : 'var(--rbr-navy-dark)' }}
        >
          {msg.texto}
        </div>
      )}
    </section>
  )
}
