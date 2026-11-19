import { useCallback, useEffect, useState } from 'react'
import { Aviso, Botao, Campo, Card, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { db, auditar } from '../../lib/prospeccaoDb'
import { EXEMPLO_MODELO, MODELO_ROTULO, modeloPendente, preencher, validarModelo, VARIAVEIS_MODELO } from '../../lib/prospeccao'

type Modelo = { tipo: string; assunto: string; corpo: string; ativo: boolean }
type Passo = { toque: number; atraso_dias: number; modelo_tipo: string }

// "Jornada e textos": modelos e jornada ficam em tabelas editaveis (nunca em codigo). Modelo inativo trava a jornada naquele ponto.
export default function Modelos() {
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [jornada, setJornada] = useState<Passo[]>([])
  const [sel, setSel] = useState('toque1')
  const [form, setForm] = useState<Modelo | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const [m, j] = await Promise.all([db.from('prospeccao_modelos').select('tipo, assunto, corpo, ativo').order('tipo'), db.from('prospeccao_jornada').select('*').order('toque')])
    setModelos((m.data ?? []) as Modelo[])
    setJornada((j.data ?? []) as Passo[])
  }, [])
  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { setForm(modelos.find((m) => m.tipo === sel) ?? null) }, [sel, modelos])

  const inativos = modelos.filter((m) => modeloPendente(m))
  const erroModelo = form ? validarModelo(form.assunto, form.corpo) : null

  return (
    <div className="flex flex-col gap-3">
      {confirmacao}
      {inativos.length > 0 && (
        <Aviso tipo="atencao">
          Modelos inativos ou "A DEFINIR" (a jornada espera neles): <b>{inativos.map((m) => MODELO_ROTULO[m.tipo]).join(', ')}</b>.
        </Aviso>
      )}
      <Card titulo="Jornada (dias depois do toque anterior)">
        <div className="flex gap-3 flex-wrap items-end">
          {jornada.map((p, i) => (
            <div key={p.toque} className="w-28">
              <Campo label={`Toque ${p.toque}`}>
                <input className={inputClass} style={inputStyle} inputMode="numeric" value={p.atraso_dias} disabled={p.toque === 1}
                  onChange={(e) => setJornada(jornada.map((x, k) => (k === i ? { ...x, atraso_dias: Number(e.target.value.replace(/\D/g, '')) } : x)))} />
              </Campo>
            </div>
          ))}
          <Botao disabled={ocupado} onClick={() => void rodar('Jornada salva.', async () => {
            for (const p of jornada) {
              const { error } = await db.from('prospeccao_jornada').update({ atraso_dias: p.atraso_dias }).eq('toque', p.toque)
              if (error) throw new Error(error.message)
            }
            await auditar('prospeccao_jornada_editada', { jornada })
          })}>Salvar jornada</Botao>
        </div>
        <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">Depois do 4º toque a empresa vai para repouso por 90 dias.</div>
      </Card>

      <div className="grid md:grid-cols-[240px_1fr] gap-3">
        <Card titulo="Modelos">
          <div className="flex flex-col gap-1">
            {modelos.map((m) => (
              <button key={m.tipo} type="button" onClick={() => setSel(m.tipo)} className="text-left text-xs px-2.5 py-2 rounded-lg flex items-center gap-2"
                style={{ background: sel === m.tipo ? '#eef0fa' : 'transparent', fontWeight: sel === m.tipo ? 800 : 600 }}>
                <span className="flex-1">{MODELO_ROTULO[m.tipo] ?? m.tipo}</span>
                <span className="text-[10px] font-bold" style={{ color: modeloPendente(m) ? '#8A5A00' : '#1a6b3c' }}>{modeloPendente(m) ? 'inativo' : 'ativo'}</span>
              </button>
            ))}
          </div>
        </Card>
        {form && (
          <Card titulo={MODELO_ROTULO[form.tipo]}>
            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-[color:var(--rbr-muted)]">Variáveis: {VARIAVEIS_MODELO.map((v) => `{${v}}`).join(' ')}. Texto puro, sem HTML.</div>
              <Campo label="Assunto"><input className={inputClass} style={inputStyle} value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} /></Campo>
              <Campo label="Corpo"><textarea className={inputClass} style={inputStyle} rows={14} value={form.corpo} onChange={(e) => setForm({ ...form, corpo: e.target.value })} /></Campo>
              <label className="text-xs flex items-center gap-1.5 font-semibold"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo (modelo inativo trava a jornada neste ponto)</label>
              {erroModelo && <Aviso>{erroModelo}</Aviso>}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)] mb-1">Pré-visualização (dados de exemplo)</div>
                <div className="text-xs font-bold">Assunto: {preencher(form.assunto, EXEMPLO_MODELO)}</div>
                <pre className="text-xs whitespace-pre-wrap font-sans border rounded-lg p-3 bg-[#fafbfe] mt-1" style={{ borderColor: 'var(--rbr-border)' }}>{preencher(form.corpo, EXEMPLO_MODELO)}</pre>
              </div>
              <div className="flex justify-end">
                <Botao disabled={ocupado || !!erroModelo || !form.assunto.trim() || !form.corpo.trim()} onClick={() => void rodar('Modelo salvo.', async () => {
                  const { error } = await db.from('prospeccao_modelos').update({ assunto: form.assunto, corpo: form.corpo, ativo: form.ativo }).eq('tipo', form.tipo)
                  if (error) throw new Error(error.message)
                  await auditar('prospeccao_modelo_editado', { tipo: form.tipo, ativo: form.ativo })
                  await carregar()
                })}>Salvar modelo</Botao>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
