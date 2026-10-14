import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import ListaDeItens from './ListaDeItens.jsx'
import { rotuloDoTotal } from '../os/valorTotal.js'

const detalhado = [
  { posicao: 1, quantidade: 1, descricao: 'Alternador',
    valor_unitario_centavos: 38000, valor_total_centavos: 38000 },
  { posicao: 2, quantidade: 2, descricao: 'Correia',
    valor_unitario_centavos: 5000, valor_total_centavos: 10000 },
]
const valorTotal = [
  { posicao: 1, quantidade: 1, descricao: 'Troca de alternador',
    valor_unitario_centavos: 0, valor_total_centavos: 0 },
  { posicao: 2, quantidade: 2, descricao: 'Troca de baterias',
    valor_unitario_centavos: 0, valor_total_centavos: 0 },
  { posicao: 3, quantidade: 1, descricao: 'Valor total',
    valor_unitario_centavos: 120000, valor_total_centavos: 120000 },
]

describe('ListaDeItens (o que o cliente vê antes de assinar)', () => {
  it('OS itemizada: cada item com unitário e total', () => {
    const h = renderToString(<ListaDeItens itens={detalhado} />)
    expect(h).toContain('Alternador')
    expect(h).toContain('Unit.')
    expect(h).toContain('380,00')
    expect(h).toContain('100,00')
  })

  it('valor total: só os serviços, sem preço por item', () => {
    const h = renderToString(<ListaDeItens itens={valorTotal} />)
    expect(h).toContain('Troca de alternador')
    expect(h).toContain('Troca de baterias')
    expect(h).not.toContain('Unit.')
    expect(h).not.toContain('0,00')
  })

  it('valor total: a linha de fechamento não repete na lista (o total está logo abaixo)', () => {
    const h = renderToString(<ListaDeItens itens={valorTotal} />)
    expect(h).not.toContain('Valor total')
    expect(h).not.toContain('1.200,00')
  })

  it('o total se chama "Valor total" nesse modo e "Total" no itemizado', () => {
    expect(rotuloDoTotal(valorTotal)).toBe('Valor total')
    expect(rotuloDoTotal(detalhado)).toBe('Total')
    expect(rotuloDoTotal([])).toBe('Total')
  })
})
