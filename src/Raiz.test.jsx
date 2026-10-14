import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// Renderiza a Raiz de verdade, com o App de verdade. Só a autenticação é
// trocada por passagem direta: o que se testa aqui é o ROTEAMENTO — que a
// rota pública do cliente fica fora do login e que as rotas internas
// continuam alcançáveis depois de ganharem um `path="*"` por cima.
vi.stubEnv('VITE_MODO_DEMO', '1')

vi.mock('./auth/AuthProvider.jsx', () => ({
  AuthProvider: ({ children }) => children,
}))
vi.mock('./auth/AuthGate.jsx', () => ({
  default: ({ children }) => children,
}))

let Raiz

beforeAll(async () => {
  Raiz = (await import('./Raiz.jsx')).default
})

function pagina(caminho) {
  return renderToString(
    <MemoryRouter initialEntries={[caminho]}>
      <Raiz />
    </MemoryRouter>,
  )
}

const CODIGO = 'a1b2c3d4'.repeat(8)

describe('Raiz — roteamento', () => {
  it('a rota do cliente abre a página pública, sem a casca do sistema', () => {
    const html = pagina(`/assinar/${CODIGO}`)
    expect(html).toContain('Carregando')
    // Sem menu, sem abas e sem login: o cliente não tem conta.
    expect(html).not.toContain('Histórico')
    expect(html).not.toContain('Ajustes')
    expect(html).not.toContain('Entrar')
  })

  it('o Início continua abrindo na raiz', () => {
    const html = pagina('/')
    expect(html).toContain('Nova OS')
    expect(html).toContain('Histórico') // a aba da casca
    expect(html).not.toContain('Nº, cliente ou placa')
  })

  it('o Histórico continua abrindo em /os', () => {
    const html = pagina('/os')
    expect(html).toContain('Nº, cliente ou placa')
  })

  it('a Nova OS continua abrindo em /os/nova', () => {
    const html = pagina('/os/nova')
    expect(html).toContain('Itens')
    expect(html).toContain('Placa')
  })
})
