import { somarCentavos } from '../lib/dinheiro.js'
import { STATUS } from '../lib/status.js'

// O que a oficina tem a receber no período: OS cancelada foi abandonada e
// somá-la daria um número que não existe no caixa.
export function totalDoPeriodo(ordens) {
  return somarCentavos(
    (ordens || [])
      .filter((o) => o.status !== STATUS.CANCELADA)
      .map((o) => o.total_centavos),
  )
}
