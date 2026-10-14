import { describe, it, expect } from 'vitest'
import { validarDadosDaOs, CAMPOS_VAZIOS, camposDoRascunho } from './dadosOs.js'

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

  // A data nasce no carregamento da tela e vai no rascunho. OS começada às
  // 23h50 e retomada de manhã sairia datada de ontem, e a garantia contaria
  // de ontem — numa tela em que a data fica no alto, mas que ninguém relê.
  describe('camposDoRascunho', () => {
    it('reaproveita o que foi digitado', () => {
      const c = camposDoRascunho(
        { campos: { cliente_nome: 'João', veiculo_placa: 'ABC1234', data_os: '2026-10-14' } },
        '2026-10-14',
      )
      expect(c.cliente_nome).toBe('João')
      expect(c.veiculo_placa).toBe('ABC1234')
      expect(c.data_os).toBe('2026-10-14')
    })

    it('traz a data para hoje quando o rascunho é de outro dia', () => {
      const c = camposDoRascunho(
        { campos: { cliente_nome: 'João', data_os: '2026-10-13' } },
        '2026-10-14',
      )
      expect(c.data_os).toBe('2026-10-14')
      expect(c.cliente_nome).toBe('João')
    })

    it('aguenta rascunho no formato antigo, sem campos', () => {
      const c = camposDoRascunho({ placa: 'ABC1234', itens: [] }, '2026-10-14')
      expect(c.data_os).toBe('2026-10-14')
      expect(c.cliente_nome).toBe('')
    })

    it('aguenta rascunho ausente', () => {
      expect(camposDoRascunho(null, '2026-10-14').data_os).toBe('2026-10-14')
    })
  })

  it('CAMPOS_VAZIOS traz a data de hoje e o resto em branco', () => {
    const v = CAMPOS_VAZIOS()
    expect(v.data_os).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(v.cliente_nome).toBe('')
    expect(v.veiculo_placa).toBe('')
  })
})
