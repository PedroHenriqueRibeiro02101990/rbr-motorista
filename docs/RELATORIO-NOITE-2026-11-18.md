# Relatorio da noite fiscal — 18/11/2026
Branch: fix/fiscal-noite-2026-11-18. Cada secao = um item (A1..A8). Se a sessao cair, continue do primeiro item sem "CONCLUIDO".

## A1 — Sincronizar emitir-mdfe v30 — CONCLUIDO
- Baixei a v30 publicada (get_edge_function, so leitura) e comparei arquivo a arquivo: so index.ts (comentario v30) e mdfe.ts (contratantes) diferiam; _shared e condutorTitular ja identicos.
- mdfe.ts: contratantes = propTracao ? [{nome: emitente_razao_social, cnpj: cnpjEmitente}] : cliente ? [cliente] : [] (rejeicao 741).
- Teste novo em mdfe.test.ts (com proprietario PF: 1 contratante = emitente; sem: cliente). 47/47 passam.
- Nada publicado.
