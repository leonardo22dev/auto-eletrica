import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ListaOsExcluidas } from './OsExcluidas.jsx'

const registros = [
  {
    id: 2, os_id: 'b', numero: 1043, cliente_nome: 'Ana Ribeiro', veiculo_placa: 'LMN4P89',
    veiculo_descricao: 'Volvo V70', status: 'aprovada', total_centavos: 48000,
    assinada: true, aceite_em: '2026-10-14T18:32:00Z',
    excluida_por_nome: 'Dono da Oficina', excluida_em: '2026-10-15T13:05:00Z',
  },
  {
    id: 1, os_id: 'a', numero: null, cliente_nome: 'João Silva', veiculo_placa: 'ABC1234',
    veiculo_descricao: 'Chevette', status: 'cancelada', total_centavos: 0,
    assinada: false, aceite_em: null,
    excluida_por_nome: 'Dono da Oficina', excluida_em: '2026-10-14T12:00:00Z',
  },
]

describe('ListaOsExcluidas', () => {
  it('mostra o que era a OS, quem excluiu e quando', () => {
    const h = renderToString(<ListaOsExcluidas registros={registros} />)
    expect(h).toContain('Ana Ribeiro')
    expect(h).toContain('1043')
    expect(h).toContain('LMN4P89') // Mercosul: sem hífen
    expect(h).toContain('ABC-1234') // modelo antigo: com hífen
    expect(h).toContain('Dono da Oficina')
    expect(h).toContain('15/10/2026')
  })

  it('marca as que estavam assinadas', () => {
    const h = renderToString(<ListaOsExcluidas registros={registros} />)
    expect(h).toMatch(/estava assinada/i)
    expect(h.match(/estava assinada/gi)).toHaveLength(1)
  })

  it('OS sem número não escreve "null"', () => {
    const h = renderToString(<ListaOsExcluidas registros={registros} />)
    expect(h).not.toContain('null')
    expect(h).toContain('João Silva')
  })

  it('sem registros, diz que não há nenhuma', () => {
    expect(renderToString(<ListaOsExcluidas registros={[]} />)).toMatch(/Nenhuma OS excluída/)
  })
})
