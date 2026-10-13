import { describe, it, expect } from 'vitest'
import { somenteDigitos, telefoneWhatsApp, linkWhatsApp } from './telefone.js'

describe('somenteDigitos', () => {
  it('tira tudo que não é número', () => {
    expect(somenteDigitos('(11) 98888-7777')).toBe('11988887777')
    expect(somenteDigitos('+55 11 98888-7777')).toBe('5511988887777')
    expect(somenteDigitos(null)).toBe('')
  })
})

// Review Focus 4: o dono vai digitar telefone de todo jeito. Todos
// precisam chegar no mesmo contato do WhatsApp.
describe('telefoneWhatsApp', () => {
  it('põe o DDI 55 quando falta', () => {
    expect(telefoneWhatsApp('(11) 98888-7777')).toBe('5511988887777')
    expect(telefoneWhatsApp('11988887777')).toBe('5511988887777')
  })

  it('não duplica o DDI quando já existe', () => {
    expect(telefoneWhatsApp('+55 11 98888-7777')).toBe('5511988887777')
    expect(telefoneWhatsApp('5511988887777')).toBe('5511988887777')
  })

  it('aceita fixo de 10 dígitos', () => {
    expect(telefoneWhatsApp('(11) 4355-9830')).toBe('551143559830')
  })

  it('devolve nulo para telefone curto demais ou ausente', () => {
    expect(telefoneWhatsApp('9830')).toBe(null)
    expect(telefoneWhatsApp('')).toBe(null)
    expect(telefoneWhatsApp(null)).toBe(null)
  })
})

describe('linkWhatsApp', () => {
  it('monta o link com o texto escapado', () => {
    expect(linkWhatsApp('(11) 98888-7777', 'Olá João'))
      .toBe('https://wa.me/5511988887777?text=Ol%C3%A1%20Jo%C3%A3o')
  })

  it('abre o WhatsApp sem destinatário quando o telefone não serve', () => {
    expect(linkWhatsApp('', 'Olá')).toBe('https://wa.me/?text=Ol%C3%A1')
  })
})
