import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabaseClient'

type AppNome = 'motorista' | 'agenciador' | 'gestor'

interface Mensagem {
  role: 'user' | 'assistant'
  texto: string
}

const SUGESTOES: Record<AppNome, string[]> = {
  motorista: ['Como confirmo que entreguei a carga?', 'Por que preciso ficar "online"?', 'Cadê meu pagamento?'],
  agenciador: ['Como importo o XML da nota fiscal?', 'Como funciona minha comissão?', 'O que é uma carga complexa?'],
  gestor: ['O que é o "caixa projetado"?', 'Quando devo liberar um bloqueio fiscal?', 'Como promovo alguém a gestor?'],
}

/**
 * Botão flutuante de ajuda, presente nos três apps. Chama a Edge Function
 * `assistente-ajuda`, que responde só sobre como usar o app (nunca decide
 * nada de negócio sozinha) — ver o comentário no topo da função no backend.
 */
// Web Speech API — nativa do navegador (Chrome/Edge/Android; sem suporte no
// Firefox/Safari mais antigo), não precisa de nenhuma chave/API paga. Quando
// não existe, o microfone simplesmente não aparece e o texto continua
// funcionando normal.
type SpeechRecognitionCtor = new () => any
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null
}

export default function AjudaFlutuante({ app }: { app: AppNome }) {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pergunta, setPergunta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ouvindo, setOuvindo] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  const vozDisponivel = getSpeechRecognitionCtor() !== null

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [mensagens, aberto])

  function alternarEscuta() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    if (ouvindo) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new Ctor()
    recognition.lang = 'pt-BR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setOuvindo(true)
    recognition.onend = () => setOuvindo(false)
    recognition.onerror = () => {
      setOuvindo(false)
      setErro('Não consegui ouvir — confere se o microfone está liberado pro navegador.')
    }
    recognition.onresult = (event: any) => {
      const texto = event.results?.[0]?.[0]?.transcript
      if (texto) enviar(texto)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  async function enviar(texto: string) {
    const textoLimpo = texto.trim()
    if (!textoLimpo || enviando) return

    const novasMensagens: Mensagem[] = [...mensagens, { role: 'user', texto: textoLimpo }]
    setMensagens(novasMensagens)
    setPergunta('')
    setEnviando(true)
    setErro(null)

    const { data, error } = await supabase.functions.invoke('assistente-ajuda', {
      body: {
        app,
        pergunta: textoLimpo,
        historico: novasMensagens.slice(-6),
      },
    })

    setEnviando(false)

    if (error || !data?.sucesso) {
      setErro(data?.erro ?? error?.message ?? 'Não consegui responder agora. Tenta de novo em instantes.')
      return
    }

    setMensagens((m) => [...m, { role: 'assistant', texto: data.resposta }])
  }

  return (
    <>
      {aberto && (
        <div
          className="fixed z-50 bg-white border rounded-[20px] flex flex-col overflow-hidden right-4 bottom-24 md:bottom-24"
          style={{
            borderColor: 'var(--rbr-border)',
            boxShadow: '0 8px 30px rgba(18,23,61,0.18)',
            width: 'min(360px, calc(100vw - 32px))',
            height: 'min(480px, calc(100vh - 200px))',
          }}
        >
          <div
            className="px-4 py-3.5 flex items-center justify-between flex-shrink-0"
            style={{ background: 'var(--rbr-navy)', color: '#FFFFFF' }}
          >
            <div className="text-sm font-bold">Precisa de ajuda?</div>
            <button onClick={() => setAberto(false)} aria-label="Fechar" className="text-white/80 hover:text-white text-lg leading-none">
              ×
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
            {mensagens.length === 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs text-[color:var(--rbr-muted)]">
                  Pergunta o que quiser sobre como usar o app. Algumas ideias:
                </div>
                {SUGESTOES[app].map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-left text-xs rounded-xl px-3 py-2 font-semibold"
                    style={{ background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {mensagens.map((m, i) => (
              <div
                key={i}
                className="text-xs rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap"
                style={
                  m.role === 'user'
                    ? { alignSelf: 'flex-end', background: 'var(--rbr-navy)', color: '#FFFFFF' }
                    : { alignSelf: 'flex-start', background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy-dark)' }
                }
              >
                {m.texto}
              </div>
            ))}

            {enviando && (
              <div
                className="text-xs rounded-xl px-3 py-2"
                style={{ alignSelf: 'flex-start', background: 'var(--rbr-muted-bg)', color: 'var(--rbr-muted)' }}
              >
                Pensando…
              </div>
            )}

            {erro && <div className="text-xs text-[color:var(--rbr-danger)]">{erro}</div>}

            {ouvindo && (
              <div
                className="text-xs rounded-xl px-3 py-2 font-semibold text-center"
                style={{ alignSelf: 'center', background: 'var(--rbr-warning-bg)', color: 'var(--rbr-navy-dark)' }}
              >
                🎙️ Ouvindo… pode falar
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              enviar(pergunta)
            }}
            className="flex items-center gap-2 p-2.5 border-t flex-shrink-0"
            style={{ borderColor: 'var(--rbr-border)' }}
          >
            {vozDisponivel && (
              <button
                type="button"
                onClick={alternarEscuta}
                aria-label={ouvindo ? 'Parar de ouvir' : 'Falar em vez de digitar'}
                className="rounded-xl px-2.5 py-2 text-sm font-bold flex-shrink-0"
                style={
                  ouvindo
                    ? { background: 'var(--rbr-danger)', color: '#FFFFFF' }
                    : { background: 'var(--rbr-muted-bg)', color: 'var(--rbr-navy)' }
                }
              >
                🎙️
              </button>
            )}
            <input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder={ouvindo ? 'Ouvindo…' : 'Escreva ou fale sua dúvida…'}
              className="flex-1 border rounded-xl px-3 py-2 text-xs"
              style={{ borderColor: 'var(--rbr-border)' }}
            />
            <button
              type="submit"
              disabled={enviando || pergunta.trim() === ''}
              className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--rbr-gold)', color: 'var(--rbr-navy-dark)' }}
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setAberto((a) => !a)}
        aria-label="Precisa de ajuda?"
        className="fixed z-50 rounded-full flex items-center justify-center font-bold text-lg right-4 bottom-24"
        style={{
          width: 52,
          height: 52,
          background: 'var(--rbr-navy)',
          color: '#FFFFFF',
          boxShadow: '0 4px 14px rgba(18,23,61,0.3)',
        }}
      >
        {aberto ? '×' : '?'}
      </button>
    </>
  )
}
