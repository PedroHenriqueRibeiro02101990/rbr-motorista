import { useEffect, useState } from 'react'
import { supabase } from '@rbr/shared/supabaseClient'
import { initials } from '@rbr/shared/format'

// Aba Equipe (visual aprovado "Equipe-Funcoes"): quem tem acesso ao painel, com função e situação do acesso. Só leitura:
// funções e acessos continuam sendo dados pelo gestor como já eram. Autonomia de preço ainda não existe no sistema.
type Pessoa = { id: string; nome: string; papel: string; acesso_bloqueado: boolean; created_at: string }
type Funcao = { pessoa_id: string; funcao: string }

const PAPEIS = ['gestor_rbr', 'comercial', 'operacao', 'fiscal', 'financeiro']
const ROTULO: Record<string, string> = { gestor_rbr: 'Gestor', comercial: 'Comercial', operacao: 'Operação', fiscal: 'Fiscal', financeiro: 'Financeiro' }
const COR: Record<string, { bg: string; fg: string }> = {
  gestor_rbr: { bg: '#dfe3f5', fg: '#1c2559' },
  comercial: { bg: '#fff0d6', fg: '#7a5200' },
  operacao: { bg: '#d6ecdf', fg: '#1a6b3c' },
  fiscal: { bg: '#eef0fa', fg: '#1c2559' },
  financeiro: { bg: '#ece6fb', fg: '#6b4fb3' },
}

function desde(iso: string): string {
  const d = new Date(iso)
  return `desde ${d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')}`
}

const caixaOff = 'rounded-xl border px-3 py-2 bg-[#f7f8fc] opacity-70 cursor-not-allowed'

// Convidar pessoa (visual "Convidar-Pessoa"): o convite de funcionário e o e-mail de envio de propostas ainda não existem no sistema.
// O formulário aparece no formato aprovado, com tudo desativado.
function ConvidarPessoa({ onFechar }: { onFechar: () => void }) {
  const campo = (rotulo: string, valor: string) => (
    <div className={caixaOff} aria-disabled>
      <div className="text-[10px]" style={{ color: 'var(--rbr-muted)' }}>{rotulo}</div>
      <div className="text-[14px] font-extrabold" style={{ color: '#8a91ad' }}>{valor}</div>
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(15,23,42,0.45)' }} role="dialog" aria-modal="true">
      <div className="w-full max-w-[880px] grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] items-start my-6">
        <div className="bg-white rounded-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px]">Convidar pessoa</h2>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="text-[18px]" style={{ color: 'var(--rbr-muted)' }}>×</button>
          </div>
          <div className="text-[12px] rounded-xl px-3 py-2.5" style={{ background: '#fff4d9', color: '#7a5200' }}>Ainda não disponível: o convite de funcionário e o envio de propostas por e-mail próprio não existem no sistema. Nada aqui é enviado.</div>
          <div className="grid gap-2.5 sm:grid-cols-2">{campo('Nome', 'Nome da pessoa')}{campo('E-mail para o convite', 'pessoa@empresa.com')}</div>
          <div className="flex items-center gap-2 flex-wrap text-[13px]">
            <span className="font-semibold">Função</span>
            {['Comercial', 'Operação', 'Fiscal', 'Financeiro'].map((f, i) => (
              <button key={f} type="button" disabled className="text-[12px] font-extrabold px-3.5 py-1.5 rounded-full cursor-not-allowed" style={i === 0 ? { background: '#1c2559', color: '#fff', opacity: 0.55 } : { background: '#eef0fa', color: '#1c2559', opacity: 0.55 }}>{f}</button>
            ))}
            <span className="ml-auto text-[12px]" style={{ color: 'var(--rbr-muted)' }}>Autonomia: ainda não disponível</span>
          </div>
          <div className="text-[11px] font-extrabold tracking-[0.08em] pt-2 border-t" style={{ color: 'var(--rbr-muted)', borderColor: '#eef0f5' }}>E-MAIL PARA ENVIAR PROPOSTAS</div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {campo('Endereço de e-mail', 'nome@empresa.com.br')}
            {campo('Provedor', 'detectado pelo endereço')}
            {campo('Servidor de envio', 'smtp.provedor.com · porta 465')}
            {campo('Usuário', 'nome@empresa.com.br')}
            {campo('Senha do e-mail', '••••••••••••')}
            <button type="button" disabled className="rounded-xl border px-3 py-2 text-[13px] font-extrabold cursor-not-allowed opacity-60" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Testar conexão</button>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onFechar} className="flex-1 text-[14px] font-extrabold px-4 py-2.5 rounded-xl border" style={{ borderColor: 'var(--rbr-border)', color: '#1c2559' }}>Cancelar</button>
            <button type="button" disabled className="flex-1 text-[14px] font-extrabold px-4 py-2.5 rounded-xl text-white cursor-not-allowed opacity-50" style={{ background: '#1c2559' }}>Convidar</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 flex flex-col gap-2 text-[12px]" style={{ color: '#4a5275' }}>
          <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>COMO A SENHA SERÁ GUARDADA</div>
          <div>✓ Criptografada no cofre do sistema; só o servidor usa, para enviar.</div>
          <div>✓ Depois de salvar, ninguém vê de novo.</div>
          <div>✓ Use uma senha criada só para esse e-mail da empresa.</div>
          <div className="text-[11px]" style={{ color: '#8a91ad' }}>Regra de projeto: segredos só no cofre (Vault). Ainda não ligado.</div>
        </div>
      </div>
    </div>
  )
}

