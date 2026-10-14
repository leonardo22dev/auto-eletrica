import { describe, it, expect } from 'vitest'
import { precisaRedimensionar } from './desenho.js'

// Atribuir canvas.width limpa o quadro, mesmo com o mesmo valor. No celular o
// evento de resize dispara quando a barra de endereço some ao rolar a página:
// a assinatura desaparecia, e o botão seguia habilitado porque o comprimento
// do traço continuava somado.
describe('precisaRedimensionar', () => {
  it('na primeira medição, sim', () => {
    expect(precisaRedimensionar(null, { w: 320, h: 180 })).toBe(true)
  })

  it('não, quando o tamanho é o mesmo', () => {
    expect(precisaRedimensionar({ w: 320, h: 180 }, { w: 320, h: 180 })).toBe(false)
  })

  it('não, para diferença de fração de pixel', () => {
    expect(precisaRedimensionar({ w: 320, h: 180 }, { w: 320.4, h: 180.2 })).toBe(false)
  })

  it('sim, quando a largura muda de verdade, como ao girar o celular', () => {
    expect(precisaRedimensionar({ w: 320, h: 180 }, { w: 640, h: 180 })).toBe(true)
  })

  it('sim, quando a altura muda', () => {
    expect(precisaRedimensionar({ w: 320, h: 180 }, { w: 320, h: 220 })).toBe(true)
  })
})
