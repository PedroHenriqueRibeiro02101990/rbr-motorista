import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import type { Database } from '@rbr/shared/database.types'
import { initials, formatDate } from '@rbr/shared/format'
import { IconLogOut } from '@rbr/shared/icons'

type Pessoa = Database['public']['Tables']['pessoas']['Row']
type Vinculo = Database['public']['Tables']['vinculos_agenciador_motorista']['Row']

type VinculoComNome = Vinculo & { motoristaNome?: string }

const VINCULO_LABEL: Record<string, string> = {
  reivindicado: 'Reivindicado',
  confirmado: 'Confirmado',
  rejeitado: 'Rejeitado',
}
const VINCULO_STYLE: Record<string, { bg: string; color: string }> = {
  reivindicado: { bg: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' },
  confirmado: { bg: 'var(--rbr-positive)', color: '#FFFFFF' },
  rejeitado: { bg: '#FCE8E8', color: 'var(--rbr-danger)' },
}

const inputCls = 'border rounded-xl px-3 py-2.5 text-sm'
const labelCls = 'flex flex-col gap-1 text-xs font-semibold text-[color:var(--rbr-muted)]'

type LinhaCsv = { nome: string; email: string; celular: string; cpf: string }
type ResultadoImportacao = {
  linha: number
  nome: string
  email: string
  sucesso: boolean
  mensagem: string
  pessoa_id?: string
  link_definir_senha?: string
}

// Parser de CSV simples (sem suporte a vírgula dentro de campo entre aspas —
// suficiente pro caso de uso: nome, e-mail, celular, cpf numa planilha
// exportada do Excel/Sheets). Detecta o delimitador (vírgula ou ponto e
// vírgula, comum em planilhas em pt-BR) pela linha de cabeçalho.
function parseCsv(texto: string): LinhaCsv[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (linhas.length === 0) return []

  const delimitador = (linhas[0].match(/;/g)?.length ?? 0) > (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const cabecalho = linhas[0].split(delimitador).map((c) => c.trim().toLowerCase().replace(/[^a-z]/g, ''))

  const acha = (opcoes: string[]) => cabecalho.findIndex((c) => opcoes.includes(c))
  // Lista ampla de variações — a ideia é aceitar a planilha de controle que
  // o agenciador já tem, não só o nosso modelo, e pegar só o que importa.
  const idxNome = acha(['nome', 'name', 'nomemotorista', 'nomedomotorista', 'nomecompleto', 'motorista'])
  const idxEmail = acha(['email', 'emailmotorista', 'emaildomotorista', 'endereodeemail'])
  const idxCelular = acha([
    'celular',
    'telefone',
    'fone',
    'whatsapp',
    'contato',
    'numero',
    'celulardomotorista',
    'telefonedomotorista',
    'tel',
  ])
  const idxCpf = acha(['cpf', 'documento', 'cpfcnpj'])

  // Se não achou uma coluna "nome" nem "email" no cabeçalho, assume que não
  // tem cabeçalho e usa a ordem fixa nome, email, celular, cpf.
  const temCabecalho = idxNome !== -1 || idxEmail !== -1
  const linhasDados = temCabecalho ? linhas.slice(1) : linhas

  return linhasDados.map((linha) => {
    const campos = linha.split(delimitador).map((c) => c.trim())
    if (temCabecalho) {
      return {
        nome: idxNome !== -1 ? (campos[idxNome] ?? '') : '',
        email: idxEmail !== -1 ? (campos[idxEmail] ?? '') : '',
        celular: idxCelular !== -1 ? (campos[idxCelular] ?? '') : '',
        cpf: idxCpf !== -1 ? (campos[idxCpf] ?? '') : '',
      }
    }
    return { nome: campos[0] ?? '', email: campos[1] ?? '', celular: campos[2] ?? '', cpf: campos[3] ?? '' }
  })
}

// Modelo de planilha pra baixar — o agenciador também pode subir a planilha
// de controle que ele já usa (o parser acima reconhece várias variações de
// nome de coluna), mas o modelo garante que ele sabe exatamente o que é
// obrigatório sem precisar adivinhar.
function baixarModeloCsv() {
  const conteudo =
    'nome,email,cpf,celular\n' +
    'João da Silva,joao.dasilva@example.com,12345678900,11999998888\n' +
    'Maria Souza,maria.souza@example.com,98765432100,\n'
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'modelo-importacao-motoristas-rbr.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function Perfil({ pessoa, onSignOut }: { pessoa: Pessoa; onSignOut: () => void }) {
  const [form, setForm] = useState({
    nome: pessoa.nome ?? '',
    email: pessoa.email ?? '',
    celular: pessoa.celular ?? '',
    pix: pessoa.pix ?? '',
    cep: pessoa.cep ?? '',
    logradouro: pessoa.logradouro ?? '',
    numero_endereco: pessoa.numero_endereco ?? '',
    complemento: pessoa.complemento ?? '',
    bairro: pessoa.bairro ?? '',
    cidade: pessoa.cidade ?? '',
    uf: pessoa.uf ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [vinculos, setVinculos] = useState<VinculoComNome[]>([])
  const [loadingVinculos, setLoadingVinculos] = useState(true)

  const [importAberto, setImportAberto] = useState(false)
  const [importArquivoNome, setImportArquivoNome] = useState<string | null>(null)
  const [importLinhas, setImportLinhas] = useState<LinhaCsv[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importErro, setImportErro] = useState<string | null>(null)
  const [importResultados, setImportResultados] = useState<ResultadoImportacao[] | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  const loadVinculos = useCallback(async () => {
    setLoadingVinculos(true)
    const { data, error: err } = await supabase
      .from('vinculos_agenciador_motorista')
      .select('*, pessoas!vinculos_agenciador_motorista_motorista_id_fkey(nome)')
      .eq('agenciador_id', pessoa.id)
      .order('created_at', { ascending: false })
    if (!err) {
      setVinculos((data ?? []).map((v: any) => ({ ...v, motoristaNome: v.pessoas?.nome })))
    }
    setLoadingVinculos(false)
  }, [pessoa.id])

  useEffect(() => {
    loadVinculos()
  }, [loadVinculos])

  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportErro(null)
    setImportResultados(null)
    setImportArquivoNome(file.name)
    try {
      const texto = await file.text()
      const linhas = parseCsv(texto).filter((l) => l.nome || l.email)
      if (linhas.length === 0) {
        setImportErro('Não encontrei nenhuma linha com nome ou e-mail nesse arquivo.')
        setImportLinhas([])
        return
      }
      setImportLinhas(linhas)
    } catch {
      setImportErro('Não consegui ler esse arquivo. Confirma que é um .csv de texto.')
      setImportLinhas([])
    }
  }

  async function handleImportar() {
    setImportLoading(true)
    setImportErro(null)
    const { data, error: err } = await supabase.functions.invoke('importar-motoristas-csv', {
      body: { linhas: importLinhas },
    })
    setImportLoading(false)
    if (err) {
      setImportErro(err.message ?? 'Erro ao importar.')
      return
    }
    if (!data?.sucesso) {
      setImportErro(data?.erro ?? 'Erro ao importar.')
      return
    }
    setImportResultados(data.resultados as ResultadoImportacao[])
    loadVinculos()
  }

  function fecharImportacao() {
    setImportAberto(false)
    setImportArquivoNome(null)
    setImportLinhas([])
    setImportErro(null)
    setImportResultados(null)
    if (importFileRef.current) importFileRef.current.value = ''
  }

  async function copiarLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // silencioso — o link continua visível na tela pra copiar manualmente
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    const { error: err } = await supabase
      .from('pessoas')
      .update({
        nome: form.nome,
        email: form.email || null,
        celular: form.celular || null,
        pix: form.pix || null,
        cep: form.cep || null,
        logradouro: form.logradouro || null,
        numero_endereco: form.numero_endereco || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
      })
      .eq('id', pessoa.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setSaved(true)
  }

  return (
    <div className="px-5 pt-8 md:px-0 md:pt-0 flex flex-col gap-3.5 md:gap-6 pb-4">
      <div className="flex items-center gap-3.5">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
        >
          {initials(pessoa.nome)}
        </div>
        <div>
          <h1 className="rbr-display font-bold text-xl md:text-2xl text-[color:var(--rbr-navy-dark)]">{pessoa.nome}</h1>
          <div className="text-xs text-[color:var(--rbr-muted)]">Agenciador parceiro RBR</div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded-[20px] p-[18px] flex flex-col gap-3"
        style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
      >
        <div className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">Meus dados</div>

        <div className="grid md:grid-cols-2 gap-3">
          <label className={labelCls}>
            Nome
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              required
            />
          </label>
          <label className={labelCls}>
            E-mail
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            Celular
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.celular}
              onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            Chave Pix
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.pix}
              onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))}
            />
          </label>
        </div>

        <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mt-1">Endereço</div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className={labelCls}>
            CEP
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.cep}
              onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))}
            />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Logradouro
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.logradouro}
              onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            Número
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.numero_endereco}
              onChange={(e) => setForm((f) => ({ ...f, numero_endereco: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            Complemento
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.complemento}
              onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            Bairro
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.bairro}
              onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            Cidade
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              value={form.cidade}
              onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
            />
          </label>
          <label className={labelCls}>
            UF
            <input
              className={inputCls}
              style={{ borderColor: 'var(--rbr-border)' }}
              maxLength={2}
              value={form.uf}
              onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
            />
          </label>
        </div>

        {error && <div className="text-xs text-[color:var(--rbr-danger)]">{error}</div>}
        {saved && <div className="text-xs" style={{ color: 'var(--rbr-positive)' }}>Dados salvos.</div>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl py-3 font-bold text-sm disabled:opacity-60"
          style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Sua base de motoristas</div>
          {!importAberto && (
            <button
              onClick={() => setImportAberto(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-full border"
              style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-navy-dark)' }}
            >
              + Importar CSV
            </button>
          )}
        </div>

        {importAberto && (
          <div
            className="bg-white border rounded-[16px] p-4 flex flex-col gap-3"
            style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
          >
            <div className="text-[15px] font-bold text-[color:var(--rbr-navy-dark)]">Importar motoristas por CSV</div>
            <div className="text-xs text-[color:var(--rbr-muted)]">
              Colunas: <strong>nome</strong>, <strong>email</strong> e <strong>cpf</strong> (obrigatórias — CPF só não
              é exigido se o motorista já tiver cadastro), celular (opcional). Pra cada motorista novo a gente cria a
              conta e devolve um link pra ele definir a senha — manda por WhatsApp. Já vincula automaticamente com
              você. Pode subir o nosso modelo ou a sua própria planilha de controle — o sistema reconhece as colunas
              (nome, e-mail, cpf, celular/telefone) mesmo que os nomes não sejam exatamente iguais, e ignora o resto.
            </div>
            <button
              type="button"
              onClick={baixarModeloCsv}
              className="self-start text-xs font-bold underline"
              style={{ color: 'var(--rbr-navy-dark)' }}
            >
              Baixar planilha modelo (.csv)
            </button>

            {!importResultados && (
              <>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleArquivoSelecionado}
                  className="text-sm"
                />
                {importArquivoNome && importLinhas.length > 0 && (
                  <div className="text-xs text-[color:var(--rbr-muted)]">
                    {importArquivoNome}: {importLinhas.length} linha(s) encontrada(s).
                  </div>
                )}
                {importLinhas.length > 0 && (
                  <div className="overflow-x-auto border rounded-xl" style={{ borderColor: 'var(--rbr-border)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[color:var(--rbr-muted)]">
                          <th className="px-2 py-1.5">Nome</th>
                          <th className="px-2 py-1.5">E-mail</th>
                          <th className="px-2 py-1.5">Celular</th>
                          <th className="px-2 py-1.5">CPF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importLinhas.slice(0, 8).map((l, i) => (
                          <tr key={i} className="border-t" style={{ borderColor: 'var(--rbr-border)' }}>
                            <td className="px-2 py-1.5">{l.nome || '—'}</td>
                            <td className="px-2 py-1.5">{l.email || '—'}</td>
                            <td className="px-2 py-1.5">{l.celular || '—'}</td>
                            <td className="px-2 py-1.5">{l.cpf || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importLinhas.length > 8 && (
                      <div className="px-2 py-1.5 text-[11px] text-[color:var(--rbr-muted)]">
                        + {importLinhas.length - 8} linha(s)…
                      </div>
                    )}
                  </div>
                )}
                {importErro && <div className="text-xs text-[color:var(--rbr-danger)]">{importErro}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={fecharImportacao}
                    className="rounded-xl py-2.5 px-4 font-bold text-sm border"
                    style={{ borderColor: 'var(--rbr-border)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImportar}
                    disabled={importLoading || importLinhas.length === 0}
                    className="flex-1 rounded-xl py-2.5 font-bold text-sm disabled:opacity-60"
                    style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
                  >
                    {importLoading ? 'Importando…' : `Importar ${importLinhas.length || ''} motorista(s)`}
                  </button>
                </div>
              </>
            )}

            {importResultados && (
              <>
                <div className="text-xs font-semibold">
                  {importResultados.filter((r) => r.sucesso).length} de {importResultados.length} importado(s) com
                  sucesso.
                </div>
                <div className="overflow-x-auto border rounded-xl" style={{ borderColor: 'var(--rbr-border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[color:var(--rbr-muted)]">
                        <th className="px-2 py-1.5">Linha</th>
                        <th className="px-2 py-1.5">Nome</th>
                        <th className="px-2 py-1.5">Resultado</th>
                        <th className="px-2 py-1.5">Link p/ definir senha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResultados.map((r) => (
                        <tr key={r.linha} className="border-t" style={{ borderColor: 'var(--rbr-border)' }}>
                          <td className="px-2 py-1.5">{r.linha}</td>
                          <td className="px-2 py-1.5">{r.nome}</td>
                          <td className="px-2 py-1.5" style={{ color: r.sucesso ? 'var(--rbr-positive)' : 'var(--rbr-danger)' }}>
                            {r.mensagem}
                          </td>
                          <td className="px-2 py-1.5">
                            {r.link_definir_senha ? (
                              <button
                                onClick={() => copiarLink(r.link_definir_senha!)}
                                className="underline font-semibold"
                                style={{ color: 'var(--rbr-navy-dark)' }}
                              >
                                Copiar link
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={fecharImportacao}
                  className="rounded-xl py-2.5 font-bold text-sm border"
                  style={{ borderColor: 'var(--rbr-border)' }}
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        )}

        {loadingVinculos && <div className="text-sm text-[color:var(--rbr-muted)] py-4 text-center">Carregando…</div>}
        {!loadingVinculos && vinculos.length === 0 && (
          <div className="text-sm text-[color:var(--rbr-muted)] bg-white border rounded-[16px] p-4" style={{ borderColor: 'var(--rbr-border)' }}>
            Nenhum motorista vinculado ainda.
          </div>
        )}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {vinculos.map((v) => {
            const style = VINCULO_STYLE[v.status] ?? VINCULO_STYLE.reivindicado
            return (
              <div
                key={v.id}
                className="bg-white border rounded-[14px] p-3.5 flex items-center justify-between gap-2"
                style={{ borderColor: 'var(--rbr-border)', boxShadow: '0 1px 2px rgba(18,23,61,0.03), 0 6px 18px rgba(18,23,61,0.05)' }}
              >
                <div>
                  <div className="text-sm font-semibold">{v.motoristaNome ?? 'Motorista'}</div>
                  <div className="text-xs text-[color:var(--rbr-muted)]">Desde {formatDate(v.created_at)}</div>
                </div>
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: style.bg, color: style.color }}
                >
                  {VINCULO_LABEL[v.status] ?? v.status}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <button
        onClick={onSignOut}
        className="flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-sm border"
        style={{ borderColor: 'var(--rbr-border)', color: 'var(--rbr-danger)' }}
      >
        <IconLogOut width={16} height={16} />
        Sair
      </button>
    </div>
  )
}
