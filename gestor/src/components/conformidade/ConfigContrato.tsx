import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { Aviso, Botao, Card, Carregando, Modal, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { TIPO_TERMO_LABEL, type Clausula, type Termo } from './Termos'

// Tarefas 8 e 9: campos {{...}} do contrato que não vêm do cadastro (contrato_config) e importação da minuta (.md).
// Campo pendente BLOQUEIA a publicação da versão (publicar_termo confere de novo no banco).

type Config = { tipo: 'prestador' | 'agenciador'; chave: string; valor: string | null; descricao: string | null }

export function CamposContrato() {
  const [lista, setLista] = useState<Config[] | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('contrato_config').select('*').order('tipo').order('chave')
    const l = (data ?? []) as Config[]
    setLista(l)
    setValores(Object.fromEntries(l.map((c) => [`${c.tipo}|${c.chave}`, c.valor ?? ''])))
  }, [])
  useEffect(() => {
    void carregar()
  }, [carregar])

  if (lista === null) return <Carregando />
  return (
    <Card titulo="Campos do contrato (preenchidos pela RBR)">
      <div className="text-xs text-[color:var(--rbr-muted)] mb-3">
        Os campos do prestador/agenciador (nome, documento, tipo, RNTRC, responsável) vêm do cadastro. Estes aqui valem para todos; vazio = pendente e bloqueia a
        publicação.
      </div>
      {(['prestador', 'agenciador'] as const).map((tipo) => (
        <div key={tipo} className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1.5">{TIPO_TERMO_LABEL[tipo]}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lista
              .filter((c) => c.tipo === tipo)
              .map((c) => {
                const k = `${c.tipo}|${c.chave}`
                const vazio = !(valores[k] ?? '').trim()
                return (
                  <label key={k} className="flex flex-col gap-1 text-[11px]">
                    <span className="font-mono" style={{ color: vazio ? '#8A5A00' : 'var(--rbr-muted)' }}>
                      {`{{${c.chave}}}`} {vazio ? '· pendente' : ''}
                    </span>
                    <input
                      value={valores[k] ?? ''}
                      placeholder={c.descricao ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                      className={inputClass}
                      style={{ ...inputStyle, ...(vazio ? { borderColor: '#F0D6A0', background: '#FDF8EC' } : {}) }}
                    />
                  </label>
                )
              })}
          </div>
        </div>
      ))}
      {confirmacao}
      <Botao
        disabled={ocupado}
        onClick={() =>
          void rodar('Campos do contrato salvos.', async () => {
            const mudou = lista.filter((c) => (c.valor ?? '') !== (valores[`${c.tipo}|${c.chave}`] ?? ''))
            for (const c of mudou) {
              const { error } = await supabase
                .from('contrato_config')
                .update({ valor: (valores[`${c.tipo}|${c.chave}`] ?? '').trim() || null, updated_at: new Date().toISOString() })
                .eq('tipo', c.tipo)
                .eq('chave', c.chave)
              if (error) throw error
            }
            await carregar()
          })
        }
      >
        {ocupado ? 'enviando…' : 'Salvar campos'}
      </Botao>
    </Card>
  )
}

// Linha extra em cada versão: campos pendentes e importar a minuta (só em rascunho).
export function ExtraTermo({ t, recarregar }: { t: Termo; recarregar: () => void }) {
  const [pend, setPend] = useState<string[] | null>(null)
  const [importando, setImportando] = useState(false)
  useEffect(() => {
    if (t.status !== 'rascunho') return
    void supabase.rpc('campos_pendentes_termo', { p_termo: t.id }).then(({ data }) => setPend((data as string[] | null) ?? []))
  }, [t])
  if (t.status !== 'rascunho') return null
  const naoImportado = t.texto.includes('[IMPORTAR')
  return (
    <div className="flex flex-col gap-1.5">
      {naoImportado && <Aviso tipo="atencao">O texto da minuta ainda não foi importado: a publicação fica bloqueada.</Aviso>}
      {pend && pend.length > 0 && (
        <Aviso tipo="atencao">
          Campos pendentes (bloqueiam a publicação): <span className="font-mono">{pend.map((p) => `{{${p}}}`).join(' ')}</span>
        </Aviso>
      )}
      <div>
        <Botao variante="secundario" onClick={() => setImportando(true)}>
          Importar minuta (.md)
        </Botao>
      </div>
      {importando && (
        <ImportarMinuta
          t={t}
          onFechar={() => setImportando(false)}
          onFeito={() => {
            setImportando(false)
            recarregar()
          }}
        />
      )}
    </div>
  )
}

