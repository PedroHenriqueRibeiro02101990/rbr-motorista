// Publica funções do Supabase: node scripts/deploy-functions.js <nome> [<nome>...]
// As funções ficam em supabase/functions/ (formato que o CLI espera), então não há cópia temporária a apagar (H05).
// Não imprime segredos: só o nome da função e o resultado do CLI.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REF = 'kwscmegsfbtvlnyxougt'
const RAIZ = path.join(__dirname, '..', 'supabase', 'functions')
const nomes = process.argv.slice(2)

if (nomes.length === 0) {
  console.log('uso: node scripts/deploy-functions.js <funcao> [<funcao>...]')
  process.exit(1)
}

let falhou = false
for (const nome of nomes) {
  if (!/^[a-z0-9-]+$/.test(nome) || !fs.existsSync(path.join(RAIZ, nome, 'index.ts'))) {
    console.log(`${nome}: função não encontrada em supabase/functions/`)
    falhou = true
    continue
  }
  const r = spawnSync('npx', ['supabase', 'functions', 'deploy', nome, '--project-ref', REF], { encoding: 'utf8', shell: true, cwd: path.join(__dirname, '..') })
  console.log(`${nome}: ${r.status === 0 ? 'publicada' : 'FALHOU'}`)
  if (r.status !== 0) {
    console.log((r.stderr || r.stdout || '').split('\n').slice(-6).join('\n'))
    falhou = true
  }
}
process.exit(falhou ? 1 : 0)
