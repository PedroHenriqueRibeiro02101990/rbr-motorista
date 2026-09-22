import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

// Regra fechada em claude/monitoramento-localizacao-frota.md: captura via GPS
// do navegador é grátis e só roda com o app aberto em primeiro plano (não há
// rastreio em segundo plano confiável, principalmente no iPhone). Envia uma
// posição ao abrir o app, e depois periodicamente (a cada 4h, dentro da janela
// de 3-6h combinada) enquanto o app continuar aberto. OFFLINE não interrompe o
// envio de uma operação já em andamento — só INTERVALO_MS controla a cadência,
// e chamamos isto sempre que há uma operação ativa OU o motorista está online.
const INTERVALO_MS = 4 * 60 * 60 * 1000 // 4h

export function useLocationReporter(options: {
  pessoaId: string
  operacaoId: string | null
  veiculoId: string | null
  ativo: boolean // true quando online=true OU há operação em andamento
}) {
  const { pessoaId, operacaoId, veiculoId, ativo } = options
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!ativo || !navigator.geolocation) return

    function capturar() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from('posicoes_gps').insert({
            pessoa_id: pessoaId,
            operacao_id: operacaoId,
            veiculo_id: veiculoId,
            fonte: 'app_celular',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            capturado_em: new Date(pos.timestamp).toISOString(),
          })
        },
        () => {
          // Permissão negada ou indisponível — falha silenciosa, não bloqueia o app.
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15000 },
      )
    }

    capturar()
    timerRef.current = window.setInterval(capturar, INTERVALO_MS)

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [pessoaId, operacaoId, veiculoId, ativo])
}
