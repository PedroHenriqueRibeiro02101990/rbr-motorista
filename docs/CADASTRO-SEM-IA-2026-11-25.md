# Cadastro por documentos sem depender da IA paga (25/11/2026)

Branch `fix/cadastro-sem-ia-2026-11-25`. Contrato com o front mantido (so campos novos, opcionais, na resposta).

## Ordem de leitura (fixa, decidida pelo Pedro)
1. **PDF/XML com texto** -> parsers puros em `_shared/leitura-texto.ts`, sem IA: CNH digital, CRLV-e, RNTRC, VPR, contrato CIOT Repom. `origem_leitura: "texto"`.
2. **FreeLLM** (no PC, pelo Agente RBR, assincrono): fotos, scans e PDF lido so em parte. `extrair-documento` grava na fila `leituras_pendentes` e responde `na_fila`; o front consulta a cada 3 s por ate 60 s.
3. **Gemini so como ultima reserva**: so se `GEMINI_RESERVA_ATIVA=1` na funcao **e** o front pedir (`VITE_LEITURA_RESERVA_GEMINI=1`) depois dos 60 s. Ambos desligados por padrao: o Gemini gratuito nao atrasa mais nada.

## Campos por tipo (`CAMPOS_POR_TIPO`)
- **cnh**: nome, cpf, numero_registro, categoria, validade, data_nascimento, **primeira_habilitacao (novo)**, sexo (o PDF digital nao traz)
- **crlv**: placa, renavam, chassi, ano_fabricacao, ano_modelo, marca_modelo, especie_tipo, carroceria, quantidade_eixos, tara (CRLV-e nao traz), capacidade_carga, pbt, cmt, uf, exercicio, nome_proprietario, cpf_cnpj_proprietario, observacoes
- **rntrc**: numero, titular, validade, situacao, **tipo_transportador (novo: TAC/ETC/CTC)**
- rg, cpf, comprovante_residencia, dados_bancarios: sem parser (so IA/manual), campos inalterados.
- Obrigatorios para "leu tudo sem IA": cnh {nome, cpf, registro, categoria, validade, nascimento}; crlv {placa, renavam, chassi, especie_tipo, doc. do proprietario}; rntrc {numero, titular, validade}.

## Sucesso parcial
Parser leu parte -> `sucesso: true`, `origem_leitura: "parcial"`, `normalizado` com o que leu, `campos_faltantes: [...]`; se a IA completar, vira `ia` (parser tem prioridade sobre a IA nos campos que leu). Foto que nao for lida: "Foto nao pode ser lida agora; envie o PDF original (CNH digital, CRLV-e) ou preencha manualmente."

## Fotos pelo FreeLLM
- FreeLLM: `%USERPROFILE%\freellmapi`, porta **3001**, API OpenAI (`/v1/chat/completions`, imagem em `data:` URL, `model: "auto"` roteia so entre modelos com visao: Gemini, Llama 4 Scout/Maverick (Groq, NVIDIA), GLM-4.6V Flash, Nemotron Nano VL, GPT-4o/4.1 do GitHub; 422 `no_vision_model` se nenhum estiver ligado). Quais estao ligados depende das chaves do painel; **nao verifiquei no PC**.
- O agente **nao usa chave de servico** (o agente existente entra com login `agente_central`): ele pede tarefas a `extrair-documento` (modos `agente_pegar` / `agente_resultado`) e recebe URL assinada de 5 min; nao le Storage nem tabela direto. Desvio consciente do desenho original (que citava credencial de servico).
- Toda leitura de IA passa por `normalizarExtracao` (CPF, placa, validade da CNH, datas ISO), confianca limitada a "media", aviso "Lido por IA gratuita - confira" e selo na tela.
- Migration `supabase/migrations/20261125-0100-leituras-pendentes.sql` (+ rollback) **NAO aplicada**. Tabela com RLS e sem policy (so a funcao, via service role).

## OCR (tesseract) como apoio para foto - nao implementado
1. Tesseract nao esta instalado no PC e nao medi nada (sem foto real para comparar); isto e analise, nao medicao.
2. Modelo de visao le a foto direto; OCR em foto de celular de CNH/CRLV (holograma, reflexo, tela) devolve texto sujo.
3. Texto sujo nao serve aos parsers exatos e so serviria de entrada para modelo de texto: mais um passo para o mesmo resultado.
4. Unico ganho claro: quando **nenhum** modelo de visao estiver ligado no FreeLLM (422). Custo: instalar tesseract + idioma `por` no PC.
5. Decisao: so vale se aparecer 422 na pratica; ate la, nao implementar.

## Testes
`node --test supabase/functions/_shared/*.test.ts gestor/test/*.test.ts`: 701 passaram (inclui 13 de `leitura-texto`, 5 de `leituraFila`, 2 novos do front). Agente: `python testes\test_central.py` (51) e `testes\test_leitura_fila.py` (12) em `D:\RBR\Sistema\AGENTE-RBR-NOVO`.

## Limites (honestidade)
- Parsers testados com **texto sintetico** com os rotulos conhecidos; nenhum PDF real foi lido (nao usei Storage para nao expor dados). O layout real do texto extraido pelo `unpdf` pode diferir: o parser foi feito tolerante (valor ao lado do rotulo ou linha de rotulos + linha de valores) e **deixa null o que for ambiguo**, mas confira com 1 CNH-e, 1 CRLV-e e 1 RNTRC reais antes de confiar.
- O fluxo da edge function (fila, `agente_pegar`, `agente_resultado`) nao tem teste automatizado de ponta a ponta (depende do Supabase); coberto por type-check e pelo teste do agente contra funcao falsa.
- PDF escaneado (sem texto) nao e lido por modelo de visao: vai para erro rapido e preenchimento manual.

## Ordem para colocar no ar
1. Aplicar `20261125-0100-leituras-pendentes.sql` (rollback ao lado). 2. Publicar `extrair-documento` e o gestor. 3. Trocar o Agente (RELATORIO.md do `AGENTE-RBR-NOVO`, secao 8) e por `freellm_chave` no `central-config.json`. Sem os passos 1 e 3, PDFs completos ja funcionam sem IA; foto/PDF parcial cai no manual apos 60 s (e o enfileiramento falha sem a tabela: a funcao devolve erro por arquivo).
