import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { formatarDoc } from '@rbr/shared/documento'
import { soDigitos } from '@rbr/shared/consultaCadastro'
import { Modal } from '../financeiro/ui'
import {
  dataBr,
  dataCurtaBr,
  dataHoraBr,
  estadoDaConsulta,
  lerRegraProtesto,
  lerUltimaConsulta,
  reaisDeCentavos,
  textoDataProtesto,
  textoQuantidade,
  textoValor,
  type ConsultaProtesto,
  type RegraProtesto,
  type SituacaoProtesto,
} from '../../lib/protesto'

// Consulta de protesto (IEPTB Online) na ficha do cliente. Cada consulta custa dinheiro,
// então NUNCA consulta sozinha: só quando o gestor clica e confirma. Prazo de validade e
// custo vêm do parâmetro 'consulta_protesto'. Baixar o relatório não consulta de novo.

type Confirmacao = { forcar: boolean } | null
export type ClienteRisco = { razao_social?: string | null; nome_fantasia?: string | null; cidade?: string | null; uf?: string | null }

const COR = {
  sem: { bg: '#E7F5EC', fg: 'var(--rbr-positive)', borda: '#BFE3CD' },
  com: { bg: '#FDF1DC', fg: '#8A5A00', borda: '#F0D6A0' },
  vencida: { bg: 'var(--rbr-muted-bg)', fg: 'var(--rbr-muted)', borda: 'var(--rbr-border)' },
}

function Selo({ tipo, children }: { tipo: keyof typeof COR; children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: COR[tipo].bg, color: COR[tipo].fg }}>
      {children}
    </span>
  )
}

// Selinho da lista de clientes (aba Clientes).
export function SeloProtestoLista({ situacao, vencida }: { situacao: SituacaoProtesto; vencida: boolean }) {
  if (vencida) return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: COR.vencida.bg, color: COR.vencida.fg }}>Consulta vencida</span>
  if (situacao === 'com') return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: COR.com.bg, color: COR.com.fg }}>Com protesto</span>
  if (situacao === 'sem') return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: COR.sem.bg, color: COR.sem.fg }}>Sem protesto</span>
  return null
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl px-3 py-2 bg-white/70 min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">{rotulo}</div>
      <div className="text-lg font-bold tabular-nums text-[color:var(--rbr-navy-dark)] whitespace-nowrap">{valor}</div>
    </div>
  )
}

