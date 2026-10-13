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

  if (limpo.includes(',')) {
    // Com vírgula, ela é o decimal e o ponto é separador de milhar.
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  } else if (/\.\d{3}(?:\.\d{3})*$/.test(limpo)) {
    // Sem vírgula, ponto seguido de exatamente três dígitos é milhar: em
    // pt-BR ninguém escreve R$ 1,23 como "1.234". Tratar como decimal daria
    // erro de mil vezes numa linha do documento.
    limpo = limpo.replace(/\./g, '')
  }

  const valor = Number.parseFloat(limpo)
  if (!Number.isFinite(valor)) return 0
  return Math.round(valor * 100)
}

// Devolve null quando o texto não é uma quantidade utilizável, para que a
// tela possa recusar em vez de inventar um valor.
export function textoParaQuantidade(valor) {
  if (valor == null) return null
  const limpo = String(valor).trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number.parseFloat(limpo)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function totalDoItem(quantidade, valorUnitarioCentavos) {
  const q = textoParaQuantidade(quantidade) ?? 0
  const v = Number(valorUnitarioCentavos) || 0
  return Math.round(q * v)
}

export function somarCentavos(lista) {
  return (lista || []).reduce((soma, v) => soma + (Number(v) || 0), 0)
}