// A tabela das cláusulas de aceite fica no FIM do arquivo da minuta: pega a última tabela markdown.
export function clausulasDaUltimaTabela(md: string): Clausula[] {
  const linhas = md.split('\n')
  let fim = linhas.length - 1
  while (fim >= 0 && !linhas[fim].trim().startsWith('|')) fim--
  if (fim < 0) return []
  let ini = fim
  while (ini > 0 && linhas[ini - 1].trim().startsWith('|')) ini--
  const celulas = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim().replace(/\*\*/g, ''))
  const linhasTabela = linhas.slice(ini, fim + 1).filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l))
  return linhasTabela.slice(1).flatMap((l, i) => {
    const cs = celulas(l)
    if (cs.length < 2) return []
    const texto = cs.slice(1).reduce((a, b) => (b.length > a.length ? b : a), '')
    const codigo = (cs[0].match(/[\w.]+/)?.[0] ?? String(i + 1)).replace(/\.$/, '')
    return texto ? [{ ordem: i + 1, codigo, texto }] : []
  })
}

function ImportarMinuta({ t, onFechar, onFeito }: { t: Termo; onFechar: () => void; onFeito: () => void }) {
  const [md, setMd] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const clausulas = md && t.tipo === 'prestador' ? clausulasDaUltimaTabela(md) : []
  const campos = md ? Array.from(new Set(Array.from(md.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]))) : []

  async function salvar() {
    if (!md) throw new Error('Escolha o arquivo .md da minuta.')
    const texto = /minuta para revis/i.test(md) ? md : `MINUTA PARA REVISÃO JURÍDICA\n\n${md}`
    const { error } = await supabase.from('termos_contrato').update({ texto, minuta: true }).eq('id', t.id)
    if (error) throw error
    if (t.tipo === 'prestador') {
      if (clausulas.length === 0) throw new Error('Não achei a tabela de cláusulas no fim do arquivo. O texto foi salvo; cadastre as cláusulas em "Editar rascunho".')
      const { error: e1 } = await supabase.from('termos_contrato_clausulas').delete().eq('termo_id', t.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('termos_contrato_clausulas').insert(clausulas.map((c) => ({ termo_id: t.id, ...c })))
      if (e2) throw e2
    }
    onFeito()
  }

  return (
    <Modal titulo={`Importar minuta · ${TIPO_TERMO_LABEL[t.tipo]} v${t.versao}`} onFechar={ocupado ? () => {} : onFechar} largura="max-w-3xl">
      <div className="flex flex-col gap-3">
        <div className="text-xs text-[color:var(--rbr-muted)]">
          {t.tipo === 'prestador' ? 'claude/contrato-prestador-motorista-minuta-2026-10-11.md' : 'claude/contrato-agenciador-minuta-2026-10-11.md'}: o texto
          inteiro vira o contrato (os campos {'{{...}}'} são mantidos){t.tipo === 'prestador' ? ' e a tabela do fim vira as caixas "Li e aceito".' : '.'}
        </div>
        <input
          type="file"
          accept=".md,text/markdown,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setNome(f.name)
            setMd(await f.text())
          }}
          className="text-xs"
        />
        {md && (
          <div className="flex flex-col gap-2 text-xs">
            <div>
              <b>{nome}</b>: {md.length.toLocaleString('pt-BR')} caracteres · {campos.length} campo(s): <span className="font-mono">{campos.join(', ')}</span>
            </div>
            {t.tipo === 'prestador' && (
              <div className="flex flex-col gap-1">
                <b>{clausulas.length} cláusula(s) de aceite encontradas:</b>
                <ol className="list-none flex flex-col gap-0.5 max-h-48 overflow-auto">
                  {clausulas.map((c) => (
                    <li key={c.codigo}>
                      <b>{c.codigo}.</b> {c.texto}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        {confirmacao}
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar} disabled={ocupado}>
            Voltar
          </Botao>
          <Botao disabled={ocupado || !md} onClick={() => void rodar('Minuta importada no rascunho. Confira, preencha os campos pendentes e publique.', salvar)}>
            {ocupado ? 'enviando…' : 'Importar no rascunho'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}
