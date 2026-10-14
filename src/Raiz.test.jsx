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

// A casca e as rotas de administrador leem o perfil de quem está logado.
const estado = vi.hoisted(() => ({
  perfil: { user_id: 'u1', usuario: 'dono', nome: 'Dono', papel: 'admin', ativo: true },
}))
vi.mock('./auth/contexto.js', () => ({
  AuthCtx: {},
  useAuth: () => ({ perfil: estado.perfil, sair: () => {} }),
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

  it('o administrador abre a aba Usuários em /usuarios', () => {
    const html = pagina('/usuarios')
    expect(html).toContain('Usuários')
    expect(html).not.toContain('Nova OS')
  })

  // Em renderização no servidor o <Navigate> não executa o redirecionamento;
  // o que se verifica é que a página protegida NÃO é entregue ao atendente.
  it('o atendente que digita /usuarios não recebe a aba Usuários', () => {
    const original = estado.perfil
    estado.perfil = { ...original, papel: 'atendente' }
    try {
      expect(pagina('/usuarios')).not.toContain('Usuários')
    } finally {
      estado.perfil = original
    }
  })

  it('o atendente que digita /configuracoes não recebe os Ajustes', () => {
    const original = estado.perfil
    estado.perfil = { ...original, papel: 'atendente' }
    try {
      const html = pagina('/configuracoes')
      // A página de Ajustes, ainda sem dados, mostra "Carregando…": se ela
      // fosse entregue ao atendente, este texto apareceria.
      expect(html).not.toContain('Carregando')
      expect(html).not.toContain('Ajustes')
    } finally {
      estado.perfil = original
    }
  })
})
