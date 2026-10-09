// Marcação de campos obrigatórios por exigência fiscal (NF-e, CT-e, MDF-e).
//
// A lista vive no banco (tabela campos_obrigatorios_fiscais) para ter uma fonte
// única: o que a tela mostra é o mesmo que o motor de emissão cobra. Cada campo
// aparece com asterisco, os documentos que o exigem e o motivo (passando o mouse
// ou tocando no asterisco). Se a lista não carregar, a tela continua funcionando,
// só sem a marcação.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabaseClient'

export type CampoObrigatorio = {
  entidade: string
  campo: string
  rotulo: string
  documentos: string[]
  condicao: string | null
  motivo: string
}

let cache: Map<string, CampoObrigatorio> | null = null
let carregando: Promise<Map<string, CampoObrigatorio>> | null = null

function carregar(): Promise<Map<string, CampoObrigatorio>> {
  if (cache) return Promise.resolve(cache)
  if (!carregando) {
    carregando = (async () => {
      const mapa = new Map<string, CampoObrigatorio>()
      const { data } = await supabase
        .from('campos_obrigatorios_fiscais' as never)
        .select('entidade, campo, rotulo, documentos, condicao, motivo')
      for (const r of (data ?? []) as unknown as CampoObrigatorio[]) mapa.set(`${r.entidade}.${r.campo}`, r)
      if (mapa.size > 0) cache = mapa
      carregando = null
      return mapa
    })()
  }
  return carregando
}

function useCampo(entidade: string, campo: string): CampoObrigatorio | null {
  const [item, setItem] = useState<CampoObrigatorio | null>(() => cache?.get(`${entidade}.${campo}`) ?? null)
  useEffect(() => {
    let ativo = true
    carregar().then((m) => {
      if (ativo) setItem(m.get(`${entidade}.${campo}`) ?? null)
    })
    return () => {
      ativo = false
    }
  }, [entidade, campo])
  return item
}

function textoAjuda(c: CampoObrigatorio): string {
  const docs = c.documentos.join(' e ')
  const cond = c.condicao ? ` (${c.condicao})` : ''
  return `Obrigatório para ${docs}${cond}. ${c.motivo}`
}

/** Asterisco vermelho com o motivo no balão. Fica ao lado do rótulo do campo. */
export function Obrig({ entidade, campo }: { entidade: string; campo: string }) {
  const c = useCampo(entidade, campo)
  if (!c) return null
  return (
    <span
      title={textoAjuda(c)}
      aria-label={textoAjuda(c)}
      className="ml-1 cursor-help font-bold normal-case"
      style={{ color: 'var(--rbr-danger)' }}
    >
      *
      <span className="ml-1 text-[10px] font-semibold tracking-normal" style={{ color: 'var(--rbr-muted)' }}>
        {c.documentos.join(' · ')}
        {c.condicao ? ' · condicional' : ''}
      </span>
    </span>
  )
}

/**
 * Envolve um campo que só tem placeholder (sem rótulo): mostra o nome do campo,
 * o asterisco e os documentos acima dele. Sem registro no banco, devolve o campo como está.
 */
export function CampoFiscal({
  entidade,
  campo,
  rotulo,
  children,
  className = '',
}: {
  entidade: string
  campo: string
  rotulo?: string
  children: ReactNode
  className?: string
}) {
  const c = useCampo(entidade, campo)
  if (!c) return <>{children}</>
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--rbr-muted)]">
        {rotulo ?? c.rotulo}
        <Obrig entidade={entidade} campo={campo} />
      </div>
      {c.condicao && (
        <div className="text-[10px] text-[color:var(--rbr-muted)] -mt-0.5">{c.condicao}</div>
      )}
      {children}
    </div>
  )
}
