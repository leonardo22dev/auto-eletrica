import { describe, it, expect } from 'vitest'
import { situacaoGarantia } from './situacaoGarantia.js'

const finalizada = { status: 'finalizada', data_os: '2026-05-10' }

describe('situacaoGarantia', () => {
  it('é vigente dentro do prazo', () => {
    const s = situacaoGarantia(finalizada, 3, '2026-07-01')
    expect(s.vigente).toBe(true)
    expect(s.vencimento).toBe('2026-08-10')
  })

  it('é vigente no próprio dia do vencimento', () => {
    expect(situacaoGarantia(finalizada, 3, '2026-08-10').vigente).toBe(true)
  })

  // O defeito que isto existe para impedir: a tela afirmava "vigente até
  // 10/08" em outubro, no balcão, para o cliente ler.
  it('não é vigente depois do vencimento, mas informa quando acabou', () => {
    const s = situacaoGarantia(finalizada, 3, '2026-10-14')
    expect(s.vigente).toBe(false)
    expect(s.vencimento).toBe('2026-08-10')
  })

  it('não tem garantia enquanto a OS não for finalizada', () => {
    for (const status of ['orcamento', 'aprovada', 'cancelada']) {
      const s = situacaoGarantia({ status, data_os: '2026-05-10' }, 3, '2026-07-01')
      expect(s.vencimento).toBe(null)
      expect(s.vigente).toBe(false)
    }
  })

  it('não quebra sem OS nem sem data', () => {
    expect(situacaoGarantia(null, 3, '2026-07-01')).toEqual({ vencimento: null, vigente: false })
    expect(situacaoGarantia({ status: 'finalizada' }, 3, '2026-07-01'))
      .toEqual({ vencimento: null, vigente: false })
  })

  it('respeita o prazo configurado, não um número fixo', () => {
    expect(situacaoGarantia(finalizada, 6, '2026-07-01').vencimento).toBe('2026-11-10')
    expect(situacaoGarantia(finalizada, 1, '2026-07-01').vigente).toBe(false)
  })
})