// Painel da pessoa (visual "Equipe-Funcoes"): autonomia de preço e acompanhamento ainda não existem; ficam desativados.
function PainelPessoa({ p, onFechar }: { p: Pessoa; onFechar: () => void }) {
  const gestor = p.papel === 'gestor_rbr'
  return (
    <aside className="bg-white border rounded-2xl p-5 flex flex-col gap-3 self-start" style={{ borderColor: 'var(--rbr-border)' }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[16px] font-extrabold">{p.nome}</div>
          <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>{ROTULO[p.papel] ?? p.papel}</div>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar painel" style={{ color: 'var(--rbr-muted)' }}>×</button>
      </div>
      <div className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: 'var(--rbr-muted)' }}>AUTONOMIA DE PREÇO</div>
      <div className="flex p-1 rounded-xl" style={{ background: '#e9ecf4' }}>
        {['Novo', 'Intermediário', 'Sênior'].map((n) => (
          <button key={n} type="button" disabled className="flex-1 text-[12px] font-bold py-1.5 rounded-lg cursor-not-allowed" style={{ color: '#8a91ad' }}>{n}</button>
        ))}
      </div>
      <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>Ainda não disponível. A cor da margem usa vermelho abaixo de 29% e verde acima de 32%, igual para todos.</div>
      <div className="text-[11px] font-extrabold tracking-[0.08em] pt-2 border-t" style={{ color: 'var(--rbr-muted)', borderColor: '#eef0f5' }}>ACOMPANHAMENTO</div>
      <div className="text-[12px]" style={{ color: '#8a91ad' }}>Cotações aprovadas sem ajuste e pedidos enviados ao gestor: ainda não disponível.</div>
      <div className="flex flex-col gap-1 pt-2 border-t text-[13px]" style={{ borderColor: '#eef0f5' }}>
        <div className="flex justify-between"><span>Vê a margem em número</span><b style={{ color: gestor ? '#1a6b3c' : '#b42318' }}>{gestor ? 'Sim' : 'Não'}</b></div>
        <div className="flex justify-between"><span>Vê clientes de outros vendedores</span><b style={{ color: gestor ? '#1a6b3c' : '#b42318' }}>{gestor ? 'Sim' : 'Não'}</b></div>
      </div>
    </aside>
  )
}

