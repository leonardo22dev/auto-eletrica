import { Svg, Path } from '@react-pdf/renderer'
import { CONTORNO_WHATSAPP } from '../ui/IconeWhatsApp.jsx'

export const VERDE_WHATSAPP = '#25D366'

// O mesmo símbolo da tela, desenhado como vetor no documento: no papel ele
// sai nítido em qualquer impressora, e não depende de fonte nenhuma.
export default function IconeWhatsApp({ size = 14, cor = VERDE_WHATSAPP }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d={CONTORNO_WHATSAPP} fill={cor} />
    </Svg>
  )
}
