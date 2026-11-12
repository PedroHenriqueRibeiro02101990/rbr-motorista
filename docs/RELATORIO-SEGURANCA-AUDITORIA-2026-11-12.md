# Auditoria de segurança (somente leitura), 12/11/2026

**Escopo e limites.** Análise estática do repositório (código das Edge Functions, migrações SQL, front, `vercel.json`, histórico do git, `npm audit`). **Nada foi alterado** em código de produção, função, banco ou configuração. O acesso do Claude ao banco (Supabase) foi **negado** pelo sistema de segurança, até para leitura; por isso os itens 6.2 a 6.4 refletem o que as migrações do repositório dizem, **não o banco vivo**. Cada ponto marcado "confirmar no banco" tem a consulta no fim. Nenhum valor de segredo aparece aqui.

## Resumo por gravidade

| # | Gravidade | Achado |
|---|---|---|
| 1 | **Alta** | Pagamentos e emissões sem limite por valor/dia, sem aprovação dupla, sem bloqueio após troca de Pix, sem alerta de login novo (6.6) |
| 2 | **Alta** | Nenhum cabeçalho de segurança nas 3 aplicações (CSP, HSTS, X-Frame-Options, Referrer-Policy) (6.5) |
| 3 | **Alta** | Dependências com vulnerabilidade: `jspdf` (crítica) e `dompurify` (alta), nos 3 apps (6.5) |
| 4 | Média | CORS aberto (`*`) em 31 das 32 Edge Functions, inclusive emissão fiscal (6.1) |
| 5 | Média | Funções caras e autenticadas sem limite de uso (Gemini, extração de documento) (6.1/6.5) |
| 6 | Média | Chave da API Gemini enviada na URL (query string) em 2 funções (6.1) |
| 7 | Média | `SECURITY DEFINER` sem `search_path` fixo em algumas migrações; confirmar no banco (6.2) |
| 8 | Média | Sem Dependabot; secret scanning e push protection não verificáveis daqui (6.5) |
| 9 | Baixa | Funções com `verify_jwt` desligado dependem só da checagem interna (6.1) |
| 10 | Baixa | Logs com identificador do ator em `efrete-ciot-operacao` (sem segredo) (6.1) |
| 11 | Baixa | Bucket público `agenciador-logos` (só logos; esperado) (6.3) |

Pontos positivos verificados: nenhuma chave ou segredo no repositório nem no histórico (busca por padrões de chaves, tokens e blocos de chave privada); no cliente só a chave pública (`VITE_SUPABASE_PUBLISHABLE_KEY`) e a URL; todos os buckets de documentos são privados com link assinado de 60 a 600 s; nenhuma policy `using (true)`; toda tabela criada pelas migrações liga RLS; nenhum `GRANT EXECUTE ... TO anon`.

## 6.1 Edge Functions

`verify_jwt` abaixo é o **declarado no código/comentário**; o valor real do gateway só se confirma no painel. Quase todas fazem a própria checagem (`auth.getUser()` + papel) dentro da função.

