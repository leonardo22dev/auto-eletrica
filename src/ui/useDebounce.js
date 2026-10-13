import { useEffect, useState } from 'react'

// Na oficina a busca é digitada devagar e com a mão suja. Esperar a digitação
// parar evita uma consulta por tecla.
export function useDebounce(valor, espera = 300) {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), espera)
    return () => clearTimeout(t)
  }, [valor, espera])

  return atrasado
}
