import { describe, it, expect } from 'vitest'
import { mensagemWhatsApp } from './mensagem.js'

const config = { razao_social: 'Auto Elétrica MIZUHO II Ltda. - ME' }
const os = {
  numero: 1042, status: 'orcamento', cliente_nome: 'João Silva',
  veiculo_descricao: 'GM Chevette 1982', veiculo_placa: 'ABC1234',
}

describe('mensagemWhatsApp', () => {
  it('chama de orçamento enquanto for orçamento', () => {
    const m = mensagemWhatsApp({ os, config })
    expect(m).toContain('Olá, João Silva!')
    expect(m).toContain('o orçamento nº 1042')
    expect(m).toContain('GM Chevette 1982')
  })

  it('chama de OS depois de aprovada', () => {
    const m = mensagemWhatsApp({ os: { ...os, status: 'aprovada' }, config })
    expect(m).toContain('a OS nº 1042')
  })

  it('leva o link do PDF quando existe', () => {
    const m = mensagemWhatsApp({ os, config, urlPdf: 'https://x/pdf' })
    expect(m).toContain('https://x/pdf')
  })

  it('pede a assinatura e leva o link quando existe', () => {
    const m = mensagemWhatsApp({ os, config, urlAssinatura: 'https://x/assinar/abc' })
    expect(m).toMatch(/assine/i)
    expect(m).toContain('https://x/assinar/abc')
  })

  it('sem link de assinatura, não pede assinatura', () => {
    expect(mensagemWhatsApp({ os, config })).not.toMatch(/assine/i)
  })

  it('aguenta OS sem número', () => {
    const m = mensagemWhatsApp({ os: { ...os, numero: null }, config })
    expect(m).toContain('seu orçamento')
  })
})
