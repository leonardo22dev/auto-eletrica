import { describe, it, expect } from 'vitest'
import { normalizarCodigo, urlDeAssinatura } from './codigo.js'

const COD = 'a1b2c3d4'.repeat(8) // 64 hex

describe('normalizarCodigo', () => {
  it('aceita o código puro', () => {
    expect(normalizarCodigo(COD)).toBe(COD)
  })

  // Review Focus 2: o que o WhatsApp e o copiar-e-colar trazem junto.
  it('tira espaço, quebra de linha e pontuação em volta', () => {
    expect(normalizarCodigo(`  ${COD}\n`)).toBe(COD)
    expect(normalizarCodigo(`${COD}.`)).toBe(COD)
    expect(normalizarCodigo(`${COD},`)).toBe(COD)
    expect(normalizarCodigo(`${COD})`)).toBe(COD)
  })

  it('aceita maiúscula e devolve em minúscula', () => {
    expect(normalizarCodigo(COD.toUpperCase())).toBe(COD)
  })

  it('devolve vazio para o que não é código', () => {
    expect(normalizarCodigo('')).toBe('')
    expect(normalizarCodigo(null)).toBe('')
    expect(normalizarCodigo('abc')).toBe('')
    expect(normalizarCodigo('z'.repeat(64))).toBe('')
  })
})

describe('urlDeAssinatura', () => {
  it('monta o endereço sem barra duplicada', () => {
    expect(urlDeAssinatura('https://x.vercel.app', COD)).toBe(`https://x.vercel.app/assinar/${COD}`)
    expect(urlDeAssinatura('https://x.vercel.app/', COD)).toBe(`https://x.vercel.app/assinar/${COD}`)
  })
})
