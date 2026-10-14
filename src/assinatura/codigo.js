// O código tem 64 caracteres hexadecimais. Extrair os 64 primeiros é o que
// torna a página tolerante ao que o WhatsApp e o copiar-e-colar anexam: espaço,
// quebra de linha, ponto, vírgula, parêntese.
export function normalizarCodigo(texto) {
  const limpo = String(texto ?? '').trim().toLowerCase()
  return limpo.match(/^[0-9a-f]{64}/)?.[0] ?? ''
}

// O link vai para o cliente. Se o dono abrir o sistema por um endereço de
// preview da Vercel ou por um IP de rede local, o link não abriria para ele.
// Um endereço público configurado tem prioridade sobre a origem do navegador.
export function baseDaUrl(configurada, origem) {
  const base = String(configurada ?? '').trim()
  return base !== '' ? base.replace(/\/+$/, '') : origem
}

export function urlDeAssinatura(base, codigo) {
  return `${String(base).replace(/\/+$/, '')}/assinar/${codigo}`
}
