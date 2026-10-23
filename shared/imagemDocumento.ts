// Foto de documento antes de subir: redimensiona para no máximo 1600 px no maior lado e converte para JPEG.
// Arquivo menor = envio que termina no 4G e leitura da IA mais rápida. Usado por enviarDocumentoPessoal (cadastro.tsx).
// Testes: shared/imagemDocumento.test.ts.

export const LADO_MAXIMO = 1600
export const QUALIDADE_JPEG = 0.85

// Tamanho final mantendo a proporção; nunca aumenta a foto.
export function dimensoesAlvo(largura: number, altura: number, maximo = LADO_MAXIMO): { largura: number; altura: number } {
  if (!(largura > 0) || !(altura > 0)) return { largura: 0, altura: 0 }
  const fator = Math.min(1, maximo / Math.max(largura, altura))
  return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) }
}

// Caminho no Storage: pessoa/<id>/<tipo>-<timestamp>.jpg (sempre .jpg, porque o arquivo sobe convertido).
export function caminhoDocumento(pastaPessoaId: string, tipo: string, agora = Date.now()): string {
  return `pessoa/${pastaPessoaId}/${tipo}-${agora}.jpg`
}

export const ehImagem = (tipoMime: string | null | undefined) => /^image\//i.test(tipoMime ?? '')

async function decodificar(arquivo: Blob): Promise<{ fonte: CanvasImageSource; largura: number; altura: number; liberar: () => void }> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    return { fonte: bmp, largura: bmp.width, altura: bmp.height, liberar: () => bmp.close() }
  } catch {
    // Safari antigo / HEIC: cai para <img>, que o navegador decodifica sozinho.
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) }
  }
}

// Converte a foto para JPEG de até 1600 px. Se o navegador não conseguir ler a imagem, lança erro com mensagem clara.
export async function prepararImagemDocumento(arquivo: File, maximo = LADO_MAXIMO): Promise<Blob> {
  if (!ehImagem(arquivo.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(arquivo.name)) {
    throw new Error('Envie uma foto (JPG ou PNG) do documento.')
  }
  let d: Awaited<ReturnType<typeof decodificar>>
  try {
    d = await decodificar(arquivo)
  } catch {
    throw new Error('Não consegui abrir essa foto. Tire outra foto do documento e tente de novo.')
  }
  try {
    const alvo = dimensoesAlvo(d.largura, d.altura, maximo)
    const canvas = document.createElement('canvas')
    canvas.width = alvo.largura
    canvas.height = alvo.altura
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não consegui preparar a foto neste aparelho.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, alvo.largura, alvo.altura)
    ctx.drawImage(d.fonte, 0, 0, alvo.largura, alvo.altura)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG))
    if (!blob) throw new Error('Não consegui preparar a foto neste aparelho.')
    return blob
  } finally {
    d.liberar()
  }
}
