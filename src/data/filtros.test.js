import { describe, it, expect } from 'vitest'
import { condicaoIlike } from './filtros.js'

// O valor de `or=` do PostgREST é uma lista separada por vírgula com grupos
// entre parênteses. Termo cru com vírgula ou parêntese corta a condição no
// meio e a consulta volta 400 — buscar um cliente por "(11) 98888" derrubava
// a tela com "Não foi possível listar os clientes."
describe('condicaoIlike', () => {
  it('envolve o valor em aspas, que é o que torna a vírgula segura', () => {
    expect(condicaoIlike('nome', 'Silva')).toBe('nome.ilike."%Silva%"')
  })

  it('aguenta telefone com parêntese, espaço e hífen', () => {
    expect(condicaoIlike('telefone', '(11) 98888-7777'))
      .toBe('telefone.ilike."%(11) 98888-7777%"')
  })

  it('aguenta vírgula no nome', () => {
    expect(condicaoIlike('nome', 'Silva, José'))
      .toBe('nome.ilike."%Silva, José%"')
  })

  it('escapa aspas e barra invertida, que quebrariam as aspas', () => {
    expect(condicaoIlike('nome', 'Jo"ao')).toBe('nome.ilike."%Jo\\"ao%"')
    expect(condicaoIlike('nome', 'a\\b')).toBe('nome.ilike."%a\\\\b%"')
  })

  it('aguenta ponto, dois-pontos e asterisco, que são sintaxe do PostgREST', () => {
    expect(condicaoIlike('nome', 'J.R: *')).toBe('nome.ilike."%J.R: *%"')
  })
})