| Função | verify_jwt (declarado) | Checa papel | Chamada pública | Validação de assinatura/segredo | CORS |
|---|---|---|---|---|---|
| acesso-app | true | sim | não | n/a | `*` |
| assistente-ajuda | não declarado (auth interna) | sim | não | n/a | `*` |
| avaliar-risco-carga | não declarado (auth interna) | não (qualquer logado) | não | n/a | `*` |
| calcular-rota-frete | não declarado (auth interna) | não (qualquer logado) | não | n/a | `*` |
| cancelar-documento-fiscal | não declarado (auth interna) | sim | não | n/a | `*` |
| conferir-documento-operacao | não declarado (auth interna) | sim | não | n/a | `*` |
| consulta-cadastros | não declarado | sim | parcial (`sincronizar_municipios` por segredo) | cabeçalho `x-rbr-segredo` | `*` |
| consultar-documento-fiscal | não declarado (auth interna) | não (qualquer logado) | não | n/a | `*` |
| conta-publica | **false** (login/cadastro) | n/a | **sim** | limite por tentativas (429) | `*` |
| efrete-ciot-operacao, -teste, homologacao-teste | true | sim | não | n/a | `*` |
| emitir-cte, emitir-mdfe, emitir-nfse-intramunicipal, emitir-nfe-teste(-producao), emitir-cte-teste-producao | não declarado (auth interna) | sim (gestor) | não | n/a | `*` |
| enviar-averbacao, enviar-averbacao-rcv | desligado no gateway (auth interna) | sim | não | n/a | `*` |
| eventos-fiscais | desligado no gateway | sim | só o gatilho de entrega | `x-rbr-segredo` (Vault) | `*` |
| extrair-documento | não declarado (auth interna) | sim | não | n/a | `*` |
| financeiro-ia | não declarado (auth interna) | sim | não | n/a | `*` |
| importar-motoristas-csv | não declarado (auth interna) | sim | não | n/a | `*` |
| nspedagio-vpo | true (**não publicada**) | sim | não | n/a | `*` |
| proposta-publica | não declarado | n/a | **sim** (link de proposta) | token do link + limite por tentativas | `*` |
| receber-lead | **false** (formulário do site) | n/a | **sim** | campo-isca e 20 envios/h por IP | `*` |
| repom-pedagio-rota, repom-status | true (publicadas só após o PR #70) | sim | não | chave interna comparada em tempo constante | `*` |
| resumo-dia | true | n/a (usa RPC do usuário) | não | n/a | `*` |
| saude-fiscal | true | sim | não | n/a | `*` |
| sincronizar-documentos-fiscais | desligado (chamada pelo banco) | n/a | só o banco | segredo do Vault validado por RPC só de `service_role` | sem CORS |

- **Alta/Média, CORS `*` em tudo.** Mitigado pelo JWT, mas as funções de emissão fiscal, CIOT e vale deviam aceitar só o domínio do gestor/agenciador. *Correção:* lista de origens permitidas lida de uma variável, devolvida no `Access-Control-Allow-Origin` conforme o `Origin`.
- **Média, avaliar-risco-carga, calcular-rota-frete e consultar-documento-fiscal** aceitam qualquer usuário logado (papel não checado). *Correção:* exigir gestor/agenciador aprovado como nas demais.
- **Média, chave Gemini na URL** (`...generateContent?key=`) em `avaliar-risco-carga` e `resumo-dia`: URLs costumam ir para logs de proxy. *Correção:* enviar no cabeçalho `x-goog-api-key`.
- **Média, sem limite de uso** em funções que gastam dinheiro por chamada (Gemini: `avaliar-risco-carga`, `assistente-ajuda`, `financeiro-ia`, `resumo-dia`; `extrair-documento`). Só a Repom (PR #70) e as 3 públicas têm limite. *Correção:* contador por usuário/dia em tabela, como `repom_requisicoes`.
- **Baixa, verify_jwt desligado** em `enviar-averbacao`, `eventos-fiscais` e `sincronizar-documentos-fiscais`: a proteção é só interna (checagem de usuário ou segredo). Está certo para o gatilho do banco; *correção:* registrar no painel o motivo e testar uma chamada sem token por trimestre.
- **Baixa, logs:** `efrete-ciot-operacao` registra ação e identificador do ator; `receber-lead` e `proposta-publica` registram só mensagem de erro. Nenhum segredo, token ou CPF encontrado nos `console.*`.
- **Validação de entrada:** as funções fiscais validam `operacao_id` string e leem o resto do banco (bom). `repom-pedagio-rota` valida IBGE de 7 dígitos, eixos de 2 a 15 e até 23 paradas. As públicas validam formato e têm limite. Não há esquema formal (zod ou similar) em nenhuma; *sugestão:* esquema compartilhado nas públicas.

## 6.2 Funções SECURITY DEFINER

35 arquivos de migração usam `SECURITY DEFINER`. Padrão da casa: `REVOKE ... FROM public, anon` logo após criar, e `GRANT EXECUTE` só a `authenticated`/`service_role`. Nenhum `GRANT EXECUTE ... TO anon`. SQL dinâmico (`EXECUTE format`) só aparece em `fin1_base.sql`, num bloco de criação de policies com nome de tabela interno (`%I`), não em função chamável por usuário.

- **Média, `search_path` não fixo (contagem por arquivo, confirmar no banco):** `20261011_12_revoga_funcoes_dados_pessoais.sql` (2 menções a definer, 0 a `search_path`; é migração que só revoga, mas as funções de origem precisam ser conferidas), `20261011_13_restringe_funcoes_novas.sql` (10 definer, 9 `search_path`) e `20261024_05_nfes_em_outra_operacao_permissao.sql` (`nfes_em_outra_operacao`: definer sem `search_path`, mas **checa o papel** antes de responder, ver o comentário do próprio arquivo). Uma varredura mais fina (função a função) listou ainda 20 funções criadas por `create or replace` cujas 4 primeiras linhas não trazem `search_path`; boa parte provavelmente o declara mais abaixo, por isso é só pista. *Correção:* `alter function ... set search_path = public, pg_temp` nas que a consulta 1 do fim listar.
- **A conferir (sem checagem de papel visível no cabeçalho):** funções de gatilho (`trg_*`, `proteger_campos_parceiro`, `validar_ciot_origem`, `aplicar_retencao_inss`, `exigir_aceite_*`) não são chamáveis por usuário porque o `revoke` foi aplicado; as chamáveis por RPC (`recalcular_documento_operacao`, `publicar_termo`, `registrar_pdf_aceite`, `numerar_operacao_vpo`, `iniciar_finalizacao`, `terminar_finalizacao`, `marcar_aviso_lido`, `gerar_link_proposta`, `auditar_segregacao`) precisam, cada uma, validar papel dentro do corpo. A consulta 2 lista as executáveis por `authenticated`; revisar as que não chamam `current_papel()`/`tem_funcao()`.
- **Lição já registrada no repositório:** `current_user` dentro de `SECURITY DEFINER` vira o dono; `eh_backend()` deu TRUE a qualquer agenciador (corrigido em 24/10). Reaproveitar esse teste em toda função nova.

## 6.3 Storage

Buckets citados no código: `agenciador-logos` (público: só logos), `contratos`, `documentos-pessoais`, `dossies`, `financeiro-documentos`, `notas-parceiros`, `operacao-documentos`, `operacao-fotos`, `operacao-nfe`, `cotacao-xml` (privados nas migrações do repositório). O front lê com `createSignedUrl` de **60 a 600 s** (documentos pessoais, CNH/CRLV: 300 s) e só um `getPublicUrl` (logo do agenciador). Bom.

- **Baixa:** `agenciador-logos` é público; aceitável, mas confirmar o limite de tamanho e os tipos permitidos (a migração define).
- **A conferir no banco:** policies de `storage.objects` de `documentos-pessoais`, `operacao-documentos` e `operacao-fotos` (criadas antes das migrações versionadas); confirmar que motorista/agenciador só leem o próprio prefixo (consulta 3).

## 6.4 RLS

- Nenhuma policy `using (true)` / `with check (true)` e nenhuma policy `to anon`/`to public` nas migrações do repositório; toda tabela criada nelas tem `enable row level security`. Tabelas muito antigas (anteriores às migrações versionadas) não podem ser avaliadas daqui.
- **Baixa/Média:** só algumas tabelas novas usam `force row level security` (as de fornecedor e versões, nos PRs #65 e #74). *Correção:* aplicar `force` nas tabelas sensíveis (pagamentos, pessoas, documentos).
- **Teste proposto (não executado):** roteiro que loga como cada papel e tenta ler/alterar dado de outro, em transação com rollback. Rodar no SQL Editor com ids de teste.

```sql
-- Roteiro de isolamento por papel (NAO executado). Troque os ids por usuarios de teste de cada papel.
-- Cada bloco simula um login (role authenticated + claims) e tenta ler dado de OUTRO usuario. Esperado: 0 linhas / erro de permissao.
begin;
set local role authenticated;

-- 1) agenciador A tenta ler cotacoes, operacoes e clientes do agenciador B
select set_config('request.jwt.claims', json_build_object('sub', '<AUTH_ID_AGENCIADOR_A>', 'role', 'authenticated')::text, true);
select count(*) as deve_ser_zero_cotacoes_de_b from public.cotacoes where agenciador_id = '<PESSOA_ID_AGENCIADOR_B>';
select count(*) as deve_ser_zero_operacoes_de_b from public.operacoes o join public.cotacoes c on c.id = o.cotacao_id where c.agenciador_id = '<PESSOA_ID_AGENCIADOR_B>';

-- 2) agenciador nao le as tabelas Repom, fornecedores, pagamentos nem documentos fiscais
select count(*) as deve_ser_zero_repom from public.repom_requisicoes;
select count(*) as deve_ser_zero_fornecedores from public.fornecedores_fiscais;
select count(*) as deve_ser_zero_docs_fiscais from public.documentacao_operacao;

-- 3) motorista le so o proprio cadastro e documentos
select set_config('request.jwt.claims', json_build_object('sub', '<AUTH_ID_MOTORISTA_A>', 'role', 'authenticated')::text, true);
select count(*) as deve_ser_zero_pessoas_de_outros from public.pessoas where id <> '<PESSOA_ID_MOTORISTA_A>' and papel in ('condutor','titular_motorista');
select count(*) as deve_ser_zero_docs_de_outros from storage.objects where bucket_id = 'documentos-pessoais' and name not like '<PESSOA_ID_MOTORISTA_A>/%';

-- 4) tentativa de ESCRITA indevida (cada uma deve falhar com erro de permissao; rode uma por vez)
-- update public.pessoas set papel = 'gestor_rbr' where id = '<PESSOA_ID_MOTORISTA_A>';
-- insert into public.fornecedores_fiscais (id, nome) values ('x', 'x');
-- update public.operacao_ciot_vpo set ciot_status = 'emitido' where operacao_id = '<OPERACAO_ID_QUALQUER>';

-- 5) funcoes sensiveis chamadas por papel sem permissao (devem levantar excecao)
-- select public.escolher_fornecedor_fiscal('<OPERACAO_ID>', 'ciot', 'nstech');  -- como agenciador
rollback;
```

## 6.5 Front e infraestrutura

- **Alta, sem cabeçalhos de segurança.** `gestor/vercel.json`, `agenciador/vercel.json` e `motorista/vercel.json` só têm `ignoreCommand` e `rewrites`. Faltam `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`. Sem `frame-ancestors`, as telas de emissão e pagamento podem ser embutidas em outro site (clickjacking). *Correção:* bloco `headers` no `vercel.json` de cada app. Ponto de partida: `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, e uma CSP em modo `Report-Only` primeiro (`default-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; frame-ancestors 'none'`), ajustando antes de impor.
- **Alta, dependências (`npm audit --omit=dev`, nos 3 apps):** `jspdf` ≤ 4.2.0 **crítica** (ReDoS/DoS e leitura local de arquivo) e `dompurify` ≤ 3.4.16 **alta** (XSS e bypass de lista de tags), este último vindo do `jspdf`. *Correção:* atualizar `jspdf` (a correção pode ser breaking: testar a geração dos PDFs de cotação, contrato e ordem de coleta) e, se o `jspdf` não for atualizado, fixar `dompurify` por `overrides`. Como os PDFs são gerados com dados da própria RBR, o risco prático é menor que a nota, mas a nota é crítica.
- **Média, Dependabot ausente** (não há `.github/dependabot.yml`). *Correção:* criar com `npm` semanal para `gestor`, `agenciador`, `motorista` e `github-actions`.
- **Média, secret scanning e push protection:** são configurações do GitHub, **não verificáveis pelo repositório**. *Correção:* conferir em Settings, Code security, e ligar os dois. A busca local não achou segredos, nem no histórico (383 commits, busca por padrões de chave, token e chave privada; não substitui o scanner).
- **Chaves no cliente:** só `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (chave pública) e flags booleanas. Nenhum `service_role` em `src/`.
- **Rate limit nas rotas públicas:** existe em `conta-publica`, `proposta-publica` e `receber-lead` (tabela de tentativas por chave). Falta o mesmo nas funções autenticadas que custam dinheiro (ver 6.1). O login em si é do Supabase Auth (limites do próprio serviço); confirmar o CAPTCHA/limites no painel.

## 6.6 Pagamentos (CIOT, vale-pedágio, financeiro)

**O que existe:** emissão de CIOT e compra de vale só por gestor/Fiscal; confirmação em janela com o nome de quem confirmou e a hora (gravado no pedido); protocolo gravado antes de ler a resposta e chave de idempotência (clicar de novo não gera outro CIOT nem outra compra); só homologação nesta fase, com CIOT real travado por flag; operação de teste limitada a R$ 5 por trava no banco (`trava_teste_fiscal`); trava de segregação de funções (quem gerou ou alocou o motorista não emite o fiscal); cancelamento exige motivo de 15+ caracteres; trilha de auditoria dos eventos fiscais.

**O que falta (nada disso foi encontrado no código nem nas migrações):**

1. **Limite por pagamento e por dia** (valor máximo por CIOT/vale e total diário por usuário e global). *Sugestão:* tabela de limites com valores padrão e checagem na função antes de chamar efrete/NSPEDÁGIO, igual ao contador da Repom.
2. **Aprovação dupla** acima de um valor (quem pede não aprova). A segregação atual impede só gerar+emitir.
3. **Bloqueio depois de trocar a chave Pix** do transportador (ex.: 24 a 72 h sem pagar, ou aprovação extra). Hoje a chave Pix lida do cadastro vai direto no CIOT.
4. **Alerta de login novo** (e-mail/notificação ao gestor em login de dispositivo novo ou fora do horário). Não há.
5. **Alerta de compra de vale e emissão de CIOT** (aviso imediato ao gestor, com valor). Hoje só fica no registro.
6. **Reautenticação** (senha/biometria) para emitir ou cancelar. Há biometria no app do motorista, mas não na emissão do gestor.

## Consultas para confirmar no banco (somente leitura, o Pedro roda)

```sql
-- 1) SECURITY DEFINER sem search_path fixo
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- 2) funcoes SECURITY DEFINER que authenticated ou anon executam
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));

-- 3) buckets e policies de storage
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
select policyname, cmd, roles, qual from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- 4) tabelas sem RLS ou com policy ampla
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true' or 'anon' = any(roles) or 'public' = any(roles));
```
