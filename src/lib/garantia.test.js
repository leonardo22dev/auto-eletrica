import { describe, it, expect } from 'vitest'
import { vencimentoGarantia, garantiaVigente } from './garantia.js'

describe('vencimentoGarantia', () => {
  it('soma os meses configurados', () => {
    expect(vencimentoGarantia('2026-08-12', 3)).toBe('2026-11-12')
    expect(vencimentoGarantia('2026-08-12', 6)).toBe('2027-02-12')
  })

  it('vira o ano', () => {
    expect(vencimentoGarantia('2026-11-20', 3)).toBe('2027-02-20')
  })

  // Review Focus 2: 31/01 + 3 meses não existe em abril.
  // Tem que cair no último dia do mês, não transbordar para maio.
  it('ancora no último dia quando o mês de destino é mais curto', () => {
    expect(vencimentoGarantia('2026-01-31', 3)).toBe('2026-04-30')
    expect(vencimentoGarantia('2026-01-31', 1)).toBe('2026-02-28')
    expect(vencimentoGarantia('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('devolve nulo sem data de conclusão', () => {
    expect(vencimentoGarantia(null, 3)).toBe(null)
    expect(vencimentoGarantia('', 3)).toBe(null)
  })
})

describe('garantiaVigente', () => {
  it('é vigente até o próprio dia do vencimento', () => {
    expect(garantiaVigente('2026-11-12', '2026-11-11')).toBe(true)
    expect(garantiaVigente('2026-11-12', '2026-11-12')).toBe(true)
    expect(garantiaVigente('2026-11-12', '2026-11-13')).toBe(false)
  })

  it('não é vigente sem vencimento', () => {
    expect(garantiaVigente(null, '2026-11-11')).toBe(false)
  })
})
