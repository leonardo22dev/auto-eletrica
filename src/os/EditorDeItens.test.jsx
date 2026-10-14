import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import EditorDeItens from './EditorDeItens.jsx'

const nada = () => {}
const detalhado = [
  { quantidade: '1', descricao: 'Alternador', valor_unitario_centavos: 38000 },
]
const valorTotal = [
  { quantidade: '1', descricao: 'Troca de alternador', valor_unitario_centavos: 0 },
  { quantidade: '2', descricao: 'Troca de baterias', valor_unitario_centavos: 0 },
  { quantidade: '1', descricao: 'Valor total', valor_unitario_centavos: 120000 },
]

const html = (itens, extra = {}) =>
  renderToString(<EditorDeItens itens={itens} aoMudar={nada} {...extra} />)

describe('EditorDeItens', () => {
  it('detalhado: mostra o valor unitário de cada item', () => {
    const h = html(detalhado)
    expect(h).toContain('Unit.')
    expect(h).toContain('Adicionar item')
    expect(h).not.toContain('Adicionar serviço')
  })

  it('valor total: serviços sem campo de preço e o campo do valor total', () => {
    const h = html(valorTotal)
    expect(h).toContain('Troca de alternador')
    expect(h).toContain('Troca de baterias')
    expect(h).toContain('Adicionar serviço')
    expect(h).not.toContain('Unit.')
    expect(h).toContain('value="1.200,00"')
  })

  it('o campo do valor total tem o nome acessível "Valor total"', () => {
    expect(html(valorTotal)).toContain('aria-label="Valor total"')
  })

  it('oferece a troca de modo, com o nome "Valor total"', () => {
    const h = html(detalhado)
    expect(h).toContain('Detalhar valores')
    expect(h).toContain('Valor total')
    expect(h).not.toMatch(/combinado/i)
  })

  it('OS assinada: sem troca de modo e sem adicionar', () => {
    const h = html(valorTotal, { somenteLeitura: true })
    expect(h).not.toContain('Detalhar valores')
    expect(h).not.toContain('Adicionar serviço')
    expect(h).toContain('Troca de alternador')
    expect(h).toContain('value="1.200,00"')
  })

  it('OS assinada, detalhada: continua mostrando os itens', () => {
    const h = html(detalhado, { somenteLeitura: true })
    expect(h).not.toContain('Detalhar valores')
    expect(h).toContain('Alternador')
  })
})
