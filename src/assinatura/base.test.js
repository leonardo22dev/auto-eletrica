import { describe, it, expect } from 'vitest'
import { baseDaUrl } from './codigo.js'

// O link vai para o cliente. Se o dono abrir o sistema por um endereço de
// preview da Vercel (que pede login da Vercel) ou por um IP de rede local, o
// cliente recebe um link que não abre. Um endereço público configurado resolve.
describe('baseDaUrl', () => {
  it('usa o endereço configurado quando existe', () => {
    expect(baseDaUrl('https://oficina.exemplo.com', 'https://preview-x.vercel.app'))
      .toBe('https://oficina.exemplo.com')
  })

  it('tira a barra do final do endereço configurado', () => {
    expect(baseDaUrl('https://oficina.exemplo.com/', 'https://x')).toBe('https://oficina.exemplo.com')
  })

  it('cai na origem do navegador quando não há configuração', () => {
    expect(baseDaUrl(undefined, 'https://autoeletricamizuho.vercel.app'))
      .toBe('https://autoeletricamizuho.vercel.app')
    expect(baseDaUrl('', 'https://x')).toBe('https://x')
    expect(baseDaUrl('   ', 'https://x')).toBe('https://x')
  })
})
