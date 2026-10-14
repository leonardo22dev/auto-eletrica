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

// Atribuir canvas.width limpa o quadro, mesmo com o mesmo valor. No celular o
// evento de resize dispara quando a barra de endereço some ao rolar a página,
// então só se redimensiona quando o tamanho mudou de verdade (a menos de um
// pixel), como ao girar o aparelho.
export function precisaRedimensionar(anterior, atual) {
  if (!anterior) return true
  return Math.abs(anterior.w - atual.w) >= 1 || Math.abs(anterior.h - atual.h) >= 1
}

export function dimensionarParaExportar(largura, altura, larguraMaxima) {
  if (largura <= larguraMaxima) return { w: largura, h: altura }
  const fator = larguraMaxima / largura
  return { w: larguraMaxima, h: Math.max(1, Math.round(altura * fator)) }
}
