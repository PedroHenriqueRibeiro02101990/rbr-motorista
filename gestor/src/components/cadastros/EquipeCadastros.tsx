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

export default function EquipeCadastros() {
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
      {erro && <div className="text-xs text-[color:var(--rbr-danger)]">{erro}</div>}
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
              <div key={p.id} className="px-4 py-3 flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3" style={{ borderTop: i ? '1px solid #eef0f5' : undefined }}>
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
      <div className="text-[12px]" style={{ color: 'var(--rbr-muted)' }}>
        Cada pessoa pode ter mais de uma função. Ao tirar o acesso, o login deixa de funcionar na hora e o histórico fica guardado.
      </div>
    </div>
  )
}
