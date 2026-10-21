import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import IconeWhatsApp from './IconeWhatsApp.jsx'

describe('IconeWhatsApp', () => {
  it('desenha o símbolo do WhatsApp como SVG', () => {
    const h = renderToString(<IconeWhatsApp />)
    expect(h).toContain('<svg')
    expect(h).toContain('viewBox="0 0 24 24"')
    expect(h).toContain('<path')
  })

  it('herda a cor de quem o usa, para servir em botão verde e em texto', () => {
    expect(renderToString(<IconeWhatsApp />)).toContain('currentColor')
  })

  it('aceita o tamanho', () => {
    const h = renderToString(<IconeWhatsApp size={24} />)
    expect(h).toContain('width="24"')
    expect(h).toContain('height="24"')
  })

  it('é decorativo: o leitor de tela lê o texto ao lado, não o ícone', () => {
    expect(renderToString(<IconeWhatsApp />)).toContain('aria-hidden="true"')
  })
})
