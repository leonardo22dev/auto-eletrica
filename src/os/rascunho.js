const CHAVE = 'mizuho:rascunho-os'

// Toda leitura e escrita é protegida: aba anônima, armazenamento bloqueado
// e cota estourada não podem derrubar a tela de Nova OS.
export function salvarRascunho(dados) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados))
  } catch { /* rascunho é conveniência, não requisito */ }
}

export function lerRascunho() {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const valor = JSON.parse(bruto)
    return (valor && typeof valor === 'object') ? valor : null
  } catch {
    return null
  }
}

export function limparRascunho() {
  try {
    localStorage.removeItem(CHAVE)
  } catch { /* idem */ }
}
