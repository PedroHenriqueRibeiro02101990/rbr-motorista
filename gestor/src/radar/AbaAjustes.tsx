// R10: Ajustes (absorve a antiga "Saúde do envio"): chaves, caixas, horário e ritmo, assinatura, paradas automáticas, avisos e lista de bloqueio.
import { useState } from 'react'
import { auditar, db } from '../lib/prospeccaoDb'
import { CHAVES_AJUSTES, bloqueioDoTexto, estadoCaixa, podeAlterarChave } from '../lib/radar'
import Caixas from '../components/prospeccao/Caixas'
import IaCusto from '../components/prospeccao/IaCusto'
import { AvisoErro, Ic, mensagemDeErro, quando, toast, useConsulta, useRadar } from './ui'

type Caixa = { id: string; endereco: string; papel: string; ativa: boolean; limite_diario: number; segredo_senha: string; assinatura: string; parada_motivo: string | null }
type Rampa = { dia_inicio: number; limite: number }
type Bloq = { id: string; tipo: 'email' | 'dominio'; valor: string; motivo: string; criado_em: string }
const PAPEL: Record<string, string> = { agente_1: 'Agente 1', agente_2: 'Agente 2 · assina como Pedro', reserva: 'Fora da prospecção, protege a operação' }
const AVISO_SAIDA: Record<string, string> = {
  PROSPECCAO_MODO_TESTE: 'Atenção: sem o modo teste, o agente envia para empresas de verdade.',
  PROSPECCAO_APROVACAO_OBRIGATORIA: 'Atenção: sem aprovação obrigatória, o agente aprova e envia sozinho.',
}

