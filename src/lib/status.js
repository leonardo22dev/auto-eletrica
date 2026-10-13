export const STATUS = {
  ORCAMENTO: 'orcamento',
  APROVADA: 'aprovada',
  FINALIZADA: 'finalizada',
  CANCELADA: 'cancelada',
}

const TRANSICOES = {
  [STATUS.ORCAMENTO]: [STATUS.APROVADA, STATUS.CANCELADA],
  [STATUS.APROVADA]: [STATUS.FINALIZADA, STATUS.CANCELADA],
  [STATUS.FINALIZADA]: [STATUS.CANCELADA],
  [STATUS.CANCELADA]: [],
}

const ROTULOS = {
  [STATUS.ORCAMENTO]: 'Orçamento',
  [STATUS.APROVADA]: 'Aprovada',
  [STATUS.FINALIZADA]: 'Finalizada',
  [STATUS.CANCELADA]: 'Cancelada',
}

export function podeTransicionar(de, para) {
  return (TRANSICOES[de] || []).includes(para)
}

export function transicoesPermitidas(status) {
  return TRANSICOES[status] || []
}

export function rotuloStatus(status) {
  return ROTULOS[status] || ''
}

export function tituloDocumento(status) {
  return status === STATUS.ORCAMENTO ? 'ORÇAMENTO' : 'ORDEM DE SERVIÇOS'
}
