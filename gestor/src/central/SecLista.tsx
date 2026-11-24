// Lista de clientes: cartões, botão "Enviar para a base do TMS" (com progresso por lote) e tabela paginada no servidor.
// Tudo vem de consultas ao banco (prospeccao_base); nenhum arquivo ou pasta é aberto por aqui.
import { useEffect, useState } from 'react'
import { batimentoAtrasado, faltamNaBase, fracaoProgresso, loteNovo, resumoDaLista, textoProgresso, verificacaoRotulo } from '../lib/central'
import { gravarFlag, paginaContatos, pedirImportacao, registrar, type Contagens, type FiltroContatos, type LinhaContato } from '../lib/centralDb'
import { fmtData, fmtN, ultimoBatimento, useCentral } from './ctx'

const TAM = 15
const FILTRO0: FiltroContatos = { q: '', contato: '', verif: '', situacao: '', pagina: 0, tam: TAM }

export default function SecLista({ c, abrirImportacao, onMudou }: { c: Contagens | null; abrirImportacao: number; onMudou: () => void }) {
  const { painel, flags, agora, confirmar, executar } = useCentral()
  const bat = ultimoBatimento(painel)
  const lista = resumoDaLista(bat?.resumo_json)
  const faltam = faltamNaBase(lista, c?.naBase ?? 0)
  const imp = painel.comandos.find((x) => x.comando === 'importar_base')
  const emCurso = imp && ['pendente', 'executando'].includes(imp.status)
  const semAgente = batimentoAtrasado(bat?.ultimo_batimento, agora)
  const auto = flags.CENTRAL_IMPORTAR_AUTO === 'sim'

  const [f, setF] = useState<FiltroContatos>(FILTRO0)
  const [busca, setBusca] = useState('')
  const [dados, setDados] = useState<{ linhas: LinhaContato[]; total: number } | null>(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q: busca, pagina: 0 })), 350); return () => clearTimeout(t) }, [busca])
  useEffect(() => {
    let vivo = true
    setErro('')
    paginaContatos(f).then((r) => { if (vivo) setDados(r) }, (e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao ler a lista.') })
    return () => { vivo = false }
  }, [f, c?.naBase])

  async function enviar() {
    if (!lista) return
    const ok = await confirmar({
      titulo: 'Enviar a lista para a base do TMS?',
      texto: `Vou enviar ${fmtN(lista.empresas)} empresas e ${fmtN(lista.contatos)} contatos para a base do TMS.\n\nNão apaga nada, não envia e-mail e não liga o robô de envio. Se a empresa já estiver na base, ela só é atualizada.`,
      ok: 'Enviar',
    })
    if (ok) await executar(async () => { await pedirImportacao(loteNovo(new Date()), lista.empresas, lista.contatos); onMudou(); return 'Pedido enviado ao agente. O progresso aparece aqui.' })
  }
  useEffect(() => { if (abrirImportacao > 0 && !emCurso && lista) void enviar() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [abrirImportacao])

  async function mudarAuto(ligar: boolean) {
    const antes = flags.CENTRAL_IMPORTAR_AUTO ?? 'nao'
    await executar(async () => {
      await gravarFlag('CENTRAL_IMPORTAR_AUTO', ligar ? 'sim' : 'nao')
      await registrar(`${ligar ? 'Ligou' : 'Desligou'} "Enviar sozinho quando a LISTAS terminar"`, { tipo: 'flag', chave: 'CENTRAL_IMPORTAR_AUTO', valor: antes }, { tipo: 'flag', chave: 'CENTRAL_IMPORTAR_AUTO', valor: ligar ? 'sim' : 'nao' })
      return ligar ? 'Ligado: ao terminar a LISTAS, a lista segue para a base.' : 'Desligado.'
    })
  }

  const totalPag = dados ? Math.max(1, Math.ceil(dados.total / TAM)) : 1
  const gerais = c ? Math.max(0, c.comEmail - c.setorCerto) : 0
  const stt = emCurso ? ['enviando', 'ic'] : faltam > 0 ? [`${fmtN(faltam)} a enviar`, 'wn'] : c && c.naBase > 0 ? ['em dia', 'ok'] : ['vazia', 'wn']
  const prog = imp?.progresso

  return (
    <section className="card" id="lista">
      <div className="hd"><div><h2>Lista de clientes</h2><p>Veja os contatos achados e mande a lista para a base do TMS com um botão. Nada de abrir arquivo.</p></div><span className={`stt ${stt[1]}`}>{stt[0]}</span></div>
      <div className="lc">
        <div className="lk2 big"><div className="nm">Contatos achados</div><div className="v">{c ? fmtN(c.comEmail) : '…'}</div><div className="tx">e-mails achados, em {c ? fmtN(c.comEmail) : '…'} empresas</div></div>
        <div className="lk2"><div className="nm">Do setor certo</div><div className="v">{c ? fmtN(c.setorCerto) : '…'}</div><div className="tx">compras@, logistica@ e parecidos</div></div>
        <div className="lk2"><div className="nm">Gerais</div><div className="v">{c ? fmtN(gerais) : '…'}</div><div className="tx">contato@ e parecidos</div></div>
        <div className="lk2"><div className="nm">Com telefone</div><div className="v">{c ? fmtN(c.telefones) : '…'}</div><div className="tx">empresas com telefone</div></div>
        <div className="lk2"><div className="nm">Empresas com contato</div><div className="v">{c ? fmtN(c.comEmail) : '…'}</div><div className="tx">com ao menos um e-mail</div></div>
        <div className="lk2"><div className="nm">Na base do TMS</div><div className="v">{c ? fmtN(c.naBase) : '…'}</div><div className="tx">empresas já enviadas</div></div>
        <div className="lk2"><div className="nm">Esperando envio</div><div className="v">{c ? fmtN(c.esperandoEnvio) : '…'}</div><div className="tx">e-mails aprovados que ainda não saíram</div></div>
      </div>

      <div className="imp">
        <div>
          <div className="nm">{lista ? `${fmtN(lista.empresas)} empresas e ${fmtN(lista.contatos)} contatos prontos na lista` : 'O agente ainda não informou o tamanho da lista'}</div>
          <div className="ds">{lista ? (faltam > 0 ? `${fmtN(faltam)} ainda não estão na base do TMS.${lista.gerada_em ? ` Lista gerada em ${fmtData(lista.gerada_em)}.` : ''}` : 'Tudo da lista já está na base do TMS.') : 'Quando a LISTAS terminar e o agente estiver ligado, o tamanho da lista aparece aqui.'}</div>
          {emCurso && imp && <><div className="bar" aria-hidden><i style={{ width: `${Math.round(fracaoProgresso(prog) * 100)}%` }} /></div><div className="ds" role="status">{textoProgresso(prog)}</div></>}
          {imp?.status === 'feito' && <div className="okline">Último envio concluído: {textoProgresso(prog)}</div>}
          {imp?.status === 'erro' && <div className="ds" style={{ color: 'var(--bad)' }}>O último envio deu erro: {imp.resultado ?? 'sem detalhe'}</div>}
          <label className="ds" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <span className="sw"><input type="checkbox" role="switch" checked={auto} onChange={(e) => void mudarAuto(e.target.checked)} aria-label="Enviar sozinho quando a LISTAS terminar" /><i /></span>
            Enviar sozinho quando a LISTAS terminar
          </label>
        </div>
        <button className="pri big" disabled={!lista || !!emCurso || semAgente || faltam === 0} title={semAgente ? 'O agente do PC não está conectado.' : undefined} onClick={() => void enviar()}>Enviar para a base do TMS</button>
      </div>

      <div className="lbl">Contatos e empresas</div>
      <div className="flt">
        <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, cidade ou e-mail" aria-label="Buscar" />
        <select aria-label="Filtrar por contato" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value as FiltroContatos['contato'], pagina: 0 })}>
          <option value="">Contato: todos</option><option value="com">Com e-mail</option><option value="setor">Do setor certo</option><option value="geral">Só geral (contato@)</option><option value="sem">Sem e-mail</option>
        </select>
        <select aria-label="Filtrar por verificação" value={f.verif} onChange={(e) => setF({ ...f, verif: e.target.value as FiltroContatos['verif'], pagina: 0 })}>
          <option value="">Verificação: todas</option><option value="valido">Válido</option><option value="pendente">Pendente</option><option value="invalido">Inválido</option>
        </select>
        <select aria-label="Filtrar por situação" value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as FiltroContatos['situacao'], pagina: 0 })}>
          <option value="">Situação: todas</option><option value="lista">Já na lista do Radar</option><option value="base">Só na base do TMS</option>
        </select>
        <span className="ds">{dados ? `${fmtN(dados.total)} encontrados` : ''}</span>
      </div>
      {erro && <div className="ds" role="alert" style={{ color: 'var(--bad)' }}>{erro}</div>}
      <div className="tb">
        <table>
          <thead><tr><th>Empresa</th><th>Cidade</th><th>Segmento</th><th>E-mail achado</th><th>Tipo</th><th>Verificação</th><th>Telefone</th><th>Nota</th><th>Situação</th></tr></thead>
          <tbody>
            {dados && dados.linhas.length === 0 && <tr><td colSpan={9} className="ds">{c && c.naBase === 0 ? 'A base do TMS ainda está vazia. Envie a lista pelo botão acima.' : 'Nada encontrado com esses filtros.'}</td></tr>}
            {dados?.linhas.map((l) => {
              const v = verificacaoRotulo(l.email_verificado)
              return (
                <FragmentoLinha key={l.cnpj} aberta={aberta === l.cnpj} onClick={() => setAberta(aberta === l.cnpj ? null : l.cnpj)} l={l}
                  celulas={<>
                    <td><div className="nm">{l.nome_fantasia || l.razao_social}</div></td>
                    <td>{[l.municipio, l.uf].filter(Boolean).join('/')}</td>
                    <td>{l.segmento_rbr ?? '—'}</td>
                    <td>{l.melhor_email ?? '—'}</td>
                    <td>{l.tipo === 'setor' ? <span className="pill on">setor certo</span> : l.tipo === 'geral' ? <span className="pill">geral</span> : '—'}</td>
                    <td><span className={`pill ${v.nivel === 'neutro' ? '' : v.nivel}`}>{v.rotulo}</span></td>
                    <td>{l.telefone1 ?? '—'}</td>
                    <td>{l.pontuacao ?? '—'}</td>
                    <td>{l.ja_na_lista ? 'na lista' : 'na base'}</td>
                  </>}
                  detalhe={`E-mail veio de: ${l.site_encontrado ? `site ${l.site_encontrado}` : 'origem não informada'} · importado em ${fmtData(l.importado_em)}${l.lote_importacao ? ` · envio ${l.lote_importacao}` : ''} · verificação: ${verificacaoRotulo(l.email_verificado).rotulo.toLowerCase()}`}
                />
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="pg">
        <button className="sm" disabled={f.pagina === 0} onClick={() => setF({ ...f, pagina: f.pagina - 1 })}>Anterior</button>
        <span>Página {f.pagina + 1} de {totalPag}</span>
        <button className="sm" disabled={f.pagina + 1 >= totalPag} onClick={() => setF({ ...f, pagina: f.pagina + 1 })}>Próxima</button>
      </div>
    </section>
  )
}

function FragmentoLinha({ l, celulas, aberta, onClick, detalhe }: { l: LinhaContato; celulas: React.ReactNode; aberta: boolean; onClick: () => void; detalhe: string }) {
  return (
    <>
      <tr className="rw" tabIndex={0} aria-expanded={aberta} data-cnpj={l.cnpj} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}>{celulas}</tr>
      {aberta && <tr className="dt"><td colSpan={9}>{detalhe}</td></tr>}
    </>
  )
}
