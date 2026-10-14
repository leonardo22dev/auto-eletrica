import { useState } from 'react'
import { centavosParaTexto, textoParaCentavos } from '../lib/dinheiro.js'

const CLASSE_PADRAO =
  'h-10 w-28 rounded-lg border-[1.5px] border-linha px-2 text-right text-sm font-semibold focus:border-ink focus:outline-none'

// O campo guarda o texto enquanto está em edição e, ao sair, reescreve com o
// valor normalizado. Sem isso, digitar "1.234" deixava o campo mostrando
// "1.234" enquanto o estado guardava outro número — a tela mentia sobre o
// que seria salvo.
export default function CampoDinheiro({
  rotulo, centavos, desabilitado = false, aoMudar, className = CLASSE_PADRAO,
}) {
  const [texto, setTexto] = useState(null)
  const exibido = texto ?? centavosParaTexto(centavos)

  return (
    <input
      aria-label={rotulo}
      inputMode="decimal"
      disabled={desabilitado}
      value={exibido}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={(e) => {
        aoMudar(textoParaCentavos(e.target.value))
        setTexto(null)
      }}
      className={className}
    />
  )
}
