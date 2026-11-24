// Pré-voo do primeiro envio: 7 itens. O que dá para conferir no banco é conferido sozinho; só SPF/DKIM/DMARC e descadastrar@ são marcados por você.
import { calcularPrevoo, type EntradaPrevoo } from '../lib/central'
import { marcarPrevoo } from '../lib/centralDbF3'
import { gravarFlag, registrar } from '../lib/centralDb'
import { efeitoDaChave } from '../lib/central'
import { useCentral } from './ctx'

export default function SecPrevoo({ entrada }: { entrada: EntradaPrevoo | null }) {
  const { flags, confirmar, executar } = useCentral()
  if (!entrada) return <section className="card" id="preflight"><div className="hd"><div><h2>Pronto para o primeiro envio?</h2><p>Conferindo…</p></div></div></section>
  const p = calcularPrevoo(entrada)
  const marcas = entrada.marcas ?? {}

  async function guarda(chave: string, robo: string, nome: string) {
    const ligar = flags[chave] !== 'sim'
    const e = efeitoDaChave(robo, ligar)
    if (!(await confirmar({ titulo: e.titulo, texto: `${e.efeito}\n\nChave: ${chave}`, ok: ligar ? 'Ligar' : 'Desligar', perigoso: e.perigoso }))) return
    await executar(async () => {
      await gravarFlag(chave, ligar ? 'sim' : 'nao')
      await registrar(`${ligar ? 'Ligou' : 'Desligou'} "${nome}"`, { tipo: 'flag', chave, valor: flags[chave] ?? null }, { tipo: 'flag', chave, valor: ligar ? 'sim' : 'nao' })
      return `${nome}: ${ligar ? 'ligado' : 'desligado'}.`
    })
  }

  return (
    <section className="card" id="preflight">
      <div className="hd"><div><h2>Pronto para o primeiro envio?</h2><p>Os robôs de enviar e de ler só ligam quando tudo abaixo estiver certo. Assim a primeira campanha não sai com falha.</p></div><span className={`stt ${p.completo ? 'ok' : 'wn'}`}>{p.feitos} de {p.total}</span></div>
      <div className="bar" aria-hidden><i style={{ width: `${(p.feitos / p.total) * 100}%` }} /></div>
      <div className="pf">
        <div>
          {p.itens.map((i) => (
            <div className={`pfi ${i.feito ? 'done' : ''}`} key={i.id}>
              <span className="ck">{i.feito ? '✓' : '○'}</span>
              <div><div className="nm">{i.nome}</div><div className="ds">{i.feito ? 'Pronto.' : i.detalhe}</div></div>
              {i.manual
                ? <button className="sm" disabled={entrada.marcas == null} onClick={() => void executar(async () => { await marcarPrevoo(i.id as 'dns' | 'descadastrar', !i.feito, marcas); return i.feito ? 'Desmarcado.' : 'Marcado.' })}>{i.feito ? 'Desmarcar' : 'Marcar feito'}</button>
                : <span />}
            </div>
          ))}
        </div>
        <div>
          <div className="lbl" style={{ marginTop: 0 }}>As duas travas</div>
          {([['PROSPECCAO_APROVACAO_OBRIGATORIA', 'aprovacao', 'Aprovação obrigatória', 'Todo e-mail só sai depois do seu ok.'], ['PROSPECCAO_MODO_TESTE', 'modo_teste', 'Modo teste', 'E-mails só saem para endereços de teste.']] as const).map(([chave, robo, nome, d]) => (
            <div className="guard" key={chave}>
              <label className="sw"><input type="checkbox" role="switch" checked={flags[chave] === 'sim'} aria-label={nome} onChange={() => void guarda(chave, robo, nome)} /><i /></label>
              <div><div className="nm">{nome}</div><div className="ds">{d}</div><div className="mt" style={{ marginTop: 4 }}><span className="mini" style={{ fontFamily: 'var(--mono)' }}>{chave}</span></div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
