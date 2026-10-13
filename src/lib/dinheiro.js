const formatadorBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const formatadorSimples = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatarBRL(centavos) {
  return formatadorBRL.format((centavos || 0) / 100).replace(/ /g, ' ')
}

export function centavosParaTexto(centavos) {
  return formatadorSimples.format((centavos || 0) / 100)
}

export function textoParaCentavos(texto) {
  if (typeof texto !== 'string') return 0
  let limpo = texto.replace(/[^\d,.-]/g, '')
  if (limpo === '') return 0
  // Com vírgula, ela é o decimal e o ponto é separador de milhar.
  // Sem vírgula, um ponto sozinho pode ser decimal.
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  }
  const valor = Number.parseFloat(limpo)
  if (!Number.isFinite(valor)) return 0
  return Math.round(valor * 100)
}

export function totalDoItem(quantidade, valorUnitarioCentavos) {
  const q = Number(quantidade) || 0
  const v = Number(valorUnitarioCentavos) || 0
  return Math.round(q * v)
}

export function somarCentavos(lista) {
  return (lista || []).reduce((soma, v) => soma + (Number(v) || 0), 0)
}