export default function RiscoComercial({ cnpj, cliente, onConsultado }: { cnpj: string; cliente?: ClienteRisco; onConsultado?: () => void }) {
  const digitos = soDigitos(cnpj)
  const [regra, setRegra] = useState<RegraProtesto | null | undefined>(undefined)
  const [consulta, setConsulta] = useState<ConsultaProtesto | null | undefined>(undefined)
  const [confirmar, setConfirmar] = useState<Confirmacao>(null)
  const [consultando, setConsultando] = useState(false)
  const emAndamento = useRef(false)
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null)
  const [verCartorios, setVerCartorios] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const carregar = useCallback(async () => {
    const [r, c] = await Promise.all([lerRegraProtesto(), lerUltimaConsulta(digitos)])
    setRegra(r)
    setConsulta(c)
    return c
  }, [digitos])

  useEffect(() => {
    if (digitos.length === 14) carregar()
  }, [digitos, carregar])

  if (digitos.length !== 14) return null

  const custo = regra ? reaisDeCentavos(regra.custo_centavos) : null
  const est = consulta && regra ? estadoDaConsulta(consulta, regra) : null
  const r = consulta?.resultado ?? null

  async function consultar(forcar: boolean) {
    if (emAndamento.current) return
    emAndamento.current = true
    setConsultando(true)
    setAviso(null)
    const falhou = (texto: string) => {
      setConfirmar(null)
      setAviso({ tipo: 'erro', texto })
    }
    try {
      const { data, error } = await supabase.functions.invoke('consultar-protesto', { body: { cnpj: digitos, forcar } })
      if (error) {
        const ctx = (error as { context?: Response }).context
        const status = typeof ctx?.status === 'number' ? ctx.status : null
        let corpo: { erro?: string; message?: string } | null = null
        try {
          corpo = await ctx?.json()
        } catch {
          corpo = null
        }
        const texto = `${error.message ?? ''} ${corpo?.erro ?? ''} ${corpo?.message ?? ''}`
        console.error('[consultar-protesto]', status, texto)
        if (status === 404 || /not found|não encontrad|nao encontrad/i.test(texto)) {
          setConfirmar(null)
          setAviso({ tipo: 'info', texto: 'A consulta de protesto ainda não foi ativada.' })
        } else {
          falhou('A fonte da consulta está indisponível agora. Tente de novo mais tarde.')
        }
        return
      }
      if (!data?.sucesso) {
        console.error('[consultar-protesto]', data)
        falhou('A fonte da consulta está indisponível agora. Tente de novo mais tarde.')
        return
      }
      setConfirmar(null)
      // A função devolve só um resumo: relê a linha gravada, que tem os títulos completos.
      const relida = await carregar()
      if (!relida) {
        setConsulta({
          cnpj: digitos,
          created_at: data.consultado_em ?? new Date().toISOString(),
          tem_protesto: typeof data.tem_protesto === 'boolean' ? data.tem_protesto : null,
          resultado: data.resultado && typeof data.resultado === 'object' ? data.resultado : null,
          consultado_por: null,
        })
      }
      if (data.do_cache) setAviso({ tipo: 'info', texto: 'Usamos a consulta que já estava salva. Nada foi cobrado.' })
      onConsultado?.()
    } catch (e) {
      console.error('[consultar-protesto]', e)
      falhou('A fonte da consulta está indisponível agora. Tente de novo mais tarde.')
    } finally {
      emAndamento.current = false
      setConsultando(false)
    }
  }

  async function baixarPdf() {
    if (!consulta || !regra || gerandoPdf) return
    setGerandoPdf(true)
    setAviso(null)
    try {
      const [{ gerarProtestoPdf, nomeArquivoProtesto, baixarBlob }, { data: empresa }, { data: pessoa }] = await Promise.all([
        import('../../lib/protestoPdf'),
        supabase.from('parametros_sistema').select('valor').eq('chave', 'dados_empresa').maybeSingle(),
        consulta.consultado_por
          ? supabase.from('pessoas').select('nome').eq('id', consulta.consultado_por).maybeSingle()
          : Promise.resolve({ data: null as { nome: string | null } | null }),
      ])
      const blob = gerarProtestoPdf({
        cliente: { cnpj: digitos, razao_social: cliente?.razao_social, nome_fantasia: cliente?.nome_fantasia, cidade: cliente?.cidade, uf: cliente?.uf },
        consulta,
        regra,
        empresa: (empresa?.valor ?? {}) as Record<string, string>,
        consultadoPorNome: pessoa?.nome ?? null,
      })
      baixarBlob(blob, nomeArquivoProtesto(digitos, consulta.created_at))
    } catch (e) {
      console.error('[protestoPdf]', e)
      setAviso({ tipo: 'erro', texto: 'Não consegui gerar o relatório agora. Tente de novo.' })
    } finally {
      setGerandoPdf(false)
    }
  }

  const botaoConsultar = (forcar: boolean, principal: boolean) => (
    <button
      type="button"
      onClick={() => setConfirmar({ forcar })}
      disabled={consultando || !regra}
      className={`text-xs font-bold px-3.5 py-2 rounded-lg disabled:opacity-60 ${principal ? '' : 'border'}`}
      style={principal ? { background: 'var(--rbr-navy)', color: '#fff' } : { borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', background: '#fff' }}
    >
      {consultando ? 'Consultando...' : `${consulta ? 'Consultar de novo' : 'Consultar protesto'}${custo ? ` (${custo})` : ''}`}
    </button>
  )
  const botaoPdf = (
    <button
      type="button"
      onClick={baixarPdf}
      disabled={gerandoPdf}
      className="text-xs font-bold px-3.5 py-2 rounded-lg border disabled:opacity-60"
      style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)', background: '#fff' }}
    >
      {gerandoPdf ? 'Gerando...' : 'Baixar relatório (PDF)'}
    </button>
  )

  const total = textoQuantidade(r?.numeroTotalProtestos)
  const valorTotal = textoValor(r?.valorTotalProtestos)
  const estados = r?.protestos ?? []

  // Resultado (sem/com protesto). Na consulta vencida aparece esmaecido.
  const resultado = est && consulta && (
    <div className={`flex flex-col gap-3 ${est.vencida ? 'opacity-60' : ''}`}>
      <div
        className="rounded-xl px-3.5 py-3 flex flex-col gap-2 border-l-4"
        style={{
          background: est.situacao === 'com' ? COR.com.bg : est.situacao === 'sem' ? COR.sem.bg : 'var(--rbr-muted-bg)',
          borderColor: est.situacao === 'com' ? COR.com.fg : est.situacao === 'sem' ? COR.sem.fg : 'var(--rbr-border)',
        }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {est.situacao === 'sem' && <Selo tipo="sem">Sem protesto</Selo>}
          {est.situacao === 'com' && <Selo tipo="com">Com protesto</Selo>}
          {est.situacao === 'indefinido' && <Selo tipo="vencida">Sem indicação</Selo>}
        </div>
        {est.situacao === 'sem' && <div className="text-sm text-[color:var(--rbr-navy-dark)]">Nada consta em nome deste CNPJ nos cartórios do país na data da consulta.</div>}
        {est.situacao === 'com' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Numero rotulo="Protestos" valor={total ?? '—'} />
            <Numero rotulo="Valor total" valor={valorTotal ?? '—'} />
          </div>
        )}
        {est.situacao === 'indefinido' && <div className="text-sm text-[color:var(--rbr-navy-dark)]">A fonte não indicou se há protestos. Veja as observações.</div>}
      </div>

      {est.situacao === 'com' && estados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">Por estado</div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
            {estados.map((e, i) => (
              <div key={`${e.estado}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs border-t first:border-t-0" style={{ borderColor: 'var(--rbr-border)' }}>
                <span className="font-bold text-[color:var(--rbr-navy-dark)]">{e.estado || 'UF não informada'}</span>
                <span className="text-[color:var(--rbr-muted)] tabular-nums text-right">
                  {[textoQuantidade(e.numeroTotalProtestosUF) && `${textoQuantidade(e.numeroTotalProtestosUF)} protesto(s)`, textoValor(e.valorTotalProtestosEstado)].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setVerCartorios((v) => !v)} aria-expanded={verCartorios} className="self-start text-xs font-bold text-[color:var(--rbr-navy)] mt-1">
            {verCartorios ? '▾' : '▸'} Ver detalhes por cartório
          </button>
          {verCartorios && (
            <div className="flex flex-col gap-2">
              {estados.map((e, i) =>
                (e.cartorios ?? []).map((c, j) => (
                  <div key={`${i}-${j}`} className="rounded-xl px-3 py-2.5 text-xs flex flex-col gap-1" style={{ background: 'var(--rbr-muted-bg)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-bold text-[color:var(--rbr-navy-dark)]">
                        {[c.cidade, e.estado].filter(Boolean).join('/') || 'Cartório'}
                      </span>
                      <span className="text-[color:var(--rbr-navy-dark)] tabular-nums text-right">
                        {[textoQuantidade(c.numeroProtestos) && `${textoQuantidade(c.numeroProtestos)} protesto(s)`, textoValor(c.valorTotalProtestosCartorio)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    {(c.titulos ?? []).map((t, k) => (
                      <div key={k} className="flex items-center justify-between gap-3 pl-3 text-[color:var(--rbr-muted)] tabular-nums">
                        <span>{textoDataProtesto(t.dataProtesto) ? `Protesto em ${textoDataProtesto(t.dataProtesto)}` : 'Protesto (data não informada)'}</span>
                        <span>{textoValor(t.valorProtestado) ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )),
              )}
            </div>
          )}
        </div>
      )}

      {r?.observacoes && (
        <div className="text-xs text-[color:var(--rbr-navy-dark)]">
          <span className="font-bold text-[color:var(--rbr-muted)]">Observações da fonte: </span>
          {r.observacoes}
        </div>
      )}
      <div className="text-xs text-[color:var(--rbr-muted)] flex flex-wrap gap-x-3 gap-y-0.5">
        <span>Consultado em {dataHoraBr(consulta.created_at)}</span>
        {regra && !est.vencida && (
          <span>
            Válido até {dataBr(est.valeAte)} ({regra.validade_dias} dias)
          </span>
        )}
      </div>
    </div>
  )

  return (
    <div className="bg-white border rounded-2xl p-4 flex flex-col gap-3" style={{ borderColor: 'var(--rbr-border)' }}>
      <div>
        <div className="text-sm font-bold text-[color:var(--rbr-navy-dark)]">Risco comercial</div>
        <div className="text-xs text-[color:var(--rbr-muted)]">Protestos em cartório (IEPTB)</div>
      </div>

      {consulta === undefined || regra === undefined ? (
        <div className="text-xs text-[color:var(--rbr-muted)]">Carregando…</div>
      ) : regra === null ? (
        <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#FDF6E7', color: '#7A5A12' }}>
          Não consegui ler a regra da consulta de protesto (validade e custo). Tente de novo mais tarde.
        </div>
      ) : !consulta ? (
        <>
          <div className="text-xs text-[color:var(--rbr-muted)]">Este CNPJ ainda não teve a consulta de protesto.</div>
          <div>{botaoConsultar(false, true)}</div>
        </>
      ) : est?.vencida ? (
        <>
          <div className="rounded-xl px-3.5 py-3 flex flex-col gap-1.5" style={{ background: 'var(--rbr-muted-bg)' }}>
            <div>
              <Selo tipo="vencida">Consulta vencida</Selo>
            </div>
            <div className="text-xs text-[color:var(--rbr-navy-dark)]">
              Esta consulta tem {est.idadeDias} dias e passou do prazo de validade ({dataBr(est.valeAte)}). O resultado pode estar desatualizado.
            </div>
          </div>
          {resultado}
          <div className="flex gap-2 flex-wrap">
            {botaoConsultar(false, true)}
            {botaoPdf}
          </div>
        </>
      ) : (
        <>
          {resultado}
          <div className="flex gap-2 flex-wrap">
            {botaoPdf}
            {botaoConsultar(true, false)}
          </div>
        </>
      )}

      {aviso && (
        <div
          role="status"
          className="text-xs rounded-lg px-3 py-2"
          style={aviso.tipo === 'info' ? { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' } : { background: '#FDF6E7', color: '#7A5A12' }}
        >
          {aviso.texto}
        </div>
      )}
      {regra && <div className="text-[11px] text-[color:var(--rbr-muted)]">O resultado vale por {regra.validade_dias} dias para não pagar duas vezes.</div>}

      {confirmar && regra && custo && (
        <Modal titulo="Consultar protesto" onFechar={() => !consultando && setConfirmar(null)} largura="max-w-md">
          <div className="text-sm text-[color:var(--rbr-navy-dark)]">
            {confirmar.forcar && consulta && est && !est.vencida
              ? `Esta consulta já foi feita há ${est.idadeDias} ${est.idadeDias === 1 ? 'dia' : 'dias'} e vale até ${dataCurtaBr(est.valeAte)}. Consultar de novo custa mais ${custo}.`
              : `Cada consulta custa ${custo}. Consultar protesto do CNPJ ${formatarDoc(digitos)}?`}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmar(null)}
              disabled={consultando}
              className="text-sm font-bold px-4 py-2.5 rounded-xl border disabled:opacity-50"
              style={{ borderColor: 'var(--rbr-navy)', color: 'var(--rbr-navy)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => consultar(confirmar.forcar)}
              disabled={consultando}
              className="text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-60"
              style={{ background: 'var(--rbr-navy)', color: '#fff' }}
            >
              {consultando ? 'Consultando...' : 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
