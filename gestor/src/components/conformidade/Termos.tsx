import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Botao, Campo, Card, Carregando, Modal, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'

// Tarefa 7: versões do termo/contrato (texto em tabela, com versão). Rascunho é editável; publicado não muda;
// publicar arquiva a versão anterior e exige novo aceite no próximo acesso.

export type Termo = {
  id: string
  tipo: 'prestador' | 'agenciador'
  versao: number
  titulo: string
  texto: string
  minuta: boolean
  status: 'rascunho' | 'publicado' | 'arquivado'
  publicado_em: string | null
  termos_contrato_clausulas: Clausula[]
}
export type Clausula = { id?: string; ordem: number; codigo: string; texto: string }

const STATUS: Record<Termo['status'], { t: string; bg: string; c: string }> = {
  rascunho: { t: 'Rascunho', bg: '#FDF1DC', c: '#8A5A00' },
  publicado: { t: 'Publicado (em vigor)', bg: '#E7F5EC', c: 'var(--rbr-positive)' },
  arquivado: { t: 'Arquivado', bg: 'var(--rbr-muted-bg)', c: 'var(--rbr-muted)' },
}
export const TIPO_TERMO_LABEL = { prestador: 'Motorista / parceiro', agenciador: 'Agenciador' } as const

export default function Termos({
  extraPorTermo,
  validarPublicacao,
}: {
  extraPorTermo?: (t: Termo, recarregar: () => void) => React.ReactNode
  validarPublicacao?: (t: Termo) => Promise<string | null>
}) {
  const [lista, setLista] = useState<Termo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<Termo | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('termos_contrato')
      .select('*, termos_contrato_clausulas(id, ordem, codigo, texto)')
      .order('tipo')
      .order('versao', { ascending: false })
    setErro(error ? error.message : null)
    setLista(((data ?? []) as Termo[]).map((t) => ({ ...t, termos_contrato_clausulas: [...t.termos_contrato_clausulas].sort((a, b) => a.ordem - b.ordem) })))
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  async function novaVersao(base: Termo) {
    const proxima = Math.max(...(lista ?? []).filter((t) => t.tipo === base.tipo).map((t) => t.versao)) + 1
    const { data, error } = await supabase
      .from('termos_contrato')
      .insert({ tipo: base.tipo, versao: proxima, titulo: base.titulo, texto: base.texto, minuta: base.minuta })
      .select('id')
      .single()
    if (error) throw error
    if (base.termos_contrato_clausulas.length) {
      const { error: e2 } = await supabase
        .from('termos_contrato_clausulas')
        .insert(base.termos_contrato_clausulas.map((c) => ({ termo_id: (data as { id: string }).id, ordem: c.ordem, codigo: c.codigo, texto: c.texto })))
      if (e2) throw e2
    }
    await carregar()
    return proxima
  }

  if (lista === null) return <Carregando />
  return (
    <div className="flex flex-col gap-3">
      {erro && <Aviso>{erro}</Aviso>}
      {confirmacao}
      {(['prestador', 'agenciador'] as const).map((tipo) => (
        <Card key={tipo} titulo={`Termo/contrato: ${TIPO_TERMO_LABEL[tipo]}`}>
          <div className="flex flex-col gap-3">
            {lista.filter((t) => t.tipo === tipo).length === 0 && <div className="text-xs text-[color:var(--rbr-muted)]">Nenhuma versão cadastrada.</div>}
            {lista
              .filter((t) => t.tipo === tipo)
              .map((t) => (
                <div key={t.id} className="border rounded-xl p-3 flex flex-col gap-2" style={{ borderColor: 'var(--rbr-border)' }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-bold">
                      v{t.versao} · {t.titulo}
                      {t.minuta && <span className="ml-2 text-[10px] font-bold uppercase" style={{ color: '#8A5A00' }}>minuta para revisão jurídica</span>}
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: STATUS[t.status].bg, color: STATUS[t.status].c }}>
                      {STATUS[t.status].t}
                      {t.publicado_em ? ` · ${new Date(t.publicado_em).toLocaleDateString('pt-BR')}` : ''}
                    </span>
                  </div>
                  <div className="text-xs text-[color:var(--rbr-muted)]">{t.termos_contrato_clausulas.length} cláusula(s) com "Li e aceito" separado.</div>
                  {extraPorTermo?.(t, () => void carregar())}
                  <div className="flex gap-2 flex-wrap">
                    {t.status === 'rascunho' && (
                      <>
                        <Botao variante="secundario" onClick={() => setEditando(t)}>
                          Editar rascunho
                        </Botao>
                        <Botao
                          variante="ouro"
                          disabled={ocupado}
                          onClick={() =>
                            void rodar(`Versão ${t.versao} publicada: quem ainda não aceitou terá de aceitar no próximo acesso.`, async () => {
                              const motivo = await validarPublicacao?.(t)
                              if (motivo) throw new Error(motivo)
                              const { error } = await supabase.rpc('publicar_termo', { p_termo: t.id })
                              if (error) throw error
                              await carregar()
                            })
                          }
                        >
                          Publicar esta versão
                        </Botao>
                      </>
                    )}
                    {t.status !== 'rascunho' && !lista.some((x) => x.tipo === t.tipo && x.status === 'rascunho') && (
                      <Botao variante="secundario" disabled={ocupado} onClick={() => void rodar((v: number) => `Rascunho da versão ${v} criado a partir da v${t.versao}.`, () => novaVersao(t))}>
                        Nova versão a partir desta
                      </Botao>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}
      {editando && (
        <EditarTermo
          t={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            void carregar()
          }}
        />
      )}
    </div>
  )
}

export function EditarTermo({ t, onFechar, onSalvo }: { t: Termo; onFechar: () => void; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(t.titulo)
  const [texto, setTexto] = useState(t.texto)
  const [minuta, setMinuta] = useState(t.minuta)
  const [clausulas, setClausulas] = useState<Clausula[]>(t.termos_contrato_clausulas)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  async function salvar() {
    if (!titulo.trim() || !texto.trim()) throw new Error('Título e texto são obrigatórios.')
    const cls = clausulas.filter((c) => c.texto.trim())
    if (new Set(cls.map((c) => c.codigo.trim())).size !== cls.length || cls.some((c) => !c.codigo.trim())) throw new Error('Cada cláusula precisa de um código único.')
    const { error } = await supabase.from('termos_contrato').update({ titulo: titulo.trim(), texto, minuta }).eq('id', t.id)
    if (error) throw error
    const { error: e1 } = await supabase.from('termos_contrato_clausulas').delete().eq('termo_id', t.id)
    if (e1) throw e1
    if (cls.length) {
      const { error: e2 } = await supabase
        .from('termos_contrato_clausulas')
        .insert(cls.map((c, i) => ({ termo_id: t.id, ordem: i + 1, codigo: c.codigo.trim(), texto: c.texto.trim() })))
      if (e2) throw e2
    }
    onSalvo()
  }

  return (
    <Modal titulo={`Editar rascunho v${t.versao}`} onFechar={ocupado ? () => {} : onFechar} largura="max-w-4xl">
      <div className="flex flex-col gap-3">
        <Campo label="Título">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputClass} style={inputStyle} />
        </Campo>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={minuta} onChange={(e) => setMinuta(e.target.checked)} /> Marcar como "minuta para revisão jurídica"
        </label>
        <Campo label="Texto" dica="Campos entre chaves duplas, como {{prestador_nome}}, são preenchidos na hora do aceite.">
          <textarea rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} className={`${inputClass} font-mono text-xs`} style={inputStyle} />
        </Campo>
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Cláusulas com "Li e aceito" (uma caixa por cláusula)</div>
          {clausulas.map((c, i) => (
            <div key={i} className="grid grid-cols-[64px_1fr_auto] gap-2 items-start">
              <input value={c.codigo} onChange={(e) => setClausulas((l) => l.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))} className={inputClass} style={inputStyle} />
              <textarea rows={2} value={c.texto} onChange={(e) => setClausulas((l) => l.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} className={inputClass} style={inputStyle} />
              <Botao variante="perigo" onClick={() => setClausulas((l) => l.filter((_, j) => j !== i))}>
                Remover
              </Botao>
            </div>
          ))}
          <div>
            <Botao variante="secundario" onClick={() => setClausulas((l) => [...l, { ordem: l.length + 1, codigo: String(l.length + 1), texto: '' }])}>
              + Cláusula
            </Botao>
          </div>
        </div>
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao disabled={ocupado} onClick={() => void rodar('Rascunho salvo.', salvar)}>
            {ocupado ? 'enviando…' : 'Salvar rascunho'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
