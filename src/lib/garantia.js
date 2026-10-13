function ultimoDiaDoMes(ano, mes) {
  // mes é 1-12. Dia 0 do mês seguinte é o último dia deste.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

export function vencimentoGarantia(dataConclusaoISO, meses) {
  if (typeof dataConclusaoISO !== 'string') return null
  const m = dataConclusaoISO.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null

  const qtd = Number(meses) || 0
  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])

  const totalMeses = (ano * 12) + (mes - 1) + qtd
  const anoFinal = Math.floor(totalMeses / 12)
  const mesFinal = (totalMeses % 12) + 1
  const diaFinal = Math.min(dia, ultimoDiaDoMes(anoFinal, mesFinal))

  return [
    String(anoFinal).padStart(4, '0'),
    String(mesFinal).padStart(2, '0'),
    String(diaFinal).padStart(2, '0'),
  ].join('-')
}

export function garantiaVigente(vencimentoISO, referenciaISO) {
  if (!vencimentoISO || !referenciaISO) return false
  // Strings YYYY-MM-DD comparam corretamente em ordem lexicográfica.
  return referenciaISO <= vencimentoISO
}
