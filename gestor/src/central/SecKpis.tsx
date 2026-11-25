// Quatro cartões de resultado. O que o Radar já mostra (respostas, leads quentes, gasto de IA) não se repete aqui.
import { useState } from 'react'
import { fmtN, useCentral } from './ctx'
import { salvarMetas } from '../lib/centralDbF3'
import type { Contagens } from '../lib/centralDb'

const CHAVE_METAS = 'central-metas'
const PADRAO = { contatos: 1000, base: 5000 }
function lerMetas(): typeof PADRAO {
  try { return { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE_METAS) ?? '{}') as object) } } catch { return PADRAO }
}
function veredito(v: number, meta: number): ['on' | 'wn' | 'bd', string] {
  if (!(meta > 0)) return ['wn', 'sem meta']
  const r = v / meta
  return r >= 1 ? ['on', 'na meta ou acima'] : r >= 0.8 ? ['wn', 'atenção'] : ['bd', 'abaixo']
}

export default function SecKpis({ c, esperandoVoce, fila, metas: metasBanco }: { c: Contagens | null; esperandoVoce: number; fila: number; metas: typeof PADRAO }) {
  const { flags, executar } = useCentral()
  const temParametro = flags.CENTRAL_METAS != null
  const [metas, setMetas] = useState(temParametro ? metasBanco : lerMetas)
  const mudar = (k: keyof typeof PADRAO, v: number) => {
    const n = { ...metas, [k]: v }
    setMetas(n)
    if (temParametro) return
    try { localStorage.setItem(CHAVE_METAS, JSON.stringify(n)) } catch { /* sem armazenamento: a meta vale só nesta tela */ }
  }
  const gravar = () => { if (temParametro && (metas.contatos !== metasBanco.contatos || metas.base !== metasBanco.base)) void executar(async () => { await salvarMetas(metas, metasBanco); return 'Meta salva.' }) }
  const cont = c?.comEmail ?? 0, base = c?.naBase ?? 0
  const [cc, cl] = veredito(cont, metas.contatos)
  const [bc, bl] = veredito(base, metas.base)
  return (
    <section id="kpis" aria-label="Resultados de hoje">
      <div className="kp4">
        <div className={`kc ${c ? cc : ''}`}>
          <div className="top2"><span className="nm">Contatos achados</span>{c && <span className={`pill ${cc}`}>{cl}</span>}</div>
          <div className="v">{c ? fmtN(cont) : '…'}</div>
          <div className="tx"><b>Por quê:</b> {cont === 0 ? 'Ainda não há e-mails na base do TMS.' : `E-mails achados na base, em ${fmtN(cont)} empresas.`}</div>
          <div className="tx"><b>Fazer:</b> {cont === 0 ? 'Envie a lista para a base do TMS.' : cc === 'on' ? 'Nada. Siga.' : 'Rode a LISTAS para achar mais.'}</div>
          <div className="ft">Meta <input type="number" min={0} value={metas.contatos} onChange={(e) => mudar('contatos', Number(e.target.value))} aria-label="Meta de contatos achados" onBlur={gravar} /></div>
        </div>
        <div className={`kc ${c ? bc : ''}`}>
          <div className="top2"><span className="nm">Empresas na base do TMS</span>{c && <span className={`pill ${bc}`}>{bl}</span>}</div>
          <div className="v">{c ? fmtN(base) : '…'}</div>
          <div className="tx"><b>Por quê:</b> Só entram na prospecção as empresas que já estão na base.</div>
          <div className="tx"><b>Fazer:</b> {base === 0 ? 'Use o botão Enviar para a base do TMS, logo abaixo.' : bc === 'on' ? 'Nada. Siga.' : 'Envie a próxima lista.'}</div>
          <div className="ft">Meta <input type="number" min={0} value={metas.base} onChange={(e) => mudar('base', Number(e.target.value))} aria-label="Meta de empresas na base" onBlur={gravar} /></div>
        </div>
        <div className={`kc ${esperandoVoce === 0 ? 'on' : 'wn'}`}>
          <div className="top2"><span className="nm">Esperando você</span><span className={`pill ${esperandoVoce === 0 ? 'on' : 'wn'}`}>{esperandoVoce === 0 ? 'em dia' : 'atenção'}</span></div>
          <div className="v">{fmtN(esperandoVoce)}</div>
          <div className="tx"><b>Por quê:</b> Avisos e sugestões que só você decide.</div>
          <div className="tx"><b>Fazer:</b> {esperandoVoce === 0 ? 'Nada. Os robôs cuidam do resto.' : 'Veja a Mesa de despacho.'}</div>
        </div>
        <div className={`kc ${fila > 0 ? 'wn' : ''}`}>
          <div className="top2"><span className="nm">Leads na fila do SDR</span><span className={`pill ${fila > 0 ? 'wn' : ''}`}>{fila > 0 ? 'esperando' : 'vazia'}</span></div>
          <div className="v">{fmtN(fila)}</div>
          <div className="tx"><b>Por quê:</b> Quem respondeu e quem tem telefone com nota alta.</div>
          <div className="tx"><b>Fazer:</b> {fila > 0 ? 'Alguém precisa assumir.' : 'Nada por enquanto.'}</div>
        </div>
      </div>
    </section>
  )
}
