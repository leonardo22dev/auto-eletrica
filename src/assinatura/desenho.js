// Menor retângulo que contém tinta (alfa > 0), ou nulo se o quadro está vazio.
export function caixaDoDesenho({ data, width, height }) {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

// Um toque acidental ou um ponto não é assinatura. O comprimento é somado em
// pixels de tela ao longo do traço.
const COMPRIMENTO_MINIMO_PX = 40
export function tracoSuficiente(comprimentoPx) {
  return comprimentoPx >= COMPRIMENTO_MINIMO_PX
}

export function dimensionarParaExportar(largura, altura, larguraMaxima) {
  if (largura <= larguraMaxima) return { w: largura, h: altura }
  const fator = larguraMaxima / largura
  return { w: larguraMaxima, h: Math.max(1, Math.round(altura * fator)) }
}
