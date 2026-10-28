import { useMemo, useState } from 'react'
import CartaoCiot, { FaixaFixa, type PagamentoCiot, type PedidoCiot } from '../components/operacao/CartaoCiot'
import { montarConferencia, motivoNaoCancela, passosAntesDoCiot, type Corrigir, type Previa } from '../lib/ciotCartao'

// /demo-ciot: o mesmo CartaoCiot com dados FICTÍCIOS, sem login e sem nenhuma chamada (nem função, nem Supabase, nem efrete).
// Só existe no preview (VITE_DEMO_CIOT=true no build); em produção a rota não é montada.

type Tela = 'antes' | 'emitido' | 'erro' | 'cancelado'
const TELAS: { id: Tela; rotulo: string }[] = [
  { id: 'antes', rotulo: '1. Antes de emitir' },
  { id: 'emitido', rotulo: '2. Emitido' },
  { id: 'erro', rotulo: '3. Erro' },
  { id: 'cancelado', rotulo: '4. Cancelado' },
]

const PREVIA_OK: Previa = {
  ok: true,
  piso: { ok: true, piso: 4870, tabela: 'A', tipoCarga: 'Carga Geral', eixos: 6, distanciaKm: 188 },
  diferencaPiso: 1230,
  bloqueios: [],
  avisos: [],
  pedido: {
    referencia: 'DEMO-0001',
    frete: 6100,
    pagamentos: [
      { categoria: 'Adiantamento', valor: 1830, liberacao: '2026-10-28T14:47:00' },
      { categoria: 'Quitacao', valor: 4270, liberacao: '2026-10-29T14:47:00' },
    ],
    pix: 'CpfOuCnpj',
    placas: ['AAA0A00', 'BBB0B00'],
    notas: 2,
    pesoKg: 24500,
    ncm: '3923',
    distanciaKm: 188,
  },
}
const PREVIA_SEM_PIX: Previa = { ...PREVIA_OK, bloqueios: ['Transportador sem chave Pix (o pagamento do CIOT vai por Pix).'], pedido: null }

const PEDIDO_BASE: PedidoCiot = {
  status: 'emitido',
  ciot: '123456789012',
  ciot_verificador: '3456',
  protocolo: 'EXEMPLO-0001',
  valor_frete: 6100,
  piso_minimo: 4870,
  emitido_em: '2026-10-28T14:32:00-03:00',
  cancelado_em: null,
  encerrado_em: null,
  cancelamento_protocolo: null,
  confirmado_por_nome: 'Gestor de demonstração',
  confirmado_em: '2026-10-28T14:31:00-03:00',
  ultimo_erro: null,
}
const PAGAMENTOS: PagamentoCiot[] = [
  { categoria: 'Adiantamento', valor: 1830, status: 'liquidado', data_liberacao: '2026-10-28T14:47:00-03:00' },
  { categoria: 'Quitacao', valor: 4270, status: 'pendente', data_liberacao: '2026-10-29T14:47:00-03:00' },
]

export default function DemoCiot() {
  const [tela, setTela] = useState<Tela>('antes')
  const [pixCorrigido, setPixCorrigido] = useState(false)
  const [cancelado, setCancelado] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const previa = tela === 'antes' ? (pixCorrigido ? PREVIA_OK : PREVIA_SEM_PIX) : tela === 'erro' ? PREVIA_OK : null
  const linhas = useMemo(() => montarConferencia(previa), [previa])
  const passos = useMemo(() => passosAntesDoCiot([{ tipo: 'cte', status: 'emitido', exigido: true, dispensa_motivo: null }, { tipo: 'atm', status: 'emitido', exigido: true, dispensa_motivo: null }], true), [])
  const pedido: PedidoCiot | null =
    tela === 'emitido' ? { ...PEDIDO_BASE, status: cancelado ? 'cancelado' : 'emitido', cancelado_em: cancelado ? '2026-10-28T15:10:00-03:00' : null, cancelamento_protocolo: cancelado ? 'EXEMPLO-0002' : null, cancelamento_motivo: cancelado ? 'Dados do motorista informados errados.' : null }
      : tela === 'cancelado' ? { ...PEDIDO_BASE, status: 'cancelado', cancelado_em: '2026-10-28T15:10:00-03:00', cancelamento_protocolo: 'EXEMPLO-0002', cancelamento_motivo: 'Dados do motorista informados errados.' }
      : tela === 'erro' ? { ...PEDIDO_BASE, status: 'erro', ciot: null, ciot_verificador: null, protocolo: 'EXEMPLO-0003', emitido_em: null, ultimo_erro: 'A efrete não aceitou o RNTRC do proprietário. Confira o cadastro.' }
      : null

  const trocar = (t: Tela) => {
    setTela(t)
    setPixCorrigido(false)
    setCancelado(false)
    setInfo(null)
  }
  const naoCancela = motivoNaoCancela([])
  const aviso = (m: string) => setInfo(`${m} (demonstração: nada foi enviado)`)

  return (
    <div className="min-h-dvh pt-9 pb-10" style={{ background: 'var(--rbr-bg, #f5f6fa)' }}>
      <FaixaFixa texto="DEMONSTRAÇÃO: dados fictícios" />
      <div className="max-w-5xl mx-auto px-4 flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-bold text-[color:var(--rbr-navy-dark)] m-0">CIOT na operação (demonstração)</h1>
          <p className="text-xs text-[color:var(--rbr-muted)] mt-1 mb-0">Este é o mesmo cartão da tela Fiscal, com dados de mentira. Nada aqui chama o banco nem a efrete.</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TELAS.map((t) => (
            <button key={t.id} type="button" onClick={() => trocar(t.id)} className="text-xs font-bold px-3.5 py-2 rounded-full border" style={tela === t.id ? { background: 'var(--rbr-navy)', color: '#fff', borderColor: 'var(--rbr-navy)' } : { borderColor: 'var(--rbr-border)', background: '#fff' }}>
              {t.rotulo}
            </button>
          ))}
        </div>
        <CartaoCiot
          rotuloCaminhao="Caminhão 1 · AAA0A00"
          ambiente="homologacao"
          ehTeste
          demo
          pedido={pedido}
          pagamentos={pedido && pedido.status !== 'erro' ? PAGAMENTOS.map((g) => (pedido.status === 'cancelado' ? { ...g, status: 'cancelado' } : g)) : []}
          previa={previa}
          linhas={linhas}
          passos={passos}
          naoCancela={naoCancela}
          ocupado={null}
          erro={null}
          erroOriginal={tela === 'erro' ? 'Excecao.Mensagem = "exemplo de retorno da efrete"' : null}
          info={info}
          transacoes={null}
          linkCorrigir={() => null}
          onCorrigir={(c: Corrigir) => {
            if (c === 'cadastro_motorista') setPixCorrigido(true)
          }}
          onEmitir={() => {
            setTela('emitido')
            setCancelado(false)
          }}
          onConsultar={() => aviso('Consulta feita')}
          onPdf={() => aviso('PDF baixado')}
          onTransacoes={() => aviso('Transações listadas')}
          onCancelar={async () => {
            setCancelado(true)
            return true
          }}
        />
      </div>
    </div>
  )
}
