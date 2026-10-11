import { useSearchParams } from 'react-router-dom'
import Termos from '../components/conformidade/Termos'
import { CamposContrato, ExtraTermo } from '../components/conformidade/ConfigContrato'
import ContratosAgenciador from '../components/conformidade/ContratosAgenciador'
import { AlertasAbertos, Incidentes, PainelConformidade, ParametrosConformidade, PrestadoresSuspensos, Retencoes } from '../components/conformidade/Escudo'

// Conformidade: termos e contratos (Tarefas 7 a 9) e o escudo contra carga ilícita (Tarefa 10).
const ABAS = [
  { id: 'agenciadores', label: 'Contratos de agenciador' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'retencoes', label: 'Retenções' },
  { id: 'incidentes', label: 'Incidentes' },
  { id: 'termos', label: 'Termos e contratos' },
  { id: 'regras', label: 'Regras' },
] as const
type Aba = (typeof ABAS)[number]['id']

export default function Conformidade() {
  const [params, setParams] = useSearchParams()
  const aba = (ABAS.some((a) => a.id === params.get('aba')) ? params.get('aba') : ABAS[0].id) as Aba
  return (
    <div className="flex flex-col gap-4">
      <h1 className="rbr-display font-bold text-2xl md:text-3xl text-[color:var(--rbr-navy-dark)]">Conformidade</h1>
      <PainelConformidade />
      <nav className="-mx-1 overflow-x-auto">
        <div className="flex gap-1 px-1 border-b min-w-max" style={{ borderColor: 'var(--rbr-border)' }}>
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setParams({ aba: a.id })}
              className="px-3 py-2 text-sm font-bold border-b-2 -mb-px"
              style={{ borderColor: aba === a.id ? 'var(--rbr-navy)' : 'transparent', color: aba === a.id ? 'var(--rbr-navy-dark)' : 'var(--rbr-muted)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </nav>
      {aba === 'agenciadores' && <ContratosAgenciador />}
      {aba === 'alertas' && <AlertasAbertos />}
      {aba === 'retencoes' && <Retencoes />}
      {aba === 'incidentes' && (
        <>
          <Incidentes />
          <PrestadoresSuspensos />
        </>
      )}
      {aba === 'regras' && <ParametrosConformidade />}
      {aba === 'termos' && (
        <>
          <Termos extraPorTermo={(t, recarregar) => <ExtraTermo t={t} recarregar={recarregar} />} />
          <CamposContrato />
        </>
      )}
    </div>
  )
}
