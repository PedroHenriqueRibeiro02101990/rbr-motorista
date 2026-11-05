// Regras do logotipo do agenciador: PNG, JPG ou WebP, ate 1 MB, redimensionado no navegador para no maximo 512 px. SVG nunca.
export const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_MAX_PX = 512

export function validarLogo(tipo: string, tamanho: number): string | null {
  if (!(LOGO_TIPOS as readonly string[]).includes(tipo)) return 'Use uma imagem PNG, JPG ou WebP. Arquivos SVG não são aceitos.'
  if (tamanho > LOGO_MAX_BYTES) return 'A imagem passa de 1 MB. Escolha um arquivo menor.'
  return null
}

export function dimensoesFinais(w: number, h: number, max = LOGO_MAX_PX): { w: number; h: number } {
  const f = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) }
}

/** Redimensiona no navegador e devolve PNG (mantem transparencia). */
export async function redimensionarLogo(arquivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(arquivo)
  const { w, h } = dimensoesFinais(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  return await new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao processar a imagem.'))), 'image/png'))
}

export function urlLogo(supabaseStorageBase: string, path?: string | null): string | null {
  return path ? `${supabaseStorageBase}/${path}` : null
}
