import { describe, it, expect } from 'vitest'
import { acaoParaErro } from './erros.js'

describe('acaoParaErro', () => {
  // Review Focus 1: o segundo toque não é erro, é o estado final.
  it('ja_assinada recarrega e mostra o estado assinado', () => {
    expect(acaoParaErro('ja_assinada').tipo).toBe('recarregar')
  })

  // Review Focus 4: o valor mudou enquanto o cliente olhava.
  it('total_divergente recarrega e avisa que o orçamento mudou', () => {
    const a = acaoParaErro('total_divergente')
    expect(a.tipo).toBe('recarregar')
    expect(a.texto).toMatch(/atualizado/i)
  })

  it('link_invalido e status_invalido recarregam para a tela correspondente', () => {
    expect(acaoParaErro('link_invalido').tipo).toBe('recarregar')
    expect(acaoParaErro('status_invalido').tipo).toBe('recarregar')
  })

  it('assinatura_invalida pede para refazer o desenho', () => {
    expect(acaoParaErro('assinatura_invalida').tipo).toBe('refazer')
  })

  it('erro desconhecido ou de rede permite tentar de novo', () => {
    expect(acaoParaErro('Failed to fetch').tipo).toBe('tentar')
    expect(acaoParaErro(undefined).tipo).toBe('tentar')
  })

  it('reconhece o código dentro de uma mensagem maior', () => {
    expect(acaoParaErro('P0001: total_divergente (detalhe)').tipo).toBe('recarregar')
  })
})
