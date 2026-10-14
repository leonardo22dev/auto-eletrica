// Sufixo reservado (RFC 2606): nunca resolve, então nenhum e-mail enviado a
// um usuário interno pode chegar a um estranho.
export const DOMINIO_LOGIN = 'mizuho.invalid'

const NOME_VALIDO = /^[a-z0-9._-]+$/

// O Supabase exige e-mail e não tem login por nome de usuário. A tela aceita
// "usuário" e converte aqui. Devolve null quando não dá para entrar com o que
// foi digitado, para a tela dizer isso em vez de mandar lixo ao servidor.
export function usuarioParaEmail(entrada) {
  const texto = String(entrada ?? '').trim().toLowerCase()
  if (texto === '') return null
  // Quem já tem conta com e-mail de verdade continua entrando como antes.
  if (texto.includes('@')) return texto
  if (!NOME_VALIDO.test(texto)) return null
  return `${texto}@${DOMINIO_LOGIN}`
}
