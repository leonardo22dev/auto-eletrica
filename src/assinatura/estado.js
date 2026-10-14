import { STATUS } from '../lib/status.js'

// Estado do link, visto do lado do dono. O aceite vence todo o resto: uma OS
// assinada continua assinada mesmo depois de o link expirar.
export function situacaoDoLink(os, agora = new Date()) {
  if (!os) return 'indisponivel'
  if (os.aceite_em) return 'assinada'
  if (os.status !== STATUS.ORCAMENTO && os.status !== STATUS.APROVADA) {
    return 'indisponivel'
  }
  if (!os.assinatura_codigo) return 'nao_enviada'
  const expira = new Date(os.assinatura_expira_em).getTime()
  if (Number.isNaN(expira) || expira <= new Date(agora).getTime()) return 'vencido'
  return 'aguardando'
}
