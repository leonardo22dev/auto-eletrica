import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthCtx } from '../auth/contexto.js'
import AppShell from './AppShell.jsx'

function casca(perfil) {
  return renderToString(
    <AuthCtx.Provider value={{ perfil, sair: () => {} }}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>conteúdo</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthCtx.Provider>,
  )
}

describe('AppShell', () => {
  it('administrador vê Usuários e Ajustes', () => {
    const html = casca({ nome: 'Dono', papel: 'admin', ativo: true })
    expect(html).toContain('Usuários')
    expect(html).toContain('Ajustes')
  })

  it('atendente não vê Usuários nem Ajustes', () => {
    const html = casca({ nome: 'Maria', papel: 'atendente', ativo: true })
    expect(html).not.toContain('Usuários')
    expect(html).not.toContain('Ajustes')
    expect(html).toContain('Início')
    expect(html).toContain('Histórico')
  })

  it('mostra quem está logado, o nível e o Sair, para todos', () => {
    const html = casca({ nome: 'Maria', papel: 'atendente', ativo: true })
    expect(html).toContain('Maria')
    expect(html).toContain('Atendente')
    expect(html).toContain('Sair')
  })
})
