import { normalizarPlaca, placaValida } from '../lib/placa.js'
import { hojeISO } from '../lib/datas.js'

export function CAMPOS_VAZIOS() {
  return {
    veiculo_placa: '',
    data_os: hojeISO(),
    cliente_nome: '',
    cliente_telefone: '',
    veiculo_descricao: '',
  }
}

// A data nasce no carregamento da tela e vai junto no rascunho. Uma OS
// começada às 23h50 e retomada de manhã seria emitida com a data de ontem,
// e a garantia contaria de ontem — num campo que fica no alto da tela, mas
// que ninguém relê. Ao retomar, a data volta para hoje; o resto é mantido.
export function camposDoRascunho(rascunho, hoje) {
  return {
    ...CAMPOS_VAZIOS(),
    ...(rascunho?.campos || {}),
    data_os: hoje,
  }
}

// Única porta de entrada dos dados da OS. A tela chama antes de salvar, e a
// camada de dados chama de novo: sem cadastro por trás, estes campos são o
// documento, e documento com campo em branco não se emite.
export function validarDadosDaOs(entrada) {
  const d = entrada || {}
  const nome = String(d.cliente_nome || '').trim()
  const veiculo = String(d.veiculo_descricao || '').trim()
  const placa = normalizarPlaca(d.veiculo_placa)
  const data = String(d.data_os || '')
  const telefone = String(d.cliente_telefone || '').trim()

  if (!placaValida(placa)) {
    return { erro: 'Informe a placa do veículo (ABC1234 ou ABC1D23).', dados: null }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: 'Informe a data da OS.', dados: null }
  }
  if (nome === '') {
    return { erro: 'Informe o nome do cliente.', dados: null }
  }
  if (veiculo === '') {
    return { erro: 'Informe o veículo.', dados: null }
  }

  return {
    erro: '',
    dados: {
      veiculo_placa: placa,
      data_os: data,
      cliente_nome: nome,
      cliente_telefone: telefone || null,
      veiculo_descricao: veiculo,
    },
  }
}
