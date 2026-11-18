import { STATUS } from '../lib/status.js'

export const TEXTO_ENTREGUE =
  'Entregue o aparelho ao cliente para ele conferir os valores e assinar.'

// Quando faz sentido colher a assinatura ali na hora. As regras são as mesmas
// do link enviado por WhatsApp — quem decide de verdade é o banco —, mais uma:
// OS sem valor nenhum não vai para a assinatura, porque "de acordo com zero"
// não diz nada e o cliente assinaria um documento em branco.
export function situacaoPresencial(os) {
  if (!os) return 'indisponivel'
  if (os.aceite_em) return 'assinada'
  if (os.status !== STATUS.ORCAMENTO && os.status !== STATUS.APROVADA) {
    return 'indisponivel'
  }
  if (!Number(os.total_centavos)) return 'sem_valor'
  return 'pode'
}