export default function EquipeCadastros() {
  const [convidando, setConvidando] = useState(false)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null)
  const [funcoes, setFuncoes] = useState<Map<string, string[]>>(new Map())
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [p, f] = await Promise.all([
        supabase.from('pessoas').select('id, nome, papel, acesso_bloqueado, created_at').in('papel', PAPEIS as never).is('deleted_at', null).order('nome'),
        supabase.from('funcoes_pessoa' as never).select('pessoa_id, funcao').eq('ativo', true),
      ])
      if (!vivo) return
      if (p.error) {
        setErro('Não consegui ler a equipe agora.')
        return setPessoas([])
      }
      const mapa = new Map<string, string[]>()
      for (const x of ((f.data ?? []) as unknown as Funcao[])) mapa.set(x.pessoa_id, [...(mapa.get(x.pessoa_id) ?? []), x.funcao])
      setFuncoes(mapa)
      setPessoas((p.data ?? []) as unknown as Pessoa[])
    })()
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setConvidando(true)} className="text-[13px] font-extrabold px-4 py-2.5 rounded-xl text-white" style={{ background: '#b8863b' }}>
          + Convidar pessoa
        </button>
      </div>
      {convidando && <ConvidarPessoa onFechar={() => setConvidando(false)} />}
      {erro && <div className="text-xs text-[color:var(--rbr-danger)]">{erro}</div>}
      <div className={escolhida ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start' : ''}>
      <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--rbr-border)' }}>
        <div className="hidden md:flex items-center gap-3 px-4 py-2.5 text-[10px] font-extrabold tracking-[0.08em] uppercase" style={{ background: '#f7f8fc', color: 'var(--rbr-muted)' }}>
          <span className="flex-1">Pessoa</span>
          <span className="w-[260px] flex-shrink-0">Função</span>
          <span className="w-[120px] flex-shrink-0">Acesso</span>
        </div>
        {pessoas === null ? (
          <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Carregando…</div>
        ) : pessoas.length === 0 ? (
          <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">Ninguém na equipe ainda.</div>
        ) : (
          pessoas.map((p, i) => {
            const extras = funcoes.get(p.id) ?? []
            const cor = COR[p.papel] ?? COR.fiscal
            return (
              <div key={p.id} role="button" tabIndex={0} onClick={() => setEscolhida(p.id)} onKeyDown={(e) => e.key === 'Enter' && setEscolhida(p.id)} className="px-4 py-3 flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3 cursor-pointer hover:bg-[#f7f8fc]" style={{ borderTop: i ? '1px solid #eef0f5' : undefined, background: escolhida === p.id ? '#f0f3fb' : undefined }}>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full inline-flex items-center justify-center text-[12px] font-extrabold text-white flex-shrink-0" style={{ background: '#1c2559' }}>
                    {initials(p.nome)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-extrabold truncate">{p.nome}</span>
                    <span className="block text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
                      {desde(p.created_at)}
                    </span>
                  </span>
                </div>
                <div className="md:w-[260px] flex-shrink-0 flex gap-1.5 flex-wrap">
                  <span className="text-[12px] font-extrabold rounded-full px-3 py-1" style={{ background: cor.bg, color: cor.fg }}>
                    {ROTULO[p.papel] ?? p.papel}
                  </span>
                  {extras
                    .filter((f) => ROTULO[f] && f !== p.papel)
                    .map((f) => (
                      <span key={f} className="text-[12px] font-bold rounded-full px-3 py-1" style={{ background: '#f1f2f6', color: '#4a5275' }}>
                        + {ROTULO[f]}
                      </span>
                    ))}
                </div>
                <div className="md:w-[120px] flex-shrink-0">
                  <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={p.acesso_bloqueado ? { background: '#fbe3e1', color: '#b42318' } : { background: '#d6ecdf', color: '#1a6b3c' }}>
                    {p.acesso_bloqueado ? '● Bloqueado' : '● Ativo'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
      {escolhida && pessoas?.find((x) => x.id === escolhida) && <PainelPessoa p={pessoas.find((x) => x.id === escolhida)!} onFechar={() => setEscolhida(null)} />}
      </div>
      <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
        Cada pessoa pode ter mais de uma função. Ao tirar o acesso, o login deixa de funcionar na hora e o histórico fica guardado.
      </div>
    </div>
  )
}
