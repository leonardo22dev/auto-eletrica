const ANTIGA = /^[A-Z]{3}\d{4}$/
const MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/

export function normalizarPlaca(valor) {
  if (typeof valor !== 'string') return ''
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function placaValida(placa) {
  const p = normalizarPlaca(placa)
  return ANTIGA.test(p) || MERCOSUL.test(p)
}

export function formatarPlaca(placa) {
  const p = normalizarPlaca(placa)
  if (ANTIGA.test(p)) return `${p.slice(0, 3)}-${p.slice(3)}`
  return p
}
