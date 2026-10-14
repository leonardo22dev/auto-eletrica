import { describe, it, expect } from 'vitest'
import { validarDadosDaOs, CAMPOS_VAZIOS } from './dadosOs.js'

const bom = {
  veiculo_placa: 'ABC1234',
  data_os: '2026-10-14',
  cliente_nome: 'João Silva',
  cliente_telefone: '(11) 98888-7777',
  veiculo_descricao: 'GM Chevette 1982',
}

describe('validarDadosDaOs', () => {
  it('aceita os campos completos e normaliza a placa', () => {
    const r = validarDadosDaOs({ ...bom, veiculo_placa: 'abc-1234' })
    expect(r.erro).toBe('')
    expect(r.dados.veiculo_placa).toBe('ABC1234')
  })

  it('apara espaço das pontas', () => {
    const r = validarDadosDaOs({ ...bom, cliente_nome: '  João Silva  ' })
    expect(r.dados.cliente_nome).toBe('João Silva')
  })

  // Review Focus 5: campo em branco precisa dizer qual é.
  it('recusa sem nome, dizendo qual campo falta', () => {
    const r = validarDadosDaOs({ ...bom, cliente_nome: '   ' })
    expect(r.erro).toContain('nome')
  })

  it('recusa sem descrição do veículo', () => {
    const r = validarDadosDaOs({ ...bom, veiculo_descricao: '' })
    expect(r.erro).toContain('veículo')
  })

  it('recusa placa inválida', () => {
    expect(validarDadosDaOs({ ...bom, veiculo_placa: 'ABC12' }).erro).toContain('laca')
    expect(validarDadosDaOs({ ...bom, veiculo_placa: '' }).erro).toContain('laca')
  })

  it('recusa data fora do formato', () => {
    expect(validarDadosDaOs({ ...bom, data_os: '14/10/2026' }).erro).toContain('ata')
    expect(validarDadosDaOs({ ...bom, data_os: '' }).erro).toContain('ata')
  })

  it('aceita telefone vazio, que é opcional', () => {
    const r = validarDadosDaOs({ ...bom, cliente_telefone: '' })
    expect(r.erro).toBe('')
    expect(r.dados.cliente_telefone).toBe(null)
  })

  it('CAMPOS_VAZIOS traz a data de hoje e o resto em branco', () => {
    const v = CAMPOS_VAZIOS()
    expect(v.data_os).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(v.cliente_nome).toBe('')
    expect(v.veiculo_placa).toBe('')
  })
})
