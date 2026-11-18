// Chamada resiliente a API do Gemini (etapa 32): timeout por tentativa, ate 4 tentativas, pausa so depois de 429/5xx, orcamento total de 100 s
// (para a funcao devolver erro tratado ANTES do limite de 150 s do Supabase, status 546), modelo alternativo na ultima tentativa.
// Sem dependencias: fetch, pausa e relogio sao injetaveis (testes com mocks). Teste: node --test supabase/functions/_shared/geminiResiliente.test.ts

// ---- Constantes (ajuste aqui depois de ver o log) ----
export const TIMEOUTS_MS = [15_000, 20_000, 25_000, 25_000]; // por tentativa (leituras normais levam 6 a 8 s)
export const MAX_TENTATIVAS = TIMEOUTS_MS.length;
export const PAUSA_MS = 3_000; // so depois de 429, 500, 502, 503 ou 504
export const ORCAMENTO_TOTAL_MS = 100_000;
export const STATUS_COM_PAUSA = new Set([429, 500, 502, 503, 504]);
export const STATUS_SEM_REPETIR = new Set([400, 401, 403, 404]);
export const MENSAGEM_OCUPADA = "A leitura automatica esta ocupada agora. Tente de novo em instantes.";

export interface Deps {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
  dormir: (ms: number) => Promise<void>;
  agora: () => number;
  /** agenda fn daqui a ms e devolve o cancelamento (injetavel para simular o tempo nos testes) */
  agendar: (fn: () => void, ms: number) => () => void;
}
export const depsReais = (): Deps => ({
  fetch: (u, i) => fetch(u, i) as never,
  dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
  agora: () => Date.now(),
  agendar: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
});

export type ResultadoGemini =
  | { ok: true; json: unknown; tentativas: number; ms: number }
  | { ok: false; codigo: "ia_indisponivel" | "ia_recusou"; mensagem: string; detalhe: string; status: number | null; tentativas: number; ms: number };

export interface OpcoesGemini {
  chave: string
  modelo: string
  /** usado so na ULTIMA tentativa, quando existir (GEMINI_MODEL_FALLBACK); nunca inventado aqui */
  modeloAlternativo?: string | null
  corpo: unknown
  /** instante absoluto (ms) em que a FUNCAO inteira precisa terminar (varias chamadas ao Gemini na mesma execucao dividem o mesmo orcamento) */
  prazoAbsoluto?: number
}

export async function chamarGemini(o: OpcoesGemini, d: Deps = depsReais()): Promise<ResultadoGemini> {
  const inicio = d.agora();
  let ultimoStatus: number | null = null;
  let ultimoMotivo = "";
  let tentativas = 0;
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    const restante = Math.min(ORCAMENTO_TOTAL_MS - (d.agora() - inicio), o.prazoAbsoluto != null ? o.prazoAbsoluto - d.agora() : Infinity);
    if (restante <= 1_000) { ultimoMotivo = "orcamento_esgotado"; break; }
    tentativas++;
    const modelo = i === MAX_TENTATIVAS - 1 && o.modeloAlternativo ? o.modeloAlternativo : o.modelo;
    const ctl = new AbortController();
    const limite = Math.min(TIMEOUTS_MS[i], restante);
    const cancelar = d.agendar(() => ctl.abort(), limite);
    let pausar = false;
    try {
      const r = await d.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${o.chave}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o.corpo), signal: ctl.signal,
      });
      cancelar();
      ultimoStatus = r.status;
      if (r.ok) {
        const json = await r.json();
        return { ok: true, json, tentativas, ms: d.agora() - inicio };
      }
      if (STATUS_SEM_REPETIR.has(r.status)) {
        return { ok: false, codigo: "ia_recusou", mensagem: `A leitura automatica foi recusada pela IA (codigo ${r.status}). Preencha manualmente ou avise o suporte.`, detalhe: `gemini=${r.status};tentativas=${tentativas}`, status: r.status, tentativas, ms: d.agora() - inicio };
      }
      ultimoMotivo = `status_${r.status}`;
      pausar = STATUS_COM_PAUSA.has(r.status);
    } catch (e) {
      cancelar();
      const abortou = (e as { name?: string })?.name === "AbortError" || ctl.signal.aborted;
      ultimoMotivo = abortou ? "timeout" : "rede"; // timeout e erro de rede: repete SEM pausa
    }
    if (pausar && i < MAX_TENTATIVAS - 1) {
      if (Math.min(ORCAMENTO_TOTAL_MS - (d.agora() - inicio), o.prazoAbsoluto != null ? o.prazoAbsoluto - d.agora() : Infinity) <= PAUSA_MS + 1_000) { ultimoMotivo += ";orcamento_esgotado"; break; }
      await d.dormir(PAUSA_MS);
    }
  }
  return { ok: false, codigo: "ia_indisponivel", mensagem: MENSAGEM_OCUPADA, detalhe: `gemini=${ultimoStatus ?? "sem_resposta"};motivo=${ultimoMotivo};tentativas=${tentativas}`, status: ultimoStatus, tentativas, ms: d.agora() - inicio };
}

/** Extrai o texto JSON da resposta do Gemini; null se vier vazia (ex.: resposta curta sem dados). */
export function textoDaResposta(json: unknown): string | null {
  const t = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof t === "string" && t.trim() ? t : null;
}

/** Fila de concorrencia (usada pelo front e testada aqui): no maximo `limite` tarefas ao mesmo tempo; as demais esperam a sua vez. */
export async function rodarComLimite<T>(tarefas: (() => Promise<T>)[], limite: number): Promise<T[]> {
  const out: T[] = new Array(tarefas.length);
  let prox = 0;
  const worker = async () => { while (prox < tarefas.length) { const i = prox++; out[i] = await tarefas[i](); } };
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, worker));
  return out;
}