export default function AbaAjustes() {
  const { exemplos, flags, ehPedro, recarregar, tick } = useRadar()
  const [versao, setVersao] = useState(0)
  const [troca, setTroca] = useState<{ chave: string; para: 'sim' | 'nao'; texto: string } | null>(null)
  const [novoBloq, setNovoBloq] = useState('')
  const [remover, setRemover] = useState<string | null>(null)
  const [assin, setAssin] = useState<Record<string, string>>({})
  const [rampaEd, setRampaEd] = useState<Rampa[] | null>(null)
  const [limite, setLimite] = useState<string | null>(null)
  const [tetoIa, setTetoIa] = useState<string | null>(null)

  const dados = useConsulta(async () => {
    const [cx, seg, ra, st, bl, ps, dt] = await Promise.all([
      db.from('prospeccao_caixas').select('id, endereco, papel, ativa, limite_diario, segredo_senha, assinatura, parada_motivo').order('papel'),
      db.rpc('prospeccao_segredos_status'),
      db.from('prospeccao_rampa').select('dia_inicio, limite').order('dia_inicio'),
      db.from('prospeccao_estado').select('parada_motivo, parada_em').eq('id', 1).maybeSingle(),
      db.from('prospeccao_bloqueio').select('*').order('criado_em', { ascending: false }),
      db.from('parametros_sistema').select('chave, valor').in('chave', ['PROSPECCAO_LIMITE_DIARIO', 'PROSPECCAO_IA_TETO_DIARIO_BRL']),
      db.from('prospeccao_destinos_teste').select('email'),
    ])
    const erro = [cx, ra, bl].find((r) => r.error)?.error ?? null
    return { data: {
      caixas: (cx.data ?? []) as Caixa[], senhas: Object.fromEntries(((seg.data ?? []) as { nome: string; cadastrado: boolean }[]).map((x) => [x.nome, x.cadastrado])) as Record<string, boolean>,
      rampa: (ra.data ?? []) as Rampa[], parada: (st.data ?? null) as { parada_motivo: string | null; parada_em: string | null } | null, bloqueios: (bl.data ?? []) as Bloq[],
      params: Object.fromEntries(((ps.data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, String(x.valor)])) as Record<string, string>, destinos: ((dt.data ?? []) as { email: string }[]).map((x) => x.email),
    }, error: erro }
  }, { caixas: [] as Caixa[], senhas: {} as Record<string, boolean>, rampa: [] as Rampa[], parada: null as { parada_motivo: string | null; parada_em: string | null } | null, bloqueios: [] as Bloq[], params: {} as Record<string, string>, destinos: [] as string[] }, [tick, versao])
  const d = dados.dados
  const refaz = () => { setVersao((v) => v + 1); recarregar() }
  const emExemplo = () => { if (exemplos) { toast('Saia dos exemplos para mudar os Ajustes de verdade.'); return true } return false }

  function pedirTroca(chave: string, para: 'sim' | 'nao') {
    if (emExemplo()) return
    if ((flags[chave] ?? 'nao') === para) return
    const c = CHAVES_AJUSTES.find((x) => x.chave === chave)!
    const arriscado = c.exigeLigar && para === 'sim'
    const aviso = para === 'nao' ? AVISO_SAIDA[chave] : undefined
    if (!ehPedro) return toast('Só o usuário do Pedro altera as chaves.')
    if (arriscado || aviso) return setTroca({ chave, para, texto: '' })
    void aplicarTroca(chave, para)
  }
  async function aplicarTroca(chave: string, para: 'sim' | 'nao', digitado?: string) {
    const erro = podeAlterarChave({ ehPedro, chave, novoValor: para, digitado })
    if (erro) return toast(erro)
    const { error } = await db.from('parametros_sistema').update({ valor: para, updated_at: new Date().toISOString() }).eq('chave', chave)
    if (error) return toast(mensagemDeErro(error.message))
    // o gatilho do banco já grava prospeccao_flag_alterada na auditoria_log
    setTroca(null); toast(`${CHAVES_AJUSTES.find((x) => x.chave === chave)?.rotulo}: ${para === 'sim' ? 'sim' : 'não'}`); refaz()
  }
  async function salvarAssinatura(c: Caixa) {
    if (emExemplo()) return
    const { error } = await db.from('prospeccao_caixas').update({ assinatura: (assin[c.id] ?? c.assinatura).trim() }).eq('id', c.id)
    if (error) return toast(mensagemDeErro(error.message)); try { await auditar('prospeccao_assinatura_editada', { caixa: c.endereco }) } catch { /* melhor esforço */ } toast('Assinatura salva'); refaz()
  }
  async function salvarRitmo() {
    if (emExemplo()) return
    for (const r of rampaEd ?? []) { const { error } = await db.from('prospeccao_rampa').update({ limite: Math.min(100, Math.max(0, r.limite)) }).eq('dia_inicio', r.dia_inicio); if (error) return toast(mensagemDeErro(error.message)) }
    if (limite !== null) { const n = Math.min(100, Math.max(0, Number(limite))); if (!Number.isFinite(n)) return toast('Limite inválido.'); const { error } = await db.from('parametros_sistema').update({ valor: n }).eq('chave', 'PROSPECCAO_LIMITE_DIARIO'); if (error) return toast(mensagemDeErro(error.message)) }
    if (tetoIa !== null) { const n = Number(tetoIa.replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 100) return toast('Teto de IA inválido.'); const { error } = await db.from('parametros_sistema').update({ valor: n }).eq('chave', 'PROSPECCAO_IA_TETO_DIARIO_BRL'); if (error) return toast(mensagemDeErro(error.message)) }
    try { await auditar('prospeccao_rampa_editada', { rampa: rampaEd, limite, tetoIa }) } catch { /* melhor esforço */ }
    setRampaEd(null); setLimite(null); setTetoIa(null); toast('Ajustes salvos'); refaz()
  }
  async function bloquear() {
    if (emExemplo()) return
    const b = bloqueioDoTexto(novoBloq)
    if (!b) return toast('Informe um e-mail, um domínio ou um CNPJ válido.')
    if (b.tipo === 'cnpj') {
      const { data: e } = await db.from('prospeccao_empresas').select('id, prospeccao_contatos(email)').eq('cnpj', b.valor).maybeSingle()
      const emp = e as { id: string; prospeccao_contatos: { email: string }[] } | null
      if (!emp) return toast('Nenhuma empresa da lista com esse CNPJ. Bloqueie pelo e-mail ou domínio.')
      for (const c of emp.prospeccao_contatos) await db.from('prospeccao_bloqueio').insert({ tipo: 'email', valor: c.email.toLowerCase(), motivo: 'manual' })
      await db.from('prospeccao_empresas').update({ status: 'descartado' }).eq('id', emp.id)
    } else {
      const { error } = await db.from('prospeccao_bloqueio').insert({ tipo: b.tipo, valor: b.valor, motivo: 'manual' })
      if (error) return toast(error.code === '23505' ? 'Já está na lista.' : error.code === '23514' ? 'Domínio de e-mail público não pode ser bloqueado inteiro: bloqueie o e-mail.' : mensagemDeErro(error.message))
    }
    setNovoBloq(''); toast('Bloqueado'); refaz()
  }
  async function removerBloq(b: Bloq) {
    const { error } = await db.from('prospeccao_bloqueio').delete().eq('id', b.id)
    if (error) return toast(mensagemDeErro(error.message))
    setRemover(null); toast('Removido da lista de bloqueio'); refaz()
  }

  const valorFlag = (c: string) => (flags[c] ?? (c === 'PROSPECCAO_APROVACAO_OBRIGATORIA' || c === 'PROSPECCAO_MODO_TESTE' ? 'sim' : 'nao')) === 'sim'
  const rampa = rampaEd ?? d.rampa
  const mostrarCaixas = exemplos ? [{ id: 'a', endereco: 'pedro@rbrcargo.com.br', papel: 'agente_1', ativa: true, limite_diario: 50, segredo_senha: 'PROSPECCAO_CAIXA_PEDRO_SENHA', assinatura: 'Pedro | RBR Cargo', parada_motivo: null }, { id: 'b', endereco: 'comercial@rbrcargo.com.br', papel: 'agente_2', ativa: true, limite_diario: 50, segredo_senha: 'x', assinatura: 'Pedro | RBR Cargo', parada_motivo: null }, { id: 'c', endereco: 'operacional@rbrcargo.com.br', papel: 'reserva', ativa: false, limite_diario: 0, segredo_senha: 'y', assinatura: 'RBR Cargo', parada_motivo: null }] as Caixa[] : d.caixas
  return (
    <>
      <AvisoErro erro={exemplos ? null : dados.erro} />
      {d.parada?.parada_motivo && <div className="note" style={{ background: 'var(--badbg)' }}><Ic n="info" /><div><b>O agente parou sozinho{d.parada.parada_em ? ` em ${quando(d.parada.parada_em)}` : ''}:</b> {d.parada.parada_motivo}. Para religar, ligue o envio abaixo.</div></div>}
      <div className="split">
        <div className="card pad"><h3 style={{ marginBottom: 6 }}>Chaves de liberação</h3><p className="xs faint" style={{ marginBottom: 6 }}>Só o Pedro altera. Para ligar envio, leitura ou resposta automática, digite LIGAR para confirmar. Tudo fica na auditoria.</p>
          {CHAVES_AJUSTES.map((c, i) => {
            const v = valorFlag(c.chave)
            return (
              <div key={c.chave} className="between" style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                <span>{c.rotulo}</span>
                <span className="seg"><button aria-pressed={!v} disabled={!ehPedro && !exemplos} onClick={() => pedirTroca(c.chave, 'nao')}>Não</button><button aria-pressed={v} disabled={!ehPedro && !exemplos} onClick={() => pedirTroca(c.chave, 'sim')}>Sim</button></span>
              </div>
            )
          })}
          {!ehPedro && !exemplos && <p className="xs faint" style={{ marginTop: 8 }}>Você não é o usuário do Pedro: as chaves estão só para leitura.</p>}
          {troca && (
            <div className="note" style={{ marginTop: 12, background: 'var(--warnbg)', flexDirection: 'column' }}>
              <div><b>{CHAVES_AJUSTES.find((x) => x.chave === troca.chave)?.rotulo}: mudar para {troca.para === 'sim' ? 'SIM' : 'NÃO'}?</b> {AVISO_SAIDA[troca.chave] && troca.para === 'nao' ? AVISO_SAIDA[troca.chave] : ''}</div>
              {CHAVES_AJUSTES.find((x) => x.chave === troca.chave)?.exigeLigar && troca.para === 'sim' && <input className="inp" placeholder="Digite LIGAR" value={troca.texto} autoFocus onChange={(e) => setTroca({ ...troca, texto: e.target.value })} />}
              <div className="row"><button className="btn pri sm" onClick={() => void aplicarTroca(troca.chave, troca.para, troca.texto)}>Confirmar</button><button className="btn ghost sm" onClick={() => setTroca(null)}>Cancelar</button></div>
            </div>
          )}
        </div>
        <div className="card pad"><h3 style={{ marginBottom: 10 }}>Caixas de envio</h3>
          <div className="kv" style={{ gridTemplateColumns: '1fr auto', gap: 12 }}>
            {mostrarCaixas.map((c) => { const e = estadoCaixa({ ativa: c.ativa, senhaCadastrada: exemplos ? c.endereco !== 'pedro@rbrcargo.com.br' : d.senhas[c.segredo_senha] }); return (
              <><dt key={`${c.id}t`}><b style={{ color: 'var(--ink)' }}>{c.endereco}</b><br /><span className="xs">{PAPEL[c.papel] ?? c.papel}{c.ativa ? ` · até ${c.limite_diario} por dia` : ''}</span></dt><dd key={`${c.id}d`}><span className={`chip ${e.tom === 'ok' ? 'ok' : e.tom === 'bad' ? 'bad' : ''}`}>{e.texto}</span></dd></>
            ) })}
            {mostrarCaixas.length === 0 && <dt>Nenhuma caixa cadastrada.</dt>}
          </div>
          <p className="xs faint" style={{ marginTop: 10 }}>As senhas ficam no cofre do sistema, nunca na tela. Para cadastrá-las, use o bloco "Senhas e diagnóstico das caixas" mais abaixo.</p>
        </div>
      </div>
      <div className="split">
        <div className="card pad"><h3 style={{ marginBottom: 12 }}>Horário, ritmo e assinatura</h3>
          <div className="kv" style={{ gridTemplateColumns: '1fr auto', gap: '10px 16px' }}>
            <dt>Dias e horário</dt><dd className="mono">seg a sex · 07h às 18h</dd><dt>Intervalo entre e-mails</dt><dd className="mono">8 a 25 min (aleatório)</dd>
            <dt>Limite por dia (parâmetro)</dt><dd><input className="inp mono" style={{ width: 80, padding: '4px 8px' }} inputMode="numeric" value={limite ?? d.params.PROSPECCAO_LIMITE_DIARIO ?? '10'} onChange={(e) => setLimite(e.target.value)} /></dd>
            <dt>Teto de gasto da IA por dia (R$)</dt><dd><input className="inp mono" style={{ width: 80, padding: '4px 8px' }} inputMode="decimal" value={tetoIa ?? d.params.PROSPECCAO_IA_TETO_DIARIO_BRL ?? '3'} onChange={(e) => setTetoIa(e.target.value)} /></dd>
            <dt>WhatsApp nos e-mails</dt><dd className="mono">(11) 95101-2846</dd>
          </div>
          <span className="lab" style={{ display: 'block', margin: '16px 0 6px' }}>Rampa de envio (teto fixo de 100 por dia)</span>
          {rampa.length === 0 ? <p className="xs muted">Rampa ainda não cadastrada.</p> : rampa.map((r, i) => <div key={r.dia_inicio} className="between" style={{ padding: '4px 0' }}><span className="sm">a partir do dia {r.dia_inicio}</span><span><input className="inp mono" style={{ width: 70, padding: '4px 8px' }} inputMode="numeric" value={r.limite} onChange={(e) => setRampaEd(rampa.map((x, k) => (k === i ? { ...x, limite: Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0) } : x)))} /> <span className="xs faint">por dia</span></span></div>)}
          <span className="lab" style={{ display: 'block', margin: '16px 0 6px' }}>Assinatura por caixa</span>
          {mostrarCaixas.filter((c) => c.papel !== 'reserva').map((c) => <div key={c.id} style={{ marginBottom: 8 }}><span className="xs muted">{c.endereco}</span><textarea className="inp" rows={2} value={assin[c.id] ?? c.assinatura} onChange={(e) => setAssin({ ...assin, [c.id]: e.target.value })} /><button className="btn sm" style={{ marginTop: 4 }} disabled={!ehPedro && !exemplos} onClick={() => void salvarAssinatura(c)}>Salvar assinatura</button></div>)}
          <div className="row" style={{ marginTop: 12 }}><button className="btn pri sm" disabled={!ehPedro && !exemplos} onClick={() => void salvarRitmo()}>Salvar ritmo</button></div>
        </div>
        <div className="card pad"><h3 style={{ marginBottom: 10 }}>Quando o agente para sozinho</h3>
          <ol className="tl"><li><span>3 e-mails devolvidos no mesmo dia</span></li><li><span>1 reclamação de qualquer empresa</span></li><li><span>5% de devolução nos últimos 40 envios (com pelo menos 20 envios)</span></li><li><span>Erro de limite, spam ou suspensão do SMTP, ou aviso da Hostinger</span></li></ol>
          <p className="xs faint">{d.parada?.parada_motivo ? `Última parada: ${d.parada.parada_motivo}.` : 'Nenhuma parada automática até agora.'} Depois de parar, só volta quando você religar o envio.</p>
          <h3 style={{ margin: '18px 0 10px' }}>Quem recebe os avisos</h3>
          <div className="kv" style={{ gridTemplateColumns: '1fr auto', gap: '10px 16px' }}><dt>Lead quente</dt><dd>Pedro e José Carlos</dd><dt>Reclamação e parada automática</dt><dd>Pedro</dd><dt>IA com dúvida</dt><dd>Pedro</dd></div>
          <p className="xs faint" style={{ marginTop: 8 }}>Os destinatários são definidos no sistema (pelo nome na equipe), não por esta tela.</p>
          <h3 style={{ margin: '18px 0 6px' }}>Destinos de teste</h3>
          <p className="sm">{d.destinos.length ? d.destinos.join(', ') : 'Nenhum cadastrado: em modo teste nada é enviado até você cadastrar.'}</p>
        </div>
      </div>
      <div className="card pad"><div className="between" style={{ marginBottom: 10 }}><h3>Lista de bloqueio</h3><span className="lab">nunca recebem e-mail</span></div>
        <div className="row" style={{ marginBottom: 10 }}><div className="search" style={{ flex: 1, minWidth: 220 }}><input value={novoBloq} placeholder="E-mail, domínio ou CNPJ" onChange={(e) => setNovoBloq(e.target.value)} /></div><button className="btn sm" onClick={() => void bloquear()}>Bloquear</button></div>
        <div className="row">
          {d.bloqueios.length === 0 && <span className="sm muted">Lista vazia.</span>}
          {d.bloqueios.map((b) => {
            const auto = b.motivo !== 'manual' && b.motivo !== 'sair' ? true : false
            return (
              <span key={b.id} className="chip" style={{ padding: '6px 10px' }}>{b.tipo === 'dominio' ? '@' : ''}{b.valor} · {b.motivo === 'manual' ? 'manual' : b.motivo === 'sair' ? 'pediu para sair' : `automático (${b.motivo})`}
                {!auto && (remover === b.id ? <> <button className="btn ghost sm" style={{ minHeight: 0, padding: '0 4px', color: 'var(--bad)' }} onClick={() => void removerBloq(b)}>confirmar remoção</button><button className="btn ghost sm" style={{ minHeight: 0, padding: '0 4px' }} onClick={() => setRemover(null)}>não</button></> : <button className="btn ghost sm" style={{ minHeight: 0, padding: '0 2px' }} aria-label="Remover" onClick={() => setRemover(b.id)}>×</button>)}
              </span>
            )
          })}
        </div>
        <p className="xs faint" style={{ marginTop: 8 }}>Bloqueios automáticos (reclamação, devolução) não têm botão de remover. Bloquear por CNPJ bloqueia os e-mails da empresa e marca a empresa como bloqueada.</p>
      </div>
      <details className="card pad"><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Senhas e diagnóstico das caixas, chave de IA e custo</summary>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>{exemplos ? <p className="sm muted">Saia dos exemplos para ver as caixas reais.</p> : <><Caixas /><IaCusto /></>}</div>
      </details>
    </>
  )
}
