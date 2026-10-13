import { supabase } from './supabase.js'
import { condicaoIlike } from './filtros.js'
import { STATUS, podeTransicionar } from '../lib/status.js'
import { normalizarPlaca } from '../lib/placa.js'
import { hojeISO } from '../lib/datas.js'
import { validarItens } from '../os/validarItens.js'

const CAMPOS_LISTA =
  'id, numero, status, cliente_nome, veiculo_placa, veiculo_descricao, ' +
  'data_abertura, data_conclusao, total_centavos'

// A ficha do veículo precisa responder "o que já foi feito nesse carro",
// então a listagem traz também a primeira linha de cada OS.
const CAMPOS_LISTA_COM_ITEM = `${CAMPOS_LISTA}, itens:os_itens(posicao, descricao)`

export function servicoPrincipal(os) {
  const itens = os?.itens || []
  if (itens.length === 0) return ''
  const primeiro = itens.slice().sort((a, b) => a.posicao - b.posicao)[0]
  const extras = itens.length - 1
  return extras > 0
    ? `${primeiro.descricao} (+${extras})`
    : primeiro.descricao
}

export async function listarOrdens({
  termo = '', status = '', veiculoId = '', clienteId = '',
  limite = 100, comItens = false,
} = {}) {
  let q = supabase.from('ordens_servico')
    .select(comItens ? CAMPOS_LISTA_COM_ITEM : CAMPOS_LISTA)
    .order('data_abertura', { ascending: false })
    .order('numero', { ascending: false, nullsFirst: false })
    .limit(limite)

  if (status) q = q.eq('status', status)
  if (veiculoId) q = q.eq('veiculo_id', veiculoId)
  if (clienteId) q = q.eq('cliente_id', clienteId)

  const t = termo.trim()
  if (t) {
    const filtros = [
      condicaoIlike('cliente_nome', t),
      condicaoIlike('veiculo_placa', normalizarPlaca(t)),
    ]
    if (/^\d+$/.test(t)) filtros.push(`numero.eq.${t}`)
    q = q.or(filtros.join(','))
  }

  const { data, error } = await q
  if (error) throw new Error('Não foi possível listar as ordens de serviço.')
  return data
}

export async function buscarOrdem(id) {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select('*, itens:os_itens(*)')
    .eq('id', id).single()
  if (error) throw new Error('Ordem de serviço não encontrada.')
  data.itens.sort((a, b) => a.posicao - b.posicao)
  return data
}

export async function ultimaOrdemDoVeiculo(veiculoId) {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select(CAMPOS_LISTA_COM_ITEM)
    .eq('veiculo_id', veiculoId)
    .eq('status', STATUS.FINALIZADA)
    .order('data_conclusao', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle()
  if (error) throw new Error('Não foi possível consultar o histórico do veículo.')
  return data
}

// `veiculo.descricao` que chega aqui vem de descricaoVeiculo(veiculo), em
// src/data/veiculos.js — é a string que fica congelada e vai impressa no PDF.
export async function criarOrdem({ cliente, veiculo, itens = [],
                                   status = STATUS.ORCAMENTO, observacoes = '' }) {
  const { erro, itens: linhas } = validarItens(itens)
  if (erro) throw new Error(erro)

  const { data: sessao } = await supabase.auth.getSession()
  const agora = new Date().toISOString()

  // data_abertura fica a cargo do default da tabela, que é ancorado no fuso
  // de São Paulo — uma única fonte de "hoje" para a OS.
  const { data: os, error } = await supabase.from('ordens_servico').insert({
    status,
    cliente_id: cliente.id,
    veiculo_id: veiculo.id,
    cliente_nome: cliente.nome,
    cliente_telefone: cliente.telefone,
    veiculo_descricao: veiculo.descricao,
    veiculo_placa: normalizarPlaca(veiculo.placa),
    observacoes: observacoes || null,
    data_aprovacao: status === STATUS.ORCAMENTO ? null : agora,
    criado_por: sessao?.session?.user?.id ?? null,
  }).select().single()
  if (error) throw new Error('Não foi possível criar a ordem de serviço.')

  if (linhas.length) await substituirItens(os.id, linhas)
  return buscarOrdem(os.id)
}

// Troca o conjunto de itens numa transação só, no banco. Em duas requisições
// separadas, uma falha depois do delete deixava a OS sem item nenhum e com
// total zero — documento emitido destruído sem cópia.
async function substituirItens(osId, linhas) {
  const { error } = await supabase.rpc('substituir_itens', {
    p_os_id: osId,
    p_itens: linhas,
  })
  if (error) throw new Error('Não foi possível salvar os itens.')
}

export async function atualizarItens(osId, itens) {
  const { erro, itens: linhas } = validarItens(itens)
  if (erro) throw new Error(erro)
  await substituirItens(osId, linhas)
}

export async function mudarStatus(osId, novoStatus) {
  const atual = await buscarOrdem(osId)
  if (!podeTransicionar(atual.status, novoStatus)) {
    throw new Error(`Não é possível ir de ${atual.status} para ${novoStatus}.`)
  }
  if (novoStatus === STATUS.CANCELADA) {
    await cancelarOrdem(osId)
    return buscarOrdem(osId)
  }

  const campos = { status: novoStatus }
  if (novoStatus === STATUS.APROVADA) campos.data_aprovacao = new Date().toISOString()
  if (novoStatus === STATUS.FINALIZADA) {
    if (!atual.data_conclusao) campos.data_conclusao = hojeISO()
    campos.finalizada_em = new Date().toISOString()
  }

  const { error } = await supabase
    .from('ordens_servico').update(campos).eq('id', osId)
  if (error) throw new Error('Não foi possível mudar o status.')
  return buscarOrdem(osId)
}

// Devolve true quando o número foi devolvido à sequence.
export async function cancelarOrdem(osId) {
  const { data, error } = await supabase.rpc('cancelar_os', { p_os_id: osId })
  if (error) throw new Error('Não foi possível cancelar a ordem de serviço.')
  return Boolean(data)
}

export async function registrarPdfDaOrdem(osId, caminho) {
  const { error } = await supabase.from('ordens_servico')
    .update({ pdf_path: caminho, pdf_gerado_em: new Date().toISOString() })
    .eq('id', osId)
  if (error) throw new Error('Não foi possível registrar o PDF da OS.')
}
