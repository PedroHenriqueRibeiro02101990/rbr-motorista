// Rascunho automático de formulário em painel/modal (cotação, pré-cotação).
//
// - `sujo`: há alteração não salva. A "base" é o estado no momento da primeira interação do usuário com o painel
//   (assim os carregamentos assíncronos depois de abrir não contam como alteração). Rascunho retomado conta como sujo.
// - Enquanto sujo, grava em localStorage (debounce), numa chave por formulário ("nova" ou o id em edição).
// - Ao abrir, se houver rascunho guardado nessa chave, `pendente` traz o rascunho para oferecer "Retomar rascunho?".
// - Avisa no beforeunload (fechar aba / recarregar) quando há alteração não salva.
// localStorage pode falhar (modo privado, cota): tudo protegido por try/catch e o formulário funciona sem ele.
import { useCallback, useEffect, useMemo, useState } from 'react'

export interface Rascunho<T> {
  salvoEm: string
  dados: T
}

const PREFIXO = 'rbr:rascunho:'

export function lerRascunho<T>(chave: string): Rascunho<T> | null {
  try {
    const bruto = window.localStorage.getItem(PREFIXO + chave)
    if (!bruto) return null
    const r = JSON.parse(bruto) as Rascunho<T>
    return r && typeof r.salvoEm === 'string' && r.dados != null ? r : null
  } catch {
    return null
  }
}

export function gravarRascunho<T>(chave: string, dados: T) {
  try {
    window.localStorage.setItem(PREFIXO + chave, JSON.stringify({ salvoEm: new Date().toISOString(), dados }))
  } catch {
    // sem localStorage: segue sem rascunho
  }
}

export function removerRascunho(chave: string) {
  try {
    window.localStorage.removeItem(PREFIXO + chave)
  } catch {
    // idem
  }
}

export function useRascunho<T>(chave: string | null, dados: T, aplicar: (dados: T) => void, debounceMs = 800) {
  const serial = useMemo(() => JSON.stringify(dados), [dados])
  const [base, setBase] = useState<{ chave: string; serial: string } | null>(null)
  const [restaurado, setRestaurado] = useState<string | null>(null)
  const [pendente, setPendente] = useState<{ chave: string; rascunho: Rascunho<T> } | null>(null)
  const [chaveLida, setChaveLida] = useState<string | null>(null)

  // Abriu (ou trocou de cotação): procura rascunho guardado para oferecer.
  if (chave !== chaveLida) {
    setChaveLida(chave)
    setBase(null)
    setRestaurado(null)
    const r = chave ? lerRascunho<T>(chave) : null
    setPendente(chave && r ? { chave, rascunho: r } : null)
  }

  const baseAtual = base && base.chave === chave ? base.serial : null
  const sujo = chave != null && (restaurado === chave || (baseAtual != null && baseAtual !== serial))
  const pendenteAtual = pendente && pendente.chave === chave ? pendente.rascunho : null

  // Chamar no início de qualquer interação com o painel (pointerdown/keydown em captura).
  const marcarInteracao = useCallback(() => {
    if (chave) setBase((b) => (b && b.chave === chave ? b : { chave, serial }))
  }, [chave, serial])

  useEffect(() => {
    if (!chave || !sujo || pendenteAtual) return
    const t = window.setTimeout(() => gravarRascunho(chave, dados), debounceMs)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, sujo, serial, pendenteAtual, debounceMs])

  useEffect(() => {
    if (!sujo) return
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [sujo])

  const retomar = useCallback(() => {
    if (!chave || !pendenteAtual) return
    aplicar(pendenteAtual.dados)
    setRestaurado(chave)
    setPendente(null)
  }, [chave, pendenteAtual, aplicar])

  const descartarPendente = useCallback(() => {
    if (chave) removerRascunho(chave)
    setPendente(null)
  }, [chave])

  // Depois de salvar com sucesso ou de descartar de propósito: apaga o rascunho e zera a base.
  const limpar = useCallback(() => {
    if (chave) removerRascunho(chave)
    setBase(null)
    setRestaurado(null)
    setPendente(null)
  }, [chave])

  return { sujo, pendente: pendenteAtual, marcarInteracao, retomar, descartarPendente, limpar }
}

export function quandoFoiSalvo(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
