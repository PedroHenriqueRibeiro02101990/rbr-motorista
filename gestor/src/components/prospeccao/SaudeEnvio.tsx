import { useCallback, useEffect, useState } from 'react'
import { Aviso, Botao, Campo, Card, Kpi, Modal, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { db, auditar, type Bloqueio } from '../../lib/prospeccaoDb'
import { diaDaRampa, limiteDoDia, validarSintaxeEmail } from '../../lib/prospeccao'

type Dia = { data: string; enviados: number; devolvidos: number; descadastros: number; respostas: number }
type Rampa = { dia_inicio: number; limite: number }
type Estado = { proximo_envio_apos: string | null; primeiro_envio_em: string | null; parada_motivo: string | null; parada_em: string | null }

const FLAGS: { chave: string; rotulo: string; ajuda: string }[] = [
  { chave: 'PROSPECCAO_UI_LIBERADA', rotulo: 'Aba visível', ajuda: 'Mostra a aba Prospecção no menu.' },
  { chave: 'PROSPECCAO_ENVIO_LIBERADO', rotulo: 'Envio (chave geral)', ajuda: 'Kill switch: com "não", nada é enviado.' },
  { chave: 'PROSPECCAO_LEITURA_LIBERADA', rotulo: 'Leitura da caixa', ajuda: 'Robô que lê respostas, descadastros e devoluções.' },
  { chave: 'PROSPECCAO_APROVACAO_OBRIGATORIA', rotulo: 'Aprovação humana obrigatória', ajuda: '"sim" = agente só prepara rascunhos. "não" = aprova e envia sozinho (totalmente automático).' },
  { chave: 'PROSPECCAO_RESPOSTA_AUTOMATICA_LIBERADA', rotulo: 'Resposta automática', ajuda: 'O agente responde sozinho "agora não" e indicações. (Confirmação de "sair" é sempre automática.)' },
  { chave: 'PROSPECCAO_MODO_TESTE', rotulo: 'Modo de teste', ajuda: '"sim" = todo envio vai só para os destinos de teste, com [TESTE] no assunto.' },
]

export default function SaudeEnvio() {
  const [flags, setFlags] = useState<Record<string, string>>({})
  const [dias, setDias] = useState<Dia[]>([])
  const [aprovados, setAprovados] = useState(0)
  const [incertos, setIncertos] = useState<{ id: string; assunto: string; erro: string | null }[]>([])
  const [rampa, setRampa] = useState<Rampa[]>([])
  const [estado, setEstado] = useState<Estado | null>(null)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [destinos, setDestinos] = useState<string[]>([])
  const [novoDestino, setNovoDestino] = useState('')
  const [ehPedro, setEhPedro] = useState(false)
  const [trocar, setTrocar] = useState<{ chave: string; para: 'sim' | 'nao' } | null>(null)
  const [novo, setNovo] = useState(false)
  const [remover, setRemover] = useState<Bloqueio | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 13 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const [fl, d, a, r, e, b, dt, p, inc] = await Promise.all([
      db.from('parametros_sistema').select('chave, valor').like('chave', 'PROSPECCAO\\_%'),
      db.from('prospeccao_envio_diario').select('*').gte('data', desde).order('data'),
      db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('status', 'aprovado'),
      db.from('prospeccao_rampa').select('*').order('dia_inicio'),
      db.from('prospeccao_estado').select('*').eq('id', 1).maybeSingle(),
      db.from('prospeccao_bloqueio').select('*').order('criado_em', { ascending: false }),
      db.from('prospeccao_destinos_teste').select('email').order('email'),
      db.rpc('prospeccao_eh_pedro'),
      db.from('prospeccao_mensagens').select('id, assunto, erro').eq('status', 'aprovado').not('message_id', 'is', null).limit(50),
    ])
    setIncertos((inc.data ?? []) as { id: string; assunto: string; erro: string | null }[])
    setFlags(Object.fromEntries(((fl.data ?? []) as { chave: string; valor: unknown }[]).map((x) => [x.chave, String(x.valor)])))
    setDias((d.data ?? []) as Dia[])
    setAprovados(a.count ?? 0)
    setRampa((r.data ?? []) as Rampa[])
    setEstado((e.data as Estado | null) ?? null)
    setBloqueios((b.data ?? []) as Bloqueio[])
    setDestinos(((dt.data ?? []) as { email: string }[]).map((x) => x.email))
    setEhPedro(p.data === true)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const dHoje = dias.find((x) => x.data === hoje) ?? { data: hoje, enviados: 0, devolvidos: 0, descadastros: 0, respostas: 0 }
  const lim = limiteDoDia(flags.PROSPECCAO_LIMITE_DIARIO == null ? null : Number(flags.PROSPECCAO_LIMITE_DIARIO), rampa, diaDaRampa(estado?.primeiro_envio_em ?? null, hoje))
  const ligado = flags.PROSPECCAO_ENVIO_LIBERADO === 'sim'
  const parado = !ligado && !!estado?.parada_motivo
  const teste = flags.PROSPECCAO_MODO_TESTE === 'sim'
  const aprovObrig = flags.PROSPECCAO_APROVACAO_OBRIGATORIA !== 'nao'
  const max14 = Math.max(1, ...dias.map((x) => x.enviados))

  return (
    <div className="flex flex-col gap-3">
      {confirmacao}
      {parado && <div className="rounded-xl px-4 py-3 text-sm font-extrabold text-white" style={{ background: '#c0392b' }}>PARADO AUTOMATICAMENTE: {estado?.parada_motivo}. Religue manualmente (digitando LIGAR) só depois de entender o motivo.</div>}
      {incertos.length > 0 && (
        <Aviso tipo="atencao">
          <b>Envio incerto, conferir ({incertos.length}):</b> o robô começou a enviar, mas não confirmou o resultado. Estas mensagens <b>não serão reenviadas sozinhas</b>. Confira na pasta Enviados da caixa e,
          se o e-mail não saiu, descarte a mensagem na Fila de aprovação e gere de novo. {incertos.slice(0, 5).map((m) => m.assunto).join(' · ')}
        </Aviso>
      )}
      <Aviso tipo={aprovObrig ? 'info' : 'atencao'}>
        {aprovObrig ? 'Modo semi-automático: nada sai sem aprovação humana.' : 'MODO TOTALMENTE AUTOMÁTICO: o agente aprova e envia sozinho.'} Remetente: pedro@rbrcargo.com.br
        {teste ? ' · MODO DE TESTE ligado: os e-mails vão só para os destinos de teste.' : ''}
      </Aviso>

      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="px-5 py-3 rounded-xl text-lg font-extrabold tracking-wide text-white" style={{ background: parado ? '#c0392b' : ligado ? '#d35400' : '#8a90a6' }}>
            {parado ? 'PARADO AUTOMATICAMENTE' : ligado ? 'ENVIO LIGADO' : 'ENVIO DESLIGADO'}
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)] flex-1 min-w-[220px]">
            Janela: segunda a sexta, 07:00 às 18:00 (Brasília), fora de feriados. Próximo envio previsto: {estado?.proximo_envio_apos ? new Date(estado.proximo_envio_apos).toLocaleString('pt-BR') : 'a qualquer momento da janela'}.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Enviados hoje" valor={`${dHoje.enviados} / ${lim.limite}`} sub={`limite vem do(a) ${lim.origem} · dia ${diaDaRampa(estado?.primeiro_envio_em ?? null, hoje)} da rampa`} />
        <Kpi label="Devoluções hoje" valor={String(dHoje.devolvidos)} sub="parada automática com 3" tom={dHoje.devolvidos >= 3 ? 'ruim' : undefined} />
        <Kpi label="Descadastros hoje" valor={String(dHoje.descadastros)} />
        <Kpi label="Respostas hoje" valor={String(dHoje.respostas)} />
        <Kpi label="Aprovados aguardando" valor={String(aprovados)} />
      </div>

      <Card titulo="Enviados nos últimos 14 dias">
        {dias.length === 0 ? <Vazio>Sem envios ainda.</Vazio> : (
          <div className="flex items-end gap-1.5 h-24">
            {dias.map((x) => (
              <div key={x.data} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${x.data}: ${x.enviados} enviados, ${x.devolvidos} devolvidos`}>
                <div className="w-full rounded-t" style={{ height: `${(x.enviados / max14) * 80}%`, minHeight: x.enviados ? 3 : 0, background: x.devolvidos ? '#c0392b' : 'var(--rbr-navy)' }} />
                <div className="text-[9px] text-[color:var(--rbr-muted)]">{x.data.slice(8)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card titulo="Chaves (só o usuário do Pedro troca)">
        <div className="flex flex-col">
          {FLAGS.map((fl) => {
            const v = flags[fl.chave] ?? 'nao'
            return (
              <div key={fl.chave} className="flex items-center gap-3 py-2 border-t first:border-t-0 flex-wrap" style={{ borderColor: '#eef0f5' }}>
                <div className="flex-1 min-w-[220px]"><div className="text-sm font-bold">{fl.rotulo} <span className="text-[10px] text-[color:var(--rbr-muted)]">{fl.chave}</span></div><div className="text-[11px] text-[color:var(--rbr-muted)]">{fl.ajuda}</div></div>
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-full" style={{ background: v === 'sim' ? '#FDF1DC' : '#EEF0F5', color: v === 'sim' ? '#8A5A00' : '#4a5275' }}>{v === 'sim' ? 'SIM' : 'NÃO'}</span>
                <Botao variante="secundario" disabled={!ehPedro} title={ehPedro ? '' : 'Só o usuário do Pedro troca as chaves.'} onClick={() => setTrocar({ chave: fl.chave, para: v === 'sim' ? 'nao' : 'sim' })}>Mudar para {v === 'sim' ? 'NÃO' : 'SIM'}</Botao>
              </div>
            )
          })}
        </div>
        {!ehPedro && <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">Somente o usuário do Pedro pode trocar estas chaves.</div>}
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        <Card titulo="Rampa de envio (limite por dia de rampa)">
          <div className="flex flex-col gap-1.5">
            {rampa.map((r, i) => (
              <div key={r.dia_inicio} className="flex items-center gap-2 text-xs">
                <span className="w-28">a partir do dia {r.dia_inicio}</span>
                <input className={inputClass + ' !w-20'} style={inputStyle} inputMode="numeric" value={r.limite} onChange={(e) => setRampa(rampa.map((x, k) => (k === i ? { ...x, limite: Math.min(100, Number(e.target.value.replace(/\D/g, ''))) } : x)))} />
                <span className="text-[color:var(--rbr-muted)]">por dia</span>
              </div>
            ))}
            <div className="text-[11px] text-[color:var(--rbr-muted)]">O limite do dia é o menor entre PROSPECCAO_LIMITE_DIARIO ({flags.PROSPECCAO_LIMITE_DIARIO ?? '10'}) e a rampa. Nunca passa de 100.</div>
            <div><Botao disabled={ocupado} onClick={() => void rodar('Rampa salva.', async () => {
              for (const r of rampa) { const { error } = await db.from('prospeccao_rampa').update({ limite: r.limite }).eq('dia_inicio', r.dia_inicio); if (error) throw new Error(error.message) }
              await auditar('prospeccao_rampa_editada', { rampa })
            })}>Salvar rampa</Botao></div>
          </div>
        </Card>
        <Card titulo="Destinos de teste">
          <div className="flex flex-col gap-1.5">
            {destinos.length === 0 && <div className="text-xs" style={{ color: '#8A5A00' }}>Nenhum destino: em modo de teste nada é enviado até você cadastrar.</div>}
            {destinos.map((e) => (
              <div key={e} className="flex items-center gap-2 text-xs"><span className="flex-1">{e}</span>
                <Botao variante="perigo" disabled={ocupado} onClick={() => void rodar('Destino removido.', async () => { await db.from('prospeccao_destinos_teste').delete().eq('email', e); await carregar() })}>Remover</Botao></div>
            ))}
            <div className="flex gap-2"><input className={inputClass} style={inputStyle} placeholder="e-mail de teste" value={novoDestino} onChange={(e) => setNovoDestino(e.target.value)} />
              <Botao disabled={ocupado || !novoDestino.trim()} onClick={() => void rodar('Destino adicionado.', async () => {
                const em = novoDestino.trim().toLowerCase()
                if (!validarSintaxeEmail(em)) throw new Error('E-mail inválido.')
                const { error } = await db.from('prospeccao_destinos_teste').insert({ email: em })
                if (error) throw new Error(error.code === '23505' ? 'Já cadastrado.' : error.message)
                setNovoDestino(''); await carregar()
              })}>Adicionar</Botao></div>
          </div>
        </Card>
      </div>

      <Card titulo="Lista de bloqueio" acao={<Botao variante="secundario" onClick={() => setNovo(true)}>Adicionar</Botao>}>
        {bloqueios.length === 0 ? <Vazio>Lista vazia.</Vazio> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[color:var(--rbr-muted)]"><th className="py-1">Tipo</th><th>Valor</th><th>Motivo</th><th>Desde</th><th /></tr></thead>
            <tbody>
              {bloqueios.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: '#eef0f5' }}>
                  <td className="py-1.5">{b.tipo === 'dominio' ? 'Domínio' : 'E-mail'}</td><td className="font-bold">{b.valor}</td><td>{b.motivo}</td>
                  <td>{new Date(b.criado_em).toLocaleDateString('pt-BR')}</td>
                  <td className="text-right"><Botao variante="perigo" onClick={() => setRemover(b)}>Remover</Botao></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {trocar && (
        <ConfirmarDigitando
          titulo={`${FLAGS.find((x) => x.chave === trocar.chave)?.rotulo}: mudar para ${trocar.para === 'sim' ? 'SIM' : 'NÃO'}`} palavra={trocar.para === 'sim' ? 'LIGAR' : 'DESLIGAR'} ocupado={ocupado}
          aviso={trocar.chave === 'PROSPECCAO_MODO_TESTE' && trocar.para === 'nao' ? 'Atenção: sem modo de teste, o agente envia para empresas reais.' : trocar.chave === 'PROSPECCAO_APROVACAO_OBRIGATORIA' && trocar.para === 'nao' ? 'Atenção: o agente passa a aprovar e enviar sozinho.' : undefined}
          onFechar={() => setTrocar(null)}
          onOk={() => rodar('Chave alterada.', async () => {
            const { error } = await db.from('parametros_sistema').update({ valor: trocar.para, updated_at: new Date().toISOString() }).eq('chave', trocar.chave)
            if (error) throw new Error(error.message)
            setTrocar(null)
            await carregar()
          })}
        />
      )}
      {remover && (
        <ConfirmarDigitando titulo={`Remover ${remover.valor} do bloqueio`} palavra="REMOVER" ocupado={ocupado} onFechar={() => setRemover(null)}
          onOk={() => rodar('Removido da lista de bloqueio.', async () => {
            const { error } = await db.from('prospeccao_bloqueio').delete().eq('id', remover.id)
            if (error) throw new Error(error.message)
            setRemover(null)
            await carregar()
          })} />
      )}
      {novo && <NovoBloqueio onFechar={() => setNovo(false)} onFeito={carregar} />}
    </div>
  )
}

function ConfirmarDigitando({ titulo, palavra, aviso, onOk, onFechar, ocupado }: { titulo: string; palavra: string; aviso?: string; onOk: () => Promise<unknown>; onFechar: () => void; ocupado: boolean }) {
  const [t, setT] = useState('')
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="max-w-md">
      {aviso && <Aviso tipo="atencao">{aviso}</Aviso>}
      <div className="text-sm">Para confirmar, digite <b>{palavra}</b>.</div>
      <input className={inputClass} style={inputStyle} value={t} onChange={(e) => setT(e.target.value)} autoFocus />
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="perigo" disabled={ocupado || t !== palavra} onClick={() => void onOk()}>Confirmar</Botao>
      </div>
    </Modal>
  )
}

function NovoBloqueio({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => Promise<void> }) {
  const [valor, setValor] = useState('')
  const { confirmacao, rodar, ocupado } = useConfirmacao()
  const v = valor.trim().toLowerCase()
  const tipo = v.includes('@') ? 'email' : 'dominio'
  return (
    <Modal titulo="Adicionar à lista de bloqueio" onFechar={onFechar} largura="max-w-md">
      {confirmacao}
      <Campo label="E-mail ou domínio" dica="Ex.: fulano@empresa.com.br ou empresa.com.br"><input className={inputClass} style={inputStyle} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus /></Campo>
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao disabled={ocupado || !v} onClick={() => void rodar('Adicionado à lista de bloqueio.', async () => {
          if (tipo === 'email' && !validarSintaxeEmail(v)) throw new Error('E-mail inválido.')
          if (tipo === 'dominio' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) throw new Error('Domínio inválido.')
          const { error } = await db.from('prospeccao_bloqueio').insert({ tipo, valor: v, motivo: 'manual' })
          if (error) throw new Error(error.code === '23505' ? 'Já está na lista.' : error.message)
          await onFeito()
          onFechar()
        })}>Adicionar</Botao>
      </div>
    </Modal>
  )
}
