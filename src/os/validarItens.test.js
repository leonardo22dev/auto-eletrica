import { describe, it, expect } from 'vitest'
import { validarItens } from './validarItens.js'

const item = (extra) => ({ quantidade: '1', descricao: '', valor_unitario_centavos: 0, ...extra })

describe('validarItens', () => {
  it('aceita itens completos e devolve só eles', () => {
    const r = validarItens([
      item({ descricao: 'Alternador', valor_unitario_centavos: 38000 }),
      item({ descricao: 'Correia', valor_unitario_centavos: 10000 }),
    ])
    expect(r.erro).toBe('')
    expect(r.itens).toHaveLength(2)
  })

  // A linha em branco do fim do formulário é descarte legítimo.
  it('descarta linha totalmente vazia sem reclamar', () => {
    const r = validarItens([
      item({ descricao: 'Alternador', valor_unitario_centavos: 38000 }),
      item(),
    ])
    expect(r.erro).toBe('')
    expect(r.itens).toHaveLength(1)
  })

  // Descartar uma linha que tem dinheiro é decisão do usuário, não do filtro:
  // o rodapé somava o valor e o documento sairia sem ele.
  it('recusa item com valor e sem discriminação', () => {
    const r = validarItens([item({ valor_unitario_centavos: 15000 })])
    expect(r.erro).toContain('1')
    expect(r.erro).toContain('discriminação')
    expect(r.itens).toHaveLength(0)
  })

  it('aponta o número da linha certa', () => {
    const r = validarItens([
      item({ descricao: 'Alternador', valor_unitario_centavos: 38000 }),
      item({ descricao: 'Correia', valor_unitario_centavos: 10000 }),
      item({ valor_unitario_centavos: 500 }),
    ])
    expect(r.erro).toContain('3')
  })

  it('recusa quantidade que não é número', () => {
    const r = validarItens([
      item({ quantidade: 'abc', descricao: 'Alternador', valor_unitario_centavos: 100 }),
    ])
    expect(r.erro).toContain('quantidade')
  })

  it('recusa quantidade zero ou negativa', () => {
    expect(validarItens([item({ quantidade: '0', descricao: 'X', valor_unitario_centavos: 1 })]).erro)
      .toContain('quantidade')
    expect(validarItens([item({ quantidade: '-1', descricao: 'X', valor_unitario_centavos: 1 })]).erro)
      .toContain('quantidade')
  })

  it('normaliza a quantidade escrita com vírgula', () => {
    const r = validarItens([
      item({ quantidade: '0,5', descricao: 'Fluido', valor_unitario_centavos: 4000 }),
    ])
    expect(r.erro).toBe('')
    expect(r.itens[0].quantidade).toBe(0.5)
    expect(r.itens[0].valor_total_centavos).toBe(2000)
  })

  it('numera as posições na ordem da tela', () => {
    const r = validarItens([
      item({ descricao: 'Primeiro', valor_unitario_centavos: 100 }),
      item(),
      item({ descricao: 'Segundo', valor_unitario_centavos: 100 }),
    ])
    expect(r.itens.map((i) => i.posicao)).toEqual([1, 2])
    expect(r.itens[1].descricao).toBe('Segundo')
  })

  it('aceita lista vazia — OS sem itens é permitida', () => {
    const r = validarItens([])
    expect(r.erro).toBe('')
    expect(r.itens).toHaveLength(0)
  })

  it('aceita item com descrição e valor zero, como serviço de cortesia', () => {
    const r = validarItens([item({ descricao: 'Revisão de cortesia' })])
    expect(r.erro).toBe('')
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0].valor_total_centavos).toBe(0)
  })
})
