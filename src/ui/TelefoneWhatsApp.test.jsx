import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import TelefoneWhatsApp from './TelefoneWhatsApp.jsx'

const html = (telefone) => renderToString(<TelefoneWhatsApp telefone={telefone} />)

describe('TelefoneWhatsApp', () => {
  it('mostra o número como foi digitado', () => {
    expect(html('(11) 98888-7777')).toContain('(11) 98888-7777')
  })

  it('o número vira um atalho para a conversa no WhatsApp', () => {
    const h = html('(11) 98888-7777')
    expect(h).toContain('href="https://wa.me/5511988887777')
    expect(h).toMatch(/WhatsApp/i) // nome acessível do atalho
  })

  it('mostra o símbolo do WhatsApp, não um balão genérico', () => {
    const h = html('(11) 98888-7777')
    expect(h).toContain('<svg')
    expect(h).not.toContain('lucide') // o ícone genérico da biblioteca
  })

  it('abre em outra aba sem dar acesso à nossa', () => {
    const h = html('(11) 98888-7777')
    expect(h).toContain('target="_blank"')
    expect(h).toContain('rel="noopener noreferrer"')
  })

  it('aceita telefone fixo com DDD', () => {
    expect(html('11 4355-9830')).toContain('href="https://wa.me/551143559830')
  })

  it('número incompleto fica só como texto, sem atalho quebrado', () => {
    const h = html('9999')
    expect(h).toContain('9999')
    expect(h).not.toContain('href')
  })

  it('sem telefone, não mostra nada de atalho', () => {
    for (const vazio of ['', null, undefined]) {
      const h = renderToString(<TelefoneWhatsApp telefone={vazio} />)
      expect(h).not.toContain('href')
    }
  })
})
