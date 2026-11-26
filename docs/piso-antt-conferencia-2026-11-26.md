# Conferência do piso ANTT: sistema x Qualp x Portaria SUROC 22 (26/11/2026)

Somente leitura: nada do sistema foi alterado. Parâmetros iguais em tudo: carga Geral, 6 eixos, sem retorno vazio, Tabela A (lotação).

## Resumo
A diferença de piso vem da **versão da resolução/portaria**, não do km nem da fórmula. O banco (`piso_antt_coeficientes`) guarda a Resolução ANTT 6.084/2026 (vigência 17/07/2026). O Qualp usa a Portaria SUROC nº 22 de 28/09/2026 (diesel S10 R$ 7,33/L). O CC (fixo) é igual nas duas; só o **CCD (R$/km)** subiu cerca de 2,2% a 2,5% em todas as 78 linhas da Tabela A.

## 1) Cálculo do sistema x Qualp
Fórmula da função `calcular-rota-frete`: `piso = CC + CCD x km` (km arredondado a 0,1; sem retorno vazio no código). Banco, carga Geral, 6 eixos: CCD 7,3547, CC 671,93.

Como rodei: a função publicada exige usuário logado, então repliquei as mesmas chamadas dela (Nominatim por cidade/UF e OSRM público) e apliquei a mesma conta. Não chamei a função em produção.

| Rota | km nosso | km Qualp | Piso nosso | Piso Qualp | Diferença R$ | Diferença % |
|---|---|---|---|---|---|---|
| SP-BH | 582,7 | 587 | 4.957,51 | 5.094,80 | -137,29 | -2,69% |
| SP-Rio | 442,8 | 447 | 3.928,59 | 4.039,94 | -111,35 | -2,76% |
| SP-Curitiba | 403,8 | 403 | 3.641,76 | 3.708,41 | -66,65 | -1,80% |

Conta nossa: SP-BH 582,7 x 7,3547 = 4.285,58 + 671,93 = 4.957,51. SP-Rio 442,8 x 7,3547 = 3.256,66 + 671,93 = 3.928,59. SP-Curitiba 403,8 x 7,3547 = 2.969,83 + 671,93 = 3.641,76.

Prova de que o Qualp usa a Portaria 22: com CCD 7,5347 e CC 671,93 (Tabela A da portaria, Geral 6 eixos) e **o km do Qualp**, o resultado bate no centavo: 587 km = 5.094,80; 447 km = 4.039,94; 403 km = 3.708,41. Com o **nosso** km e os coeficientes da portaria: 5.062,40 (BH), 4.008,30 (Rio), 3.714,44 (Curitiba).

## 2) Tabela A do banco x Portaria SUROC 22
Fonte: contadores.cnt.br/legislacoes/portaria-suroc-no-22-de-28-09-2026.html (republicação do DOU; não é a página oficial do DOU). Diesel de referência R$ 7,33/L. Vigência a partir do dia seguinte à publicação (DOU 30/09/2026).
- Banco: 78 linhas na Tabela A (12 tipos de carga x eixos 2,3,4,5,6,7,9, com lacunas). Portaria: as mesmas 78 linhas.
- **Linhas diferentes: 78 de 78.** CC igual em todas; CCD maior na portaria em todas (razão 1,021 a 1,025).
- Ausentes no banco: nenhuma. Sobrando no banco: nenhuma.
- Três linhas (Conteinerizada, Perigosa conteinerizada, Granel pressurizada) vieram sem coluna de eixos no texto; associei às colunas do banco (3,4,5,6,7,9 e 5,6,9) e os CC batem um a um, o que confirma o mapeamento.
- Linha para conferir no DOU: Perigosa granel líquido, 7 eixos: portaria 9,1849, banco 9,1949 (a portaria ficaria abaixo do banco, o contrário do resto; pode ser erro de transcrição da página).
- Exemplos (Geral): 2 eixos 3,9826 -> 4,0738; 4 eixos 5,7822 -> 5,9180; 5 eixos 6,6718 -> 6,8284; 6 eixos 7,3547 -> 7,5347; 9 eixos 9,2027 -> 9,4114.
- Tabelas B, C e D (tração, alto desempenho) não foram comparadas (fora do pedido; o banco as tem com a mesma fonte 6.084).
- Valores completos da portaria: conferir no DOU/anexo oficial da ANTT antes de gravar; a fonte aqui é secundária.

## 3) Causa da diferença do Qualp
1. **Versão da resolução (causa principal):** banco em 6.084/2026 (jul), Qualp em Portaria 22 (set/out). Explica -2,2% a -2,5% do piso por km.
2. **Km (causa secundária):** OSRM x Qualp divergem de -0,7% (BH, 582,7 x 587), -0,9% (Rio, 442,8 x 447) e +0,2% (Curitiba, 403,8 x 403). Com os mesmos coeficientes isso ainda dá de -R$ 32 a +R$ 6.
3. **Tabela de coeficientes:** não há erro de estrutura (CC e tipos/eixos batem); está só desatualizada em CCD.
Observação: o cabeçalho e o campo `fonte` da função citam a Resolução 6.084/2026; hoje o piso vigente é o da Portaria 22 (a confirmar no DOU).

## 4) Fallback de linha reta no código
- `supabase/functions/calcular-rota-frete/index.ts`: **não há fallback para linha reta.** Se o Nominatim não acha a cidade, devolve 422 "Não consegui localizar a origem/destino…". Se o OSRM falha, devolve 502 "Não consegui calcular a rota… Tenta de novo em instantes." Não calcula piso nesse caso e o front mostra o erro.
- Sem timeout nem retry nas chamadas (um OSRM público lento pode demorar).
- Linha reta x 1,25 existe só em `gestor/src/pages/Mapa.tsx` (estimativa de distância/chegada do motorista e, quando a cotação não teve piso calculado, a distância da viagem). Ali o texto avisa "estimada (linha reta x 1,25)". Não alimenta o piso ANTT.
- A migration da tabela `piso_antt_coeficientes` não está em `supabase/migrations` neste branch (a tabela existe no banco com 272 linhas); a carga da portaria nova precisa de migration nova.

## Pendências (nada foi alterado)
- Decidir se atualiza a tabela para a Portaria 22 (só CCD muda, CC igual), com a conferência no DOU oficial.
- Rodar a função publicada com um usuário logado para confirmar o km (o OSRM aqui deu 582,7 / 442,8 / 403,8).
