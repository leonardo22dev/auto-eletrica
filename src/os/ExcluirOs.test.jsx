import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import ConfirmarExclusao, { BotaoExcluirOs } from './ExcluirOs.jsx'

const nada = () => {}
const os = { id: 'x', numero: 1042, cliente_nome: 'João Silva', veiculo_placa: 'ABC1234', aceite_em: null }

describe('BotaoExcluirOs', () => {
  it('o administrador vê o botão', () => {
    const h = renderToString(
      <BotaoExcluirOs perfil={{ papel: 'admin', ativo: true }} aoClicar={nada} />)
    expect(h).toContain('Excluir OS')
  })

  it('o atendente não vê o botão', () => {
    const h = renderToString(
      <BotaoExcluirOs perfil={{ papel: 'atendente', ativo: true }} aoClicar={nada} />)
    expect(h).not.toContain('Excluir')
  })

  it('administrador bloqueado, ou sem perfil, também não', () => {
    expect(renderToString(
      <BotaoExcluirOs perfil={{ papel: 'admin', ativo: false }} aoClicar={nada} />)).not.toContain('Excluir')
    expect(renderToString(<BotaoExcluirOs perfil={null} aoClicar={nada} />)).not.toContain('Excluir')
  })
})

describe('ConfirmarExclusao', () => {
  const html = (extra = {}) => renderToString(
    <ConfirmarExclusao os={os} aoConfirmar={nada} aoCancelar={nada} ocupado={false} {...extra} />)

  it('diz o que vai ser apagado e o que fica', () => {
    const h = html()
    expect(h).toContain('1042')
    expect(h).toContain('João Silva')
    expect(h).toMatch(/itens/)
    expect(h).toMatch(/atividade/)
    expect(h).toMatch(/registro mínimo/)
    expect(h).toContain('Excluir de vez')
    expect(h).toContain('Voltar')
  })

  it('OS assinada leva um aviso a mais sobre o aceite do cliente', () => {
    expect(html()).not.toMatch(/assinou/)
    const h = html({ os: { ...os, aceite_em: '2026-10-14T15:32:00-03:00' } })
    expect(h).toMatch(/assinou/)
    expect(h).toMatch(/aceite/)
  })

  it('OS sem número (cancelada) ainda tem confirmação legível', () => {
    const h = html({ os: { ...os, numero: null } })
    expect(h).toContain('João Silva')
    expect(h).not.toContain('null')
  })

  it('enquanto exclui, os botões ficam desabilitados', () => {
    const h = html({ ocupado: true })
    expect(h.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
