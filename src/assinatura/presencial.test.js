import { describe, it, expect } from 'vitest'
import { situacaoPresencial, TEXTO_ENTREGUE } from './presencial.js'

const os = (extra = {}) => ({
  status: 'orcamento', total_centavos: 48000, aceite_em: null, ...extra,
})

describe('situacaoPresencial', () => {
  it('orçamento e aprovada podem ser assinados na hora', () => {
    expect(situacaoPresencial(os())).toBe('pode')
    expect(situacaoPresencial(os({ status: 'aprovada' }))).toBe('pode')
  })

  it('OS já assinada não assina de novo', () => {
    expect(situacaoPresencial(os({ aceite_em: '2026-10-14T15:32:00-03:00' }))).toBe('assinada')
  })

  it('finalizada e cancelada não aceitam assinatura', () => {
    expect(situacaoPresencial(os({ status: 'finalizada' }))).toBe('indisponivel')
    expect(situacaoPresencial(os({ status: 'cancelada' }))).toBe('indisponivel')
  })

  it('OS sem valor nenhum não vai para a assinatura', () => {
    // Assinar "de acordo" com um total zerado não quer dizer nada, e o
    // cliente assinaria um documento em branco.
    expect(situacaoPresencial(os({ total_centavos: 0 }))).toBe('sem_valor')
  })

  it('OS inexistente não quebra a tela', () => {
    expect(situacaoPresencial(null)).toBe('indisponivel')
    expect(situacaoPresencial(undefined)).toBe('indisponivel')
  })
})

describe('TEXTO_ENTREGUE', () => {
  it('instrui a entregar o aparelho ao cliente', () => {
    expect(TEXTO_ENTREGUE).toMatch(/entregue|passe/i)
    expect(TEXTO_ENTREGUE).toMatch(/cliente/i)
  })
})
