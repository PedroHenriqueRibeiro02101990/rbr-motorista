# Como publicar os 3 apps (motorista, agenciador, gestor) na Vercel

Os 3 apps já estão compilados e prontos dentro desta pasta (motorista/, agenciador/, gestor/).
Cada pasta já tem o vercel.json configurado (rota SPA). Não precisa instalar nada além do Node.js.

## Passo a passo (uns 2 minutos por app)

1. Instale a Vercel CLI (uma vez só, se ainda não tiver):
   npm install -g vercel

2. Faça login (uma vez só):
   vercel login

3. Para cada app, rode a partir desta pasta:

   cd motorista
   vercel --prod --yes --name rbr-motorista
   cd ..

   cd agenciador
   vercel --prod --yes --name rbr-agenciador
   cd ..

   cd gestor
   vercel --prod --yes --name rbr-gestor
   cd ..

4. No fim de cada comando, a Vercel imprime a URL de produção (algo como
   https://rbr-motorista.vercel.app). É esse link que dá pra mandar pros sócios,
   motoristas e agenciadores.

## Alternativa (recomendada pra longo prazo): conectar ao GitHub

Se preferir, suba as pastas motorista/, agenciador/, gestor/ (do projeto completo,
não só o dist/) pra um repositório no GitHub e conecte cada um como um projeto na
Vercel (vercel.com/new). Assim, toda vez que o código for atualizado, a Vercel
publica sozinha — sem precisar rodar comando nenhum.

## Por que não publiquei direto daqui

Os 3 apps têm bundles JavaScript grandes (500-700KB cada, já otimizados/minificados).
O canal que uso pra falar com a Vercel neste ambiente não consegue transportar
arquivos desse tamanho com segurança — tentar isso manualmente arrisca corromper
o bundle (um único caractere errado quebra o app inteiro). Por isso preparei tudo
pronto pra você publicar com um comando por app, sem risco nenhum.

As duas landing pages de divulgação (agenciador e motorista) eu já publiquei —
são páginas simples, sem esse problema.
