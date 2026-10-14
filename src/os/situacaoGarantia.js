import { STATUS } from '../lib/status.js'
import { vencimentoGarantia, garantiaVigente } from '../lib/garantia.js'

// Calcular o vencimento e exibi-lo eram duas coisas separadas, e a tela
// acabava afirmando "vigente até <data>" para garantia já vencida — no
// balcão, para o cliente ler. Aqui as duas andam juntas: quem tem o
// vencimento tem também a resposta sobre estar valendo.
export function situacaoGarantia(os, meses, hojeISO) {
  if (!os || os.status !== STATUS.FINALIZADA || !os.data_os) {
    return { vencimento: null, vigente: false }
  }
  const vencimento = vencimentoGarantia(os.data_os, meses)
  return { vencimento, vigente: garantiaVigente(vencimento, hojeISO) }
}
