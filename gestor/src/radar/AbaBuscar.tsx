// R4: painel de busca sobre a base da Receita (prospeccao_base). A busca roda no banco, paginada; o navegador nunca carrega a base toda.
import { useEffect, useMemo, useRef, useState } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import {
  FILTROS_PADRAO, RESTRICAO_LABEL, SEGMENTOS_RADAR, TAMANHO_BLOCO, emBlocos, filtrarBase, filtrosParaRpc, kpisBusca, prepararImportacaoBase, slugDoSegmento, somarTotais,
  type EmpresaBase, type FiltrosBusca, type Totais,
} from '../lib/radar'
import { EXEMPLO_BASE } from './exemplos'
import { Acoes, AvisoErro, FaixaExemplo, Ic, Vazio, mensagemDeErro, toast, useRadar } from './ui'

type Resposta = { total: number; com_dominio: number; prontas: number; km_medio: number; linhas: EmpresaBase[] }
type Salva = { id: string; nome: string; filtros: FiltrosBusca }
const TAM = 50

export default function AbaBuscar() {
  const { exemplos, irPara, recarregar } = useRadar()
  const [f, setF] = useState<FiltrosBusca>(FILTROS_PADRAO)
  const [segsMarcados, setSegsMarcados] = useState<string[]>([]) // slugs; vazio = todos
  const [pagina, setPagina] = useState(1)
  const [res, setRes] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [salvas, setSalvas] = useState<Salva[]>([])
  const [nomeBusca, setNomeBusca] = useState<string | null>(null)
  const [importando, setImportando] = useState<{ arquivo: string; feitas: number; total: number; totais: Totais; ignoradasArquivo: number } | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const [versao, setVersao] = useState(0)

  // chaves reais de segmento_rbr no banco para cada um dos 18 segmentos
  const chavesPorSlug = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const k of Object.keys(exemplos ? contarExemplo() : contagem)) { const s = slugDoSegmento(k); if (s) (m[s] ??= []).push(k) }
    return m
  }, [contagem, exemplos])
  const segmentosParaBusca = useMemo(() => segsMarcados.flatMap((s) => chavesPorSlug[s] ?? []), [segsMarcados, chavesPorSlug])

  useEffect(() => {
    if (exemplos) return
    void Promise.resolve(db.rpc('radar_contagem_segmentos')).then(({ data, error }) => { if (error) setErro(mensagemDeErro(error.message)); else setContagem((data ?? {}) as Record<string, number>) })
    void Promise.resolve(db.from('prospeccao_buscas_salvas').select('id, nome, filtros').order('criado_em', { ascending: false })).then(({ data }) => setSalvas((data ?? []) as Salva[]))
  }, [exemplos, versao])

  const filtrosEfetivos: FiltrosBusca = useMemo(() => ({ ...f, segmentos: segmentosParaBusca, pagina, tamanho: TAM }), [f, segmentosParaBusca, pagina])
  useEffect(() => {
    let vivo = true
    setCarregando(true)
    if (exemplos) {
      const l = filtrarBase(EXEMPLO_BASE, filtrosEfetivos).sort((a, b) => (a.prioridade ?? 'Z').localeCompare(b.prioridade ?? 'Z'))
      const k = kpisBusca(l)
      setRes({ total: k.encontradas, com_dominio: k.comDominio, prontas: k.prontas, km_medio: k.kmMedio, linhas: l.slice((pagina - 1) * TAM, pagina * TAM) })
      setErro(null); setCarregando(false)
      return
    }
    const t = setTimeout(() => {
      void Promise.resolve(db.rpc('radar_buscar_base', { p_filtros: filtrosParaRpc(filtrosEfetivos) })).then(({ data, error }) => {
        if (!vivo) return
        setCarregando(false)
        if (error) { setErro(mensagemDeErro(error.message)); setRes(null) } else { setErro(null); setRes(data as Resposta) }
      })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [filtrosEfetivos, exemplos, pagina, versao])

  const muda = (p: Partial<FiltrosBusca>) => { setF((x) => ({ ...x, ...p })); setPagina(1) }
  const alternaSeg = (slug: string) => { setSegsMarcados((x) => (x.includes(slug) ? x.filter((s) => s !== slug) : [...x, slug])); setPagina(1) }
  const alternaPorte = (p: string) => muda({ portes: f.portes.includes(p) ? f.portes.filter((x) => x !== p) : [...f.portes, p] })
  const nPaginas = Math.max(1, Math.ceil((res?.total ?? 0) / TAM))
  const contagemPorSlug = (slug: string) => (chavesPorSlug[slug] ?? []).reduce((s, k) => s + ((exemplos ? contarExemplo() : contagem)[k] ?? 0), 0)

  async function importar(arquivos: FileList | null) {
    if (!arquivos?.length) return
    for (const arq of Array.from(arquivos)) {
      const gig = /gigante/i.test(arq.name)
      const texto = await arq.text()
      const prep = prepararImportacaoBase(texto, { gigantes: gig })
      const blocos = emBlocos(prep.validas, TAMANHO_BLOCO)
      let totais: Totais = { novos: 0, atualizados: 0, ignorados: prep.ignoradas.length }
      setImportando({ arquivo: arq.name, feitas: 0, total: prep.validas.length, totais, ignoradasArquivo: prep.ignoradas.length })
      let feitas = 0
      for (const b of blocos) {
        const { data, error } = await db.rpc('radar_importar_base', { p_linhas: b })
        if (error) { toast(`Falha no bloco ${Math.floor(feitas / TAMANHO_BLOCO) + 1}: ${mensagemDeErro(error.message)}`); break }
        totais = somarTotais(totais, data as Partial<Totais>)
        feitas += b.length
        setImportando({ arquivo: arq.name, feitas, total: prep.validas.length, totais, ignoradasArquivo: prep.ignoradas.length })
      }
      try { await auditar('prospeccao_base_importada', { arquivo: arq.name, gigantes: gig, linhas: prep.validas.length + prep.ignoradas.length, ...totais }) } catch { /* auditoria é melhor esforço aqui; o RPC já grava o essencial */ }
      toast(`${arq.name}: ${totais.novos} novas, ${totais.atualizados} atualizadas, ${totais.ignorados} ignoradas`)
    }
    if (arquivo.current) arquivo.current.value = ''
    setVersao((v) => v + 1)
  }

  async function mandar(qualificado: boolean) {
    if (exemplos) return toast(qualificado ? 'Exemplo: entrariam na fila do agente' : 'Exemplo: seriam adicionadas à lista')
    const { data, error } = await db.rpc('radar_mandar_para_lista', { p_cnpjs: [...sel], p_qualificado: qualificado })
    if (error) return toast(mensagemDeErro(error.message))
    const r = data as { novas: number; ja_existiam: number; bloqueadas: number; sem_segmento: number }
    toast(`${r.novas} novas na lista${r.ja_existiam ? `, ${r.ja_existiam} já estavam` : ''}${r.bloqueadas ? `, ${r.bloqueadas} bloqueadas` : ''}${r.sem_segmento ? `, ${r.sem_segmento} sem segmento` : ''}`)
    setSel(new Set()); setVersao((v) => v + 1); recarregar()
  }
  async function salvarBusca() {
    if (!nomeBusca?.trim()) return
    if (exemplos) { setNomeBusca(null); return toast('Exemplo: a busca seria salva') }
    const { error } = await db.from('prospeccao_buscas_salvas').insert({ nome: nomeBusca.trim(), filtros: { ...f, segmentos: segsMarcados } })
    if (error) return toast(mensagemDeErro(error.message))
    setNomeBusca(null); setVersao((v) => v + 1); toast('Busca salva')
  }
  function exportar() {
    const linhas = (res?.linhas ?? []).filter((e) => sel.has(e.cnpj))
    const csv = ['cnpj;razao_social;segmento;municipio;km;email', ...linhas.map((e) => [e.cnpj, e.razao_social, e.segmento_rbr, e.municipio, e.distancia_km, e.email].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'radar-selecao.csv'; a.click()
  }

  const linhas = res?.linhas ?? []
  const todasMarcadas = linhas.length > 0 && linhas.every((e) => sel.has(e.cnpj))
  return (
    <>
      <Acoes>
        <input ref={arquivo} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => void importar(e.target.files)} />
        <button className="btn" disabled={exemplos || !!importando && importando.feitas < importando.total} title={exemplos ? 'Saia dos exemplos para importar' : ''} onClick={() => arquivo.current?.click()}><Ic n="dl" />Importar base da Receita</button>
      </Acoes>
      {exemplos && <FaixaExemplo />}
      <AvisoErro erro={exemplos ? null : erro} />
      {importando && (
        <div className="card pad">
          <div className="between"><b>Importando {importando.arquivo}</b><span className="mono sm">{importando.feitas.toLocaleString('pt-BR')} de {importando.total.toLocaleString('pt-BR')}</span></div>
          <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${importando.total ? (importando.feitas / importando.total) * 100 : 100}%`, background: 'var(--goldbtn)' }} /></div>
          <p className="xs muted" style={{ marginTop: 8 }}>{importando.totais.novos.toLocaleString('pt-BR')} novas · {importando.totais.atualizados.toLocaleString('pt-BR')} atualizadas · {importando.totais.ignorados.toLocaleString('pt-BR')} ignoradas (CNPJ inválido, MEI, repetido ou sem razão social)</p>
        </div>
      )}
      <div className="bwrap">
        <div className="card filters">
          <div className="fs"><h4>Região <span className="mono faint">{f.raio} km</span></h4>
            <select className="inp" value="sp" onChange={() => undefined} aria-label="Ponto de partida"><option value="sp">a partir de São Paulo (capital)</option></select>
            <input type="range" className="range" min={10} max={150} step={10} value={f.raio} aria-label="Raio em km" style={{ marginTop: 12 }} onChange={(e) => muda({ raio: Number(e.target.value) })} />
          </div>
          <div className="fs"><h4>Segmentos</h4>
            {SEGMENTOS_RADAR.map((s) => (
              <label key={s.slug} className="check"><input type="checkbox" checked={segsMarcados.includes(s.slug)} onChange={() => alternaSeg(s.slug)} />{s.label}<span className="n">{contagemPorSlug(s.slug).toLocaleString('pt-BR')}</span></label>
            ))}
            <p className="xs faint" style={{ marginTop: 6 }}>{segsMarcados.length ? `${segsMarcados.length} marcados` : 'Nenhum marcado = todos'}</p>
          </div>
          <div className="fs"><h4>Porte</h4>
            <div className="ufs">
              {['ME', 'EPP', 'Demais'].map((p) => <button key={p} className="tog" aria-pressed={f.portes.includes(p)} onClick={() => alternaPorte(p)}>{p}</button>)}
              <button className="tog" aria-pressed={f.gigantes} onClick={() => muda({ gigantes: !f.gigantes })}>Gigantes</button>
            </div>
            <p className="xs faint" style={{ marginTop: 8 }}>MEI fica sempre de fora.</p>
          </div>
          <div className="fs"><h4>Contato</h4>
            <label className="check"><input type="checkbox" checked={f.so_email} onChange={(e) => muda({ so_email: e.target.checked })} />Só com e-mail</label>
            <label className="check"><input type="checkbox" checked={f.so_validado} onChange={(e) => muda({ so_validado: e.target.checked })} />Só domínio validado (recebe e-mail)</label>
            <label className="check"><input type="checkbox" checked={f.so_nova} onChange={(e) => muda({ so_nova: e.target.checked })} />Só quem nunca recebeu</label>
          </div>
          <div className="fs"><h4>Nome, cidade ou CNAE</h4><div className="search"><Ic n="buscar" /><input value={f.q} placeholder="ex.: estrutura, LED, ração" onChange={(e) => muda({ q: e.target.value })} /></div></div>
          <div className="fs row">
            <button className="btn sm ghost" onClick={() => { setF(FILTROS_PADRAO); setSegsMarcados([]); setPagina(1) }}>Limpar</button>
            {nomeBusca === null ? <button className="btn sm" onClick={() => setNomeBusca('')}>Salvar esta busca</button> : (
              <span className="row" style={{ flexWrap: 'nowrap' }}><input className="inp" style={{ padding: '5px 8px' }} placeholder="Nome da busca" value={nomeBusca} autoFocus onChange={(e) => setNomeBusca(e.target.value)} /><button className="btn sm pri" onClick={() => void salvarBusca()}>Salvar</button></span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="saved"><span className="lab" style={{ alignSelf: 'center' }}>Buscas salvas</span>
            {salvas.length === 0 && <span className="xs faint" style={{ alignSelf: 'center' }}>nenhuma ainda</span>}
            {salvas.map((s) => <button key={s.id} className="tog" onClick={() => { const { segmentos, ...resto } = s.filtros; setF({ ...FILTROS_PADRAO, ...resto, segmentos: [] }); setSegsMarcados(segmentos ?? []); setPagina(1) }}>{s.nome}</button>)}
          </div>
          <div className="kpi" style={{ ['--n' as string]: 4 }}>
            <div><b>{(res?.total ?? 0).toLocaleString('pt-BR')}</b><span>encontradas</span></div><div><b>{(res?.com_dominio ?? 0).toLocaleString('pt-BR')}</b><span>com domínio validado</span></div>
            <div><b style={{ color: 'var(--gold)' }}>{(res?.prontas ?? 0).toLocaleString('pt-BR')}</b><span>prontas (e-mail válido, fora da lista)</span></div><div><b>{res?.km_medio ?? 0}</b><span>km de distância média</span></div>
          </div>
          {sel.size > 0 && (
            <div className="selbar on"><b>{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</b><span style={{ flex: 1 }} />
              <button className="btn sm" onClick={() => void mandar(false)}>Mandar para a lista</button>
              <button className="btn sm" onClick={() => void mandar(true)}>Mandar para o agente</button>
              <button className="btn sm" onClick={exportar}>Exportar</button>
            </div>
          )}
          <div className="card tw" style={{ opacity: carregando ? 0.6 : 1 }}>
            <table className="t">
              <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Selecionar a página" checked={todasMarcadas} onChange={(e) => setSel((s) => { const n = new Set(s); linhas.forEach((l) => (e.target.checked ? n.add(l.cnpj) : n.delete(l.cnpj))); return n })} /></th><th>Empresa</th><th>Segmento</th><th>Cidade</th><th>Porte</th><th>E-mail</th><th style={{ textAlign: 'right' }}>Prioridade</th></tr></thead>
              <tbody>
                {linhas.length === 0 ? <tr><td colSpan={7}><Vazio>{res === null && erro ? 'Não foi possível buscar.' : (res?.total ?? 0) === 0 && !Object.keys(contagem).length && !exemplos ? 'A base ainda está vazia. Use "Importar base da Receita" com o arquivo rbr-validadas.csv.' : 'Nenhuma empresa com esses filtros. Aumente o raio ou marque mais segmentos.'}</Vazio></td></tr> : linhas.map((e) => (
                  <tr key={e.cnpj} onClick={(ev) => { if ((ev.target as HTMLElement).closest('input')) return; irPara('empresas') }}>
                    <td><input type="checkbox" aria-label={`Selecionar ${e.razao_social}`} checked={sel.has(e.cnpj)} onChange={(ev) => setSel((s) => { const n = new Set(s); if (ev.target.checked) n.add(e.cnpj); else n.delete(e.cnpj); return n })} /></td>
                    <td className="e"><b>{e.nome_fantasia || e.razao_social}</b><span>{e.razao_social !== (e.nome_fantasia || e.razao_social) ? e.razao_social : e.cnpj}{e.ja_na_lista ? ' · já na lista' : ''}</span>{e.restricao && <span className="chip warn" style={{ marginLeft: 6 }} title={RESTRICAO_LABEL[e.restricao]}>{e.restricao}</span>}{e.gigante && <span className="chip" style={{ marginLeft: 6 }}>gigante</span>}</td>
                    <td>{e.segmento_rbr}</td><td>{e.municipio} <span className="faint mono xs">{e.distancia_km != null ? `${Math.round(e.distancia_km)} km` : ''}</span></td><td>{e.porte}</td>
                    <td>{e.email ? (e.dominio_valido ? <span className="chip ok">validado</span> : <span className="chip warn">a validar</span>) : <span className="chip">sem e-mail</span>}</td>
                    <td style={{ textAlign: 'right' }}><b className="mono" style={{ color: e.prioridade === 'A' ? 'var(--gold)' : 'var(--ink)' }}>{e.prioridade ?? '—'}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="xs faint">{exemplos ? 'Resultado de exemplo.' : 'A busca roda no banco, 50 por página, ordenada por prioridade e distância.'}</span>
            <span className="row"><button className="btn sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button><span className="mono xs">{pagina} / {nPaginas}</span><button className="btn sm" disabled={pagina >= nPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button></span>
          </div>
        </div>
      </div>
    </>
  )
}
function contarExemplo(): Record<string, number> {
  const c: Record<string, number> = {}
  for (const e of EXEMPLO_BASE) if (e.segmento_rbr) c[e.segmento_rbr] = (c[e.segmento_rbr] ?? 0) + 1
  return c
}
