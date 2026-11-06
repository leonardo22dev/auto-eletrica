import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { SeletorDeMes, ResumoDoPeriodo } from './PeriodoDoHistorico.jsx'
import { totalDoPeriodo } from './periodo.js'

const nada = () => {}
const os = (nome, status, centavos) =>
  ({ id: nome, cliente_nome: nome, status, total_centavos: centavos })

describe('SeletorDeMes', () => {
  const html = (extra = {}) => renderToString(
    <SeletorDeMes meses={['2026-11', '2026-10', '2026-09']} valor="" aoMudar={nada} {...extra} />)

  it('oferece os meses por extenso, do mais recente ao mais antigo', () => {
    const h = html()
    expect(h).toContain('Novembro de 2026')
    expect(h).toContain('Outubro de 2026')
    expect(h).toContain('Setembro de 2026')
    expect(h.indexOf('Novembro')).toBeLessThan(h.indexOf('Setembro'))
  })

  it('começa em "Todos os meses", que é como o Histórico sempre foi', () => {
    expect(html()).toContain('Todos os meses')
  })

  it('mostra o mês escolhido como selecionado', () => {
    expect(html({ valor: '2026-10' })).toMatch(/value="2026-10"[^>]*selected|selected[^>]*value="2026-10"/)
  })

  it('tem nome acessível, para quem usa leitor de tela', () => {
    expect(html()).toMatch(/aria-label="[^"]*[Mm]ês/)
  })
})

describe('totalDoPeriodo', () => {
  it('soma o que a oficina vai receber', () => {
    expect(totalDoPeriodo([
      os('a', 'finalizada', 10000), os('b', 'aprovada', 25000),
    ])).toBe(35000)
  })

  it('OS cancelada não entra na conta', () => {
    expect(totalDoPeriodo([
      os('a', 'finalizada', 10000), os('b', 'cancelada', 99900),
    ])).toBe(10000)
  })

  it('lista vazia soma zero', () => {
    expect(totalDoPeriodo([])).toBe(0)
  })
})

describe('ResumoDoPeriodo', () => {
  const lista = [os('a', 'finalizada', 10000), os('b', 'cancelada', 5000), os('c', 'aprovada', 2500)]
  const html = (extra = {}) =>
    renderToString(<ResumoDoPeriodo mes="2026-09" ordens={lista} {...extra} />)

  it('diz o mês, quantas OS e o total', () => {
    const h = html()
    expect(h).toContain('Setembro de 2026')
    expect(h).toContain('3 OS')
    expect(h).toContain('125,00')
  })

  it('uma OS só não vira "1 OSs"', () => {
    expect(html({ ordens: [lista[0]] })).toContain('1 OS')
  })

  it('mês sem OS avisa, em vez de somar zero em silêncio', () => {
    const h = html({ ordens: [] })
    expect(h).toMatch(/Nenhuma OS/)
  })

  it('sem mês escolhido, não aparece resumo nenhum', () => {
    expect(renderToString(<ResumoDoPeriodo mes="" ordens={lista} />)).toBe('')
  })
})
