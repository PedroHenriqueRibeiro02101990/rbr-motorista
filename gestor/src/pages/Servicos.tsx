import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@rbr/shared/supabaseClient";
import { formatMoney, STATUS_OPERACAO_LABEL } from "@rbr/shared/format";
import { haQuanto } from "../components/inicio/util";

// Serviços (visual aprovado "Servicos"): uma lista só com o que está andando, separada por etapa.
// Cada linha leva à tela de verdade (Cotação, Operações ou Fiscal); a lógica de cada uma continua lá.
type Etapa = "cotacao" | "operacao" | "fiscal";
type Linha = {
  id: string;
  etapa: Etapa;
  cliente: string;
  rota: string;
  nota: string;
  valor: number | null;
  teste: boolean;
  para: string;
};

const ROTULO: Record<Etapa, string> = {
  cotacao: "Cotação",
  operacao: "Operação",
  fiscal: "Fiscal",
};
const COR: Record<Etapa, { bg: string; fg: string }> = {
  cotacao: { bg: "#f3e6cf", fg: "#7a5200" },
  operacao: { bg: "#d6ecdf", fg: "#1a6b3c" },
  fiscal: { bg: "#dfe3f5", fg: "#1c2559" },
};
const FISCAL = new Set([
  "aguardando_liberacao_fiscal",
  "em_emissao",
  "devolvida_pelo_fiscal",
]);
const ENCERRADAS = ["fechada", "cancelada", "finalizada", "entregue"];

type Cot = {
  id: string;
  status: string;
  cidade_origem: string | null;
  cidade_destino: string | null;
  origem: string;
  valor_total: number | null;
  cliente_id: string | null;
  eh_teste: boolean;
  updated_at: string;
};
type Op = {
  id: string;
  status: string;
  cotacao_id: string | null;
  cliente_id: string | null;
  eh_teste: boolean;
  updated_at: string;
};
type Cli = {
  id: string;
  razao_social: string | null;
  nome_fantasia: string | null;
};

type CardFunil = {
  id: string;
  status: string;
  cliente: string;
  rota: string;
  valor: number;
  idade: string;
};
const COLUNAS: { status: string; rotulo: string; cor: string }[] = [
  { status: "rascunho", rotulo: "RASCUNHO", cor: "#8a93a6" },
  { status: "enviada", rotulo: "ENVIADA", cor: "#1c2559" },
  { status: "convertida", rotulo: "APROVADA", cor: "#1a9b57" },
  { status: "perdida", rotulo: "PERDIDA", cor: "#d64545" },
];

