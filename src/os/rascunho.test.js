import { describe, it, expect, beforeEach } from 'vitest'
import { salvarRascunho, lerRascunho, limparRascunho } from './rascunho.js'

function memoria() {
  const mapa = new Map()
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
  }
}

beforeEach(() => {
  globalThis.localStorage = memoria()
})

describe('rascunho', () => {
  it('guarda e devolve o que foi salvo', () => {
    salvarRascunho({ placa: 'ABC1D23', itens: [{ descricao: 'Bateria' }] })
    expect(lerRascunho()).toEqual({
      placa: 'ABC1D23', itens: [{ descricao: 'Bateria' }],
    })
  })

  it('devolve nulo quando não há rascunho', () => {
    expect(lerRascunho()).toBe(null)
  })

  it('limpa', () => {
    salvarRascunho({ placa: 'ABC1D23' })
    limparRascunho()
    expect(lerRascunho()).toBe(null)
  })

  it('devolve nulo e não explode com conteúdo corrompido', () => {
    globalThis.localStorage.setItem('mizuho:rascunho-os', '{isso não é json')
    expect(lerRascunho()).toBe(null)
  })

  it('não explode quando o navegador bloqueia o armazenamento', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('bloqueado') },
      removeItem: () => { throw new Error('bloqueado') },
    }
    expect(() => salvarRascunho({ placa: 'X' })).not.toThrow()
    expect(lerRascunho()).toBe(null)
    expect(() => limparRascunho()).not.toThrow()
  })
})
