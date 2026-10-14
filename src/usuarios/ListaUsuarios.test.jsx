import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import ListaUsuarios from './ListaUsuarios.jsx'

const usuarios = [
  { user_id: 'eu', usuario: 'dono', nome: 'Dono da Oficina', papel: 'admin', ativo: true },
  { user_id: 'm', usuario: 'maria', nome: 'Maria Souza', papel: 'atendente', ativo: true },
  { user_id: 'j', usuario: 'joao', nome: 'João Lima', papel: 'atendente', ativo: false },
]

const nada = () => {}
function html(extra = {}) {
  return renderToString(
    <ListaUsuarios usuarios={usuarios} euId="eu" aoEditar={nada} aoBloquear={nada}
      aoReativar={nada} aoRedefinir={nada} {...extra} />)
}

describe('ListaUsuarios', () => {
  it('mostra nome, usuário, nível e situação de cada pessoa', () => {
    const h = html()
    expect(h).toContain('Maria Souza')
    expect(h).toContain('@maria')
    expect(h).toContain('Administrador')
    expect(h).toContain('Atendente')
    expect(h).toContain('Bloqueado')
  })

  it('marca a própria linha com "Você"', () => {
    expect(html()).toContain('Você')
  })

  it('na própria linha não oferece bloquear', () => {
    // Três linhas: o próprio (sem "Bloquear"), Maria (com) e João (com "Reativar").
    const h = html()
    expect(h.match(/Bloquear/g)).toHaveLength(1)
    expect(h.match(/Reativar/g)).toHaveLength(1)
  })

  it('toda linha, inclusive a própria, oferece trocar a senha', () => {
    expect(html().match(/Redefinir senha/g)).toHaveLength(3)
  })

  it('lista vazia mostra um estado vazio, não uma tabela quebrada', () => {
    expect(html({ usuarios: [] })).toContain('Nenhum usuário')
  })
})