function Funil() {
  const nav = useNavigate();
  const [cards, setCards] = useState<CardFunil[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from("cotacoes")
        .select(
          "id, status, cidade_origem, cidade_destino, origem, valor_total, cliente_id, updated_at",
        )
        .in("status", ["rascunho", "enviada", "convertida", "perdida"])
        .is("cancelada_em", null)
        .eq("eh_teste", false)
        .order("updated_at", { ascending: false })
        .limit(300);
      const cots = (data ?? []) as unknown as Cot[];
      const ids = [
        ...new Set(
          cots.map((k) => k.cliente_id).filter((x): x is string => !!x),
        ),
      ];
      const clis = ids.length
        ? (((
            await supabase
              .from("clientes")
              .select("id, razao_social, nome_fantasia")
              .in("id", ids)
          ).data ?? []) as unknown as Cli[])
        : [];
      const nome = new Map(
        clis.map((k) => [k.id, k.nome_fantasia || k.razao_social || "Cliente"]),
      );
      if (vivo)
        setCards(
          cots.map((k) => ({
            id: k.id,
            status: k.status,
            cliente: nome.get(k.cliente_id ?? "") ?? "Cliente",
            rota: `${k.cidade_origem ?? k.origem} → ${k.cidade_destino ?? "—"}`,
            valor: Number(k.valor_total ?? 0),
            idade: haQuanto(k.updated_at).replace(/^há /, ""),
          })),
        );
    })();
    return () => {
      vivo = false;
    };
  }, []);
  if (cards === null)
    return (
      <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">
        Carregando…
      </div>
    );
  const aberto = cards
    .filter((c) => c.status === "rascunho" || c.status === "enviada")
    .reduce((a, c) => a + c.valor, 0);
  const aprov = cards.filter((c) => c.status === "convertida").length;
  const decididas = aprov + cards.filter((c) => c.status === "perdida").length;
  const taxa = decididas ? Math.round((aprov / decididas) * 100) : null;
  return (
    <>
      <div className="text-[13px]" style={{ color: "#4a5275" }}>
        Funil das cotações ·{" "}
        <b style={{ color: "var(--rbr-navy-dark)" }}>{formatMoney(aberto)}</b>{" "}
        em aberto
        {taxa != null ? (
          <>
            {" "}
            · aprovação de{" "}
            <b style={{ color: "var(--rbr-navy-dark)" }}>{taxa}%</b>
          </>
        ) : (
          ""
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-4 items-start">
        {COLUNAS.map((col) => {
          const doCol = cards.filter((c) => c.status === col.status);
          return (
            <div
              key={col.status}
              className="rounded-2xl p-2.5 flex flex-col gap-2 min-h-[200px]"
              style={{ background: "#e9ecf4" }}
            >
              <div
                className="flex items-center justify-between px-1.5 pt-1 text-[11px] font-extrabold"
                style={{ color: "#4a5275" }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: col.cor }}
                  />
                  {col.rotulo}
                </span>
                <span>{doCol.length}</span>
              </div>
              {doCol.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => nav("/cotacao")}
                  className="text-left bg-white rounded-xl px-3 py-2.5 shadow-[0_1px_2px_rgba(28,37,89,0.08)]"
                >
                  <div className="text-[13px] font-extrabold truncate">
                    {c.cliente}
                  </div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: "var(--rbr-muted)" }}
                  >
                    {c.rota}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[14px] font-extrabold tabular-nums">
                      {formatMoney(c.valor)}
                    </span>
                    <span className="text-[10px]" style={{ color: "#8a91ad" }}>
                      {c.idade}
                    </span>
                  </div>
                </button>
              ))}
              {doCol.length > 6 && (
                <div
                  className="text-[12px] px-1.5"
                  style={{ color: "#8a91ad" }}
                >
                  + {doCol.length - 6} cotações
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[11px]" style={{ color: "#8a91ad" }}>
        Cartões abrem a tela de Cotação. Testes ficam de fora do funil.
      </div>
    </>
  );
}

export default function Servicos() {
  const nav = useNavigate();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | Etapa>("todos");
  const [busca, setBusca] = useState("");
  const [testes, setTestes] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [visao, setVisao] = useState<"lista" | "funil">("lista");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [c, o] = await Promise.all([
        supabase
          .from("cotacoes")
          .select(
            "id, status, cidade_origem, cidade_destino, origem, valor_total, cliente_id, eh_teste, updated_at",
          )
          .in("status", ["rascunho", "enviada"])
          .is("cancelada_em", null)
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase
          .from("operacoes")
          .select("id, status, cotacao_id, cliente_id, eh_teste, updated_at")
          .not("status", "in", `(${ENCERRADAS.join(",")})`)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(200),
      ]);
      if (!vivo) return;
      if (c.error || o.error) {
        setErro(
          "Não consegui carregar os serviços agora. Tente de novo em instantes.",
        );
        return setLinhas([]);
      }
      const cots = (c.data ?? []) as unknown as Cot[];
      const ops = (o.data ?? []) as unknown as Op[];
      const idsCot = [
        ...new Set(
          ops
            .map((x) => x.cotacao_id)
            .filter((x): x is string => !!x && !cots.some((k) => k.id === x)),
        ),
      ];
      const extra = idsCot.length
        ? (((
            await supabase
              .from("cotacoes")
              .select(
                "id, status, cidade_origem, cidade_destino, origem, valor_total, cliente_id, eh_teste, updated_at",
              )
              .in("id", idsCot)
          ).data ?? []) as unknown as Cot[])
        : [];
      const porCot = new Map([...cots, ...extra].map((k) => [k.id, k]));
      const idsCli = [
        ...new Set(
          [...cots, ...extra]
            .map((k) => k.cliente_id)
            .concat(ops.map((x) => x.cliente_id))
            .filter((x): x is string => !!x),
        ),
      ];
      const clis = idsCli.length
        ? (((
            await supabase
              .from("clientes")
              .select("id, razao_social, nome_fantasia")
              .in("id", idsCli)
          ).data ?? []) as unknown as Cli[])
        : [];
      const nomeCli = new Map(
        clis.map((k) => [k.id, k.nome_fantasia || k.razao_social || "Cliente"]),
      );
      const rota = (k?: Cot) =>
        k ? `${k.cidade_origem ?? k.origem} → ${k.cidade_destino ?? "—"}` : "—";
      const saida: Linha[] = [
        ...ops.map((x): Linha => {
          const k = x.cotacao_id ? porCot.get(x.cotacao_id) : undefined;
          const fiscal = FISCAL.has(x.status);
          return {
            id: x.id,
            etapa: fiscal ? "fiscal" : "operacao",
            cliente:
              nomeCli.get(x.cliente_id ?? k?.cliente_id ?? "") ?? "Cliente",
            rota: rota(k),
            nota: STATUS_OPERACAO_LABEL[x.status] ?? x.status,
            valor: k?.valor_total ?? null,
            teste: x.eh_teste,
            para: fiscal ? "/fiscal" : "/operacoes",
          };
        }),
        ...cots
          .filter((k) => !ops.some((x) => x.cotacao_id === k.id))
          .map((k): Linha => ({
            id: k.id,
            etapa: "cotacao",
            cliente: nomeCli.get(k.cliente_id ?? "") ?? "Cliente",
            rota: rota(k),
            nota: `${k.status === "rascunho" ? "rascunho" : "enviada"} ${haQuanto(k.updated_at)}`,
            valor: k.valor_total,
            teste: k.eh_teste,
            para: "/cotacao",
          })),
      ];
      setLinhas(saida);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const visiveis = useMemo(
    () => (linhas ?? []).filter((l) => testes || !l.teste),
    [linhas, testes],
  );
  const cont = (e: Etapa) => visiveis.filter((l) => l.etapa === e).length;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return visiveis.filter(
      (l) =>
        (filtro === "todos" || l.etapa === filtro) &&
        (!q || `${l.cliente} ${l.rota}`.toLowerCase().includes(q)),
    );
  }, [visiveis, filtro, busca]);
  const POR_PAGINA = 12;
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas - 1);
  const fatia = lista.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);

  const chip = (id: "todos" | Etapa, rotulo: string, n: number) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setFiltro(id);
        setPagina(0);
      }}
      aria-pressed={filtro === id}
      className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border"
      style={
        filtro === id
          ? { background: "#1c2559", color: "#fff", borderColor: "#1c2559" }
          : {
              background: "#fff",
              color: "#1c2559",
              borderColor: "var(--rbr-border)",
            }
      }
    >
      {rotulo} · {n}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 max-w-[1100px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-[30px] leading-tight text-[color:var(--rbr-navy-dark)]">
          Serviços
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex p-1 rounded-xl"
            style={{ background: "#e9ecf4" }}
            role="group"
            aria-label="Forma de ver"
          >
            {(["lista", "funil"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisao(v)}
                aria-pressed={visao === v}
                className="text-[13px] font-bold px-4 py-1.5 rounded-lg"
                style={
                  visao === v
                    ? { background: "#1c2559", color: "#fff" }
                    : { color: "#4a5275" }
                }
              >
                {v === "lista" ? "Lista" : "Funil"}
              </button>
            ))}
          </div>
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar…"
            aria-label="Buscar serviços"
            className="text-[13px] bg-white border rounded-xl px-3 py-2 w-[200px]"
            style={{ borderColor: "var(--rbr-border)" }}
          />
          <button
            type="button"
            onClick={() => nav("/cotacao")}
            className="text-[13px] font-bold px-4 py-2 rounded-xl text-white"
            style={{ background: "#1c2559" }}
          >
            + Novo serviço
          </button>
        </div>
      </div>

      {visao === "funil" ? (
        <Funil />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {chip("todos", "Todos", visiveis.length)}
            {chip("cotacao", "Cotação", cont("cotacao"))}
            {chip("operacao", "Operação", cont("operacao"))}
            {chip("fiscal", "Fiscal", cont("fiscal"))}
            <label
              className="ml-2 flex items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: "var(--rbr-muted)" }}
            >
              <input
                type="checkbox"
                checked={testes}
                onChange={(e) => setTestes(e.target.checked)}
              />
              Mostrar testes
            </label>
          </div>

          {erro && (
            <div className="text-xs text-[color:var(--rbr-danger)]">{erro}</div>
          )}

          <div
            className="bg-white border rounded-2xl overflow-hidden"
            style={{ borderColor: "var(--rbr-border)" }}
          >
            {linhas === null ? (
              <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">
                Carregando…
              </div>
            ) : fatia.length === 0 ? (
              <div className="p-8 text-center text-sm text-[color:var(--rbr-muted)]">
                Nada por aqui.
              </div>
            ) : (
              fatia.map((l, i) => (
                <button
                  key={`${l.etapa}-${l.id}`}
                  type="button"
                  onClick={() => nav(l.para)}
                  className="w-full text-left flex items-center gap-4 px-4 py-3.5 hover:bg-[#f7f8fc]"
                  style={{ borderTop: i ? "1px solid #eef0f5" : undefined }}
                >
                  <span
                    className="text-[11px] font-extrabold tracking-wide rounded-full px-3 py-1.5 w-[92px] text-center flex-shrink-0"
                    style={{
                      background: COR[l.etapa].bg,
                      color: COR[l.etapa].fg,
                    }}
                  >
                    {ROTULO[l.etapa].toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-extrabold truncate">
                      {l.cliente}
                      {l.teste && (
                        <span
                          className="ml-2 text-[10px] font-bold uppercase"
                          style={{ color: "var(--rbr-danger)" }}
                        >
                          teste
                        </span>
                      )}
                    </span>
                    <span
                      className="block text-[12px] truncate"
                      style={{ color: "var(--rbr-muted)" }}
                    >
                      {l.rota}
                    </span>
                  </span>
                  <span
                    className="text-[12px] hidden sm:block"
                    style={{ color: "var(--rbr-muted)" }}
                  >
                    {l.nota}
                  </span>
                  <span className="text-[14px] font-bold tabular-nums w-[96px] text-right">
                    {l.valor != null ? formatMoney(l.valor) : "—"}
                  </span>
                </button>
              ))
            )}
          </div>

          <div
            className="flex items-center justify-between text-[13px] font-semibold"
            style={{ color: "var(--rbr-muted)" }}
          >
            <button
              type="button"
              disabled={atual === 0}
              onClick={() => setPagina(atual - 1)}
              className="disabled:opacity-40"
            >
              ← anterior
            </button>
            <span>
              {atual + 1} de {paginas}
            </span>
            <button
              type="button"
              disabled={atual >= paginas - 1}
              onClick={() => setPagina(atual + 1)}
              className="disabled:opacity-40"
            >
              próximo →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
