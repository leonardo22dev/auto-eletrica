import { describe, it, expect } from 'vitest'
import { caixaDoDesenho, tracoSuficiente, dimensionarParaExportar } from './desenho.js'

// Monta um ImageData sintético: largura x altura, RGBA, tudo transparente.
function imagem(largura, altura, tintas = []) {
  const data = new Uint8ClampedArray(largura * altura * 4)
  for (const [x, y] of tintas) data[(y * largura + x) * 4 + 3] = 255
  return { data, width: largura, height: altura }
}

describe('caixaDoDesenho', () => {
  it('devolve a menor caixa que contém a tinta', () => {
    const img = imagem(10, 10, [[2, 3], [6, 8]])
    expect(caixaDoDesenho(img)).toEqual({ x: 2, y: 3, w: 5, h: 6 })
  })

  // Review Focus 3: nada desenhado não pode virar assinatura.
  it('devolve nulo quando o quadro está vazio', () => {
    expect(caixaDoDesenho(imagem(10, 10))).toBe(null)
  })

  it('aguenta um único ponto', () => {
    expect(caixaDoDesenho(imagem(5, 5, [[1, 1]]))).toEqual({ x: 1, y: 1, w: 1, h: 1 })
  })
})

describe('tracoSuficiente', () => {
  it('recusa o toque acidental e o ponto', () => {
    expect(tracoSuficiente(0)).toBe(false)
    expect(tracoSuficiente(5)).toBe(false)
  })

  it('aceita um traço de verdade', () => {
    expect(tracoSuficiente(80)).toBe(true)
  })
})

describe('dimensionarParaExportar', () => {
  it('não amplia o que já cabe', () => {
    expect(dimensionarParaExportar(300, 100, 500)).toEqual({ w: 300, h: 100 })
  })

  it('reduz mantendo a proporção', () => {
    expect(dimensionarParaExportar(1000, 400, 500)).toEqual({ w: 500, h: 200 })
  })

  it('nunca devolve dimensão zero', () => {
    const d = dimensionarParaExportar(2000, 1, 500)
    expect(d.w).toBeGreaterThan(0)
    expect(d.h).toBeGreaterThanOrEqual(1)
  })
})
