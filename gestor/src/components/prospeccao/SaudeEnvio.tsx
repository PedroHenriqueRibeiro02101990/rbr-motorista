import { useCallback, useEffect, useState } from 'react'
import { Aviso, Botao, Campo, Card, Kpi, Modal, Vazio, inputClass, inputStyle } from '../financeiro/ui'
import { useConfirmacao } from '../Confirmacao'
import { db, lerFlag, CHAVE_ENVIO, CHAVE_LIMITE, type Bloqueio } from '../../lib/prospeccaoDb'
import { validarSintaxeEmail } from '../../lib/prospeccao'

type Dia = { enviados: number; devolvidos: number; descadastros: number; respostas: number }

export default function SaudeEnvio() {
  const [envio, setEnvio] = useState<string | null>(null)
  const [limite, setLimite] = useState('10')
  const [dia, setDia] = useState<Dia>({ enviados: 0, devolvidos: 0, descadastros: 0, respostas: 0 })
  const [aprovados, setAprovados] = useState(0)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [ehPedro, setEhPedro] = useState(false)
  const [trocar, setTrocar] = useState(false)
  const [novo, setNovo] = useState(false)
  const [remover, setRemover] = useState<Bloqueio | null>(null)
  const { confirmacao, rodar, ocupado } = useConfirmacao()

  const carregar = useCallback(async () => {
    const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const [e, l, d, a, b, p] = await Promise.all([
      lerFlag(CHAVE_ENVIO), lerFlag(CHAVE_LIMITE),
      db.from('prospeccao_envio_diario').select('*').eq('data', hoje).maybeSingle(),
      db.from('prospeccao_mensagens').select('id', { count: 'exact', head: true }).eq('status', 'aprovado'),
      db.from('prospeccao_bloqueio').select('*').order('criado_em', { ascending: false }),
      db.rpc('prospeccao_eh_pedro'),
    ])
    setEnvio(e)
    if (l) setLimite(l)
    if (d.data) setDia(d.data as Dia)
    setAprovados(a.count ?? 0)
    setBloqueios((b.data ?? []) as Bloqueio[])
    setEhPedro(p.data === true)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const ligado = envio === 'sim'
  return (
    <div className="flex flex-col gap-3">
      {confirmacao}
      <Aviso tipo="info">Modo semi-automático: nada sai sem aprovação humana. Remetente: pedro@rbrcargo.com.br</Aviso>
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="px-5 py-3 rounded-xl text-lg font-extrabold tracking-wide text-white" style={{ background: ligado ? '#c0392b' : '#8a90a6' }}>
            {envio === null ? '…' : ligado ? 'ENVIO LIGADO' : 'ENVIO DESLIGADO'}
          </div>
          <div className="text-xs text-[color:var(--rbr-muted)] flex-1 min-w-[220px]">
            Chave geral ({CHAVE_ENVIO}). Nesta fase ela só é exibida: nenhum robô consome esta chave ainda.
          </div>
          <Botao variante={ligado ? 'secundario' : 'perigo'} disabled={!ehPedro} title={ehPedro ? '' : 'Só o usuário do Pedro troca esta chave.'} onClick={() => setTrocar(true)}>
            {ligado ? 'Desligar envio' : 'Ligar envio'}
          </Botao>
        </div>
        {!ehPedro && <div className="text-[11px] text-[color:var(--rbr-muted)] mt-2">Somente o usuário do Pedro pode trocar esta chave.</div>}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Enviados hoje" valor={`${dia.enviados} / ${limite}`} sub="limite diário (PROSPECCAO_LIMITE_DIARIO)" />
        <Kpi label="Devoluções hoje" valor={String(dia.devolvidos)} sub="parada automática prevista com 3" tom={dia.devolvidos >= 3 ? 'ruim' : undefined} />
        <Kpi label="Descadastros" valor={String(dia.descadastros)} />
        <Kpi label="Respostas" valor={String(dia.respostas)} />
        <Kpi label="Aprovados aguardando" valor={String(aprovados)} />
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
          titulo={ligado ? 'Desligar o envio' : 'Ligar o envio'} palavra={ligado ? 'DESLIGAR' : 'LIGAR'} ocupado={ocupado}
          onFechar={() => setTrocar(false)}
          onOk={() => rodar(ligado ? 'Envio desligado.' : 'Envio ligado.', async () => {
            const { error } = await db.from('parametros_sistema').update({ valor: ligado ? 'nao' : 'sim', updated_at: new Date().toISOString() }).eq('chave', CHAVE_ENVIO)
            if (error) throw new Error(error.message)
            setTrocar(false)
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

function ConfirmarDigitando({ titulo, palavra, onOk, onFechar, ocupado }: { titulo: string; palavra: string; onOk: () => Promise<unknown>; onFechar: () => void; ocupado: boolean }) {
  const [t, setT] = useState('')
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="max-w-md">
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
