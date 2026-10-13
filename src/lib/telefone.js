export function somenteDigitos(tel) {
  if (typeof tel !== 'string') return ''
  return tel.replace(/\D/g, '')
}

export function telefoneWhatsApp(tel) {
  const d = somenteDigitos(tel)
  // 10 = fixo com DDD, 11 = celular com DDD.
  if (d.length === 10 || d.length === 11) return `55${d}`
  // 12 e 13 já vêm com o DDI.
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

export function linkWhatsApp(tel, texto) {
  const numero = telefoneWhatsApp(tel)
  const query = `?text=${encodeURIComponent(texto)}`
  return numero ? `https://wa.me/${numero}${query}` : `https://wa.me/${query}`
}
