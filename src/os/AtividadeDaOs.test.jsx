import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ListaDeEventos } from './AtividadeDaOs.jsx'

const eventos = [
  { id: 2, acao: 'itens_alterados', usuario_nome: 'Maria',
    detalhe: { total_de: 0, total_para: 48000 }, em: '2026-10-14T18:32:00Z' },
  { id: 1, acao: 'criada', usuario_nome: 'Maria', detalhe: {}, em: '2026-10-14T18:30:00Z' },
]

describe('ListaDeEventos', () => {
  it('mostra cada evento com quem fez e quando', () => {
    const h = renderToString(<ListaDeEventos eventos={eventos} />)
    expect(h).toContain('Maria criou a OS')
    expect(h).toContain('Maria incluiu os itens')
    expect(h).toContain('14/10/2026')
  })

  it('sem eventos, avisa em vez de sumir', () => {
    const h = renderToString(<ListaDeEventos eventos={[]} />)
    expect(h).toContain('Nenhuma atividade')
  })
})
